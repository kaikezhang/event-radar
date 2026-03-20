import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@event-radar/shared';
import { buildApp } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import { YahooPriceChartService } from '../routes/price.js';

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
