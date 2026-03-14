import type { MarketDataProvider, MarketQuote } from './market-data-provider.js';

interface CacheEntry {
  value: MarketQuote;
  expiresAt: number;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function normalizeQuote(symbol: string, quote: MarketQuote): MarketQuote {
  return {
    ...quote,
    symbol,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getUniqueSymbols(symbols: string[]): string[] {
  const uniqueSymbols = new Set<string>();

  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);

    if (normalized.length === 0) {
      continue;
    }

    uniqueSymbols.add(normalized);
  }

  return Array.from(uniqueSymbols);
}

export class MarketDataCache {
  private readonly provider: MarketDataProvider;
  private readonly ttlMs: number;
  private readonly refreshIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly knownSymbols = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(options: {
    provider: MarketDataProvider;
    ttlMs?: number;
    refreshIntervalMs?: number;
    maxConcurrent?: number;
  }) {
    this.provider = options.provider;
    this.ttlMs = options.ttlMs ?? 300_000;
    this.refreshIntervalMs = options.refreshIntervalMs ?? 300_000;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 4);
  }

  async getSymbol(symbol: string): Promise<MarketQuote | undefined> {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (normalizedSymbol.length === 0) {
      return undefined;
    }

    const entry = this.cache.get(normalizedSymbol);
    if (!entry || entry.expiresAt <= Date.now()) {
      return undefined;
    }

    return entry.value;
  }

  setSymbol(symbol: string, value: MarketQuote): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (normalizedSymbol.length === 0) {
      return;
    }

    this.cache.set(normalizedSymbol, {
      value: normalizeQuote(normalizedSymbol, value),
      expiresAt: Date.now() + this.ttlMs,
    });
    this.knownSymbols.add(normalizedSymbol);
  }

  async getOrFetch(symbol: string): Promise<MarketQuote | undefined> {
    const normalizedSymbol = normalizeSymbol(symbol);
    if (normalizedSymbol.length === 0) {
      return undefined;
    }

    const cached = await this.getSymbol(normalizedSymbol);
    if (cached) {
      return cached;
    }

    try {
      const quote = await this.provider.getQuote(normalizedSymbol);
      const normalizedQuote = normalizeQuote(normalizedSymbol, quote);
      this.setSymbol(normalizedSymbol, normalizedQuote);
      return normalizedQuote;
    } catch {
      return undefined;
    }
  }

  async refreshSymbols(symbols: string[]): Promise<Map<string, MarketQuote | Error>> {
    const uniqueSymbols = getUniqueSymbols(symbols);
    const results = new Map<string, MarketQuote | Error>();

    if (uniqueSymbols.length === 0) {
      return results;
    }

    let nextIndex = 0;
    const runWorker = async (): Promise<void> => {
      while (nextIndex < uniqueSymbols.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const symbol = uniqueSymbols[currentIndex];

        if (!symbol) {
          return;
        }

        try {
          const quote = await this.provider.getQuote(symbol);
          const normalizedQuote = normalizeQuote(symbol, quote);
          this.setSymbol(symbol, normalizedQuote);
          results.set(symbol, normalizedQuote);
        } catch (error) {
          results.set(symbol, toError(error));
        }
      }
    };

    const workerCount = Math.min(this.maxConcurrent, uniqueSymbols.length);
    await Promise.all(Array.from({ length: workerCount }, async () => runWorker()));

    return results;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.refreshSymbols(Array.from(this.knownSymbols));
    }, this.refreshIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
