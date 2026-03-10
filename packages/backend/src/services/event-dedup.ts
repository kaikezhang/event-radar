import { sql, and, gte, lte, eq } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import {
  extractTickers,
  extractKeywords,
  jaccardSimilarity,
  timeProximityScore,
} from './event-similarity.js';
import type {
  CrossSourceDedupResult,
  CrossSourceDedupOptions,
} from '@event-radar/shared';

const DEFAULT_OPTIONS: Required<CrossSourceDedupOptions> = {
  strongWindowMinutes: 5,
  likelyWindowMinutes: 30,
  strongTitleThreshold: 0.8,
  likelyContentThreshold: 0.7,
  maxCandidates: 100,
};

interface EventRow {
  id: string;
  source: string;
  sourceEventId: string | null;
  title: string;
  summary: string | null;
  rawPayload: unknown;
  metadata: unknown;
  severity: string | null;
  receivedAt: Date;
  createdAt: Date;
}

/** Severity priority for merge: CRITICAL > HIGH > MEDIUM > LOW */
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Find duplicate events for a new event.
 *
 * Dedup rules (in priority order):
 * 1. Exact match: same source + same sourceId → 100% duplicate
 * 2. Strong match: same ticker + same eventType + time<5min + title similarity>0.8
 * 3. Likely match: same ticker + time<30min + content similarity>0.7
 */
export async function findDuplicates(
  db: Database,
  newEvent: RawEvent,
  options?: Partial<CrossSourceDedupOptions>,
): Promise<CrossSourceDedupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const newEventTime = new Date(newEvent.timestamp);
  const newTickers = extractTickers(newEvent.metadata);

  // Rule 1: Exact match - same source + same sourceEventId
  if (newEvent.id) {
    const exactMatches = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.source, newEvent.source),
          eq(events.sourceEventId, newEvent.id),
          eq(events.isDuplicate, false),
        ),
      )
      .limit(1);

    if (exactMatches.length > 0) {
      return {
        isDuplicate: true,
        matchType: 'exact',
        confidence: 1.0,
        matchedEventId: exactMatches[0].id,
        duplicateIds: [exactMatches[0].id],
      };
    }
  }

  // Build time window for strong match (5 min by default)
  const strongWindowStart = new Date(
    newEventTime.getTime() - opts.strongWindowMinutes * 60 * 1000,
  );
  const strongWindowEnd = new Date(
    newEventTime.getTime() + opts.strongWindowMinutes * 60 * 1000,
  );

  // Fetch candidates for strong match: same ticker + within time window + not duplicates
  const candidates = await fetchCandidateEvents(
    db,
    newTickers,
    strongWindowStart,
    strongWindowEnd,
    opts.maxCandidates,
  );

  // Rule 2: Strong match - same ticker + time<5min + title similarity>0.8
  const newTitle = newEvent.title;
  const strongMatches: string[] = [];

  for (const candidate of candidates) {
    const candidateTickers = extractTickers(candidate.metadata);
    const tickerOverlap = jaccardSimilarity(newTickers, candidateTickers);

    if (tickerOverlap > 0) {
      // Check title similarity
      const titleSimilarity = jaccardSimilarity(
        extractKeywords(newTitle),
        extractKeywords(candidate.title),
      );

      const timeScore = timeProximityScore(newEventTime, candidate.receivedAt);

      if (timeScore >= 0.5 && titleSimilarity >= opts.strongTitleThreshold) {
        strongMatches.push(candidate.id);
      }
    }
  }

  if (strongMatches.length > 0) {
    // Return the earliest event as the primary
    const primaryEvent = await getEarliestEvent(db, strongMatches);
    return {
      isDuplicate: true,
      matchType: 'strong',
      confidence: 0.9,
      matchedEventId: primaryEvent?.id,
      duplicateIds: strongMatches,
    };
  }

  // Rule 3: Likely match - same ticker + time<30min + content similarity>0.7
  const likelyWindowStart = new Date(
    newEventTime.getTime() - opts.likelyWindowMinutes * 60 * 1000,
  );
  const likelyWindowEnd = new Date(
    newEventTime.getTime() + opts.likelyWindowMinutes * 60 * 1000,
  );

  const likelyCandidates = await fetchCandidateEvents(
    db,
    newTickers,
    likelyWindowStart,
    likelyWindowEnd,
    opts.maxCandidates,
  );

  const likelyMatches: string[] = [];
  const newContent = [newEvent.title, newEvent.body ?? ''].join(' ');
  const newKeywords = extractKeywords(newContent);

  for (const candidate of likelyCandidates) {
    // Skip already checked strong matches
    if (strongMatches.includes(candidate.id)) continue;

    const candidateContent = [candidate.title, candidate.summary ?? ''].join(' ');
    const contentSimilarity = jaccardSimilarity(
      newKeywords,
      extractKeywords(candidateContent),
    );

    if (contentSimilarity >= opts.likelyContentThreshold) {
      likelyMatches.push(candidate.id);
    }
  }

  if (likelyMatches.length > 0) {
    const primaryEvent = await getEarliestEvent(db, likelyMatches);
    return {
      isDuplicate: true,
      matchType: 'likely',
      confidence: 0.75,
      matchedEventId: primaryEvent?.id,
      duplicateIds: likelyMatches,
    };
  }

  // No duplicates found
  return {
    isDuplicate: false,
    matchType: 'none',
    confidence: 0,
    matchedEventId: undefined,
    duplicateIds: [],
  };
}

/**
 * Fetch candidate events within a time window that share tickers
 */
async function fetchCandidateEvents(
  db: Database,
  tickers: string[],
  windowStart: Date,
  windowEnd: Date,
  limit: number,
): Promise<EventRow[]> {
  if (tickers.length === 0) {
    // If no tickers, just fetch by time window
    return db
      .select()
      .from(events)
      .where(
        and(
          gte(events.receivedAt, windowStart),
          lte(events.receivedAt, windowEnd),
          eq(events.isDuplicate, false),
        ),
      )
      .orderBy(events.receivedAt)
      .limit(limit) as Promise<EventRow[]>;
  }

  // Build ticker conditions
  const tickerConditions = tickers.map((t) =>
    sql`${events.metadata}->>'ticker' = ${t}`,
  );

  return db
    .select()
    .from(events)
    .where(
      and(
        gte(events.receivedAt, windowStart),
        lte(events.receivedAt, windowEnd),
        eq(events.isDuplicate, false),
        sql`(${sql.join(tickerConditions, sql` OR `)})`,
      ),
    )
    .orderBy(events.receivedAt)
    .limit(limit) as Promise<EventRow[]>;
}

/**
 * Get the earliest event from a list of event IDs
 */
async function getEarliestEvent(
  db: Database,
  eventIds: string[],
): Promise<EventRow | null> {
  if (eventIds.length === 0) return null;

  const [earliest] = await db
    .select()
    .from(events)
    .where(sql`${events.id} IN ${eventIds}`)
    .orderBy(events.receivedAt)
    .limit(1) as EventRow[];

  return earliest ?? null;
}

/**
 * Compare severity levels, returns true if severityA is higher than severityB
 */
export function isHigherSeverity(
  severityA: string | null,
  severityB: string | null,
): boolean {
  if (!severityA) return false;
  if (!severityB) return true;

  const priorityA = SEVERITY_PRIORITY[severityA] ?? 0;
  const priorityB = SEVERITY_PRIORITY[severityB] ?? 0;

  return priorityA > priorityB;
}
