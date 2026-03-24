import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import { YahooPriceBatchService, YahooPriceChartService } from '../routes/price.js';

const TEST_API_KEY = 'price-test-key';

describe('YahooPriceChartService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('maps yahoo chart quotes into candle payloads', async () => {
    const chart = vi.fn().mockResolvedValue({
      quotes: [
        {
          date: new Date('2026-03-10T00:00:00.000Z'),
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
        {
          date: new Date('2026-03-11T00:00:00.000Z'),
          open: 120.6,
          high: 123.8,
          low: 119.7,
          close: 122.9,
          volume: 45200000,
        },
      ],
    });
    const service = new YahooPriceChartService({
      cacheTtlMs: 300_000,
      yahooFinance: { chart } as never,
    });

    const result = await service.getCandles('nvda', '1m');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ticker).toBe('NVDA');
      expect(result.value.range).toBe('1m');
      expect(result.value.candles).toEqual([
        {
          time: '2026-03-10',
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
        {
          time: '2026-03-11',
          open: 120.6,
          high: 123.8,
          low: 119.7,
          close: 122.9,
          volume: 45200000,
        },
      ]);
    }
  });

  it('reuses cached responses for the same ticker and range', async () => {
    const chart = vi.fn().mockResolvedValue({
      quotes: [
        {
          date: new Date('2026-03-10T00:00:00.000Z'),
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
      ],
    });
    const service = new YahooPriceChartService({
      cacheTtlMs: 300_000,
      yahooFinance: { chart } as never,
    });

    await service.getCandles('NVDA', '1m');
    await service.getCandles('NVDA', '1m');

    expect(chart).toHaveBeenCalledTimes(1);
  });

  it('refreshes the cache after the ttl expires', async () => {
    const chart = vi.fn().mockResolvedValue({
      quotes: [
        {
          date: new Date('2026-03-10T00:00:00.000Z'),
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
      ],
    });
    const service = new YahooPriceChartService({
      cacheTtlMs: 300_000,
      yahooFinance: { chart } as never,
    });

    await service.getCandles('NVDA', '1m');
    vi.advanceTimersByTime(300_001);
    await service.getCandles('NVDA', '1m');

    expect(chart).toHaveBeenCalledTimes(2);
  });

  it('returns an error when yahoo returns no valid candle data', async () => {
    const chart = vi.fn().mockResolvedValue({
      quotes: [
        {
          date: new Date('2026-03-10T00:00:00.000Z'),
          open: null,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
      ],
    });
    const service = new YahooPriceChartService({
      yahooFinance: { chart } as never,
    });

    const result = await service.getCandles('NVDA', '1m');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No price data');
    }
  });
});

