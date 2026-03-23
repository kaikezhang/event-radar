import type { FastifyInstance } from 'fastify';
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import { err, ok, type Result } from '@event-radar/shared';
import type { MarketQuote } from '../services/market-data-provider.js';
import { requireApiKey } from './auth-middleware.js';

const PriceRangeSchema = z.enum(['1w', '1m', '3m', '6m', '1y']);
const PriceTickerSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z][A-Za-z0-9.-]{0,9}$/);
const PriceRouteParamsSchema = z.object({
  ticker: PriceTickerSchema,
});
const PriceRouteQuerySchema = z.object({
  range: PriceRangeSchema.default('1m'),
});
const PriceBatchQuerySchema = z.object({
  tickers: z
    .string()
    .trim()
    .min(1),
});

export type PriceRange = z.infer<typeof PriceRangeSchema>;

export interface PriceCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceChartResponse {
  ticker: string;
  range: PriceRange;
  candles: PriceCandle[];
}

export interface PriceChartService {
  getCandles(ticker: string, range: PriceRange): Promise<Result<PriceChartResponse, Error>>;
}

export interface PriceBatchQuote {
  price: number;
  change: number;
  changePercent: number;
}

export type PriceBatchResponse = Record<string, PriceBatchQuote>;

interface YahooQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
}

interface YahooChartResult {
  quotes?: YahooQuote[];
}

interface YahooFinanceClient {
  chart(
    symbol: string,
    options: {
      interval: '1d';
      period1: Date;
      period2: Date;
    },
  ): Promise<YahooChartResult>;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 300_000;

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getPeriodStart(now: Date, range: PriceRange): Date {
  const start = new Date(now);

  switch (range) {
    case '1w':
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case '1m':
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    case '3m':
      start.setUTCMonth(start.getUTCMonth() - 3);
      break;
    case '6m':
      start.setUTCMonth(start.getUTCMonth() - 6);
      break;
    case '1y':
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      break;
  }

  return start;
}

export class YahooPriceChartService implements PriceChartService {
  private readonly cache = new Map<string, CacheEntry<PriceChartResponse>>();
  private readonly yahooFinance: YahooFinanceClient;
  private readonly cacheTtlMs: number;

  constructor(options?: {
    yahooFinance?: YahooFinanceClient;
    cacheTtlMs?: number;
  }) {
    this.yahooFinance = options?.yahooFinance ?? new YahooFinance();
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getCandles(ticker: string, range: PriceRange): Promise<Result<PriceChartResponse, Error>> {
    const normalizedTicker = ticker.toUpperCase();
    const cacheKey = `${normalizedTicker}:${range}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return ok(cached);
    }

    const now = new Date();
    const period1 = getPeriodStart(now, range);

    try {
      const chartResult = await this.yahooFinance.chart(normalizedTicker, {
        period1,
        period2: now,
        interval: '1d',
      });

      const candles: PriceCandle[] = [];

      for (const quote of chartResult.quotes ?? []) {
        if (
          !(quote.date instanceof Date) ||
          quote.open == null ||
          quote.high == null ||
          quote.low == null ||
          quote.close == null
        ) {
          continue;
        }

        candles.push({
          time: toDateKey(quote.date),
          open: quote.open,
          high: quote.high,
          low: quote.low,
          close: quote.close,
          volume: quote.volume ?? 0,
        });
      }

      if (candles.length === 0) {
        return err(new Error(`No price data found for ${normalizedTicker}`));
      }

      const payload: PriceChartResponse = {
        ticker: normalizedTicker,
        range,
        candles,
      };

      this.cache.set(cacheKey, {
        data: payload,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return ok(payload);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getFromCache(key: string): PriceChartResponse | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }
}

export interface PriceRouteOptions {
  apiKey?: string;
  priceChartService?: PriceChartService;
  marketDataCache?: {
    getOrFetch(symbol: string): Promise<MarketQuote | undefined>;
  };
}

function normalizeBatchTickers(input: string): string[] | null {
  const unique = new Set<string>();

  for (const rawTicker of input.split(',')) {
    const parsedTicker = PriceTickerSchema.safeParse(rawTicker);
    if (!parsedTicker.success) {
      return null;
    }

    unique.add(parsedTicker.data.toUpperCase());
  }

  return Array.from(unique);
}

export function registerPriceRoutes(
  server: FastifyInstance,
  options?: PriceRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  const priceChartService = options?.priceChartService ?? new YahooPriceChartService();

  server.get('/api/price/batch', { preHandler: withAuth }, async (request, reply) => {
    const query = PriceBatchQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid ticker list',
      });
    }

    const tickers = normalizeBatchTickers(query.data.tickers);
    if (!tickers || tickers.length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid ticker list',
      });
    }

    if (!options?.marketDataCache) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Real-time price data is unavailable',
      });
    }

    const quotes = await Promise.all(
      tickers.map(async (ticker) => ({
        ticker,
        quote: await options.marketDataCache?.getOrFetch(ticker),
      })),
    );

    const payload: PriceBatchResponse = {};
    for (const item of quotes) {
      if (!item.quote) {
        continue;
      }

      payload[item.ticker] = {
        price: item.quote.price,
        change: item.quote.change1d,
        changePercent: item.quote.change1d,
      };
    }

    return reply.send(payload);
  });

  server.get('/api/price/:ticker', { preHandler: withAuth }, async (request, reply) => {
    const params = PriceRouteParamsSchema.safeParse(request.params);
    const query = PriceRouteQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid ticker or range',
      });
    }

    const result = await priceChartService.getCandles(
      params.data.ticker.toUpperCase(),
      query.data.range,
    );

    if (!result.ok) {
      const statusCode = result.error.message.includes('No price data found') ? 404 : 502;
      return reply.status(statusCode).send({
        error: statusCode === 404 ? 'Not Found' : 'Bad Gateway',
        message: result.error.message,
      });
    }

    return reply.send(result.value);
  });
}
