import type { HistoricalContext } from '@event-radar/delivery';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { historicalEnrichmentTimeoutsTotal } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import type { MarketQuote } from '../services/market-data-provider.js';
import {
  generatePatternSummary as generatePatternSummaryFromMatcher,
  PatternMatcher,
  toHistoricalContext,
} from '../services/pattern-matcher.js';
import { extractTickers } from '../scanners/ticker-extractor.js';

export type ConfidenceLevel = HistoricalContext['confidence'];

interface HistoricalTickerMarketDataSource {
  getOrFetch(symbol: string): Promise<MarketQuote | undefined>;
}

export interface HistoricalEnricherConfig {
  enabled?: boolean;
  minConfidence?: ConfidenceLevel;
  timeoutMs?: number;
  marketDataCache?: HistoricalTickerMarketDataSource;
}

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  insufficient: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export class HistoricalEnricher {
  private readonly enabled: boolean;
  private readonly minConfidence: ConfidenceLevel;
  private readonly patternMatcher: PatternMatcher;
  private readonly tickerMarketDataCache?: HistoricalTickerMarketDataSource;
  private readonly timeoutMs: number;

  constructor(
    db: Database,
    private readonly marketCache: MarketContextCache,
    config?: HistoricalEnricherConfig,
  ) {
    this.enabled =
      config?.enabled ?? process.env.HISTORICAL_ENRICHMENT_ENABLED !== 'false';
    this.minConfidence =
      config?.minConfidence ??
      parseConfidence(process.env.HISTORICAL_MIN_CONFIDENCE) ??
      'low';
    this.patternMatcher = new PatternMatcher(db);
    this.tickerMarketDataCache = config?.marketDataCache;
    this.timeoutMs =
      config?.timeoutMs ??
      parsePositiveInt(process.env.HISTORICAL_TIMEOUT_MS) ??
      2_000;
  }

  async enrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null> {
    if (!this.enabled) {
      return null;
    }

    const timeout = Symbol('historical-timeout');
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race<
        HistoricalContext | null | typeof timeout
      >([
        this.doEnrich(event, llmResult),
        new Promise<typeof timeout>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(timeout), this.timeoutMs);
        }),
      ]);

      if (result === timeout) {
        historicalEnrichmentTimeoutsTotal.inc();
        return null;
      }

      return result;
    } catch (error) {
      console.error(
        '[historical-enricher] Error:',
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      if (timeoutHandle != null) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async doEnrich(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null> {
    const match = await this.patternMatcher.findSimilar(event, {
      llmResult,
      marketSnapshot: this.marketCache.get(),
    });
    if (!match) {
      return null;
    }

    const context = toHistoricalContext(match);
    if (!context) {
      return null;
    }

    if (
      CONFIDENCE_ORDER[context.confidence] <
      CONFIDENCE_ORDER[this.minConfidence]
    ) {
      return null;
    }

    return this.attachTickerMarketContext(event, context);
  }

  private async attachTickerMarketContext(
    event: RawEvent,
    context: HistoricalContext,
  ): Promise<HistoricalContext> {
    if (!this.tickerMarketDataCache) {
      return context;
    }

    const ticker = extractPrimaryTicker(event);
    if (!ticker) {
      return context;
    }

    try {
      const marketContext = await this.tickerMarketDataCache.getOrFetch(ticker);
      if (!marketContext) {
        return context;
      }

      return {
        ...context,
        marketContext,
      };
    } catch (error) {
      console.error(
        '[historical-enricher] Failed to load per-ticker market context:',
        error instanceof Error ? error.message : error,
      );
      return context;
    }
  }
}

export const generatePatternSummary = generatePatternSummaryFromMatcher;

function extractPrimaryTicker(event: RawEvent): string | undefined {
  const metadataTicker = event.metadata?.['ticker'];
  if (typeof metadataTicker === 'string' && metadataTicker.trim().length > 0) {
    return metadataTicker.trim().toUpperCase();
  }

  const primaryTicker = event.metadata?.['primary_ticker'];
  if (typeof primaryTicker === 'string' && primaryTicker.trim().length > 0) {
    return primaryTicker.trim().toUpperCase();
  }

  const alternatePrimaryTicker = event.metadata?.['primaryTicker'];
  if (
    typeof alternatePrimaryTicker === 'string' &&
    alternatePrimaryTicker.trim().length > 0
  ) {
    return alternatePrimaryTicker.trim().toUpperCase();
  }

  const tickers = event.metadata?.['tickers'];
  if (Array.isArray(tickers)) {
    const firstTicker = tickers.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );
    if (firstTicker) {
      return firstTicker.trim().toUpperCase();
    }
  }

  return extractTickers(`${event.title} ${event.body}`)[0]?.toUpperCase();
}

function parseConfidence(value?: string): ConfidenceLevel | undefined {
  if (
    value === 'insufficient' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  ) {
    return value;
  }

  return undefined;
}

function parsePositiveInt(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
