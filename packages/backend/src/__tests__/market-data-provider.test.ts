import { describe, it, expect, vi } from 'vitest';
import { createMarketDataProvider } from '../services/create-market-data-provider.js';
import {
  AlphaVantageMarketDataProvider,
} from '../services/providers/alpha-vantage-provider.js';
import { MarketDataError } from '../services/market-data-provider.js';

function createDailySeriesResponse(days = 40) {
  const entries: Record<string, Record<string, string>> = {};
  const startDate = new Date(Date.UTC(2024, 0, 2));
  let close = 100;

  for (let day = 0; day < days; day++) {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + day);
    const dateKey = date.toISOString().slice(0, 10);

    entries[dateKey] = {
      '1. open': String(close - 1),
      '2. high': String(close + 2),
      '3. low': String(close - 3),
      '4. close': String(close),
      '5. adjusted close': String(close),
      '6. volume': String(1_000_000 + day * 10_000),
    };

    close += 1;
  }

  return {
    'Meta Data': {
      '1. Information': 'Daily Prices (open, high, low, close) and Volumes',
      '2. Symbol': 'AAPL',
      '3. Last Refreshed': '2024-02-10',
      '4. Output Size': 'Compact',
      '5. Time Zone': 'US/Eastern',
    },
    'Time Series (Daily)': entries,
  };
}

function createFetchResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('AlphaVantageMarketDataProvider', () => {
  it('derives quote metrics from daily adjusted time series data', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse(createDailySeriesResponse()),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    const quote = await provider.getQuote('AAPL');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain('TIME_SERIES_DAILY_ADJUSTED');
    expect(quote).toMatchObject({
      symbol: 'AAPL',
      price: 139,
      change1d: 0.7246,
      change5d: 3.7313,
      change20d: 16.8067,
      volumeRatio: 1.0817,
      rsi14: 100,
      high52w: 139,
      low52w: 100,
      support: 100,
      resistance: 139,
    });
  });

  it('retries once after a rate-limit note and then succeeds', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        createFetchResponse({ Note: 'Thank you for using Alpha Vantage!' }),
      )
      .mockResolvedValueOnce(
        createFetchResponse(createDailySeriesResponse()),
      );

    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      maxRetries: 1,
      backoffMs: 0,
    });

    const indicators = await provider.getIndicators('AAPL');

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(indicators).toMatchObject({
      symbol: 'AAPL',
      price: 139,
      change20d: 16.8067,
      resistance: 139,
    });
  });

  it('uses the earliest available close when there is not enough history for 20d change', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse(createDailySeriesResponse(3)),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    const quote = await provider.getQuote('AAPL');

    expect(quote.change1d).toBe(0.9901);
    expect(quote.change5d).toBe(2);
    expect(quote.change20d).toBe(2);
  });

  it('returns neutral RSI when there is only one data point', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse(createDailySeriesResponse(1)),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    const quote = await provider.getQuote('AAPL');

    expect(quote.change1d).toBe(0);
    expect(quote.rsi14).toBe(50);
    expect(quote.volumeRatio).toBe(1);
  });

  it('uses adjusted close values when available', async () => {
    const payload = createDailySeriesResponse(2);
    payload['Time Series (Daily)'][Object.keys(payload['Time Series (Daily)'])[1]!] = {
      '1. open': '100',
      '2. high': '102',
      '3. low': '98',
      '4. close': '999',
      '5. adjusted close': '101',
      '6. volume': '1000000',
    };

    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(payload));
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    const quote = await provider.getQuote('AAPL');

    expect(quote.change1d).toBeCloseTo((101 - 100) / 100 * 100, 4);
  });

  it('encodes the symbol in the Alpha Vantage request URL', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse(createDailySeriesResponse()),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    await provider.getQuote('BRK.B');

    expect(fetchFn.mock.calls[0]?.[0]).toContain('symbol=BRK.B');
    expect(fetchFn.mock.calls[0]?.[0]).toContain('apikey=test-key');
  });

  it('creates an Alpha Vantage provider from the factory', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse(createDailySeriesResponse()),
    );

    const provider = createMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    expect(provider).toBeInstanceOf(AlphaVantageMarketDataProvider);
    await expect(provider.getQuote('AAPL')).resolves.toMatchObject({ symbol: 'AAPL' });
  });

  it('throws on HTTP errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse({}, 500));
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    await expect(provider.getQuote('AAPL')).rejects.toThrow('Alpha Vantage API returned 500');
  });

  it('throws after exhausting rate-limit retries', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () =>
      createFetchResponse({ Information: 'API rate limit reached' }),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      maxRetries: 1,
      backoffMs: 0,
    });

    await expect(provider.getQuote('AAPL')).rejects.toThrow('Alpha Vantage rate limit exceeded');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws on malformed daily time series payloads', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse({ 'Meta Data': { '2. Symbol': 'AAPL' } }),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    const quotePromise = provider.getQuote('AAPL');
    await expect(quotePromise).rejects.toThrow(MarketDataError);
    await expect(quotePromise).rejects.toThrow('Malformed Alpha Vantage response');
  });

  it('throws on invalid numeric fields', async () => {
    const payload = createDailySeriesResponse(2);
    payload['Time Series (Daily)'][Object.keys(payload['Time Series (Daily)'])[0]!] = {
      '1. open': '100',
      '2. high': '102',
      '3. low': '98',
      '4. close': '100',
      '5. adjusted close': 'not-a-number',
      '6. volume': '1000000',
    };

    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(createFetchResponse(payload));
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    await expect(provider.getQuote('AAPL')).rejects.toThrow('Malformed Alpha Vantage response');
  });

  it('throws when the time series is empty', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      createFetchResponse({
        'Meta Data': { '2. Symbol': 'AAPL' },
        'Time Series (Daily)': {},
      }),
    );
    const provider = new AlphaVantageMarketDataProvider({
      apiKey: 'test-key',
      fetchFn,
      backoffMs: 0,
    });

    await expect(provider.getQuote('AAPL')).rejects.toThrow('Malformed Alpha Vantage response');
  });
});
