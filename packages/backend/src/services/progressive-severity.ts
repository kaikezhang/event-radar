import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import {
  type EventBus,
  type Priority,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  events,
  severityChanges,
  severityOverrides,
  userFeedback,
} from '../db/schema.js';

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const SEVERITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const satisfies readonly Priority[];

const SeverityResultSchema = z.object({
  severity: z.enum(SEVERITY_ORDER),
  reason: z.string(),
  locked: z.boolean(),
  sourceCount: z.number().int().min(0),
});

type SeverityResult = z.infer<typeof SeverityResultSchema>;

const SeverityChangeSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  previousSeverity: z.enum(SEVERITY_ORDER),
  newSeverity: z.enum(SEVERITY_ORDER),
  reason: z.string(),
  changedBy: z.enum(['system', 'user']),
  createdAt: z.string(),
});

type SeverityChange = z.infer<typeof SeverityChangeSchema>;

interface ProgressiveSeverityServiceOptions {
  eventBus?: EventBus;
}

interface EventState {
  event: {
    id: string;
    source: string;
    severity: string | null;
    confirmedSources: string[] | null;
    confirmationCount: number | null;
  };
  override:
    | {
        severity: Priority;
        locked: boolean;
        lockedBy: string | null;
        sourceCount: number;
        reason: string;
      }
    | null;
  feedbackVerdict: string | null;
}

export class ProgressiveSeverityService {
  constructor(
    private readonly db: Database,
    private readonly options?: ProgressiveSeverityServiceOptions,
  ) {}

  async getEffectiveSeverity(eventId: string): Promise<SeverityResult> {
    return this.db.transaction(async (tx) => {
      const state = await this.loadState(tx, eventId);
      if (!state) {
        return SeverityResultSchema.parse({
          severity: 'MEDIUM',
          reason: 'Event not found',
          locked: false,
          sourceCount: 0,
        });
      }

      return this.reconcileSeverity(tx, state, { emit: true });
    });
  }

  async recordConfirmation(
    eventId: string,
    source: string,
  ): Promise<SeverityResult> {
    return this.db.transaction(async (tx) => {
      const state = await this.loadState(tx, eventId);
      if (!state) {
        return SeverityResultSchema.parse({
          severity: 'MEDIUM',
          reason: 'Event not found',
          locked: false,
          sourceCount: 0,
        });
      }

      const sources = new Set(
        state.event.confirmedSources && state.event.confirmedSources.length > 0
          ? state.event.confirmedSources
          : [state.event.source],
      );
      sources.add(source);

      const updatedSources = [...sources];
      const sourceCount = updatedSources.length;

      await tx
        .update(events)
        .set({
          confirmedSources: updatedSources,
          confirmationCount: sourceCount,
        })
        .where(eq(events.id, eventId));

      const refreshed = await this.loadState(tx, eventId);
      if (!refreshed) {
        return SeverityResultSchema.parse({
          severity: 'MEDIUM',
          reason: 'Event not found',
          locked: false,
          sourceCount: 0,
        });
      }

      return this.reconcileSeverity(tx, refreshed, { emit: true });
    });
  }

