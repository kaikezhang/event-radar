import YahooFinance from 'yahoo-finance2';
import type {
  IMarketRegimeService,
  RegimeDirection,
  RegimeLabel,
  RegimeSnapshot,
} from '@event-radar/shared';

interface HistoricalRow {
  date: Date;
  close: number;
}

interface YahooFinanceClient {
  historical(
    symbol: string,
    options: {
      period1: Date;
      period2: Date;
      interval: '1d';
    },
  ): Promise<Array<{
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>>;
}

interface CacheEntry {
  snapshot: RegimeSnapshot;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 300_000;
const SPY_HISTORY_DAYS = 400;
const AUX_HISTORY_DAYS = 60;
const TRADING_DAYS_IN_YEAR = 252;
const YIELD_CURVE_SCALE_PCT = 2.0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, decimals = 2): number {
  const precision = 10 ** decimals;
  return Math.round(value * precision) / precision;
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function toSortedCloses(rows: HistoricalRow[]): number[] {
  return rows
    .filter((row) => row.date instanceof Date && Number.isFinite(row.close))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map((row) => row.close);
}

export function calculateSimpleMovingAverage(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) {
    return 0;
  }

  const total = slice.reduce((sum, value) => sum + value, 0);
  return total / slice.length;
}

export function calculateRsi(values: number[], period = 14): number {
  if (values.length <= period) {
    return 50;
  }

  // This intentionally uses a simple rolling average over the last `period`
  // closes instead of Wilder smoothing. The goal is a stable sentiment signal,
  // not a chart-trading indicator that depends on recursive state.
  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const delta = current - previous;

    if (delta > 0) {
      gains += delta;
      continue;
    }

    losses += Math.abs(delta);
  }

  if (losses === 0 && gains === 0) {
    return 50;
  }

  if (losses === 0) {
    return 100;
  }

  if (gains === 0) {
    return 0;
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  const relativeStrength = averageGain / averageLoss;

  return roundTo(100 - 100 / (1 + relativeStrength));
}

export function calculateCompositeRegimeScore(factors: {
  vix: number;
  spyRsi: number;
  spy52wPosition: number;
  maSignal: number;
  yieldCurve: number;
}): number {
  const rawScore =
    factors.vix * 0.25 +
    factors.spyRsi * 0.2 +
    factors.spy52wPosition * 0.2 +
    factors.maSignal * 0.15 +
    factors.yieldCurve * 0.2;

  return Math.round(clamp(rawScore, -1, 1) * 100);
}

export function getRegimeLabel(score: number): RegimeLabel {
  if (score <= -80) {
    return 'extreme_oversold';
  }

  if (score < -40) {
    return 'oversold';
  }

  if (score <= 40) {
    return 'neutral';
  }

  if (score < 80) {
    return 'overbought';
  }

  return 'extreme_overbought';
}

export function calculateAmplificationFactor(
  score: number,
  direction: RegimeDirection,
): number {
  if (direction === 'neutral') {
    return 1;
  }

  if (score >= 80) {
    if (direction === 'bearish') {
      return roundTo(2 + (clamp(score, 80, 100) - 80) / 20);
    }

    return 0.5;
  }

  if (score >= 40) {
    return direction === 'bearish' ? 1.5 : 0.7;
  }

  if (score > -40) {
    return 1;
  }

  if (score > -80) {
    return direction === 'bullish' ? 1.5 : 0.7;
  }

  if (direction === 'bullish') {
    return roundTo(2 + (clamp(-score, 80, 100) - 80) / 20);
  }

  return 0.5;
}

function createNeutralSnapshot(updatedAt: Date): RegimeSnapshot {
  return {
    score: 0,
    label: 'neutral',
    factors: {
      vix: {
        value: 20,
        zscore: 0,
      },
      spyRsi: {
        value: 50,
        signal: 'neutral',
      },
      spy52wPosition: {
        pctFromHigh: 0,
        pctFromLow: 0,
      },
      maSignal: {
        sma20: 0,
        sma50: 0,
        signal: 'neutral',
      },
      yieldCurve: {
        spread: 0,
        inverted: false,
      },
    },
    amplification: {
      bullish: 1,
      bearish: 1,
    },
    updatedAt: updatedAt.toISOString(),
  };
}

function getRsiSignal(rsi: number): 'oversold' | 'neutral' | 'overbought' {
  if (rsi >= 70) {
    return 'overbought';
  }

  if (rsi <= 30) {
    return 'oversold';
  }

  return 'neutral';
}

function getMovingAverageSignal(
  sma20: number,
  sma50: number,
): 'golden_cross' | 'death_cross' | 'neutral' {
  if (sma50 === 0) {
    return 'neutral';
  }

  const spreadRatio = (sma20 - sma50) / sma50;

  if (spreadRatio >= 0.001) {
    return 'golden_cross';
  }

  if (spreadRatio <= -0.001) {
    return 'death_cross';
  }

  return 'neutral';
}

function normalizeVix(vix: number): number {
  return clamp((20 - vix) / 10, -1, 1);
}

function normalizeRsi(rsi: number): number {
  return clamp((rsi - 50) / 20, -1, 1);
}

function normalizePosition(current: number, high: number, low: number): number {
  if (high <= low) {
    return 0;
  }

  const position = (current - low) / (high - low);
  return clamp(position * 2 - 1, -1, 1);
}

function normalizeMovingAverage(sma20: number, sma50: number): number {
  if (sma50 === 0) {
    return 0;
  }

  return clamp((sma20 - sma50) / (sma50 * 0.03), -1, 1);
}

function normalizeYieldCurve(spread: number): number {
  return clamp(spread / YIELD_CURVE_SCALE_PCT, -1, 1);
}

export class MarketRegimeService implements IMarketRegimeService {
  private readonly yahooFinance: YahooFinanceClient;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private cache: CacheEntry | null = null;
  private inFlightSnapshot: Promise<RegimeSnapshot> | null = null;
  private lastSnapshot: RegimeSnapshot | null = null;

