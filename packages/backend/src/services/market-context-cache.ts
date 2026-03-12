interface YahooChartResult {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string | null } | null;
  };
}

interface DailyBar {
  timestamp: number;
  close: number;
}

export interface MarketSnapshot {
  vixLevel: number;
  spyClose: number;
  spy50ma: number;
  spy200ma: number;
  marketRegime: 'bull' | 'bear' | 'correction' | 'recovery';
  updatedAt: Date;
}

export function deriveMarketRegime(
  spyClose: number,
  spy50ma: number,
  spy200ma: number,
): MarketSnapshot['marketRegime'] {
  const above200 = spyClose > spy200ma;
  const above50 = spyClose > spy50ma;

  if (above200 && above50) return 'bull';
  if (!above200 && !above50) return 'bear';
  if (above200 && !above50) return 'correction';
  return 'recovery';
}

function calculateSimpleMovingAverage(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) {
    return 0;
  }

  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function startOfUtcDay(date = new Date()): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function fetchDailyBars(symbol: string, count: number): Promise<DailyBar[]> {
  const dayStart = startOfUtcDay();
  const period2 = Math.floor(dayStart.getTime() / 1000);
  const lookbackDays = Math.ceil(count * 1.5) + 10;
  const period1 = period2 - lookbackDays * 86_400;
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?period1=${period1}&period2=${period2}&interval=1d`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'event-radar/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
  }

  const json = (await response.json()) as YahooChartResult;
  if (json.chart?.error) {
    throw new Error(json.chart.error.description ?? `Yahoo Finance error for ${symbol}`);
  }

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const bars: DailyBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const close = closes[index];

    if (timestamp == null || close == null || !Number.isFinite(close)) {
      continue;
    }

    bars.push({ timestamp, close });
  }

  return bars;
}

export class MarketContextCache {
  private snapshot: MarketSnapshot | null = null;
  private readonly refreshIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private spyBars: DailyBar[] = [];
  private vixBars: DailyBar[] = [];
  private lastFetchedAt = 0;

  constructor(config?: { refreshIntervalMs?: number }) {
    this.refreshIntervalMs = config?.refreshIntervalMs ?? 300_000;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  get(): MarketSnapshot | null {
    return this.snapshot;
  }

  async refresh(): Promise<void> {
    try {
      const now = Date.now();
      const isFresh =
        this.lastFetchedAt > 0 &&
        now - this.lastFetchedAt < this.refreshIntervalMs &&
        this.spyBars.length >= 200 &&
        this.vixBars.length > 0;

      if (!isFresh) {
        const [spyBars, vixBars] = await Promise.all([
          fetchDailyBars('SPY', 200),
          fetchDailyBars('^VIX', 30),
        ]);

        if (spyBars.length < 200 || vixBars.length === 0) {
          return;
        }

        this.spyBars = spyBars.slice(-200);
        this.vixBars = vixBars;
        this.lastFetchedAt = now;
      }

      const spyCloses = this.spyBars.map((bar) => bar.close);
      const spyClose = spyCloses.at(-1) ?? 0;
      const vixLevel = this.vixBars.at(-1)?.close ?? 0;
      const spy50ma = calculateSimpleMovingAverage(spyCloses, 50);
      const spy200ma = calculateSimpleMovingAverage(spyCloses, 200);

      this.snapshot = {
        vixLevel,
        spyClose,
        spy50ma,
        spy200ma,
        marketRegime: deriveMarketRegime(spyClose, spy50ma, spy200ma),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error(
        '[market-context-cache] Refresh failed:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
