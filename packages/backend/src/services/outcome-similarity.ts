import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { eventOutcomes, events } from '../db/schema.js';
import { toNumber } from '../utils/number.js';

const DEFAULT_LIMIT = 5;
const MAX_CANDIDATE_FETCH = 100;
const RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;
const LOW_VALUE_SOURCES = new Set(['stocktwits']);
const SCORE_WEIGHTS = {
  ticker: 0.3,
  source: 0.15,
  severity: 0.1,
  keywords: 0.4,
  recency: 0.05,
} as const;

const SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

export interface OutcomeSimilarityQuery {
  ticker?: string;
  source?: string;
  severity?: string;
  titleKeywords?: string[];
  limit?: number;
  excludeEventId?: string;
}

export interface OutcomeSimilarEvent {
  eventId: string;
  ticker: string;
  title: string;
  source: string;
  severity: string;
  eventTime: string;
  eventPrice: number | null;
  change1h: number | null;
  change1d: number | null;
  change1w: number | null;
  change1m: number | null;
  score: number;
}

interface OutcomeSimilarityRow {
  eventId: string;
  sourceEventId: string | null;
  ticker: string;
  title: string;
  source: string;
  severity: string | null;
  eventTime: Date | string;
  eventPrice: string | number | null;
  change1h: string | number | null;
  change1d: string | number | null;
  change1w: string | number | null;
  change1m: string | number | null;
}

function normalizeText(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTicker(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKeywords(values?: string[]): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value): value is string => value != null && value.length >= 3),
    ),
  );
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function combineOr(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return or(...conditions);
}

function combineAnd(conditions: Array<SQL | undefined>): SQL | undefined {
  const filtered = conditions.filter((condition): condition is SQL => condition != null);
  if (filtered.length === 0) {
    return undefined;
  }

  if (filtered.length === 1) {
    return filtered[0];
  }

  return and(...filtered);
}

function severityMatches(querySeverity?: string, candidateSeverity?: string | null): boolean {
  const normalizedQuery = normalizeText(querySeverity);
  const normalizedCandidate = normalizeText(candidateSeverity);
  if (!normalizedQuery || !normalizedCandidate) {
    return false;
  }

  if (
    !(normalizedQuery in SEVERITY_ORDER) ||
    !(normalizedCandidate in SEVERITY_ORDER)
  ) {
    return normalizedQuery === normalizedCandidate;
  }

  const queryRank = SEVERITY_ORDER[normalizedQuery as keyof typeof SEVERITY_ORDER];
  const candidateRank = SEVERITY_ORDER[normalizedCandidate as keyof typeof SEVERITY_ORDER];
  return Math.abs(queryRank - candidateRank) <= 1;
}

function hasKeywordOverlap(keywords: string[], title: string): boolean {
  if (keywords.length === 0) {
    return false;
  }

  const normalizedTitle = title.toLowerCase();
  return keywords.some((keyword) => normalizedTitle.includes(keyword));
}

function isLowValueSource(source: string): boolean {
  return LOW_VALUE_SOURCES.has(normalizeText(source) ?? '');
}

function normalizeTitle(value: string): string {
  return normalizeText(value) ?? value.trim();
}

function scoreOutcomeCandidate(
  query: OutcomeSimilarityQuery,
  candidate: OutcomeSimilarityRow,
): number {
  let score = 0;
  const normalizedTicker = normalizeTicker(query.ticker);
  const normalizedSource = normalizeText(query.source);
  const normalizedKeywords = normalizeKeywords(query.titleKeywords);

  if (normalizedTicker && normalizeTicker(candidate.ticker) === normalizedTicker) {
    score += SCORE_WEIGHTS.ticker;
  }

  if (normalizedSource && normalizeText(candidate.source) === normalizedSource) {
    score += SCORE_WEIGHTS.source;
  }

  if (severityMatches(query.severity, candidate.severity)) {
    score += SCORE_WEIGHTS.severity;
  }

  if (hasKeywordOverlap(normalizedKeywords, candidate.title)) {
    score += SCORE_WEIGHTS.keywords;
  }

  const eventTime = new Date(candidate.eventTime).getTime();
  if (Date.now() - eventTime <= RECENCY_WINDOW_MS) {
    score += SCORE_WEIGHTS.recency;
  }

  if (isLowValueSource(candidate.source)) {
    score *= 0.3;
  }

  return Math.min(round(score), 1);
}

