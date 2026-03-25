import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MarketRegimeService,
  calculateAmplificationFactor,
  calculateCompositeRegimeScore,
  calculateRsi,
  toDashboardMarketRegime,
} from '../services/market-regime.js';
import { validateApiKeyValue } from '../routes/auth-middleware.js';

interface HistoricalRow {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function buildHistory(
  closes: number[],
  startDate = new Date('2025-01-01T00:00:00.000Z'),
): HistoricalRow[] {
  return closes.map((close, index) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + index);

    return {
      date,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1_000_000,
    };
  });
}

function buildLinearSeries(start: number, end: number, length: number): number[] {
  if (length <= 1) {
    return [end];
  }

  return Array.from({ length }, (_, index) => {
    const progress = index / (length - 1);
    return Number((start + (end - start) * progress).toFixed(4));
  });
}

function createYahooFinanceMock(
  values: Record<string, HistoricalRow[]>,
) {
  return {
    historical: vi.fn(async (symbol: string) => values[symbol] ?? []),
  };
}

describe('market regime helpers', () => {
  it('weights normalized factors into a bounded composite score', () => {
    const score = calculateCompositeRegimeScore({
      vix: 1,
      spyRsi: 0.5,
      spy52wPosition: 0,
      maSignal: -0.5,
      yieldCurve: 1,
    });

    expect(score).toBe(48);
  });

  it('maps extreme overbought scores to bearish amplification', () => {
    expect(calculateAmplificationFactor(95, 'bearish')).toBe(2.75);
    expect(calculateAmplificationFactor(95, 'bullish')).toBe(0.5);
  });

  it('maps oversold and neutral scores to the correct amplification', () => {
    expect(calculateAmplificationFactor(-60, 'bullish')).toBe(1.5);
    expect(calculateAmplificationFactor(-60, 'bearish')).toBe(0.7);
    expect(calculateAmplificationFactor(0, 'neutral')).toBe(1);
  });

  it('returns an RSI of 100 when every close is a gain', () => {
    const closes = buildLinearSeries(100, 120, 20);

    expect(calculateRsi(closes, 14)).toBe(100);
  });

  it('returns an RSI of 0 when every close is a loss', () => {
    const closes = buildLinearSeries(120, 100, 20);

    expect(calculateRsi(closes, 14)).toBe(0);
  });

  it('uses the documented simplified RSI average for mixed gains and losses', () => {
    const closes = [
      100, 102, 101, 105, 103, 104, 102, 106,
      104, 108, 107, 110, 108, 109, 107,
    ];

    expect(calculateRsi(closes, 14)).toBe(61.29);
  });

  it('maps dashboard market regime buckets from score thresholds', () => {
    expect(toDashboardMarketRegime(60)).toBe('bull');
    expect(toDashboardMarketRegime(-60)).toBe('bear');
    expect(toDashboardMarketRegime(-10)).toBe('correction');
    expect(toDashboardMarketRegime(10)).toBe('neutral');
  });

  it('accepts the default development api key when no override is configured', () => {
    expect(validateApiKeyValue('er-dev-2026', undefined)).toEqual({
      ok: true,
    });
  });
});

