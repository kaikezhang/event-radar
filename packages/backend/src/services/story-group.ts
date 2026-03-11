import { sql, and, eq, gte, desc } from 'drizzle-orm';
import { events, storyGroups, storyEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type {
  StoryGroup,
  StoryGroupResult,
  StoryGroupOptions,
  StoryEvent,
} from '@event-radar/shared';
import {
  extractTickers,
  extractKeywords,
  jaccardSimilarity,
} from './event-similarity.js';

const DEFAULT_OPTIONS: Required<StoryGroupOptions> = {
  timeWindowMinutes: 30,
  closedAfterMinutes: 120,
  minSimilarity: 0.6,
  limit: 20,
  status: 'all',
};

/** Severity priority for comparison */
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Assign a new event to an existing story group, or create a new one.
 *
 * Matching rules:
 * - Same ticker + within sliding window (30min from last event) + same eventType or title similarity > 0.6
 * - Story group window = lastEventAt + timeWindowMinutes (sliding)
 * - Groups auto-close after closedAfterMinutes of inactivity
 */
export async function assignStoryGroup(
  db: Database,
  eventId: string,
  options?: Partial<StoryGroupOptions>,
): Promise<StoryGroupResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Fetch the event
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    return { assigned: false, groupId: null, isNewGroup: false, sequenceNumber: null };
  }

  const eventTime = event.receivedAt;
  const eventTickers = extractTickers(event.metadata);
  const eventType = event.source;

  // Close expired story groups first
  const closedThreshold = new Date(
    eventTime.getTime() - opts.closedAfterMinutes * 60 * 1000,
  );
  await db
    .update(storyGroups)
    .set({ status: 'closed', updatedAt: new Date() })
    .where(
      and(
        eq(storyGroups.status, 'active'),
        sql`${storyGroups.lastEventAt} < ${closedThreshold}`,
      ),
    );

  // Find active story groups within the sliding window
  const windowThreshold = new Date(
    eventTime.getTime() - opts.timeWindowMinutes * 60 * 1000,
  );

  const activeGroups = await db
    .select()
    .from(storyGroups)
    .where(
      and(
        eq(storyGroups.status, 'active'),
        gte(storyGroups.lastEventAt, windowThreshold),
      ),
    )
    .orderBy(desc(storyGroups.lastEventAt));

  // Try to match against existing groups
  for (const group of activeGroups) {
    const groupTickers = group.tickers as string[];

    // Check ticker overlap
    const tickerOverlap = jaccardSimilarity(eventTickers, groupTickers);
    if (tickerOverlap === 0 && eventTickers.length > 0 && groupTickers.length > 0) {
      continue; // No shared tickers
    }

    // Check if within the sliding window (last event + timeWindow)
    const groupWindowEnd = new Date(
      (group.lastEventAt as Date).getTime() + opts.timeWindowMinutes * 60 * 1000,
    );
    if (eventTime > groupWindowEnd) {
      continue; // Outside the sliding window
    }

    // Check eventType match or title similarity
    const sameEventType = group.eventType === eventType;
    const titleSimilarity = jaccardSimilarity(
      extractKeywords(event.title),
      extractKeywords(group.title),
    );

    if (!sameEventType && titleSimilarity < opts.minSimilarity) {
      continue; // Neither same type nor similar title
    }

    // Match found — add event to this group
    const newSequence = group.eventCount + 1;
    const isKeyEvent = isHighSeverity(event.severity);

    // Update the group
    const newTickers = mergeUnique(groupTickers, eventTickers);
    const newSeverity = higherSeverity(group.severity, event.severity);

    await db
      .update(storyGroups)
      .set({
        lastEventAt: eventTime,
        eventCount: newSequence,
        severity: newSeverity,
        tickers: newTickers,
        updatedAt: new Date(),
      })
      .where(eq(storyGroups.id, group.id));

    // Insert story_event link
    await db.insert(storyEvents).values({
      storyGroupId: group.id,
      eventId,
      sequenceNumber: newSequence,
      isKeyEvent,
    });

    return {
      assigned: true,
      groupId: group.id,
      isNewGroup: false,
      sequenceNumber: newSequence,
    };
  }

  // No matching group found — create a new one
  const isKeyEvent = isHighSeverity(event.severity);

  const [newGroup] = await db
    .insert(storyGroups)
    .values({
      title: event.title,
      tickers: eventTickers,
      eventType,
      severity: event.severity ?? 'LOW',
      status: 'active',
      eventCount: 1,
      firstEventAt: eventTime,
      lastEventAt: eventTime,
    })
    .returning({ id: storyGroups.id });

  await db.insert(storyEvents).values({
    storyGroupId: newGroup.id,
    eventId,
    sequenceNumber: 1,
    isKeyEvent,
  });

  return {
    assigned: true,
    groupId: newGroup.id,
    isNewGroup: true,
    sequenceNumber: 1,
  };
}