  async lockSeverity(
    eventId: string,
    severity: Priority,
    reason: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const state = await this.loadState(tx, eventId);
      if (!state) {
        return;
      }

      const current = await this.reconcileSeverity(tx, state, { emit: false });

      await tx
        .insert(severityOverrides)
        .values({
          eventId,
          severity,
          locked: true,
          lockedBy: 'user',
          sourceCount: current.sourceCount,
          reason,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: severityOverrides.eventId,
          set: {
            severity,
            locked: true,
            lockedBy: 'user',
            sourceCount: current.sourceCount,
            reason,
            updatedAt: new Date(),
          },
        });

      await tx
        .update(events)
        .set({ severity })
        .where(eq(events.id, eventId));

      if (current.severity !== severity) {
        await this.recordChange(tx, {
          eventId,
          previousSeverity: current.severity,
          newSeverity: severity,
          reason,
          changedBy: 'user',
        });
        await this.publishSeverityChanged({
          eventId,
          previousSeverity: current.severity,
          newSeverity: severity,
          reason,
          changedBy: 'user',
          sourceCount: current.sourceCount,
          locked: true,
        });
      }
    });
  }

  async getSeverityHistory(eventId: string): Promise<SeverityChange[]> {
    const rows = await this.db
      .select()
      .from(severityChanges)
      .where(eq(severityChanges.eventId, eventId))
      .orderBy(asc(severityChanges.createdAt));

    return rows.map((row) =>
      SeverityChangeSchema.parse({
        id: row.id,
        eventId: row.eventId,
        previousSeverity: row.previousSeverity,
        newSeverity: row.newSeverity,
        reason: row.reason,
        changedBy: row.changedBy,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  private async loadState(
    tx: DbTransaction,
    eventId: string,
  ): Promise<EventState | null> {
    const [eventRow] = await tx
      .select({
        id: events.id,
        source: events.source,
        severity: events.severity,
        confirmedSources: events.confirmedSources,
        confirmationCount: events.confirmationCount,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!eventRow) {
      return null;
    }

    const [overrideRow] = await tx
      .select({
        severity: severityOverrides.severity,
        locked: severityOverrides.locked,
        lockedBy: severityOverrides.lockedBy,
        sourceCount: severityOverrides.sourceCount,
        reason: severityOverrides.reason,
      })
      .from(severityOverrides)
      .where(eq(severityOverrides.eventId, eventId))
      .limit(1);

    const [feedbackRow] = await tx
      .select({
        verdict: userFeedback.verdict,
      })
      .from(userFeedback)
      .where(eq(userFeedback.eventId, eventId))
      .limit(1);

    return {
      event: {
        id: eventRow.id,
        source: eventRow.source,
        severity: eventRow.severity,
        confirmedSources: (eventRow.confirmedSources as string[] | null) ?? null,
        confirmationCount: eventRow.confirmationCount,
      },
      override: overrideRow
        ? {
            severity: overrideRow.severity as Priority,
            locked: overrideRow.locked,
            lockedBy: overrideRow.lockedBy,
            sourceCount: overrideRow.sourceCount,
            reason: overrideRow.reason,
          }
        : null,
      feedbackVerdict: feedbackRow?.verdict ?? null,
    };
  }

  private async reconcileSeverity(
    tx: DbTransaction,
    state: EventState,
    options: { emit: boolean },
  ): Promise<SeverityResult> {
    const sourceCount = this.resolveSourceCount(state);
    const currentSeverity = state.override?.severity ?? this.startingSeverity(state.event.severity);
    const locked = state.override?.locked ?? false;

    let nextSeverity = currentSeverity;
    let reason = state.override?.reason ?? 'Default MEDIUM severity';

    if (!locked) {
      if (currentSeverity === 'LOW' && sourceCount <= 1) {
        nextSeverity = 'LOW';
        reason = 'Default LOW severity';
      } else {
        nextSeverity = this.severityFromSourceCount(sourceCount);
        reason = this.reasonFromState(sourceCount, state.feedbackVerdict);
      }

      if (state.feedbackVerdict === 'incorrect') {
        nextSeverity = this.downgrade(nextSeverity);
      }
    }

    if (!locked && currentSeverity !== nextSeverity) {
      await tx
        .insert(severityOverrides)
        .values({
          eventId: state.event.id,
          severity: nextSeverity,
          locked: false,
          lockedBy: 'system',
          sourceCount,
          reason,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: severityOverrides.eventId,
          set: {
            severity: nextSeverity,
            locked: false,
            lockedBy: 'system',
            sourceCount,
            reason,
            updatedAt: new Date(),
          },
        });

      await tx
        .update(events)
        .set({
          severity: nextSeverity,
          confirmationCount: sourceCount,
        })
        .where(eq(events.id, state.event.id));

      await this.recordChange(tx, {
        eventId: state.event.id,
        previousSeverity: currentSeverity,
        newSeverity: nextSeverity,
        reason,
        changedBy: 'system',
      });

      if (options.emit) {
        await this.publishSeverityChanged({
          eventId: state.event.id,
          previousSeverity: currentSeverity,
          newSeverity: nextSeverity,
          reason,
          changedBy: 'system',
          sourceCount,
          locked: false,
        });
      }
    } else if (!locked && state.override) {
      await tx
        .update(severityOverrides)
        .set({
          sourceCount,
          reason,
          updatedAt: new Date(),
        })
        .where(eq(severityOverrides.eventId, state.event.id));
    }

    return SeverityResultSchema.parse({
      severity: nextSeverity,
      reason,
      locked,
      sourceCount,
    });
  }

  private resolveSourceCount(state: EventState): number {
    const sources = new Set(
      state.event.confirmedSources && state.event.confirmedSources.length > 0
        ? state.event.confirmedSources
        : [state.event.source],
    );

    return Math.max(
      1,
      state.override?.sourceCount ?? 0,
      state.event.confirmationCount ?? 0,
      sources.size,
    );
  }

  private startingSeverity(severity: string | null): Priority {
    if (
      severity === 'CRITICAL'
      || severity === 'HIGH'
      || severity === 'MEDIUM'
      || severity === 'LOW'
    ) {
      return severity;
    }

    return 'MEDIUM';
  }

  private severityFromSourceCount(sourceCount: number): Priority {
    if (sourceCount >= 3) {
      return 'CRITICAL';
    }

    if (sourceCount >= 2) {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  private downgrade(severity: Priority): Priority {
    const index = SEVERITY_ORDER.indexOf(severity);
    return SEVERITY_ORDER[Math.max(0, index - 1)] ?? 'LOW';
  }

  private reasonFromState(sourceCount: number, feedbackVerdict: string | null): string {
    if (feedbackVerdict === 'incorrect') {
      return 'Downgraded after incorrect user feedback';
    }

    if (sourceCount >= 3) {
      return 'Escalated to CRITICAL after 3 source confirmations';
    }

    if (sourceCount === 2) {
      return 'Escalated to HIGH after 2 source confirmations';
    }

    return 'Default MEDIUM severity';
  }

  private async recordChange(
    tx: DbTransaction,
    input: Omit<SeverityChange, 'id' | 'createdAt'>,
  ): Promise<void> {
    await tx.insert(severityChanges).values({
      eventId: input.eventId,
      previousSeverity: input.previousSeverity,
      newSeverity: input.newSeverity,
      reason: input.reason,
      changedBy: input.changedBy,
    });
  }

  private async publishSeverityChanged(payload: {
    eventId: string;
    previousSeverity: Priority;
    newSeverity: Priority;
    reason: string;
    changedBy: 'system' | 'user';
    sourceCount: number;
    locked: boolean;
  }): Promise<void> {
    if (!this.options?.eventBus?.publishTopic) {
      return;
    }

    await this.options.eventBus.publishTopic('severity:changed', payload);
  }
}