  constructor(options?: {
    yahooFinance?: YahooFinanceClient;
    cacheTtlMs?: number;
    now?: () => Date;
  }) {
    this.yahooFinance = options?.yahooFinance ?? new YahooFinance();
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options?.now ?? (() => new Date());
  }

  getAmplificationFactor(direction: RegimeDirection): number {
    const score = this.lastSnapshot?.score ?? 0;
    return calculateAmplificationFactor(score, direction);
  }

  async getRegimeSnapshot(): Promise<RegimeSnapshot> {
    const now = this.now();

    if (this.cache && now.getTime() < this.cache.expiresAt) {
      this.lastSnapshot = this.cache.snapshot;
      return this.cache.snapshot;
    }

    if (this.inFlightSnapshot) {
      return this.inFlightSnapshot;
    }

    this.inFlightSnapshot = this.fetchSnapshot(now)
      .catch((error) => {
        console.error(
          '[market-regime] Failed to refresh snapshot:',
          error instanceof Error ? error.message : error,
        );

        return this.lastSnapshot ?? createNeutralSnapshot(now);
      })
      .then((snapshot) => {
        this.cache = {
          snapshot,
          expiresAt: now.getTime() + this.cacheTtlMs,
        };
        this.lastSnapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        this.inFlightSnapshot = null;
      });

    return this.inFlightSnapshot;
  }

  private async fetchSnapshot(updatedAt: Date): Promise<RegimeSnapshot> {
    const [spyHistory, vixHistory, tenYearHistory, shortRateHistory] = await Promise.all([
      this.fetchHistory('SPY', SPY_HISTORY_DAYS),
      this.fetchHistory('^VIX', AUX_HISTORY_DAYS),
      this.fetchHistory('^TNX', AUX_HISTORY_DAYS),
      this.fetchHistory('^IRX', AUX_HISTORY_DAYS),
    ]);

    if (
      spyHistory.length < 50 ||
      vixHistory.length === 0 ||
      tenYearHistory.length === 0 ||
      shortRateHistory.length === 0
    ) {
      return createNeutralSnapshot(updatedAt);
    }

    const spyCloses = toSortedCloses(spyHistory);
    const vixCloses = toSortedCloses(vixHistory);
    const tenYearCloses = toSortedCloses(tenYearHistory);
    const shortRateCloses = toSortedCloses(shortRateHistory);

    if (
      spyCloses.length < 50 ||
      vixCloses.length === 0 ||
      tenYearCloses.length === 0 ||
      shortRateCloses.length === 0
    ) {
      return createNeutralSnapshot(updatedAt);
    }

    const currentSpy = spyCloses.at(-1) ?? 0;
    const currentVix = vixCloses.at(-1) ?? 20;
    const currentTenYear = tenYearCloses.at(-1) ?? 0;
    const currentShortRate = shortRateCloses.at(-1) ?? 0;
    const trailing52WeekCloses = spyCloses.slice(-TRADING_DAYS_IN_YEAR);
    const high52Week = Math.max(...trailing52WeekCloses);
    const low52Week = Math.min(...trailing52WeekCloses);
    const rsi = calculateRsi(spyCloses, 14);
    const sma20 = roundTo(calculateSimpleMovingAverage(spyCloses, 20));
    const sma50 = roundTo(calculateSimpleMovingAverage(spyCloses, 50));
    const spread = roundTo(currentTenYear - currentShortRate);

    const score = calculateCompositeRegimeScore({
      vix: normalizeVix(currentVix),
      spyRsi: normalizeRsi(rsi),
      spy52wPosition: normalizePosition(currentSpy, high52Week, low52Week),
      maSignal: normalizeMovingAverage(sma20, sma50),
      yieldCurve: normalizeYieldCurve(spread),
    });
    const label = getRegimeLabel(score);

    const snapshot: RegimeSnapshot = {
      score,
      label,
      factors: {
        vix: {
          value: roundTo(currentVix),
          zscore: roundTo((currentVix - 20) / 8),
        },
        spyRsi: {
          value: roundTo(rsi),
          signal: getRsiSignal(rsi),
        },
        spy52wPosition: {
          pctFromHigh: high52Week === 0 ? 0 : roundTo(((currentSpy / high52Week) - 1) * 100),
          pctFromLow: low52Week === 0 ? 0 : roundTo(((currentSpy / low52Week) - 1) * 100),
        },
        maSignal: {
          sma20,
          sma50,
          signal: getMovingAverageSignal(sma20, sma50),
        },
        yieldCurve: {
          spread,
          inverted: spread < 0,
        },
      },
      amplification: {
        bullish: calculateAmplificationFactor(score, 'bullish'),
        bearish: calculateAmplificationFactor(score, 'bearish'),
      },
      updatedAt: updatedAt.toISOString(),
    };

    return snapshot;
  }

  private async fetchHistory(symbol: string, lookbackDays: number): Promise<HistoricalRow[]> {
    const period2 = this.now();
    const period1 = subtractDays(period2, lookbackDays);
    const rows = await this.yahooFinance.historical(symbol, {
      period1,
      period2,
      interval: '1d',
    });

    return rows
      .filter((row) => row.date instanceof Date && Number.isFinite(row.close))
      .map((row) => ({
        date: row.date,
        close: row.close,
      }));
  }
}