describe('MarketRegimeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds an extreme overbought snapshot from bullish trend data', async () => {
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory(buildLinearSeries(400, 560, 252)),
      '^VIX': buildHistory(buildLinearSeries(11, 10, 30)),
      '^TNX': buildHistory(buildLinearSeries(4.5, 6.0, 30)),
      '^IRX': buildHistory(buildLinearSeries(3.0, 3.1, 30)),
    });
    const service = new MarketRegimeService({ yahooFinance });

    const snapshot = await service.getRegimeSnapshot();

    expect(snapshot.label).toBe('extreme_overbought');
    expect(snapshot.score).toBeGreaterThanOrEqual(80);
    expect(snapshot.factors.spyRsi.signal).toBe('overbought');
    expect(snapshot.factors.maSignal.signal).toBe('golden_cross');
    expect(snapshot.factors.yieldCurve.inverted).toBe(false);
    expect(snapshot.amplification.bearish).toBeGreaterThan(2);
    expect(service.getAmplificationFactor('bearish')).toBe(snapshot.amplification.bearish);
  });

  it('builds an extreme oversold snapshot from risk-off data', async () => {
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory(buildLinearSeries(520, 390, 252)),
      '^VIX': buildHistory(buildLinearSeries(34, 42, 30)),
      '^TNX': buildHistory(buildLinearSeries(3.8, 3.1, 30)),
      '^IRX': buildHistory(buildLinearSeries(4.2, 4.3, 30)),
    });
    const service = new MarketRegimeService({ yahooFinance });

    const snapshot = await service.getRegimeSnapshot();

    expect(snapshot.label).toBe('extreme_oversold');
    expect(snapshot.score).toBeLessThanOrEqual(-80);
    expect(snapshot.factors.spyRsi.signal).toBe('oversold');
    expect(snapshot.factors.maSignal.signal).toBe('death_cross');
    expect(snapshot.factors.yieldCurve.inverted).toBe(true);
    expect(snapshot.amplification.bullish).toBeGreaterThan(2);
    expect(service.getAmplificationFactor('bullish')).toBe(snapshot.amplification.bullish);
  });

  it('reuses the cached snapshot inside the 5 minute ttl', async () => {
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory(buildLinearSeries(400, 500, 252)),
      '^VIX': buildHistory(buildLinearSeries(18, 17, 30)),
      '^TNX': buildHistory(buildLinearSeries(4.0, 4.2, 30)),
      '^IRX': buildHistory(buildLinearSeries(3.5, 3.6, 30)),
    });
    const service = new MarketRegimeService({ yahooFinance, cacheTtlMs: 300_000 });

    const first = await service.getRegimeSnapshot();
    const second = await service.getRegimeSnapshot();

    expect(second).toBe(first);
    expect(yahooFinance.historical).toHaveBeenCalledTimes(4);
  });

  it('refreshes the snapshot after the cache ttl expires', async () => {
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory(buildLinearSeries(400, 500, 252)),
      '^VIX': buildHistory(buildLinearSeries(18, 17, 30)),
      '^TNX': buildHistory(buildLinearSeries(4.0, 4.2, 30)),
      '^IRX': buildHistory(buildLinearSeries(3.5, 3.6, 30)),
    });
    const service = new MarketRegimeService({ yahooFinance, cacheTtlMs: 300_000 });

    await service.getRegimeSnapshot();
    vi.advanceTimersByTime(300_001);
    await service.getRegimeSnapshot();

    expect(yahooFinance.historical).toHaveBeenCalledTimes(8);
  });

  it('returns a neutral amplification factor before the first snapshot is loaded', () => {
    const yahooFinance = createYahooFinanceMock({});
    const service = new MarketRegimeService({ yahooFinance });

    expect(service.getAmplificationFactor('bullish')).toBe(1);
    expect(service.getAmplificationFactor('bearish')).toBe(1);
    expect(service.getAmplificationFactor('neutral')).toBe(1);
  });

  it('falls back to a neutral snapshot when market data is incomplete', async () => {
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory(buildLinearSeries(400, 520, 10)),
      '^VIX': buildHistory([18]),
      '^TNX': buildHistory([4.2]),
      '^IRX': buildHistory([3.8]),
    });
    const service = new MarketRegimeService({ yahooFinance });

    const snapshot = await service.getRegimeSnapshot();

    expect(snapshot).toMatchObject({
      score: 0,
      label: 'neutral',
      amplification: {
        bullish: 1,
        bearish: 1,
      },
    });
  });

  it('uses the last 252 closes for 52-week high and low calculations', async () => {
    const staleHighs = Array.from({ length: 28 }, () => 700);
    const recentTradingYear = buildLinearSeries(400, 520, 252);
    const yahooFinance = createYahooFinanceMock({
      SPY: buildHistory([...staleHighs, ...recentTradingYear]),
      '^VIX': buildHistory(buildLinearSeries(18, 17, 30)),
      '^TNX': buildHistory(buildLinearSeries(4.0, 5.0, 30)),
      '^IRX': buildHistory(buildLinearSeries(3.5, 4.0, 30)),
    });
    const service = new MarketRegimeService({ yahooFinance });

    const snapshot = await service.getRegimeSnapshot();

    expect(snapshot.factors.spy52wPosition.pctFromHigh).toBe(0);
    expect(snapshot.factors.spy52wPosition.pctFromLow).toBe(30);
  });

  it('coalesces concurrent snapshot requests into a single market data fetch', async () => {
    const yahooFinance = {
      historical: vi.fn(async (symbol: string) => {
        await Promise.resolve();

        const values: Record<string, HistoricalRow[]> = {
          SPY: buildHistory(buildLinearSeries(400, 500, 252)),
          '^VIX': buildHistory(buildLinearSeries(18, 17, 30)),
          '^TNX': buildHistory(buildLinearSeries(4.0, 4.2, 30)),
          '^IRX': buildHistory(buildLinearSeries(3.5, 3.6, 30)),
        };

        return values[symbol] ?? [];
      }),
    };
    const service = new MarketRegimeService({ yahooFinance });

    const [first, second] = await Promise.all([
      service.getRegimeSnapshot(),
      service.getRegimeSnapshot(),
    ]);

    expect(second).toBe(first);
    expect(yahooFinance.historical).toHaveBeenCalledTimes(4);
  });

  it('caches a neutral fallback after yahoo finance failures to prevent retry flapping', async () => {
    const yahooFinance = {
      historical: vi.fn().mockRejectedValue(new Error('Yahoo failure')),
    };
    const logger = {
      error: vi.fn(),
    };
    const service = new MarketRegimeService({ yahooFinance, cacheTtlMs: 300_000, logger });

    const first = await service.getRegimeSnapshot();
    const second = await service.getRegimeSnapshot();

    expect(first.label).toBe('neutral');
    expect(second).toBe(first);
    expect(yahooFinance.historical).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
      }),
      'failed to refresh market regime snapshot',
    );
  });
});
