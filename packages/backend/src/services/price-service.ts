import { ok, err, type Result, type PriceData, type PriceChange, type PriceAfterEvent } from '@event-radar/shared';

interface YahooChartResult {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 3_600_000; // 1 hour

const INTERVAL_LABELS: Record<number, string> = {
  1: 'T+1h',
  24: 'T+1d',
  168: 'T+1w',
  720: 'T+1m',
};

/**
 * Parse Yahoo Finance v8 chart API response into PriceData[].
 */
export function parseYahooChartResponse(
  ticker: string,
  json: YahooChartResult,
): Result<PriceData[], Error> {
  if (json.chart.error) {
    return err(new Error(`Yahoo Finance error: ${json.chart.error.description}`));
  }

  const result = json.chart.result?.[0];
  if (!result) {
    return err(new Error(`No data returned for ${ticker}`));
  }

  const { timestamp: timestamps } = result;
  const quote = result.indicators.quote[0];
  if (!quote || !timestamps) {
    return err(new Error(`Missing quote data for ${ticker}`));
  }

  const prices: PriceData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close[i];
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const volume = quote.volume[i];

    // Skip entries with null values (market holidays, etc.)
    if (close == null || open == null || high == null || low == null) {
      continue;
    }

    prices.push({
      ticker,
      date: new Date(timestamps[i]! * 1000),
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
    });
  }

  return ok(prices);
}

/**
 * Calculate price change between two price points.
 */
export function calculatePriceChange(
  ticker: string,
  fromDate: Date,
  fromPrice: number,
  toDate: Date,
  toPrice: number,
): PriceChange {
  const absolute = toPrice - fromPrice;
  const percent = fromPrice !== 0 ? (absolute / fromPrice) * 100 : 0;

  return {
    ticker,
    fromDate,
    toDate,
    fromPrice,
    toPrice,
    absolute: Math.round(absolute * 100) / 100,
    percent: Math.round(percent * 10000) / 10000,
  };
}

/**
 * Find the closest price data point to a target date.
 * Returns the entry on or before the target date (previous trading day for holidays/weekends).
 */
export function findClosestPrice(
  prices: PriceData[],
  targetDate: Date,
): PriceData | null {
  if (prices.length === 0) return null;

  const targetMs = targetDate.getTime();
  let closest: PriceData | null = null;

  for (const price of prices) {
    const priceMs = price.date.getTime();
    if (priceMs <= targetMs) {
      if (!closest || priceMs > closest.date.getTime()) {
        closest = price;
      }
    }
  }

  return closest;
}

export class PriceService {
  private readonly cache = new Map<string, CacheEntry<PriceData[]>>();
  private readonly cacheTtlMs: number;

  /** Override for testing */
  public fetchFn: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(options?: { cacheTtlMs?: number }) {
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Get closing price at a specific date.
   * Returns the closing price on the given date, or the previous trading day's close
   * if the date falls on a weekend/holiday.
   */
  async getPriceAt(
    ticker: string,
    date: Date,
  ): Promise<Result<number | null, Error>> {
    // Fetch a range around the target date to handle holidays
    const from = new Date(date);
    from.setDate(from.getDate() - 7);
    const to = new Date(date);
    to.setDate(to.getDate() + 1);

    const result = await this.getHistoricalPrices(ticker, from, to);
    if (!result.ok) return result;

    const closest = findClosestPrice(result.value, date);
    return ok(closest?.close ?? null);
  }

  /**
   * Calculate price change between two dates.
   */
  async getPriceChange(
    ticker: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Result<PriceChange, Error>> {
    // Extend range to handle holidays at boundaries
    const fetchFrom = new Date(fromDate);
    fetchFrom.setDate(fetchFrom.getDate() - 7);
    const fetchTo = new Date(toDate);
    fetchTo.setDate(fetchTo.getDate() + 1);

    const result = await this.getHistoricalPrices(ticker, fetchFrom, fetchTo);
    if (!result.ok) return result;

    const fromPrice = findClosestPrice(result.value, fromDate);
    const toPrice = findClosestPrice(result.value, toDate);

    if (!fromPrice) {
      return err(new Error(`No price data found for ${ticker} around ${fromDate.toISOString()}`));
    }
    if (!toPrice) {
      return err(new Error(`No price data found for ${ticker} around ${toDate.toISOString()}`));
    }

    return ok(
      calculatePriceChange(ticker, fromDate, fromPrice.close, toDate, toPrice.close),
    );
  }

  /**
   * Fetch historical prices for a date range.
   */
  async getHistoricalPrices(
    ticker: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Result<PriceData[], Error>> {
    const cacheKey = `${ticker}:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return ok(cached);

    const period1 = Math.floor(startDate.getTime() / 1000);
    const period2 = Math.floor(endDate.getTime() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;

    try {
      const response = await this.fetchFn(url, {
        headers: {
          'User-Agent': 'event-radar/1.0',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return err(new Error(`Yahoo Finance API returned ${response.status} for ${ticker}`));
      }

      const json = (await response.json()) as YahooChartResult;
      const parsed = parseYahooChartResponse(ticker, json);

      if (parsed.ok) {
        this.setCache(cacheKey, parsed.value);
      }

      return parsed;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return err(error);
    }
  }

  /**
   * Get price changes at multiple intervals after an event.
   * intervals are in hours: [1, 24, 168, 720] = [1h, 1d, 1w, 1m]
   */
  async getPriceAfterEvent(
    ticker: string,
    eventTime: Date,
    intervals: number[] = [1, 24, 168, 720],
  ): Promise<Result<PriceAfterEvent, Error>> {
    const maxIntervalHours = Math.max(...intervals);
    const endDate = new Date(eventTime.getTime() + maxIntervalHours * 3_600_000 + 86_400_000);

    // Fetch range from 7 days before event to cover holiday lookback
    const startDate = new Date(eventTime);
    startDate.setDate(startDate.getDate() - 7);

    const result = await this.getHistoricalPrices(ticker, startDate, endDate);
    if (!result.ok) return result;

    const eventPrice = findClosestPrice(result.value, eventTime);
    if (!eventPrice) {
      return err(new Error(`No price data found for ${ticker} around event time`));
    }

    const priceIntervals = intervals.map((hours) => {
      const targetDate = new Date(eventTime.getTime() + hours * 3_600_000);
      const target = findClosestPrice(result.value, targetDate);

      const label = INTERVAL_LABELS[hours] ?? `T+${hours}h`;

      if (!target) {
        return { interval: hours, label, price: null, change: null, absolute: null };
      }

      const absolute = Math.round((target.close - eventPrice.close) * 100) / 100;
      const change =
        eventPrice.close !== 0
          ? Math.round(((target.close - eventPrice.close) / eventPrice.close) * 100 * 10000) / 10000
          : null;

      return {
        interval: hours,
        label,
        price: target.close,
        change,
        absolute,
      };
    });

    return ok({
      ticker,
      eventTime,
      prices: priceIntervals,
    });
  }

  /** Clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }

  private getFromCache(key: string): PriceData[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: PriceData[]): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }
}
