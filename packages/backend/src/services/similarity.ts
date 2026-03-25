import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import {
  companies,
  eventMarketContext,
  eventReturns,
  eventStockContext,
  historicalEvents,
  metricsEarnings,
} from '../db/historical-schema.js';
import { toNumber } from '../utils/number.js';

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0;
const MAX_CANDIDATE_FETCH = 1_000;
const RECENCY_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

type ConfidenceLevel = 'insufficient' | 'low' | 'medium' | 'high';
type SeverityLogger = Pick<Console, 'debug'>;
const HISTORICAL_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export interface SimilarityQuery {
  eventType: string;
  eventSubtype?: string;
  ticker?: string;
  sector?: string;
  severity?: string;
  vixLevel?: number;
  marketRegime?: string;
  return30d?: number;
  marketCapTier?: string;
  epsSurprisePct?: number;
  consecutiveBeats?: number;
  limit?: number;
  minScore?: number;
}

export interface HistoricalSimilarityCandidate {
  eventId: string;
  eventType: string;
  eventSubtype: string | null;
  severity: string | null;
  ticker: string;
  headline: string;
  eventDate: string;
  sector: string | null;
  marketCapTier: string | null;
  marketRegime: string | null;
  vixLevel: number | null;
  return30d: number | null;
  epsSurprisePct?: number | null;
  consecutiveBeats?: number | null;
  returnT1: number;
  returnT5: number;
  returnT20: number;
  alphaT1: number;
  alphaT5: number;
  alphaT20: number;
}

export interface SimilarEvent {
  eventId: string;
  ticker: string;
  headline: string;
  eventDate: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  returnT1: number;
  returnT5: number;
  returnT20: number;
  alphaT1: number;
  alphaT5: number;
  alphaT20: number;
}

export interface AggregateStatsInput {
  ticker: string;
  headline: string;
  returnT1: number;
  returnT5: number;
  returnT20: number;
  alphaT1: number;
  alphaT5: number;
  alphaT20: number;
}

export interface AggregateStats {
  count: number;
  avgReturnT1: number;
  avgReturnT5: number;
  avgReturnT20: number;
  avgAlphaT1: number;
  avgAlphaT5: number;
  avgAlphaT20: number;
  winRateT20: number;
  medianAlphaT20: number;
  bestCase: { ticker: string; alphaT20: number; headline: string } | null;
  worstCase: { ticker: string; alphaT20: number; headline: string } | null;
}

export interface SimilarityResult {
  events: SimilarEvent[];
  confidence: ConfidenceLevel;
  stats: AggregateStats;
  totalCandidates: number;
}

export function parseSeverityCsv(raw?: string, logger?: SeverityLogger): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value): value is (typeof HISTORICAL_SEVERITIES)[number] => {
      const isKnownSeverity = HISTORICAL_SEVERITIES.includes(
        value as (typeof HISTORICAL_SEVERITIES)[number],
      );

      if (!isKnownSeverity) {
        logger?.debug(
          { severity: value },
          'Ignoring unrecognized historical severity filter',
        );
      }

      return isKnownSeverity;
    });
}

function normalizeText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.toLowerCase() : null;
}

function sameSign(left?: number | null, right?: number | null): boolean {
  if (left == null || right == null) {
    return false;
  }

  if (left === 0 || right === 0) {
    // Flat momentum on both sides is still treated as directionally aligned here.
    return left === right;
  }

  return Math.sign(left) === Math.sign(right);
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function percentileMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return round((sorted[middle - 1]! + sorted[middle]!) / 2);
  }

  return round(sorted[middle]!);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  // Population std dev is sufficient here; confidence only upgrades at 5+ matches.
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function allowedSeverities(minimumSeverity?: string): string[] {
  const normalized = normalizeText(minimumSeverity);
  if (normalized == null || !(normalized in SEVERITY_ORDER)) {
    return [];
  }

  const threshold = SEVERITY_ORDER[normalized as keyof typeof SEVERITY_ORDER];

  return Object.entries(SEVERITY_ORDER)
    .filter(([, rank]) => rank <= threshold)
    .map(([severity]) => severity);
}

function earningsMetricsBonus(
  query: SimilarityQuery,
  candidate: HistoricalSimilarityCandidate,
): number {
  if (normalizeText(query.eventType) !== 'earnings') {
    return 0;
  }

  let bonus = 0;

  if (query.epsSurprisePct != null && candidate.epsSurprisePct != null) {
    const surpriseDelta = Math.abs(query.epsSurprisePct - candidate.epsSurprisePct);
    if (surpriseDelta <= 2) {
      bonus += 2;
    } else if (surpriseDelta <= 5) {
      bonus += 1;
    }
  }

  if (
    query.consecutiveBeats != null &&
    candidate.consecutiveBeats != null &&
    Math.abs(query.consecutiveBeats - candidate.consecutiveBeats) <= 1
  ) {
    bonus += 1;
  }

  return Math.min(bonus, 3);
}

