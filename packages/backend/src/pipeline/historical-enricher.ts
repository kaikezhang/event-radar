import type { HistoricalContext } from '@event-radar/delivery';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { historicalEnrichmentTimeoutsTotal } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import {
  findSimilarEvents,
  type SimilarityQuery,
  type SimilarityResult,
} from '../services/similarity.js';
import {
  mapEventToSimilarityQuery,
  resolveSectorForTicker,
} from './event-type-mapper.js';

export type ConfidenceLevel = HistoricalContext['confidence'];

export interface HistoricalEnricherConfig {
  enabled?: boolean;
  minConfidence?: ConfidenceLevel;
  timeoutMs?: number;
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
  private readonly timeoutMs: number;

  constructor(
    private readonly db: Database,
    private readonly marketCache: MarketContextCache,
    config?: HistoricalEnricherConfig,
  ) {
    this.enabled =
      config?.enabled ?? process.env.HISTORICAL_ENRICHMENT_ENABLED !== 'false';
    this.minConfidence =
      config?.minConfidence ??
      parseConfidence(process.env.HISTORICAL_MIN_CONFIDENCE) ??
      'low';
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
    const mapped = mapEventToSimilarityQuery(
      event,
      llmResult,
      this.marketCache.get(),
    );
    if (!mapped) {
      return null;
    }

    const sector =
      mapped.sector ??
      (mapped.ticker
        ? await resolveSectorForTicker(this.db, mapped.ticker)
        : undefined);

    const baseQuery: SimilarityQuery = {
      eventType: mapped.eventType,
      eventSubtype: mapped.eventSubtype,
      ticker: mapped.ticker,
      sector,
      severity: mapped.severity,
      vixLevel: mapped.vixLevel,
      marketRegime: mapped.marketRegime,
      epsSurprisePct: mapped.epsSurprisePct,
      consecutiveBeats: mapped.consecutiveBeats,
    };

    const similarityResults = await Promise.all(
      buildQueryVariants(event, baseQuery).map((query) =>
        findSimilarEvents(this.db, query),
      ),
    );
    const similarityResult = selectBestSimilarityResult(similarityResults);

    if (
      similarityResult == null ||
      CONFIDENCE_ORDER[similarityResult.confidence] <
        CONFIDENCE_ORDER[this.minConfidence]
    ) {
      return null;
    }

    return {
      matchCount: similarityResult.stats.count,
      confidence: similarityResult.confidence,
      avgAlphaT5: similarityResult.stats.avgAlphaT5,
      avgAlphaT20: similarityResult.stats.avgAlphaT20,
      winRateT20: similarityResult.stats.winRateT20,
      medianAlphaT20: similarityResult.stats.medianAlphaT20,
      bestCase: similarityResult.stats.bestCase ?? undefined,
      worstCase: similarityResult.stats.worstCase ?? undefined,
      topMatches: similarityResult.events.slice(0, 3).map((match) => ({
        ticker: match.ticker,
        headline: match.headline,
        eventDate: match.eventDate,
        alphaT20: match.alphaT20,
        score: match.score,
      })),
      patternSummary: generatePatternSummary({
        sector,
        eventType: mapped.eventType,
        eventSubtype: mapped.eventSubtype,
        marketRegime: mapped.marketRegime,
        avgAlphaT20: similarityResult.stats.avgAlphaT20,
        winRateT20: similarityResult.stats.winRateT20,
        count: similarityResult.stats.count,
      }),
    };
  }
}

export function generatePatternSummary(input: {
  sector?: string;
  eventType: string;
  eventSubtype?: string;
  marketRegime?: string;
  avgAlphaT20: number;
  winRateT20: number;
  count: number;
}): string {
  const descriptor = [
    input.sector,
    input.eventType.replaceAll('_', ' '),
    input.eventSubtype,
  ]
    .filter(Boolean)
    .join(' ');
  const prefix = input.marketRegime
    ? `${descriptor} in ${input.marketRegime} market`
    : descriptor;
  const sign = input.avgAlphaT20 >= 0 ? '+' : '';

  return `${prefix}: ${sign}${(input.avgAlphaT20 * 100).toFixed(1)}% avg alpha T+20, ${input.winRateT20.toFixed(0)}% win rate (${input.count} cases)`;
}

function buildQueryVariants(
  event: RawEvent,
  baseQuery: SimilarityQuery,
): SimilarityQuery[] {
  if (event.source === 'breaking-news' && baseQuery.eventType === 'earnings') {
    return [
      baseQuery,
      {
        ...baseQuery,
        eventType: 'earnings_results',
      },
    ];
  }

  return [baseQuery];
}

function selectBestSimilarityResult(
  results: SimilarityResult[],
): SimilarityResult | null {
  return (
    [...results].sort((left, right) => {
      const confidenceDelta =
        CONFIDENCE_ORDER[right.confidence] - CONFIDENCE_ORDER[left.confidence];
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      const countDelta = right.stats.count - left.stats.count;
      if (countDelta !== 0) {
        return countDelta;
      }

      return right.events.length - left.events.length;
    })[0] ?? null
  );
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
