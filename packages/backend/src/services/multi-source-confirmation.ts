import { eq } from 'drizzle-orm';
import { events, storyEvents } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import type {
  ConfirmationResult,
  ConfirmationConfig,
} from '@event-radar/shared';
import { EventEmitter } from 'node:events';

/** Severity priority for upgrade logic */
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const PRIORITY_TO_SEVERITY: Record<number, string> = {
  4: 'CRITICAL',
  3: 'HIGH',
  2: 'MEDIUM',
  1: 'LOW',
};

const DEFAULT_CONFIG: Required<ConfirmationConfig> = {
  minSourcesForUpgrade: 2,
  twoSourceBoost: 0.15,
  threeSourceBoost: 0.25,
  maxConfidence: 0.99,
};

/**
 * Check the multi-source confirmation status of an event.
 * Returns current confirmation state without modifying anything.
 */
export async function checkConfirmation(
  db: Database,
  eventId: string,
  config?: Partial<ConfirmationConfig>,
): Promise<ConfirmationResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event) {
    return {
      eventId,
      sourceCount: 0,
      sources: [],
      previousSeverity: 'LOW',
      newSeverity: 'LOW',
      upgraded: false,
      confidenceBoost: 0,
      newConfidence: 0,
    };
  }

  const confirmedSources = (event.confirmedSources as string[] | null) ?? [event.source];
  const sourceCount = confirmedSources.length;
  const currentSeverity = event.severity ?? 'LOW';
  const currentConfidence = extractConfidence(event.metadata);

  const { newSeverity, confidenceBoost } = computeUpgrade(
    currentSeverity,
    sourceCount,
    opts,
  );

  const newConfidence = Math.min(
    currentConfidence + confidenceBoost,
    opts.maxConfidence,
  );

  return {
    eventId,
    sourceCount,
    sources: confirmedSources,
    previousSeverity: currentSeverity,
    newSeverity,
    upgraded: newSeverity !== currentSeverity,
    confidenceBoost,
    newConfidence,
  };
}

/**
 * Process a new source confirmation for an event.
 * Called when dedup merge or story group detects multiple sources.
 * Updates the event's severity and confirmation fields if upgraded.
 */
export async function processNewConfirmation(
  db: Database,
  primaryEventId: string,
  confirmingSource: string,
  config?: Partial<ConfirmationConfig>,
  emitter?: EventEmitter,
): Promise<ConfirmationResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, primaryEventId))
    .limit(1);

  if (!event) {
    return {
      eventId: primaryEventId,
      sourceCount: 0,
      sources: [],
      previousSeverity: 'LOW',
      newSeverity: 'LOW',
      upgraded: false,
      confidenceBoost: 0,
      newConfidence: 0,
    };
  }

  const currentSeverity = event.severity ?? 'LOW';
  const currentConfidence = extractConfidence(event.metadata);

  // Build confirmed sources list — only distinct sources count
  const existingSources = (event.confirmedSources as string[] | null) ?? [event.source];
  const sourcesSet = new Set(existingSources);
  sourcesSet.add(confirmingSource);
  const confirmedSources = [...sourcesSet];
  const sourceCount = confirmedSources.length;

  // Same source repeated — no upgrade
  if (sourceCount === existingSources.length) {
    return {
      eventId: primaryEventId,
      sourceCount,
      sources: confirmedSources,
      previousSeverity: currentSeverity,
      newSeverity: currentSeverity,
      upgraded: false,
      confidenceBoost: 0,
      newConfidence: currentConfidence,
    };
  }

  const { newSeverity, confidenceBoost } = computeUpgrade(
    currentSeverity,
    sourceCount,
    opts,
  );

  const newConfidence = Math.min(
    currentConfidence + confidenceBoost,
    opts.maxConfidence,
  );

  const upgraded = newSeverity !== currentSeverity;

  // Update the event in DB
  const updatedMetadata = {
    ...(typeof event.metadata === 'object' && event.metadata !== null
      ? event.metadata
      : {}),
    confidence: newConfidence,
  } as Record<string, unknown>;

  await db
    .update(events)
    .set({
      severity: newSeverity,
      metadata: updatedMetadata,
      confirmedSources: confirmedSources,
      confirmationCount: sourceCount,
    })
    .where(eq(events.id, primaryEventId));

  // Emit severity-upgraded event if upgraded
  if (upgraded && emitter) {
    emitter.emit('event:severity-upgraded', {
      eventId: primaryEventId,
      previousSeverity: currentSeverity,
      newSeverity,
      sourceCount,
      sources: confirmedSources,
      confidenceBoost,
      newConfidence,
    });
  }

  return {
    eventId: primaryEventId,
    sourceCount,
    sources: confirmedSources,
    previousSeverity: currentSeverity,
    newSeverity,
    upgraded,
    confidenceBoost,
    newConfidence,
  };
}

/**
 * Check confirmation across a story group's events.
 * Counts distinct sources across all events in the group.
 */
export async function checkStoryGroupConfirmation(
  db: Database,
  groupId: string,
  eventId: string,
  config?: Partial<ConfirmationConfig>,
  emitter?: EventEmitter,
): Promise<ConfirmationResult | null> {
  // Fetch all events in this story group
  const storyEventRows = await db
    .select({
      source: events.source,
    })
    .from(storyEvents)
    .innerJoin(events, eq(storyEvents.eventId, events.id))
    .where(eq(storyEvents.storyGroupId, groupId));

  const distinctSources = [...new Set(storyEventRows.map((r) => r.source))];

  if (distinctSources.length < 2) {
    return null; // Not enough distinct sources
  }

  // Process confirmation for the event with all distinct sources
  // We add each source — processNewConfirmation handles dedup internally
  let result: ConfirmationResult | null = null;
  for (const source of distinctSources) {
    result = await processNewConfirmation(db, eventId, source, config, emitter);
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Compute severity upgrade based on source count.
 *
 * Rules:
 * - 2 sources: LOW → MEDIUM, MEDIUM → HIGH (one step up, confidence +0.15)
 * - 3+ sources: any → HIGH, HIGH → CRITICAL (confidence +0.25)
 * - Already CRITICAL: no change
 */
function computeUpgrade(
  currentSeverity: string,
  sourceCount: number,
  config: Required<ConfirmationConfig>,
): { newSeverity: string; confidenceBoost: number } {
  if (currentSeverity === 'CRITICAL' || sourceCount < config.minSourcesForUpgrade) {
    return { newSeverity: currentSeverity, confidenceBoost: 0 };
  }

  const currentPriority = SEVERITY_PRIORITY[currentSeverity] ?? 1;

  if (sourceCount === 2) {
    // One step up, capped at HIGH
    const newPriority = Math.min(currentPriority + 1, SEVERITY_PRIORITY.HIGH);
    return {
      newSeverity: PRIORITY_TO_SEVERITY[newPriority] ?? currentSeverity,
      confidenceBoost: config.twoSourceBoost,
    };
  }

  // 3+ sources
  if (currentPriority >= SEVERITY_PRIORITY.HIGH) {
    // HIGH → CRITICAL
    return {
      newSeverity: 'CRITICAL',
      confidenceBoost: config.threeSourceBoost,
    };
  }

  // anything below HIGH → HIGH
  return {
    newSeverity: 'HIGH',
    confidenceBoost: config.threeSourceBoost,
  };
}

function extractConfidence(metadata: unknown): number {
  if (metadata && typeof metadata === 'object') {
    const md = metadata as Record<string, unknown>;
    if (typeof md.confidence === 'number') {
      return md.confidence;
    }
  }
  return 0.7; // default confidence
}
