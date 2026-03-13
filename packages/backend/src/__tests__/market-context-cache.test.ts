import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MarketContextCache,
  deriveMarketRegime,
} from '../services/market-context-cache.js';

function buildChartJson(closes: number[]) {
  const baseTimestamp = Date.UTC(2025, 0, 1) / 1000;

  return {
    chart: {
      result: [
        {
          timestamp: closes.map((_, index) => baseTimestamp + index * 86_400),
          indicators: {
            quote: [
              {
                open: closes,
                high: closes,
                low: closes,
                close: closes,
                volume: closes.map(() => 1_000_000),
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

describe('deriveMarketRegime', () => {
  it('classifies bull markets', () => {
    expect(deriveMarketRegime(510, 500, 480)).toBe('bull');
  });

  it('classifies bear markets', () => {
    expect(deriveMarketRegime(430, 450, 470)).toBe('bear');
  });

  it('classifies corrections', () => {
    expect(deriveMarketRegime(490, 505, 470)).toBe('correction');
  });

  it('classifies recoveries', () => {
    expect(deriveMarketRegime(455, 440, 470)).toBe('recovery');
  });
});

describe('MarketContextCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns null before the first refresh completes', () => {
    const cache = new MarketContextCache({ refreshIntervalMs: 1_000 });

    expect(cache.get()).toBeNull();
  });

  it('refresh updates the cached market snapshot', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildChartJson(Array.from({ length: 200 }, (_, i) => i + 100)),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildChartJson(Array.from({ length: 30 }, (_, i) => i + 10)),
      });
    vi.stubGlobal('fetch', fetchSpy);

    const cache = new MarketContextCache({ refreshIntervalMs: 1_000 });
    await cache.refresh();

    expect(cache.get()).toEqual(
      expect.objectContaining({
        vixLevel: 39,
        spyClose: 299,
        marketRegime: 'bull',
      }),
    );
  });

  it('periodically refreshes after start is called', async () => {
    vi.useFakeTimers();

    const fetchSpy = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => buildChartJson(Array.from({ length: 200 }, (_, i) => i + 100)),
      });
    vi.stubGlobal('fetch', fetchSpy);

    const cache = new MarketContextCache({ refreshIntervalMs: 500 });
    cache.start();

    await vi.advanceTimersByTimeAsync(1_200);

    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(4);

    cache.stop();
  });
});
