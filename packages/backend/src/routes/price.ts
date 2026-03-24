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

const DEFAULT_CACHE_TTL_MS = 300_000;
const DEFAULT_BATCH_RETRY_DELAYS_MS = [250, 500];
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_MS = 300_000;
const PRICE_TEMPORARILY_UNAVAILABLE_ERROR = 'Price data temporarily unavailable';

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

export type PriceBatchResponse = Record<string, PriceBatchQuote | null>;

export interface PriceBatchUnavailableResponse {
  prices: PriceBatchResponse;
  error: string;
}

export interface PriceBatchService {
  getQuotes(tickers: string[]): Promise<{ prices: PriceBatchResponse; error?: string }>;
}

interface YahooChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
}

interface YahooChartResult {
  quotes?: YahooChartQuote[];
}

interface YahooQuoteResult {
  regularMarketPrice?: number | null;
  regularMarketChange?: number | null;
  regularMarketChangePercent?: number | null;
}

interface YahooFinanceChartClient {
  chart(
    symbol: string,
    options: {
      interval: '1d';
      period1: Date;
      period2: Date;
    },
  ): Promise<YahooChartResult>;
}

interface YahooFinanceQuoteClient {
  quote(symbol: string): Promise<YahooQuoteResult>;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function quoteToBatchQuote(quote: YahooQuoteResult): PriceBatchQuote | null {
  const price = quote.regularMarketPrice;
  if (typeof price !== 'number' || Number.isNaN(price)) {
    return null;
  }

  const changePercent = typeof quote.regularMarketChangePercent === 'number'
    ? quote.regularMarketChangePercent
    : 0;
  const change = typeof quote.regularMarketChange === 'number'
    ? quote.regularMarketChange
    : price * changePercent / 100;

  if (Number.isNaN(change) || Number.isNaN(changePercent)) {
    return null;
  }

  return {
    price,
    change,
    changePercent,
  };
}

function normalizeBatchQuote(quote: MarketQuote): PriceBatchQuote {
  return {
    price: quote.price,
    change: quote.price * quote.change1d / 100,
    changePercent: quote.change1d,
  };
}

export class YahooPriceChartService implements PriceChartService {
  private readonly cache = new Map<string, CacheEntry<PriceChartResponse>>();
  private readonly yahooFinance: YahooFinanceChartClient;
  private readonly cacheTtlMs: number;

  constructor(options?: {
    yahooFinance?: YahooFinanceChartClient;
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

export class YahooPriceBatchService implements PriceBatchService {
  private readonly cache = new Map<string, CacheEntry<PriceBatchQuote>>();
  private readonly yahooFinance: YahooFinanceQuoteClient;
  private readonly cacheTtlMs: number;
  private readonly retryDelaysMs: number[];
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(options?: {
    yahooFinance?: YahooFinanceQuoteClient;
    cacheTtlMs?: number;
    retryDelaysMs?: number[];
    circuitBreakerThreshold?: number;
    circuitBreakerMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.yahooFinance = options?.yahooFinance ?? new YahooFinance();
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_BATCH_RETRY_DELAYS_MS;
    this.circuitBreakerThreshold = options?.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.circuitBreakerMs = options?.circuitBreakerMs ?? DEFAULT_CIRCUIT_BREAKER_MS;
    this.now = options?.now ?? (() => Date.now());
    this.sleep = options?.sleep ?? sleep;
  }

  async getQuotes(tickers: string[]): Promise<{ prices: PriceBatchResponse; error?: string }> {
    const prices: PriceBatchResponse = {};
    const normalizedTickers = Array.from(
      new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)),
    );

    if (normalizedTickers.length === 0) {
      return { prices };
    }

    if (this.now() < this.circuitOpenUntil) {
      for (const ticker of normalizedTickers) {
        const staleCached = this.getCachedQuote(ticker, true);
        if (staleCached) {
          prices[ticker] = staleCached;
        }
      }

      return Object.keys(prices).length > 0
        ? { prices }
        : { prices: {}, error: PRICE_TEMPORARILY_UNAVAILABLE_ERROR };
    }

    for (const ticker of normalizedTickers) {
      const freshCached = this.getCachedQuote(ticker, false);
      if (freshCached) {
        prices[ticker] = freshCached;
        continue;
      }

      const result = await this.fetchQuoteWithRetry(ticker);
      if (result.ok) {
        this.setCachedQuote(ticker, result.value);
        this.recordSuccess();
        prices[ticker] = result.value;
        continue;
      }

      if (result.error.message.includes('No price data found')) {
        prices[ticker] = null;
        continue;
      }

      this.recordFailure();

      const staleCached = this.getCachedQuote(ticker, true);
      if (staleCached) {
        prices[ticker] = staleCached;
      }
    }

    return Object.keys(prices).length > 0
      ? { prices }
      : { prices: {}, error: PRICE_TEMPORARILY_UNAVAILABLE_ERROR };
  }

  private async fetchQuoteWithRetry(ticker: string): Promise<Result<PriceBatchQuote, Error>> {
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt += 1) {
      try {
        const quote = await this.yahooFinance.quote(ticker);
        const normalized = quoteToBatchQuote(quote);
        if (!normalized) {
          return err(new Error(`No price data found for ${ticker}`));
        }

        return ok(normalized);
      } catch (error) {
        if (attempt === this.retryDelaysMs.length) {
          return err(error instanceof Error ? error : new Error(String(error)));
        }

        await this.sleep(this.retryDelaysMs[attempt] ?? 0);
      }
    }

    return err(new Error(`No price data found for ${ticker}`));
  }

  private getCachedQuote(ticker: string, allowStale: boolean): PriceBatchQuote | null {
    const entry = this.cache.get(ticker);
    if (!entry) {
      return null;
    }

    if (!allowStale && this.now() > entry.expiresAt) {
      return null;
    }

    return entry.data;
  }

  private setCachedQuote(ticker: string, quote: PriceBatchQuote): void {
    this.cache.set(ticker, {
      data: quote,
      expiresAt: this.now() + this.cacheTtlMs,
    });
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.circuitOpenUntil = this.now() + this.circuitBreakerMs;
    }
  }
}

export interface PriceRouteOptions {
  apiKey?: string;
  priceChartService?: PriceChartService;
  priceBatchService?: PriceBatchService;
  marketDataCache?: {
    getOrFetch(symbol: string): Promise<MarketQuote | undefined>;
  };
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
  const priceBatchService = options?.priceBatchService ?? new YahooPriceBatchService();

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

    const payload: PriceBatchResponse = {};
    const missingTickers = new Set(tickers);

    if (options?.marketDataCache) {
      const quotes = await Promise.allSettled(
        tickers.map(async (ticker) => ({
          ticker,
          quote: await options.marketDataCache?.getOrFetch(ticker),
        })),
      );

      for (const item of quotes) {
        if (item.status !== 'fulfilled' || !item.value.quote) {
          continue;
        }

        payload[item.value.ticker] = normalizeBatchQuote(item.value.quote);
        missingTickers.delete(item.value.ticker);
      }
    }

    if (missingTickers.size > 0) {
      const fallback = await priceBatchService.getQuotes(Array.from(missingTickers));
      Object.assign(payload, fallback.prices);

      if (Object.keys(payload).length === 0) {
        const unavailable: PriceBatchUnavailableResponse = {
          prices: {},
          error: fallback.error ?? PRICE_TEMPORARILY_UNAVAILABLE_ERROR,
        };
        return reply.send(unavailable);
      }
    }

    for (const ticker of tickers) {
      if (!(ticker in payload)) {
        payload[ticker] = null;
      }
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
