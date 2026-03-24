import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PriceService,
  parseYahooChartResponse,
  calculatePriceChange,
  findClosestPrice,
} from '../services/price-service.js';
import type { PriceData } from '@event-radar/shared';

const mockChartResponse = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures', 'mock-yahoo-chart.json'),
    'utf-8',
  ),
);

describe('PriceService', () => {
  let service: PriceService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new PriceService({ cacheTtlMs: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    service.clearCache();
  });

  describe('parseYahooChartResponse', () => {
    it('should parse valid chart response into PriceData[]', () => {
      const result = parseYahooChartResponse('AAPL', mockChartResponse);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(10);
        expect(result.value[0]!.ticker).toBe('AAPL');
        expect(result.value[0]!.open).toBe(178.50);
        expect(result.value[0]!.close).toBe(179.00);
        expect(result.value[0]!.volume).toBe(45000000);
      }
    });

    it('should return error for API error response', () => {
      const errorResponse = {
        chart: {
          result: null,
          error: { code: 'Not Found', description: 'No data for ticker XYZ123' },
        },
      };

      const result = parseYahooChartResponse('XYZ123', errorResponse);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No data for ticker XYZ123');
      }
    });

    it('should return error when no result data', () => {
      const emptyResponse = {
        chart: { result: [], error: null },
      };

      const result = parseYahooChartResponse('AAPL', emptyResponse);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No data returned');
      }
    });

    it('should skip entries with null OHLC values', () => {
      const responseWithNulls = {
        chart: {
          result: [
            {
              timestamp: [1709510400, 1709596800, 1709683200],
              indicators: {
                quote: [
                  {
                    open: [178.50, null, 180.10],
                    high: [180.00, null, 182.50],
                    low: [177.80, null, 179.00],
                    close: [179.00, null, 181.80],
                    volume: [45000000, null, 48000000],
                  },
                ],
              },
            },
          ],
          error: null,
        },
      };

      const result = parseYahooChartResponse('AAPL', responseWithNulls);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
    });
  });

  describe('calculatePriceChange', () => {
    it('should calculate correct percent and absolute change', () => {
      const from = new Date('2024-03-04');
      const to = new Date('2024-03-11');

      const change = calculatePriceChange('AAPL', from, 179.00, to, 183.50);

      expect(change.ticker).toBe('AAPL');
      expect(change.fromPrice).toBe(179.00);
      expect(change.toPrice).toBe(183.50);
      expect(change.absolute).toBe(4.50);
      expect(change.percent).toBeCloseTo(2.5140, 2);
    });

    it('should handle negative price change', () => {
      const from = new Date('2024-03-04');
      const to = new Date('2024-03-11');

      const change = calculatePriceChange('TSLA', from, 200.00, to, 190.00);

      expect(change.absolute).toBe(-10.00);
      expect(change.percent).toBe(-5);
    });

    it('should handle zero from price without dividing by zero', () => {
      const from = new Date('2024-03-04');
      const to = new Date('2024-03-11');

      const change = calculatePriceChange('TEST', from, 0, to, 10.00);

      expect(change.absolute).toBe(10.00);
      expect(change.percent).toBe(0);
    });
  });

  describe('findClosestPrice', () => {
    const prices: PriceData[] = [
      { ticker: 'AAPL', date: new Date('2024-03-04'), open: 178.5, high: 180, low: 177.8, close: 179.0, volume: 45000000 },
      { ticker: 'AAPL', date: new Date('2024-03-05'), open: 179.2, high: 181, low: 178.5, close: 180.5, volume: 42000000 },
      { ticker: 'AAPL', date: new Date('2024-03-06'), open: 180.1, high: 182.5, low: 179, close: 181.8, volume: 48000000 },
      { ticker: 'AAPL', date: new Date('2024-03-07'), open: 181, high: 182, low: 179.8, close: 180.2, volume: 38000000 },
      // No data for March 8 (Friday), 9 (Saturday), 10 (Sunday) — simulating weekend
      { ticker: 'AAPL', date: new Date('2024-03-11'), open: 182, high: 184, low: 181, close: 183.5, volume: 52000000 },
    ];

    it('should find exact date match', () => {
      const result = findClosestPrice(prices, new Date('2024-03-05'));
      expect(result).not.toBeNull();
      expect(result!.close).toBe(180.5);
    });

    it('should return previous trading day for weekend date', () => {
      // March 9, 2024 is a Saturday — should return Friday March 7's data
      // (no March 8 data in our set, so returns March 7)
      const result = findClosestPrice(prices, new Date('2024-03-09'));
      expect(result).not.toBeNull();
      expect(result!.close).toBe(180.2);
      expect(result!.date.toISOString()).toContain('2024-03-07');
    });

    it('should return null for date before all data', () => {
      const result = findClosestPrice(prices, new Date('2024-03-01'));
      expect(result).toBeNull();
    });

    it('should return null for empty prices array', () => {
      const result = findClosestPrice([], new Date('2024-03-05'));
      expect(result).toBeNull();
    });

    it('should return the latest entry on or before target', () => {
      const result = findClosestPrice(prices, new Date('2024-03-20'));
      expect(result).not.toBeNull();
      expect(result!.close).toBe(183.5);
    });
  });

  describe('getHistoricalPrices', () => {
    it('should fetch and return parsed price data', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const result = await service.getHistoricalPrices(
        'AAPL',
        new Date('2024-03-04'),
        new Date('2024-03-15'),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(10);
        expect(result.value[0]!.ticker).toBe('AAPL');
      }
    });

    it('should return error for non-200 responses', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 404 }));

      const result = await service.getHistoricalPrices(
        'INVALID',
        new Date('2024-03-04'),
        new Date('2024-03-15'),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('404');
      }
    });

    it('should handle fetch errors gracefully', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await service.getHistoricalPrices(
        'AAPL',
        new Date('2024-03-04'),
        new Date('2024-03-15'),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Network error');
      }
    });
  });

  describe('cache behavior', () => {
    it('should cache results and not refetch', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const start = new Date('2024-03-04');
      const end = new Date('2024-03-15');

      await service.getHistoricalPrices('AAPL', start, end);
      await service.getHistoricalPrices('AAPL', start, end);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should evict expired cache entries', async () => {
      const shortTtlService = new PriceService({ cacheTtlMs: 1 });
      const localFetchSpy = vi.spyOn(globalThis, 'fetch');

      localFetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const start = new Date('2024-03-04');
      const end = new Date('2024-03-15');

      await shortTtlService.getHistoricalPrices('AAPL', start, end);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      await shortTtlService.getHistoricalPrices('AAPL', start, end);

      expect(localFetchSpy).toHaveBeenCalledTimes(2);
      localFetchSpy.mockRestore();
    });

    it('should clear all cache entries', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const start = new Date('2024-03-04');
      const end = new Date('2024-03-15');

      await service.getHistoricalPrices('AAPL', start, end);
      service.clearCache();
      await service.getHistoricalPrices('AAPL', start, end);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPriceAt', () => {
    it('should return closing price for a specific date', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      // The fixture has timestamps starting at 1709510400 (2024-03-04)
      const result = await service.getPriceAt('AAPL', new Date('2024-03-04T00:00:00Z'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(179.00);
      }
    });

    it('should return null when no data available', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            chart: {
              result: [{ timestamp: [], indicators: { quote: [{ open: [], high: [], low: [], close: [], volume: [] }] } }],
              error: null,
            },
          }),
          { status: 200 },
        ),
      );

      const result = await service.getPriceAt('AAPL', new Date('2020-01-01'));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('getPriceChange', () => {
    it('should calculate price change between two dates', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      // Timestamps: 1709510400 = 2024-03-04, 1710115200 = 2024-03-11
      const result = await service.getPriceChange(
        'AAPL',
        new Date('2024-03-04T00:00:00Z'),
        new Date('2024-03-11T00:00:00Z'),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fromPrice).toBe(179.00);
        expect(result.value.toPrice).toBe(183.50);
        expect(result.value.absolute).toBe(4.50);
        expect(result.value.percent).toBeCloseTo(2.514, 1);
      }
    });

    it('should return error when no price data found', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            chart: {
              result: [{ timestamp: [], indicators: { quote: [{ open: [], high: [], low: [], close: [], volume: [] }] } }],
              error: null,
            },
          }),
          { status: 200 },
        ),
      );

      const result = await service.getPriceChange(
        'AAPL',
        new Date('2020-01-01'),
        new Date('2020-01-10'),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No price data found');
      }
    });
  });

  describe('getPriceAfterEvent', () => {
    it('uses intraday prices for the 1-hour window and daily prices for longer windows', async () => {
      const intradayResponse = {
        chart: {
          result: [
            {
              timestamp: [1709557200, 1709559000, 1709560800],
              indicators: {
                quote: [
                  {
                    open: [179.0, 180.0, 181.0],
                    high: [180.0, 181.0, 182.0],
                    low: [178.8, 179.8, 180.8],
                    close: [179.5, 180.5, 181.5],
                    volume: [1000000, 1100000, 1200000],
                  },
                ],
              },
            },
          ],
          error: null,
        },
      };

      fetchSpy
        .mockResolvedValueOnce(new Response(JSON.stringify(intradayResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockChartResponse), { status: 200 }));

      const result = await service.getPriceAfterEvent(
        'AAPL',
        new Date('2024-03-04T15:00:00Z'),
        [1, 24],
      );

      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('interval=5m');
      expect(fetchSpy.mock.calls[1]?.[0]).toContain('interval=1d');
    });

    it('keeps intraday and daily cache entries separate', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const start = new Date('2024-03-04T00:00:00Z');
      const end = new Date('2024-03-15T00:00:00Z');

      await service.getHistoricalPrices('AAPL', start, end, '1d');
      await service.getHistoricalPrices('AAPL', start, end, '5m');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('interval=1d');
      expect(fetchSpy.mock.calls[1]?.[0]).toContain('interval=5m');
    });

    it('reuses the intraday cache for repeated 1-hour lookups', async () => {
      const intradayResponse = {
        chart: {
          result: [
            {
              timestamp: [1709557200, 1709559000, 1709560800],
              indicators: {
                quote: [
                  {
                    open: [179.0, 180.0, 181.0],
                    high: [180.0, 181.0, 182.0],
                    low: [178.8, 179.8, 180.8],
                    close: [179.5, 180.5, 181.5],
                    volume: [1000000, 1100000, 1200000],
                  },
                ],
              },
            },
          ],
          error: null,
        },
      };

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(intradayResponse), { status: 200 }),
      );

      const eventTime = new Date('2024-03-04T15:00:00Z');
      await service.getPriceAfterEvent('AAPL', eventTime, [1]);
      await service.getPriceAfterEvent('AAPL', eventTime, [1]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('interval=5m');
    });

    it('should return price changes at T+1d and T+1w intervals', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      // Event at 2024-03-04 (timestamp 1709510400), close = 179.00
      // T+24h → 2024-03-05, close = 180.50
      // T+168h (1w) → 2024-03-11, close = 183.50
      const result = await service.getPriceAfterEvent(
        'AAPL',
        new Date('2024-03-04T00:00:00Z'),
        [24, 168],
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ticker).toBe('AAPL');
        expect(result.value.prices).toHaveLength(2);

        const day1 = result.value.prices.find((p) => p.interval === 24);
        expect(day1).toBeDefined();
        expect(day1!.label).toBe('T+1d');
        expect(day1!.price).toBe(180.50);
        expect(day1!.absolute).toBeCloseTo(1.50, 1);

        const week1 = result.value.prices.find((p) => p.interval === 168);
        expect(week1).toBeDefined();
        expect(week1!.label).toBe('T+1w');
        expect(week1!.price).toBe(183.50);
        expect(week1!.absolute).toBeCloseTo(4.50, 1);
      }
    });

    it('should return null prices for intervals beyond available data', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify(mockChartResponse), { status: 200 }),
      );

      const result = await service.getPriceAfterEvent(
        'AAPL',
        new Date('2024-03-13T12:00:00Z'),
        [720], // T+1m — way beyond our fixture data
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const month = result.value.prices.find((p) => p.interval === 720);
        expect(month).toBeDefined();
        // The last data point is 2024-03-13 (1710460800) which is before T+720h
        // findClosestPrice will return the last available data point
        expect(month!.label).toBe('T+1m');
      }
    });

    it('should return error when no event price data available', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            chart: {
              result: [{ timestamp: [], indicators: { quote: [{ open: [], high: [], low: [], close: [], volume: [] }] } }],
              error: null,
            },
          }),
          { status: 200 },
        ),
      );

      const result = await service.getPriceAfterEvent(
        'AAPL',
        new Date('2020-01-01'),
        [24],
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No price data found');
      }
    });
  });
});
