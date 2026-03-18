import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runAuditCleanup(db: Database): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  const auditResult = await db.execute(sql`
    DELETE FROM pipeline_audit WHERE created_at < ${thirtyDaysAgo}
  `);

  const alertResult = await db.execute(sql`
    DELETE FROM alert_log WHERE sent_at < ${ninetyDaysAgo}
  `);

  const weightResult = await db.execute(sql`
    DELETE FROM weight_adjustments WHERE created_at < ${ninetyDaysAgo}
  `);

  const severityResult = await db.execute(sql`
    DELETE FROM severity_changes WHERE created_at < ${ninetyDaysAgo}
  `);

  const counts = {
    pipeline_audit: auditResult.rowCount ?? 0,
    alert_log: alertResult.rowCount ?? 0,
    weight_adjustments: weightResult.rowCount ?? 0,
    severity_changes: severityResult.rowCount ?? 0,
  };

  console.log(
    `[audit-cleanup] Cleaned up audit records: pipeline_audit=${counts.pipeline_audit}, alert_log=${counts.alert_log}, weight_adjustments=${counts.weight_adjustments}, severity_changes=${counts.severity_changes}`,
  );
}

export interface AuditCleanupHandle {
  stop(): void;
}

export function startAuditCleanupLoop(db: Database): AuditCleanupHandle {
  let stopped = false;
  let isRunning = false;

  const run = async () => {
    if (stopped || isRunning) return;
    isRunning = true;
    try {
      await runAuditCleanup(db);
    } catch (error: unknown) {
      console.error(
        '[audit-cleanup] Failed:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      isRunning = false;
    }
  };

  // Run once at startup (delayed 30s to let server settle)
  const startupTimeout = setTimeout(() => {
    if (!stopped) void run();
  }, 30_000);

  const intervalId = setInterval(() => {
    void run();
  }, CLEANUP_INTERVAL_MS);

  return {
    stop() {
      stopped = true;
      clearTimeout(startupTimeout);
      clearInterval(intervalId);
    },
  };
}