export async function findSimilarFromOutcomes(
  db: Database,
  query: OutcomeSimilarityQuery,
): Promise<OutcomeSimilarEvent[]> {
  const normalizedTicker = normalizeTicker(query.ticker);
  const normalizedSource = normalizeText(query.source);
  const normalizedKeywords = normalizeKeywords(query.titleKeywords);
  const limit = query.limit ?? DEFAULT_LIMIT;

  const candidateFilters: SQL[] = [];

  if (normalizedSource) {
    candidateFilters.push(sql`lower(${events.source}) = ${normalizedSource}`);
  }

  if (normalizedTicker) {
    candidateFilters.push(sql`upper(${eventOutcomes.ticker}) = ${normalizedTicker}`);
  }

  if (normalizedKeywords.length > 0) {
    const keywordFilter = combineOr(
      normalizedKeywords.map((keyword) => ilike(events.title, `%${keyword}%`)),
    );
    if (keywordFilter) {
      candidateFilters.push(keywordFilter);
    }
  }

  const candidateWhere = combineAnd([
    combineOr(candidateFilters),
    query.excludeEventId
      ? sql`${events.id}::text <> ${query.excludeEventId}
          AND COALESCE(${events.sourceEventId}, '') <> ${query.excludeEventId}`
      : undefined,
  ]);

  if (!candidateWhere) {
    return [];
  }

  const rows = (await db
    .select({
      eventId: eventOutcomes.eventId,
      sourceEventId: events.sourceEventId,
      ticker: eventOutcomes.ticker,
      title: events.title,
      source: events.source,
      severity: events.severity,
      eventTime: eventOutcomes.eventTime,
      eventPrice: eventOutcomes.eventPrice,
      change1h: eventOutcomes.change1h,
      change1d: eventOutcomes.change1d,
      change1w: eventOutcomes.change1w,
      change1m: eventOutcomes.change1m,
    })
    .from(eventOutcomes)
    .innerJoin(events, eq(events.id, eventOutcomes.eventId))
    .where(candidateWhere)
    .orderBy(desc(eventOutcomes.eventTime))
    .limit(MAX_CANDIDATE_FETCH)) as OutcomeSimilarityRow[];

  const scoredRows = rows
    .map((row) => ({
      eventId: row.eventId,
      ticker: row.ticker,
      title: row.title,
      source: row.source,
      severity: normalizeText(row.severity) ?? 'unknown',
      eventTime: new Date(row.eventTime).toISOString(),
      eventPrice: toNumber(row.eventPrice),
      change1h: toNumber(row.change1h),
      change1d: toNumber(row.change1d),
      change1w: toNumber(row.change1w),
      change1m: toNumber(row.change1m),
      score: scoreOutcomeCandidate(query, row),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (
        new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime()
      );
    });

  const deduplicated = new Map<string, OutcomeSimilarEvent>();
  for (const row of scoredRows) {
    const titleKey = normalizeTitle(row.title);
    const existing = deduplicated.get(titleKey);

    if (!existing) {
      deduplicated.set(titleKey, row);
      continue;
    }

    const existingTime = new Date(existing.eventTime).getTime();
    const candidateTime = new Date(row.eventTime).getTime();
    if (
      candidateTime > existingTime ||
      (candidateTime === existingTime && row.score > existing.score)
    ) {
      deduplicated.set(titleKey, row);
    }
  }

  return Array.from(deduplicated.values())
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return new Date(right.eventTime).getTime() - new Date(left.eventTime).getTime();
    })
    .slice(0, limit);
}