describe('YahooPriceBatchService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries yahoo quote lookups with exponential backoff before succeeding', async () => {
    const quote = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({
        regularMarketPrice: 178.5,
        regularMarketChange: 4.11,
        regularMarketChangePercent: 2.36,
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const service = new YahooPriceBatchService({
      yahooFinance: { quote } as never,
      sleep,
    });

    const result = await service.getQuotes(['NVDA']);

    expect(result).toEqual({
      prices: {
        NVDA: {
          price: 178.5,
          change: 4.11,
          changePercent: 2.36,
        },
      },
    });
    expect(quote).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);
  });

  it('reuses cached batch quotes within the ttl window', async () => {
    const quote = vi.fn().mockResolvedValue({
      regularMarketPrice: 178.5,
      regularMarketChange: 4.11,
      regularMarketChangePercent: 2.36,
    });
    const service = new YahooPriceBatchService({
      yahooFinance: { quote } as never,
      cacheTtlMs: 300_000,
    });

    await service.getQuotes(['NVDA']);
    await service.getQuotes(['NVDA']);

    expect(quote).toHaveBeenCalledTimes(1);
  });

  it('falls back to stale cached quotes when yahoo is temporarily unavailable', async () => {
    const quote = vi
      .fn()
      .mockResolvedValueOnce({
        regularMarketPrice: 178.5,
        regularMarketChange: 4.11,
        regularMarketChangePercent: 2.36,
      })
      .mockRejectedValueOnce(new Error('temporary outage'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const service = new YahooPriceBatchService({
      yahooFinance: { quote } as never,
      cacheTtlMs: 300_000,
      retryDelaysMs: [0],
      sleep,
    });

    await service.getQuotes(['NVDA']);
    vi.advanceTimersByTime(300_001);
    const result = await service.getQuotes(['NVDA']);

    expect(result).toEqual({
      prices: {
        NVDA: {
          price: 178.5,
          change: 4.11,
          changePercent: 2.36,
        },
      },
    });
    expect(quote).toHaveBeenCalledTimes(3);
  });

  it('opens the circuit breaker after five consecutive yahoo failures', async () => {
    const quote = vi.fn().mockRejectedValue(new Error('yahoo down'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const service = new YahooPriceBatchService({
      yahooFinance: { quote } as never,
      retryDelaysMs: [0],
      sleep,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.getQuotes(['NVDA']);
    }

    const result = await service.getQuotes(['NVDA']);

    expect(result).toEqual({
      prices: {},
      error: 'Price data temporarily unavailable',
    });
    expect(quote).toHaveBeenCalledTimes(10);
  });
});

describe('GET /api/price/:ticker', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('requires an api key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const ctx = buildApp({ logger: false });
      await ctx.server.ready();
      try {
        const response = await ctx.server.inject({
          method: 'GET',
          url: '/api/price/NVDA?range=1m',
        });

        expect(response.statusCode).toBe(401);
      } finally {
        await safeCloseServer(ctx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('returns candle data for a valid ticker and range', async () => {
    const priceChartService = {
      getCandles: vi.fn().mockResolvedValue(ok({
        ticker: 'NVDA',
        range: '3m',
        candles: [
          {
            time: '2026-03-10',
            open: 118.2,
            high: 121.1,
            low: 117.4,
            close: 120.6,
            volume: 41000000,
          },
        ],
      })),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      priceChartService: priceChartService as never,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/nvda?range=3m',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ticker: 'NVDA',
      range: '3m',
      candles: [
        {
          time: '2026-03-10',
          open: 118.2,
          high: 121.1,
          low: 117.4,
          close: 120.6,
          volume: 41000000,
        },
      ],
    });
    expect(priceChartService.getCandles).toHaveBeenCalledWith('NVDA', '3m');
    await safeCloseServer(ctx.server);
  });

  it('defaults range to 1m when omitted', async () => {
    const priceChartService = {
      getCandles: vi.fn().mockResolvedValue(ok({
        ticker: 'NVDA',
        range: '1m',
        candles: [],
      })),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      priceChartService: priceChartService as never,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(priceChartService.getCandles).toHaveBeenCalledWith('NVDA', '1m');
    await safeCloseServer(ctx.server);
  });

  it('rejects unsupported range values', async () => {
    const ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/NVDA?range=10y',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(400);
    await safeCloseServer(ctx.server);
  });

  it('returns 404 when no candle data exists for the ticker', async () => {
    const priceChartService = {
      getCandles: vi.fn().mockResolvedValue(err(new Error('No price data found for NVDA'))),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      priceChartService: priceChartService as never,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/NVDA?range=1m',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('No price data found');
    await safeCloseServer(ctx.server);
  });
});

describe('GET /api/price/batch', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('returns current quotes for the requested tickers', async () => {
    const marketDataCache = {
      getOrFetch: vi
        .fn()
        .mockResolvedValueOnce({
          symbol: 'NVDA',
          price: 178.5,
          change1d: 2.3,
          change5d: 4.1,
          change20d: 9.4,
          volumeRatio: 1.1,
          rsi14: 61,
          high52w: 181.2,
          low52w: 88.5,
          support: 170.1,
          resistance: 180.4,
        })
        .mockResolvedValueOnce({
          symbol: 'TSLA',
          price: 212.75,
          change1d: -3.4,
          change5d: -1.2,
          change20d: 5.9,
          volumeRatio: 1.4,
          rsi14: 49,
          high52w: 275.0,
          low52w: 138.8,
          support: 205.0,
          resistance: 218.0,
        }),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      marketDataCache,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/batch?tickers=nvda,TSLA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      NVDA: {
        price: 178.5,
        change: 178.5 * 2.3 / 100,
        changePercent: 2.3,
      },
      TSLA: {
        price: 212.75,
        change: 212.75 * -3.4 / 100,
        changePercent: -3.4,
      },
    });
    expect(marketDataCache.getOrFetch).toHaveBeenNthCalledWith(1, 'NVDA');
    expect(marketDataCache.getOrFetch).toHaveBeenNthCalledWith(2, 'TSLA');
    await safeCloseServer(ctx.server);
  });

  it('returns a non-503 fallback payload when live price data is unavailable', async () => {
    const priceBatchService = {
      getQuotes: vi.fn().mockResolvedValue({
        prices: {},
        error: 'Price data temporarily unavailable',
      }),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      priceBatchService: priceBatchService as never,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/batch?tickers=AAPL',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      prices: {},
      error: 'Price data temporarily unavailable',
    });
    await safeCloseServer(ctx.server);
  });

  it('deduplicates and normalizes requested tickers', async () => {
    const marketDataCache = {
      getOrFetch: vi.fn().mockResolvedValue({
        symbol: 'NVDA',
        price: 178.5,
        change1d: 2.3,
        change5d: 4.1,
        change20d: 9.4,
        volumeRatio: 1.1,
        rsi14: 61,
        high52w: 181.2,
        low52w: 88.5,
        support: 170.1,
        resistance: 180.4,
      }),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      marketDataCache,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/batch?tickers=NVDA,nvda,NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      NVDA: {
        price: 178.5,
        change: 178.5 * 2.3 / 100,
        changePercent: 2.3,
      },
    });
    expect(marketDataCache.getOrFetch).toHaveBeenCalledTimes(1);
    expect(marketDataCache.getOrFetch).toHaveBeenCalledWith('NVDA');
    await safeCloseServer(ctx.server);
  });

  it('drops tickers whose quote lookup fails', async () => {
    const marketDataCache = {
      getOrFetch: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          symbol: 'TSLA',
          price: 212.75,
          change1d: -3.4,
          change5d: -1.2,
          change20d: 5.9,
          volumeRatio: 1.4,
          rsi14: 49,
          high52w: 275.0,
          low52w: 138.8,
          support: 205.0,
          resistance: 218.0,
        }),
    };
    const priceBatchService = {
      getQuotes: vi.fn().mockResolvedValue({ prices: {} }),
    };
    const ctx = buildApp({
      logger: false,
      apiKey: TEST_API_KEY,
      marketDataCache,
      priceBatchService: priceBatchService as never,
    });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/batch?tickers=NVDA,TSLA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      TSLA: {
        price: 212.75,
        change: 212.75 * -3.4 / 100,
        changePercent: -3.4,
      },
    });
    await safeCloseServer(ctx.server);
  });

  it('rejects an empty ticker list', async () => {
    const ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/price/batch?tickers=',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(400);
    await safeCloseServer(ctx.server);
  });
});
