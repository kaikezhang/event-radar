import { eq, sql } from 'drizzle-orm';
import type { HistoricalContext } from '@event-radar/delivery';
import type {
  LlmClassificationResult,
  RawEvent,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { companies, tickerHistory } from '../db/historical-schema.js';
import type { MarketSnapshot } from './market-context-cache.js';
import {
  findSimilarFromOutcomes,
  type OutcomeSimilarEvent,
} from './outcome-similarity.js';
import {
  findSimilarEvents,
  type SimilarEvent,
  type SimilarityQuery,
  type SimilarityResult,
} from './similarity.js';
import {
  mapEventToSimilarityQuery,
} from '../pipeline/event-type-mapper.js';
import { extractTickers } from '../scanners/ticker-extractor.js';

const OUTCOME_SCORE_THRESHOLD = 0.4;
const DEFAULT_EXAMPLES_LIMIT = 3;
const MIN_VISIBLE_SAMPLE_SIZE = 10;
const MEDIUM_CONFIDENCE_SAMPLE_SIZE = 20;
const HIGH_CONFIDENCE_SAMPLE_SIZE = 30;
const OUTCOME_TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'announced',
  'announces',
  'announcing',
  'alert',
  'after',
  'amid',
  'at',
  'before',
  'breaking',
  'company',
  'corp',
  'corporation',
  'enters',
  'entered',
  'for',
  'from',
  'inc',
  'into',
  'latest',
  'massive',
  'market',
  'news',
  'on',
  'report',
  'reported',
  'reports',
  'say',
  'says',
  'shares',
  'spike',
  'stock',
  'the',
  'trending',
  'update',
  'updates',
]);

async function lookupSectorForTicker(
  db: Database,
  ticker: string,
): Promise<string | undefined> {
  const normalizedTicker = ticker.toUpperCase();

  try {
    const rows = await db
      .select({
        ticker: tickerHistory.ticker,
        sector: companies.sector,
      })
      .from(tickerHistory)
      .innerJoin(companies, eq(companies.id, tickerHistory.companyId))
      .where(eq(sql`upper(${tickerHistory.ticker})`, normalizedTicker));

    return rows[0]?.sector ?? undefined;
  } catch {
    return undefined;
  }
}

export type PatternConfidenceLabel =
  | 'insufficient'
  | 'low'
  | 'medium'
  | 'high';

export interface PatternMatchExample {
  eventId: string;
  ticker: string;
  headline: string;
  source?: string;
  eventTime: string;
  score: number;
  move1d?: number | null;
  moveT5?: number | null;
  moveT20?: number | null;
  move1w?: number | null;
  move1m?: number | null;
}

export interface PatternMatchCase {
  ticker: string;
  headline: string;
  source?: string;
  eventTime: string;
  moveT20: number;
}

interface PatternLegacyContext {
  avgAlphaT5: number;
  avgAlphaT20: number;
  avgChange1d?: number;
  avgChange1w?: number;
  winRateT20: number;
  medianAlphaT20: number;
  bestCase?: HistoricalContext['bestCase'];
  worstCase?: HistoricalContext['worstCase'];
  topMatches: HistoricalContext['topMatches'];
  similarEvents?: HistoricalContext['similarEvents'];
  patternSummary: string;
}

export interface PatternMatchResult {
  count: number;
  confidence: PatternConfidenceLabel;
  confidenceLabel: PatternConfidenceLabel;
  suppressed: boolean;
  avgMoveT5: number | null;
  avgMoveT20: number | null;
  winRateT5: number | null;
  winRateT20: number | null;
  bestCase: PatternMatchCase | null;
  worstCase: PatternMatchCase | null;
  examples: PatternMatchExample[];
  matchSource: 'outcomes' | 'historical';
  legacyContext?: PatternLegacyContext;
}

export interface PatternMatcherOptions {
  llmResult?: LlmClassificationResult;
  marketSnapshot?: MarketSnapshot | null;
  examplesLimit?: number;
}

export class PatternMatcher {
  constructor(private readonly db: Database) {}

  async findSimilar(
    event: RawEvent,
    options: PatternMatcherOptions = {},
  ): Promise<PatternMatchResult | null> {
    const outcomeMatch = await this.findOutcomeMatches(event, options);
    if (outcomeMatch && !outcomeMatch.suppressed) {
      return outcomeMatch;
    }

    const historicalMatch = await this.findHistoricalMatches(event, options);
    if (historicalMatch) {
      return historicalMatch;
    }

    return outcomeMatch;
  }

  async findHistoricalContext(
    event: RawEvent,
    options: PatternMatcherOptions = {},
  ): Promise<HistoricalContext | null> {
    const match = await this.findSimilar(event, options);
    if (!match) {
      return null;
    }

    return toHistoricalContext(match);
  }

