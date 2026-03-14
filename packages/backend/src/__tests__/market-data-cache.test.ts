import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketDataCache } from '../services/market-data-cache.js';
import type { MarketDataProvider, MarketQuote } from '../services/market-data-provider.js';

function createQuote(symbol: string, price = 100): MarketQuote {
  return {
    symbol,
    price,
    change1d: 1,
    change5d: 2,
    change20d: 3,
    volumeRatio: 1.5,
    rsi14: 55,
    high52w: price + 20,
    low52w: price - 20,
    support: price - 5,
    resistance: price + 5,
  };
}

function createProvider() {
  const getQuote = vi.fn<(symbol: string) => Promise<MarketQuote>>();
  const getIndicators = vi.fn<(symbol: string) => Promise<Partial<MarketQuote>>>()
    .mockResolvedValue({});

  return {
    getQuote,
    provider: {
      getQuote,
      getIndicators,
    } satisfies MarketDataProvider,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MarketDataCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('setSymbol/getSymbol returns a fresh cached entry', async () => {
    const { provider } = createProvider();
    const cache = new MarketDataCache({ provider, ttlMs: 1_000 });

    cache.setSymbol('AAPL', createQuote('AAPL', 101));

    await expect(cache.getSymbol('AAPL')).resolves.toEqual(createQuote('AAPL', 101));
  });

  it('expired entries return undefined', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { provider } = createProvider();
    const cache = new MarketDataCache({ provider, ttlMs: 1_000 });

    cache.setSymbol('AAPL', createQuote('AAPL', 101));
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(cache.getSymbol('AAPL')).resolves.toBeUndefined();
  });

  it('getOrFetch fetches on cache miss and stores the result', async () => {
    const { provider, getQuote } = createProvider();
    getQuote.mockResolvedValue(createQuote('AAPL', 110));

    const cache = new MarketDataCache({ provider, ttlMs: 1_000 });

    await expect(cache.getOrFetch('AAPL')).resolves.toEqual(createQuote('AAPL', 110));
    await expect(cache.getSymbol('AAPL')).resolves.toEqual(createQuote('AAPL', 110));
    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(getQuote).toHaveBeenCalledWith('AAPL');
  });

  it('getOrFetch returns the fresh cached result without another provider call', async () => {
    const { provider, getQuote } = createProvider();
    getQuote.mockResolvedValue(createQuote('AAPL', 110));

    const cache = new MarketDataCache({ provider, ttlMs: 60_000 });

    await cache.getOrFetch('AAPL');
    await expect(cache.getOrFetch('aapl')).resolves.toEqual(createQuote('AAPL', 110));

    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it('getOrFetch refreshes stale entries on access', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { provider, getQuote } = createProvider();
    getQuote.mockResolvedValue(createQuote('AAPL', 120));

    const cache = new MarketDataCache({ provider, ttlMs: 1_000 });
    cache.setSymbol('AAPL', createQuote('AAPL', 100));

    await vi.advanceTimersByTimeAsync(1_001);

    await expect(cache.getOrFetch('AAPL')).resolves.toEqual(createQuote('AAPL', 120));
    await expect(cache.getSymbol('AAPL')).resolves.toEqual(createQuote('AAPL', 120));
    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it('getOrFetch returns undefined when the provider fails', async () => {
    const { provider, getQuote } = createProvider();
    getQuote.mockRejectedValue(new Error('provider unavailable'));

    const cache = new MarketDataCache({ provider });

    await expect(cache.getOrFetch('AAPL')).resolves.toBeUndefined();
    await expect(cache.getSymbol('AAPL')).resolves.toBeUndefined();
  });

  it('refreshSymbols dedupes normalized symbols and returns successful results', async () => {
    const { provider, getQuote } = createProvider();
    getQuote.mockImplementation(async (symbol) => createQuote(symbol, symbol === 'AAPL' ? 110 : 210));

    const cache = new MarketDataCache({ provider });

    const results = await cache.refreshSymbols(['aapl', 'AAPL', 'msft']);

    expect(getQuote).toHaveBeenCalledTimes(2);
    expect(getQuote).toHaveBeenNthCalledWith(1, 'AAPL');
    expect(getQuote).toHaveBeenNthCalledWith(2, 'MSFT');
    expect(Array.from(results.keys())).toEqual(['AAPL', 'MSFT']);
    expect(results.get('AAPL')).toEqual(createQuote('AAPL', 110));
    expect(results.get('MSFT')).toEqual(createQuote('MSFT', 210));
    await expect(cache.getSymbol('aapl')).resolves.toEqual(createQuote('AAPL', 110));
  });

  it('refreshSymbols returns inline errors instead of throwing', async () => {
    const { provider, getQuote } = createProvider();
    getQuote.mockImplementation(async (symbol) => {
      if (symbol === 'MSFT') {
        throw new Error('rate limited');
      }

      return createQuote(symbol, 110);
    });

    const cache = new MarketDataCache({ provider });

    await expect(cache.refreshSymbols(['aapl', 'msft'])).resolves.toSatisfy((results) => {
      expect(results.get('AAPL')).toEqual(createQuote('AAPL', 110));
      expect(results.get('MSFT')).toBeInstanceOf(Error);
      expect((results.get('MSFT') as Error).message).toBe('rate limited');
      return true;
    });
  });

  it('start and stop control the periodic refresh loop for known symbols', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { provider, getQuote } = createProvider();
    getQuote.mockResolvedValue(createQuote('AAPL', 130));

    const cache = new MarketDataCache({ provider, refreshIntervalMs: 1_000 });
    cache.setSymbol('aapl', createQuote('AAPL', 100));

    expect(cache.isRunning()).toBe(false);

    cache.start();
    cache.start();
    expect(cache.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(getQuote).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(getQuote).toHaveBeenCalledTimes(1);

    cache.stop();
    expect(cache.isRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it('treats symbols case-insensitively and normalizes them to uppercase', async () => {
    const { provider } = createProvider();
    const cache = new MarketDataCache({ provider });

    cache.setSymbol('aapl', createQuote('aapl', 101));

    await expect(cache.getSymbol('AAPL')).resolves.toEqual(createQuote('AAPL', 101));
    await expect(cache.getSymbol('aapl')).resolves.toEqual(createQuote('AAPL', 101));
  });

  it('evicts the oldest cached symbol when maxSymbols is exceeded', async () => {
    const { provider } = createProvider();
    const options = { provider, maxSymbols: 2 };
    const cache = new MarketDataCache(options);

    cache.setSymbol('AAPL', createQuote('AAPL', 101));
    cache.setSymbol('MSFT', createQuote('MSFT', 202));
    cache.setSymbol('TSLA', createQuote('TSLA', 303));

    await expect(cache.getSymbol('AAPL')).resolves.toBeUndefined();
    await expect(cache.getSymbol('MSFT')).resolves.toEqual(createQuote('MSFT', 202));
    await expect(cache.getSymbol('TSLA')).resolves.toEqual(createQuote('TSLA', 303));
  });

  it('keeps periodic refresh tracking bounded with the cache when maxSymbols is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { provider, getQuote } = createProvider();
    getQuote.mockImplementation(async (symbol) => createQuote(symbol, symbol.length * 100));

    const options = { provider, refreshIntervalMs: 1_000, maxSymbols: 2 };
    const cache = new MarketDataCache(options);

    cache.setSymbol('AAPL', createQuote('AAPL', 101));
    cache.setSymbol('MSFT', createQuote('MSFT', 202));
    cache.setSymbol('TSLA', createQuote('TSLA', 303));

    cache.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(getQuote).toHaveBeenCalledTimes(2);
    expect(getQuote.mock.calls.map(([symbol]) => symbol).sort()).toEqual(['MSFT', 'TSLA']);
    cache.stop();
  });

  it('respects the max concurrency cap when refreshing symbols', async () => {
    const { provider, getQuote } = createProvider();
    let activeRequests = 0;
    let maxSeen = 0;
    const resolvers = new Map<string, (quote: MarketQuote) => void>();

    getQuote.mockImplementation((symbol) => {
      activeRequests += 1;
      maxSeen = Math.max(maxSeen, activeRequests);

      return new Promise<MarketQuote>((resolve) => {
        resolvers.set(symbol, (quote) => {
          activeRequests -= 1;
          resolve(quote);
        });
      });
    });

    const cache = new MarketDataCache({ provider, maxConcurrent: 2 });
    const refreshPromise = cache.refreshSymbols(['AAPL', 'MSFT', 'TSLA', 'NVDA']);

    await flushPromises();
    expect(maxSeen).toBe(2);
    expect(resolvers.size).toBe(2);

    resolvers.get('AAPL')?.(createQuote('AAPL', 110));
    resolvers.get('MSFT')?.(createQuote('MSFT', 120));

    await flushPromises();
    expect(maxSeen).toBe(2);
    expect(resolvers.size).toBe(4);

    resolvers.get('TSLA')?.(createQuote('TSLA', 130));
    resolvers.get('NVDA')?.(createQuote('NVDA', 140));

    const results = await refreshPromise;
    expect(maxSeen).toBe(2);
    expect(results.get('AAPL')).toEqual(createQuote('AAPL', 110));
    expect(results.get('MSFT')).toEqual(createQuote('MSFT', 120));
    expect(results.get('TSLA')).toEqual(createQuote('TSLA', 130));
    expect(results.get('NVDA')).toEqual(createQuote('NVDA', 140));
  });
});