export function scoreCandidate(
  query: SimilarityQuery,
  candidate: HistoricalSimilarityCandidate,
  referenceDate: number | Date = Date.now(),
): { score: number; scoreBreakdown: Record<string, number> } {
  const scoreBreakdown: Record<string, number> = {};
  let score = 0;
  const referenceTime = referenceDate instanceof Date ? referenceDate.getTime() : referenceDate;
  const candidateTime = new Date(candidate.eventDate).getTime();

  if (
    normalizeText(query.eventSubtype) != null &&
    normalizeText(candidate.eventSubtype) === normalizeText(query.eventSubtype)
  ) {
    scoreBreakdown.subtypeMatch = 4;
    score += 4;
  }

  if (
    normalizeText(query.sector) != null &&
    normalizeText(candidate.sector) === normalizeText(query.sector)
  ) {
    scoreBreakdown.sameSector = 3;
    score += 3;
  }

  if (
    normalizeText(query.marketCapTier) != null &&
    normalizeText(candidate.marketCapTier) === normalizeText(query.marketCapTier)
  ) {
    scoreBreakdown.sameMarketCapTier = 2;
    score += 2;
  }

  if (
    normalizeText(query.marketRegime) != null &&
    normalizeText(candidate.marketRegime) === normalizeText(query.marketRegime)
  ) {
    scoreBreakdown.sameMarketRegime = 2;
    score += 2;
  }

  if (
    query.vixLevel != null &&
    candidate.vixLevel != null &&
    Math.abs(query.vixLevel - candidate.vixLevel) < 5
  ) {
    scoreBreakdown.similarVix = 1;
    score += 1;
  }

  if (sameSign(query.return30d, candidate.return30d)) {
    scoreBreakdown.similarMomentum = 1;
    score += 1;
  }

  if (
    Number.isFinite(referenceTime) &&
    candidateTime <= referenceTime &&
    referenceTime - candidateTime <= RECENCY_WINDOW_MS
  ) {
    scoreBreakdown.recencyBonus = 1;
    score += 1;
  }

  const metricsBonus = earningsMetricsBonus(query, candidate);
  if (metricsBonus > 0) {
    scoreBreakdown.metricsBonus = metricsBonus;
    score += metricsBonus;
  }

  return { score, scoreBreakdown };
}

export function calculateConfidence(alphaT20Values: number[]): ConfidenceLevel {
  if (alphaT20Values.length < 3) {
    return 'insufficient';
  }

  if (alphaT20Values.length < 5) {
    return 'low';
  }

  return standardDeviation(alphaT20Values) > 0.15 ? 'medium' : 'high';
}

export function calculateAggregateStats(
  events: AggregateStatsInput[],
): AggregateStats {
  if (events.length === 0) {
    return {
      count: 0,
      avgReturnT1: 0,
      avgReturnT5: 0,
      avgReturnT20: 0,
      avgAlphaT1: 0,
      avgAlphaT5: 0,
      avgAlphaT20: 0,
      winRateT20: 0,
      medianAlphaT20: 0,
      bestCase: null,
      worstCase: null,
    };
  }

  const average = (values: number[]) =>
    round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const alphaT20Values = events.map((event) => event.alphaT20);
  const sortedByAlpha = [...events].sort((left, right) => right.alphaT20 - left.alphaT20);

  return {
    count: events.length,
    avgReturnT1: average(events.map((event) => event.returnT1)),
    avgReturnT5: average(events.map((event) => event.returnT5)),
    avgReturnT20: average(events.map((event) => event.returnT20)),
    avgAlphaT1: average(events.map((event) => event.alphaT1)),
    avgAlphaT5: average(events.map((event) => event.alphaT5)),
    avgAlphaT20: average(alphaT20Values),
    winRateT20: round((alphaT20Values.filter((value) => value > 0).length / events.length) * 100, 2),
    medianAlphaT20: percentileMedian(alphaT20Values),
    bestCase: sortedByAlpha[0]
      ? {
          ticker: sortedByAlpha[0].ticker,
          alphaT20: sortedByAlpha[0].alphaT20,
          headline: sortedByAlpha[0].headline,
        }
      : null,
    // With a single similar event, best and worst case intentionally point to the same row.
    worstCase: sortedByAlpha.at(-1)
      ? {
          ticker: sortedByAlpha.at(-1)!.ticker,
          alphaT20: sortedByAlpha.at(-1)!.alphaT20,
          headline: sortedByAlpha.at(-1)!.headline,
        }
      : null,
  };
}

