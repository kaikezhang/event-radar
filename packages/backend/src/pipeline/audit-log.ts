import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';

export interface AuditRecord {
  eventId: string;
  source: string;
  title: string;
  severity?: string;
  ticker?: string;
  outcome: 'delivered' | 'filtered' | 'deduped' | 'grace_period' | 'error';
  stoppedAt: string;
  reason?: string;
  reasonCategory?: string;
  deliveryChannels?: Array<{ channel: string; ok: boolean }>;
  historicalMatch?: boolean;
  historicalConfidence?: string;
  durationMs?: number;
}

/**
 * Non-blocking audit logger — writes pipeline decisions to DB for debugging.
 * Fire-and-forget: errors are logged but never propagate to the pipeline.
 */
export class AuditLog {
  private readonly db: Database | undefined;
  private readonly enabled: boolean;

  constructor(db?: Database) {
    this.db = db;
    this.enabled = db != null && process.env.PIPELINE_AUDIT_ENABLED !== 'false';
  }

  record(audit: AuditRecord): void {
    if (!this.enabled || !this.db) return;

    // Fire-and-forget — do NOT await, do NOT block pipeline
    void this.write(audit).catch((err) => {
      console.error('[audit-log] Write failed:', err instanceof Error ? err.message : err);
    });
  }

  private async write(audit: AuditRecord): Promise<void> {
    const title = audit.title.length > 500 ? audit.title.slice(0, 497) + '...' : audit.title;
    const channels = audit.deliveryChannels ? JSON.stringify(audit.deliveryChannels) : null;

    await this.db!.execute(sql`
      INSERT INTO pipeline_audit 
        (event_id, source, title, severity, ticker, outcome, stopped_at, reason, reason_category, delivery_channels, historical_match, historical_confidence, duration_ms)
      VALUES (
        ${audit.eventId}, ${audit.source}, ${title}, ${audit.severity ?? null}, ${audit.ticker ?? null},
        ${audit.outcome}, ${audit.stoppedAt}, ${audit.reason ?? null}, ${audit.reasonCategory ?? null},
        ${channels}::jsonb, ${audit.historicalMatch ?? null}, ${audit.historicalConfidence ?? null}, ${audit.durationMs ?? null}
      )
    `);
  }
}
