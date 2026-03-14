import type { HistoricalContext } from '@event-radar/delivery';
import type { LlmClassificationResult, RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { historicalEnrichmentTimeoutsTotal } from '../metrics.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import { extractKeywords } from '../services/event-similarity.js';
import {
  findSimilarFromOutcomes,
  type OutcomeSimilarEvent,
  type OutcomeSimilarityQuery,
} from '../services/outcome-similarity.js';
import {
  findSimilarEvents,
  type SimilarityQuery,
  type SimilarityResult,
} from '../services/similarity.js';
import {
  mapEventToSimilarityQuery,
  resolveSectorForTicker,
} from './event-type-mapper.js';
import { extractTickers } from '../scanners/ticker-extractor.js';

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

const OUTCOME_SCORE_THRESHOLD = 0.3;
const MIN_OUTCOME_MATCHES = 2;

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
    const outcomeContext = await this.buildOutcomeHistoricalContext(event, llmResult);
    if (outcomeContext) {
      if (
        CONFIDENCE_ORDER[outcomeContext.confidence] <
        CONFIDENCE_ORDER[this.minConfidence]
      ) {
        return null;
      }

      return outcomeContext;
    }

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
      avgChange1d: similarityResult.stats.avgReturnT1,
      avgChange1w: similarityResult.stats.avgReturnT5,
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
      similarEvents: similarityResult.events.slice(0, 5).map((match) => ({
        title: match.headline,
        ticker: match.ticker,
        eventTime: match.eventDate,
        change1d: match.returnT1,
        change1w: match.returnT5,
        change1m: match.returnT20,
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

  private async buildOutcomeHistoricalContext(
    event: RawEvent,
    llmResult?: LlmClassificationResult,
  ): Promise<HistoricalContext | null> {
    const query = buildOutcomeSimilarityQuery(event, llmResult);
    const matches = await findSimilarFromOutcomes(this.db, query);
    const qualifyingMatches = matches.filter((match) => match.score > OUTCOME_SCORE_THRESHOLD);

    if (qualifyingMatches.length < MIN_OUTCOME_MATCHES) {
      return null;
    }

    const avgChange1d = averageNumbers(qualifyingMatches.map((match) => match.change1d));
    const avgChange1w = averageNumbers(qualifyingMatches.map((match) => match.change1w));
    const medianChange1w = medianNumbers(qualifyingMatches.map((match) => match.change1w));
    const winRate1w = computePositiveRate(qualifyingMatches.map((match) => match.change1w));
    const bestCase = selectExtremeMatch(qualifyingMatches, 'best');
    const worstCase = selectExtremeMatch(qualifyingMatches, 'worst');

    return {
      matchCount: qualifyingMatches.length,
      confidence: confidenceFromCount(qualifyingMatches.length),
      avgAlphaT5: avgChange1d ?? 0,
      avgAlphaT20: avgChange1w ?? 0,
      avgChange1d: avgChange1d ?? undefined,
      avgChange1w: avgChange1w ?? undefined,
      winRateT20: winRate1w,
      medianAlphaT20: medianChange1w ?? 0,
      bestCase,
      worstCase,
      topMatches: qualifyingMatches.slice(0, 3).map((match) => ({
        ticker: match.ticker,
        headline: match.title,
        eventDate: match.eventTime,
        alphaT20: match.change1w ?? 0,
        score: match.score,
      })),
      similarEvents: qualifyingMatches.slice(0, 5).map((match) => ({
        title: match.title,
        ticker: match.ticker,
        source: match.source,
        eventTime: match.eventTime,
        eventPrice: match.eventPrice,
        change1h: match.change1h,
        change1d: match.change1d,
        change1w: match.change1w,
        change1m: match.change1m,
        score: match.score,
      })),
      patternSummary: generateOutcomePatternSummary(
        query.source ?? event.source,
        qualifyingMatches.length,
        avgChange1w,
      ),
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

function buildOutcomeSimilarityQuery(
  event: RawEvent,
  llmResult?: LlmClassificationResult,
): OutcomeSimilarityQuery {
  return {
    ticker: extractTicker(event),
    source: event.source,
    severity: llmResult?.severity?.toLowerCase(),
    titleKeywords: extractKeywords(event.title).slice(0, 8),
    limit: 10,
    excludeEventId: event.id,
  };
}

function extractTicker(event: RawEvent): string | undefined {
  const metadataTicker = event.metadata?.['ticker'];
  if (typeof metadataTicker === 'string' && metadataTicker.trim().length > 0) {
    return metadataTicker.trim().toUpperCase();
  }

  return extractTickers(`${event.title} ${event.body}`)[0]?.toUpperCase();
}

function averageNumbers(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) {
    return null;
  }

  return Number((present.reduce((sum, value) => sum + value, 0) / present.length).toFixed(4));
}

function medianNumbers(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null).sort((a, b) => a - b);
  if (present.length === 0) {
    return null;
  }

  const middle = Math.floor(present.length / 2);
  if (present.length % 2 === 0) {
    return Number((((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2).toFixed(4));
  }

  return Number((present[middle] ?? 0).toFixed(4));
}

function computePositiveRate(values: Array<number | null>): number {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) {
    return 0;
  }

  return Number(
    ((present.filter((value) => value > 0).length / present.length) * 100).toFixed(2),
  );
}

function selectExtremeMatch(
  matches: OutcomeSimilarEvent[],
  direction: 'best' | 'worst',
): HistoricalContext['bestCase'] | HistoricalContext['worstCase'] | undefined {
  const comparable = matches.filter((match) => match.change1w != null);
  if (comparable.length === 0) {
    return undefined;
  }

  const selected = comparable.reduce((current, candidate) => {
    if (current.change1w == null) {
      return candidate;
    }

    if (direction === 'best') {
      return (candidate.change1w ?? -Infinity) > (current.change1w ?? -Infinity)
        ? candidate
        : current;
    }

    return (candidate.change1w ?? Infinity) < (current.change1w ?? Infinity)
      ? candidate
      : current;
  });

  if (selected.change1w == null) {
    return undefined;
  }

  return {
    ticker: selected.ticker,
    alphaT20: selected.change1w,
    headline: selected.title,
  };
}

function confidenceFromCount(count: number): ConfidenceLevel {
  if (count >= 5) {
    return 'high';
  }

  if (count >= 3) {
    return 'medium';
  }

  if (count >= 2) {
    return 'low';
  }

  return 'insufficient';
}

function generateOutcomePatternSummary(
  source: string,
  count: number,
  avgChange1w: number | null,
): string {
  const normalizedSource = source.replaceAll('-', ' ');
  const weeklyMove = avgChange1w ?? 0;
  const sign = weeklyMove >= 0 ? '+' : '';

  return `${normalizedSource}: ${sign}${(weeklyMove * 100).toFixed(1)}% avg move in 1w (${count} cases)`;
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
