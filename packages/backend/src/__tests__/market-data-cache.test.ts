import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketQuote } from '../services/market-data-provider.js';
import { MarketDataCache } from '../services/market-data-cache.js';

function makeQuote(overrides: Partial<MarketQuote> = {}): MarketQuote {
  return {
    symbol: 'AAPL',
    price: 182.45,
    change1d: 1.25,
    change5d: 4.5,
    change20d: 12.75,
    volumeRatio: 1.8,
    rsi14: 63.2,
    high52w: 199.5,
    low52w: 145.1,
    support: 175,
    resistance: 188,
    ...overrides,
  };
}

describe('MarketDataCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches and caches quote data by ticker', async () => {
    const provider = {
      getQuote: vi.fn().mockResolvedValue(makeQuote()),
      getIndicators: vi.fn(),
    };
    const cache = new MarketDataCache(provider, { ttlMs: 60_000 });

    const first = await cache.getOrFetch('aapl');
    const second = await cache.getOrFetch('AAPL');

    expect(provider.getQuote).toHaveBeenCalledTimes(1);
    expect(provider.getQuote).toHaveBeenCalledWith('AAPL');
    expect(second).toEqual(first);
  });

  it('shares the same in-flight fetch for concurrent callers', async () => {
    let resolveQuote: ((value: MarketQuote) => void) | undefined;
    const provider = {
      getQuote: vi.fn().mockImplementation(
        () =>
          new Promise<MarketQuote>((resolve) => {
            resolveQuote = resolve;
          }),
      ),
      getIndicators: vi.fn(),
    };
    const cache = new MarketDataCache(provider, { ttlMs: 60_000 });

    const firstPromise = cache.getOrFetch('AAPL');
    const secondPromise = cache.getOrFetch('AAPL');
    resolveQuote?.(makeQuote());

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(provider.getQuote).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('refreshes tracked tickers when started', async () => {
    vi.useFakeTimers();

    const provider = {
      getQuote: vi.fn().mockResolvedValue(makeQuote()),
      getIndicators: vi.fn(),
    };
    const cache = new MarketDataCache(provider, {
      ttlMs: 60_000,
      refreshIntervalMs: 500,
    });

    await cache.getOrFetch('AAPL');
    cache.start();
    await vi.advanceTimersByTimeAsync(1_100);

    expect(provider.getQuote).toHaveBeenCalledTimes(3);
    cache.stop();
  });

  it('keeps the stale cached value when a refresh fails', async () => {
    vi.useFakeTimers();

    const provider = {
      getQuote: vi.fn()
        .mockResolvedValueOnce(makeQuote({ price: 182.45 }))
        .mockRejectedValueOnce(new Error('rate limited')),
      getIndicators: vi.fn(),
    };
    const cache = new MarketDataCache(provider, {
      ttlMs: 60_000,
      refreshIntervalMs: 500,
    });

    const initial = await cache.getOrFetch('AAPL');
    cache.start();
    await vi.advanceTimersByTimeAsync(600);

    expect(initial.price).toBe(182.45);
    expect(cache.get('AAPL')).toMatchObject({ price: 182.45 });
    cache.stop();
  });
});