  private async findOutcomeMatches(
    event: RawEvent,
    options: PatternMatcherOptions,
  ): Promise<PatternMatchResult | null> {
    const query = buildOutcomeSimilarityQuery(event, options.llmResult);
    const matches = await findSimilarFromOutcomes(this.db, query);
    const qualifyingMatches = matches.filter(
      (match) => match.score >= OUTCOME_SCORE_THRESHOLD,
    );

    if (qualifyingMatches.length === 0) {
      return null;
    }

    const confidenceLabel = confidenceFromCount(qualifyingMatches.length);
    const suppressed = qualifyingMatches.length < MIN_VISIBLE_SAMPLE_SIZE;
    const examplesLimit = resolveExamplesLimit(options.examplesLimit);

    const avgMoveT5 = averageNumbers(
      qualifyingMatches.map((match) => match.changeT5),
    );
    const avgMoveT20 = averageNumbers(
      qualifyingMatches.map((match) => match.changeT20),
    );
    const avgChange1d = averageNumbers(
      qualifyingMatches.map((match) => match.change1d),
    );
    const avgChange1w = averageNumbers(
      qualifyingMatches.map((match) => match.change1w),
    );
    const medianMoveT20 = medianNumbers(
      qualifyingMatches.map((match) => match.changeT20),
    );
    const winRateT5 = computePositiveRate(
      qualifyingMatches.map((match) => match.changeT5),
    );
    const winRateT20 = computePositiveRate(
      qualifyingMatches.map((match) => match.changeT20),
    );

    const bestCase = suppressed
      ? null
      : selectOutcomeExtremeMatch(qualifyingMatches, 'best');
    const worstCase = suppressed
      ? null
      : selectOutcomeExtremeMatch(qualifyingMatches, 'worst');

    const examples = qualifyingMatches.slice(0, examplesLimit).map((match) => ({
      eventId: match.eventId,
      ticker: match.ticker,
      headline: match.title,
      source: match.source,
      eventTime: match.eventTime,
      score: match.score,
      move1d: match.change1d,
      moveT5: match.changeT5,
      moveT20: match.changeT20,
      move1w: match.change1w,
      move1m: match.change1m,
    }));

    return {
      count: qualifyingMatches.length,
      confidence: confidenceLabel,
      confidenceLabel,
      suppressed,
      avgMoveT5: suppressed ? null : avgMoveT5,
      avgMoveT20: suppressed ? null : avgMoveT20,
      winRateT5: suppressed ? null : winRateT5,
      winRateT20: suppressed ? null : winRateT20,
      bestCase,
      worstCase,
      examples,
      matchSource: 'outcomes',
      legacyContext: suppressed
        ? undefined
        : {
            avgAlphaT5: avgMoveT5 ?? 0,
            avgAlphaT20: avgMoveT20 ?? 0,
            avgChange1d: avgChange1d ?? undefined,
            avgChange1w: avgChange1w ?? undefined,
            winRateT20: winRateT20 ?? 0,
            medianAlphaT20: medianMoveT20 ?? 0,
            bestCase: bestCase
              ? {
                  ticker: bestCase.ticker,
                  alphaT20: bestCase.moveT20,
                  headline: bestCase.headline,
                }
              : undefined,
            worstCase: worstCase
              ? {
                  ticker: worstCase.ticker,
                  alphaT20: worstCase.moveT20,
                  headline: worstCase.headline,
                }
              : undefined,
            topMatches: qualifyingMatches.slice(0, 3).map((match) => ({
              ticker: match.ticker,
              headline: match.title,
              source: match.source,
              eventDate: match.eventTime,
              alphaT20: match.changeT20 ?? 0,
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
              avgMoveT20,
            ),
          },
    };
  }

  private async findHistoricalMatches(
    event: RawEvent,
    options: PatternMatcherOptions,
  ): Promise<PatternMatchResult | null> {
    const mapped = mapEventToSimilarityQuery(
      event,
      options.llmResult,
      options.marketSnapshot,
    );
    if (!mapped) {
      return null;
    }

    const sector =
      mapped.sector ??
      (mapped.ticker
        ? await lookupSectorForTicker(this.db, mapped.ticker)
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

    const results = await Promise.all(
      buildQueryVariants(event, baseQuery).map((query) =>
        findSimilarEvents(this.db, query),
      ),
    );
    const bestResult = selectBestSimilarityResult(results);
    if (!bestResult || bestResult.stats.count === 0) {
      return null;
    }

    return buildHistoricalPatternResult(bestResult, {
      sector,
      eventType: mapped.eventType,
      eventSubtype: mapped.eventSubtype,
      marketRegime: mapped.marketRegime,
      examplesLimit: resolveExamplesLimit(options.examplesLimit),
    });
  }
}

export function toHistoricalContext(
  match: PatternMatchResult,
): HistoricalContext | null {
  if (match.suppressed || !match.legacyContext) {
    return null;
  }

  return {
    matchCount: match.count,
    confidence: match.confidenceLabel,
    avgAlphaT5: match.legacyContext.avgAlphaT5,
    avgAlphaT20: match.legacyContext.avgAlphaT20,
    avgChange1d: match.legacyContext.avgChange1d,
    avgChange1w: match.legacyContext.avgChange1w,
    winRateT20: match.legacyContext.winRateT20,
    medianAlphaT20: match.legacyContext.medianAlphaT20,
    bestCase: match.legacyContext.bestCase,
    worstCase: match.legacyContext.worstCase,
    topMatches: match.legacyContext.topMatches,
    similarEvents: match.legacyContext.similarEvents,
    patternSummary: match.legacyContext.patternSummary,
  };
}

function buildHistoricalPatternResult(
  result: SimilarityResult,
  input: {
    sector?: string;
    eventType: string;
    eventSubtype?: string;
    marketRegime?: string;
    examplesLimit: number;
  },
): PatternMatchResult {
  const confidenceLabel = confidenceFromCount(result.stats.count);
  const suppressed = result.stats.count < MIN_VISIBLE_SAMPLE_SIZE;
  const avgMoveT5 = averageNumbers(result.events.map((event) => event.returnT5));
  const avgMoveT20 = averageNumbers(result.events.map((event) => event.returnT20));
  const winRateT5 = computePositiveRate(result.events.map((event) => event.returnT5));
  const winRateT20 = computePositiveRate(result.events.map((event) => event.returnT20));
  const bestCase = suppressed
    ? null
    : selectSimilarityExtremeMatch(result.events, 'best');
  const worstCase = suppressed
    ? null
    : selectSimilarityExtremeMatch(result.events, 'worst');

  return {
    count: result.stats.count,
    confidence: confidenceLabel,
    confidenceLabel,
    suppressed,
    avgMoveT5: suppressed ? null : avgMoveT5,
    avgMoveT20: suppressed ? null : avgMoveT20,
    winRateT5: suppressed ? null : winRateT5,
    winRateT20: suppressed ? null : winRateT20,
    bestCase,
    worstCase,
    examples: result.events.slice(0, input.examplesLimit).map((event) => ({
      eventId: event.eventId,
      ticker: event.ticker,
      headline: event.headline,
      eventTime: event.eventDate,
      score: event.score,
      moveT5: event.returnT5,
      moveT20: event.returnT20,
    })),
    matchSource: 'historical',
    legacyContext: suppressed
      ? undefined
      : {
          avgAlphaT5: result.stats.avgAlphaT5,
          avgAlphaT20: result.stats.avgAlphaT20,
          avgChange1d: result.stats.avgReturnT1,
          avgChange1w: result.stats.avgReturnT5,
          winRateT20: result.stats.winRateT20,
          medianAlphaT20: result.stats.medianAlphaT20,
          bestCase: result.stats.bestCase ?? undefined,
          worstCase: result.stats.worstCase ?? undefined,
          topMatches: result.events.slice(0, 3).map((match) => ({
            ticker: match.ticker,
            headline: match.headline,
            source: undefined,
            eventDate: match.eventDate,
            alphaT20: match.alphaT20,
            score: match.score,
          })),
          similarEvents: result.events.slice(0, 5).map((match) => ({
            title: match.headline,
            ticker: match.ticker,
            eventTime: match.eventDate,
            change1d: match.returnT1,
            change1w: match.returnT5,
            change1m: match.returnT20,
            score: match.score,
          })),
          patternSummary: generatePatternSummary({
            sector: input.sector,
            eventType: input.eventType,
            eventSubtype: input.eventSubtype,
            marketRegime: input.marketRegime,
            avgAlphaT20: result.stats.avgAlphaT20,
            winRateT20: result.stats.winRateT20,
            count: result.stats.count,
          }),
        },
  };
}

function selectBestSimilarityResult(
  results: SimilarityResult[],
): SimilarityResult | null {
  return (
    [...results].sort((left, right) => {
      const leftConfidence = confidenceRank(confidenceFromCount(left.stats.count));
      const rightConfidence = confidenceRank(confidenceFromCount(right.stats.count));
      if (rightConfidence !== leftConfidence) {
        return rightConfidence - leftConfidence;
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
) {
  const ticker = extractPrimaryTicker(event);

  return {
    ticker,
    source: event.source,
    severity: llmResult?.severity?.toLowerCase(),
    titleKeywords: extractOutcomeTitleKeywords(event.title, ticker),
    limit: 10,
    excludeEventId: event.id,
  };
}

function buildQueryVariants(
  event: RawEvent,
  baseQuery: SimilarityQuery,
): SimilarityQuery[] {
  if (
    event.source === 'breaking-news' &&
    (
      baseQuery.eventType === 'earnings_beat' ||
      baseQuery.eventType === 'earnings_miss' ||
      baseQuery.eventType === 'earnings_guidance'
    )
  ) {
    return [
      baseQuery,
      {
        ...baseQuery,
        eventType: 'sec_form_8k',
        eventSubtype: undefined,
      },
    ];
  }

  return [baseQuery];
}

export function extractPrimaryTicker(event: RawEvent): string | undefined {
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

function extractOutcomeTitleKeywords(
  title: string,
  primaryTicker?: string,
): string[] {
  const excludedTickers = new Set(
    [primaryTicker, ...extractTickers(title)]
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      )
      .map((value) => value.toLowerCase()),
  );

  return Array.from(new Set(title.toLowerCase().match(/[a-z]+/g) ?? []))
    .filter((token) => token.length >= 3)
    .filter((token) => !OUTCOME_TITLE_STOP_WORDS.has(token))
    .filter((token) => !excludedTickers.has(token))
    .slice(0, 8);
}

function confidenceFromCount(count: number): PatternConfidenceLabel {
  if (count >= HIGH_CONFIDENCE_SAMPLE_SIZE) {
    return 'high';
  }

  if (count >= MEDIUM_CONFIDENCE_SAMPLE_SIZE) {
    return 'medium';
  }

  if (count >= MIN_VISIBLE_SAMPLE_SIZE) {
    return 'low';
  }

  return 'insufficient';
}

function confidenceRank(value: PatternConfidenceLabel): number {
  switch (value) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function averageNumbers(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) {
    return null;
  }

  return Number(
    (
      present.reduce((sum, value) => sum + value, 0) / present.length
    ).toFixed(4),
  );
}

function medianNumbers(values: Array<number | null>): number | null {
  const present = values
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
  if (present.length === 0) {
    return null;
  }

  const middle = Math.floor(present.length / 2);
  if (present.length % 2 === 0) {
    return Number(
      (
        ((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2
      ).toFixed(4),
    );
  }

  return Number((present[middle] ?? 0).toFixed(4));
}

function computePositiveRate(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) {
    return null;
  }

  return Number(
    (
      (present.filter((value) => value > 0).length / present.length) *
      100
    ).toFixed(2),
  );
}

function selectOutcomeExtremeMatch(
  matches: OutcomeSimilarEvent[],
  direction: 'best' | 'worst',
): PatternMatchCase | null {
  const comparable = matches.filter((match) => match.changeT20 != null);
  if (comparable.length === 0) {
    return null;
  }

  const selected = comparable.reduce((current, candidate) => {
    if (current.changeT20 == null) {
      return candidate;
    }

    if (direction === 'best') {
      return (candidate.changeT20 ?? -Infinity) >
        (current.changeT20 ?? -Infinity)
        ? candidate
        : current;
    }

    return (candidate.changeT20 ?? Infinity) <
      (current.changeT20 ?? Infinity)
      ? candidate
      : current;
  });

  if (selected.changeT20 == null) {
    return null;
  }

  return {
    ticker: selected.ticker,
    headline: selected.title,
    source: selected.source,
    eventTime: selected.eventTime,
    moveT20: selected.changeT20,
  };
}

function selectSimilarityExtremeMatch(
  matches: SimilarEvent[],
  direction: 'best' | 'worst',
): PatternMatchCase | null {
  if (matches.length === 0) {
    return null;
  }

  const selected = matches.reduce((current, candidate) => {
    if (direction === 'best') {
      return candidate.returnT20 > current.returnT20 ? candidate : current;
    }

    return candidate.returnT20 < current.returnT20 ? candidate : current;
  });

  return {
    ticker: selected.ticker,
    headline: selected.headline,
    eventTime: selected.eventDate,
    moveT20: selected.returnT20,
  };
}

function resolveExamplesLimit(value?: number): number {
  if (!Number.isFinite(value) || value == null || value <= 0) {
    return DEFAULT_EXAMPLES_LIMIT;
  }

  return Math.floor(value);
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

function generateOutcomePatternSummary(
  source: string,
  count: number,
  avgMoveT20: number | null,
): string {
  const normalizedSource = source.replaceAll('-', ' ');
  const t20Move = avgMoveT20 ?? 0;
  const sign = t20Move >= 0 ? '+' : '';

  return `${normalizedSource}: ${sign}${(t20Move * 100).toFixed(1)}% avg move by T+20 (${count} cases)`;
}
