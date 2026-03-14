import type { MarketDataProvider, MarketQuote } from './market-data-provider.js';

export type TickerMarketContext = Pick<
  MarketQuote,
  | 'price'
  | 'change1d'
  | 'change5d'
  | 'change20d'
  | 'volumeRatio'
  | 'rsi14'
  | 'high52w'
  | 'low52w'
  | 'support'
  | 'resistance'
>;

interface CacheEntry {
  fetchedAt: number;
  value: TickerMarketContext;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_REFRESH_INTERVAL_MS = 300_000;

export class MarketDataCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<TickerMarketContext>>();
  private readonly refreshIntervalMs: number;
  private readonly ttlMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly provider: MarketDataProvider,
    config?: {
      refreshIntervalMs?: number;
      ttlMs?: number;
    },
  ) {
    this.refreshIntervalMs = config?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
  }

  start(): void {
    if (this.timer != null) {
      return;
    }

    this.timer = setInterval(() => {
      void this.refreshTrackedTickers();
    }, this.refreshIntervalMs);
  }

  stop(): void {
    if (this.timer == null) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  get(symbol: string): TickerMarketContext | null {
    const normalizedSymbol = normalizeSymbol(symbol);
    return this.entries.get(normalizedSymbol)?.value ?? null;
  }

  async getOrFetch(symbol: string): Promise<TickerMarketContext> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const cached = this.entries.get(normalizedSymbol);

    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.value;
    }

    const existingRequest = this.inFlight.get(normalizedSymbol);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchAndStore(normalizedSymbol, cached?.value);
    this.inFlight.set(normalizedSymbol, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(normalizedSymbol);
    }
  }

  private async refreshTrackedTickers(): Promise<void> {
    const tickers = Array.from(this.entries.keys());
    await Promise.all(
      tickers.map(async (symbol) => {
        try {
          await this.fetchAndStore(symbol, this.entries.get(symbol)?.value);
        } catch (error) {
          console.error(
            '[market-data-cache] Refresh failed:',
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );
  }

  private async fetchAndStore(
    symbol: string,
    fallback?: TickerMarketContext,
  ): Promise<TickerMarketContext> {
    try {
      const quote = await this.provider.getQuote(symbol);
      const value = toTickerMarketContext(quote);

      this.entries.set(symbol, {
        value,
        fetchedAt: Date.now(),
      });

      return value;
    } catch (error) {
      if (fallback) {
        return fallback;
      }

      throw error;
    }
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function toTickerMarketContext(quote: MarketQuote): TickerMarketContext {
  return {
    price: quote.price,
    change1d: quote.change1d,
    change5d: quote.change5d,
    change20d: quote.change20d,
    volumeRatio: quote.volumeRatio,
    rsi14: quote.rsi14,
    high52w: quote.high52w,
    low52w: quote.low52w,
    support: quote.support,
    resistance: quote.resistance,
  };
}