function buildCandidate(row: {
  eventId: string;
  eventType: string;
  eventSubtype: string | null;
  severity: string;
  ticker: string | null;
  headline: string;
  eventDate: Date;
  sector: string | null;
  marketCapTier: string | null;
  marketRegime: string | null;
  vixLevel: string | null;
  return30d: string | null;
  epsSurprisePct: string | null;
  consecutiveBeats: number | null;
  returnT1: string | null;
  returnT5: string | null;
  returnT20: string | null;
  alphaT1: string | null;
  alphaT5: string | null;
  alphaT20: string | null;
}): HistoricalSimilarityCandidate | null {
  const ticker = row.ticker?.trim();
  const returnT1 = toNumber(row.returnT1);
  const returnT5 = toNumber(row.returnT5);
  const returnT20 = toNumber(row.returnT20);
  const alphaT1 = toNumber(row.alphaT1);
  const alphaT5 = toNumber(row.alphaT5);
  const alphaT20 = toNumber(row.alphaT20);

  if (
    !ticker ||
    returnT1 == null ||
    returnT5 == null ||
    returnT20 == null ||
    alphaT1 == null ||
    alphaT5 == null ||
    alphaT20 == null
  ) {
    return null;
  }

  return {
    eventId: row.eventId,
    eventType: row.eventType,
    eventSubtype: row.eventSubtype,
    severity: row.severity,
    ticker,
    headline: row.headline,
    eventDate: row.eventDate.toISOString(),
    sector: row.sector,
    marketCapTier: row.marketCapTier,
    marketRegime: row.marketRegime,
    vixLevel: toNumber(row.vixLevel),
    return30d: toNumber(row.return30d),
    epsSurprisePct: toNumber(row.epsSurprisePct),
    consecutiveBeats: row.consecutiveBeats,
    returnT1,
    returnT5,
    returnT20,
    alphaT1,
    alphaT5,
    alphaT20,
  };
}

export async function findSimilarEvents(
  db: Database,
  query: SimilarityQuery,
): Promise<SimilarityResult> {
  const limit = Math.max(1, query.limit ?? DEFAULT_LIMIT);
  const minScore = query.minScore ?? DEFAULT_MIN_SCORE;
  const conditions = [
    eq(historicalEvents.eventType, query.eventType),
    isNotNull(eventReturns.alphaT20),
  ];

  const severityFilters = allowedSeverities(query.severity);
  if (severityFilters.length > 0) {
    conditions.push(inArray(historicalEvents.severity, severityFilters));
  }

  const rows = await db
    .select({
      eventId: historicalEvents.id,
      eventType: historicalEvents.eventType,
      eventSubtype: historicalEvents.eventSubtype,
      severity: historicalEvents.severity,
      ticker: historicalEvents.tickerAtTime,
      headline: historicalEvents.headline,
      eventDate: historicalEvents.eventTs,
      sector: companies.sector,
      marketCapTier: eventStockContext.marketCapTier,
      marketRegime: eventMarketContext.marketRegime,
      vixLevel: eventMarketContext.vixClose,
      return30d: eventStockContext.return30d,
      epsSurprisePct: metricsEarnings.epsSurprisePct,
      consecutiveBeats: metricsEarnings.consecutiveBeats,
      returnT1: eventReturns.returnT1,
      returnT5: eventReturns.returnT5,
      returnT20: eventReturns.returnT20,
      alphaT1: eventReturns.alphaT1,
      alphaT5: eventReturns.alphaT5,
      alphaT20: eventReturns.alphaT20,
    })
    .from(historicalEvents)
    .innerJoin(eventReturns, eq(eventReturns.eventId, historicalEvents.id))
    .leftJoin(companies, eq(companies.id, historicalEvents.companyId))
    .leftJoin(eventStockContext, eq(eventStockContext.eventId, historicalEvents.id))
    .leftJoin(eventMarketContext, eq(eventMarketContext.eventId, historicalEvents.id))
    .leftJoin(metricsEarnings, eq(metricsEarnings.eventId, historicalEvents.id))
    .where(and(...conditions))
    .orderBy(desc(historicalEvents.eventTs))
    // The dataset is still small (~2400 events total), so JS-side scoring stays intentional for flexibility.
    // This DB cap is just a guard rail against future bulk imports pulling an unbounded candidate set at once.
    .limit(MAX_CANDIDATE_FETCH);

  const candidates = rows
    .map(buildCandidate)
    .filter((candidate): candidate is HistoricalSimilarityCandidate => candidate != null);

  const allScored = candidates
    .map((candidate) => {
      const { score, scoreBreakdown } = scoreCandidate(query, candidate);
      return {
        candidate,
        score,
        scoreBreakdown,
      };
    })
    .filter((candidate) => candidate.score >= minScore)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.candidate.alphaT20 - left.candidate.alphaT20;
    });

  const toSimilarEvent = ({ candidate, score, scoreBreakdown }: (typeof allScored)[number]): SimilarEvent => ({
    eventId: candidate.eventId,
    ticker: candidate.ticker,
    headline: candidate.headline,
    eventDate: candidate.eventDate,
    score,
    scoreBreakdown,
    returnT1: candidate.returnT1,
    returnT5: candidate.returnT5,
    returnT20: candidate.returnT20,
    alphaT1: candidate.alphaT1,
    alphaT5: candidate.alphaT5,
    alphaT20: candidate.alphaT20,
  });

  const allQualifying = allScored.map(toSimilarEvent);
  const events = allQualifying.slice(0, limit);

  return {
    events,
    confidence: calculateConfidence(allQualifying.map((event) => event.alphaT20)),
    stats: calculateAggregateStats(allQualifying),
    totalCandidates: candidates.length,
  };
}
