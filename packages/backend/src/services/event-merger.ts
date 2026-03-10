import { eq, inArray } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type {
  CrossSourceDedupResult,
  SourceUrl,
  MergedEventData,
} from '@event-radar/shared';

/** Severity priority for merge: CRITICAL > HIGH > MEDIUM > LOW */
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Merge a new event into an existing event (primary).
 *
 * Merge strategy:
 * - Keep the earliest event as primary
 * - Merge all source URLs into sources[] array
 * - Take the highest severity
 * - Merge tags as union
 * - Record merge history: mergedFrom[] (list of merged event IDs)
 */
export async function mergeEvents(
  db: Database,
  dedupResult: CrossSourceDedupResult,
  newEvent: RawEvent,
): Promise<MergedEventData | null> {
  if (!dedupResult.isDuplicate || !dedupResult.matchedEventId) {
    return null;
  }

  // Get the primary event (earliest one)
  const primaryEvent = await getEarliestEvent(db, [
    dedupResult.matchedEventId,
    ...dedupResult.duplicateIds,
  ]);

  if (!primaryEvent) {
    return null;
  }

  // Get all events to be merged (primary + duplicates)
  const allEventIds = [primaryEvent.id, ...dedupResult.duplicateIds].filter(
    (id) => id !== primaryEvent.id,
  );

  const duplicateEvents = allEventIds.length > 0
    ? await db.select().from(events).where(inArray(events.id, allEventIds))
    : [];

  // Build merged data
  const sourceUrls: SourceUrl[] = [];

  // Add primary event's source URL
  if (primaryEvent.metadata && typeof primaryEvent.metadata === 'object') {
    const md = primaryEvent.metadata as Record<string, unknown>;
    if (typeof md.url === 'string') {
      sourceUrls.push({
        source: primaryEvent.source,
        url: md.url,
        receivedAt: primaryEvent.receivedAt.toISOString(),
      });
    }
  }

  // Add new event's source URL
  if (newEvent.url) {
    sourceUrls.push({
      source: newEvent.source,
      url: newEvent.url,
      receivedAt: typeof newEvent.timestamp === 'string'
        ? newEvent.timestamp
        : newEvent.timestamp.toISOString(),
    });
  }

  // Add duplicate events' source URLs
  for (const dup of duplicateEvents) {
    if (dup.metadata && typeof dup.metadata === 'object') {
      const md = dup.metadata as Record<string, unknown>;
      if (typeof md.url === 'string') {
        sourceUrls.push({
          source: dup.source,
          url: md.url,
          receivedAt: dup.receivedAt.toISOString(),
        });
      }
    }
  }

  // Extract metadata from new event
  const newEventMetadata = (newEvent.metadata ?? {}) as Record<string, unknown>;
  const newEventSeverity = newEventMetadata.severity as string | null | undefined;
  const newEventTags = newEventMetadata.tags as string[] | undefined;

  // Merge severity (take highest)
  const severities = [
    primaryEvent.severity,
    newEventSeverity ?? null,
    ...duplicateEvents.map((e) => e.severity),
  ].filter((s): s is string => s !== null && s !== undefined);

  const mergedSeverity = getHighestSeverity(severities);

  // Merge tags (union)
  const allTags = new Set<string>();
  if (primaryEvent.metadata && typeof primaryEvent.metadata === 'object') {
    const md = primaryEvent.metadata as Record<string, unknown>;
    if (Array.isArray(md.tags)) {
      md.tags.forEach((t: unknown) => allTags.add(String(t)));
    }
  }
  if (newEventTags) {
    newEventTags.forEach((t) => allTags.add(t));
  }
  duplicateEvents.forEach((e) => {
    if (e.metadata && typeof e.metadata === 'object') {
      const md = e.metadata as Record<string, unknown>;
      if (Array.isArray(md.tags)) {
        md.tags.forEach((t: unknown) => allTags.add(String(t)));
      }
    }
  });

  // Merge metadata
  const mergedMetadata = {
    ...(typeof primaryEvent.metadata === 'object' ? primaryEvent.metadata : {}),
    tags: Array.from(allTags),
  };

  // Build mergedFrom list (IDs of events merged into primary)
  const mergedFrom = [
    ...dedupResult.duplicateIds.filter((id) => id !== primaryEvent.id),
    // Also include the new event's ID if it has a sourceEventId
    ...(newEvent.id ? [newEvent.id] : []),
  ];

  // Update primary event
  await db
    .update(events)
    .set({
      severity: mergedSeverity,
      metadata: mergedMetadata,
      sourceUrls: sourceUrls,
      mergedFrom: mergedFrom,
      isDuplicate: false, // Primary stays as not duplicate
    })
    .where(eq(events.id, primaryEvent.id));

  // Mark duplicate events as duplicates
  const duplicateIdsToMark = dedupResult.duplicateIds.filter(
    (id) => id !== primaryEvent.id,
  );
  if (duplicateIdsToMark.length > 0) {
    await db
      .update(events)
      .set({
        isDuplicate: true,
        mergedFrom: [primaryEvent.id],
      })
      .where(inArray(events.id, duplicateIdsToMark));
  }

  return {
    primaryId: primaryEvent.id,
    mergedFrom: mergedFrom,
    sourceUrls: sourceUrls,
  };
}

/**
 * Mark a new event as duplicate of an existing event
 */
export async function markAsDuplicate(
  db: Database,
  newEvent: RawEvent,
  primaryEventId: string,
): Promise<void> {
  if (!newEvent.id) return;

  // Extract metadata from new event
  const newEventMetadata = (newEvent.metadata ?? {}) as Record<string, unknown>;

  await db
    .insert(events)
    .values({
      source: newEvent.source,
      sourceEventId: newEvent.id,
      title: newEvent.title,
      summary: newEvent.body ?? null,
      rawPayload: newEvent,
      metadata: {
        url: newEvent.url,
        ...newEventMetadata,
      },
      severity: newEventMetadata.severity as string | null ?? null,
      receivedAt: new Date(newEvent.timestamp),
      isDuplicate: true,
      mergedFrom: [primaryEventId],
    });
}

/**
 * Get the earliest event from a list of event IDs
 */
async function getEarliestEvent(
  db: Database,
  eventIds: string[],
): Promise<{
  id: string;
  source: string;
  severity: string | null;
  metadata: unknown;
  receivedAt: Date;
} | null> {
  if (eventIds.length === 0) return null;

  const [earliest] = await db
    .select({
      id: events.id,
      source: events.source,
      severity: events.severity,
      metadata: events.metadata,
      receivedAt: events.receivedAt,
    })
    .from(events)
    .where(inArray(events.id, eventIds))
    .orderBy(events.receivedAt)
    .limit(1);

  return earliest ?? null;
}

/**
 * Get the highest severity from a list
 */
function getHighestSeverity(severities: string[]): string | null {
  if (severities.length === 0) return null;

  let highest: string | null = null;
  let highestPriority = 0;

  for (const sev of severities) {
    const priority = SEVERITY_PRIORITY[sev] ?? 0;
    if (priority > highestPriority) {
      highest = sev;
      highestPriority = priority;
    }
  }

  return highest;
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