/**
 * Get a story group by ID, including all events in timeline order.
 */
export async function getStoryGroup(
  db: Database,
  groupId: string,
): Promise<StoryGroup | null> {
  const [group] = await db
    .select()
    .from(storyGroups)
    .where(eq(storyGroups.id, groupId))
    .limit(1);

  if (!group) return null;

  // Fetch story events with event details
  const storyEventRows = await db
    .select({
      eventId: storyEvents.eventId,
      sequenceNumber: storyEvents.sequenceNumber,
      isKeyEvent: storyEvents.isKeyEvent,
      source: events.source,
      title: events.title,
      receivedAt: events.receivedAt,
    })
    .from(storyEvents)
    .innerJoin(events, eq(storyEvents.eventId, events.id))
    .where(eq(storyEvents.storyGroupId, groupId))
    .orderBy(storyEvents.sequenceNumber);

  const storyEventList: StoryEvent[] = storyEventRows.map((row) => ({
    eventId: row.eventId,
    sequenceNumber: row.sequenceNumber,
    source: row.source,
    title: row.title,
    publishedAt: row.receivedAt.toISOString(),
    isKeyEvent: row.isKeyEvent,
  }));

  return {
    id: group.id,
    title: group.title,
    tickers: group.tickers as string[],
    eventType: group.eventType,
    severity: group.severity,
    status: group.status as 'active' | 'closed',
    eventCount: group.eventCount,
    firstEventAt: (group.firstEventAt as Date).toISOString(),
    lastEventAt: (group.lastEventAt as Date).toISOString(),
    events: storyEventList,
    createdAt: (group.createdAt as Date).toISOString(),
    updatedAt: (group.updatedAt as Date).toISOString(),
  };
}

/**
 * List active (or closed, or all) story groups.
 */
export async function listActiveStoryGroups(
  db: Database,
  options?: Partial<StoryGroupOptions>,
): Promise<StoryGroup[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const conditions = [];
  if (opts.status === 'active') {
    conditions.push(eq(storyGroups.status, 'active'));
  } else if (opts.status === 'closed') {
    conditions.push(eq(storyGroups.status, 'closed'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const groups = await db
    .select()
    .from(storyGroups)
    .where(where)
    .orderBy(desc(storyGroups.lastEventAt))
    .limit(opts.limit);

  // For each group, fetch story events
  const result: StoryGroup[] = [];
  for (const group of groups) {
    const storyEventRows = await db
      .select({
        eventId: storyEvents.eventId,
        sequenceNumber: storyEvents.sequenceNumber,
        isKeyEvent: storyEvents.isKeyEvent,
        source: events.source,
        title: events.title,
        receivedAt: events.receivedAt,
      })
      .from(storyEvents)
      .innerJoin(events, eq(storyEvents.eventId, events.id))
      .where(eq(storyEvents.storyGroupId, group.id))
      .orderBy(storyEvents.sequenceNumber);

    const storyEventList: StoryEvent[] = storyEventRows.map((row) => ({
      eventId: row.eventId,
      sequenceNumber: row.sequenceNumber,
      source: row.source,
      title: row.title,
      publishedAt: row.receivedAt.toISOString(),
      isKeyEvent: row.isKeyEvent,
    }));

    result.push({
      id: group.id,
      title: group.title,
      tickers: group.tickers as string[],
      eventType: group.eventType,
      severity: group.severity,
      status: group.status as 'active' | 'closed',
      eventCount: group.eventCount,
      firstEventAt: (group.firstEventAt as Date).toISOString(),
      lastEventAt: (group.lastEventAt as Date).toISOString(),
      events: storyEventList,
      createdAt: (group.createdAt as Date).toISOString(),
      updatedAt: (group.updatedAt as Date).toISOString(),
    });
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────

function isHighSeverity(severity: string | null): boolean {
  if (!severity) return false;
  const priority = SEVERITY_PRIORITY[severity] ?? 0;
  return priority >= SEVERITY_PRIORITY.HIGH;
}

function higherSeverity(a: string, b: string | null): string {
  if (!b) return a;
  const priorityA = SEVERITY_PRIORITY[a] ?? 0;
  const priorityB = SEVERITY_PRIORITY[b] ?? 0;
  return priorityB > priorityA ? b : a;
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming]);
  return [...set];
}
