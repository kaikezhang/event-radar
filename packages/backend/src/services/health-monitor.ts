import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import type { EventBus } from '@event-radar/shared';

export interface DeliveryStats {
  last24h: { total: number; bySource: Record<string, number> };
  last7d: { total: number; bySource: Record<string, number> };
}

export interface HealthMonitorOptions {
  /** Check interval in ms (default: 1 hour) */
  checkIntervalMs?: number;
  /** Function to get current time — injectable for testing */
  now?: () => Date;
}

/**
 * Returns true if the given date falls within US stock market trading hours:
 * Monday-Friday, 9:30 AM – 4:00 PM Eastern Time.
 */
export function isTradingHours(date: Date): boolean {
  const et = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/**
 * Monitors delivery health by periodically checking delivered event counts.
 * Emits `system:health:alert` when no deliveries occur on a trading day within 24h.
 */
export class HealthMonitorService {
  private readonly db: Database;
  private readonly eventBus: EventBus;
  private readonly checkIntervalMs: number;
  private readonly now: () => Date;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(db: Database, eventBus: EventBus, options?: HealthMonitorOptions) {
    this.db = db;
    this.eventBus = eventBus;
    this.checkIntervalMs = options?.checkIntervalMs ?? 60 * 60 * 1000; // 1 hour
    this.now = options?.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.check().catch((err) => {
        console.error('[health-monitor] Check failed:', err instanceof Error ? err.message : err);
      });
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check delivered count for the past 24h.
   * If on a trading day and count is 0, emit a health alert.
   */
  async check(): Promise<{ count: number; alerted: boolean }> {
    const now = this.now();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const rawRows = await this.db.execute(sql`
      SELECT COUNT(*) as cnt FROM pipeline_audit
      WHERE outcome = 'delivered'
        AND created_at >= ${twentyFourHoursAgo.toISOString()}
    `);
    const rowsResult = rawRows as unknown as { rows?: Array<{ cnt: string }> };
    const rowArr = rowsResult.rows ?? (Array.isArray(rawRows) ? rawRows : []);
    const count = Number((rowArr[0] as Record<string, unknown>)?.['cnt'] ?? 0);

    const trading = isTradingHours(now);

    if (trading && count === 0) {
      await this.eventBus.publishTopic?.('system:health:alert', {
        type: 'zero_deliveries',
        message: 'No deliveries in the past 24 hours during trading hours',
        timestamp: now.toISOString(),
        count,
      });
      return { count, alerted: true };
    }

    return { count, alerted: false };
  }

  /**
   * Get delivery stats for the past 24h and 7d, grouped by source.
   */
  async getDeliveryStats(): Promise<DeliveryStats> {
    const now = this.now();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [raw24h, raw7d] = await Promise.all([
      this.db.execute(sql`
        SELECT source, COUNT(*) as cnt FROM pipeline_audit
        WHERE outcome = 'delivered'
          AND created_at >= ${twentyFourHoursAgo.toISOString()}
        GROUP BY source
      `),
      this.db.execute(sql`
        SELECT source, COUNT(*) as cnt FROM pipeline_audit
        WHERE outcome = 'delivered'
          AND created_at >= ${sevenDaysAgo.toISOString()}
        GROUP BY source
      `),
    ]);

    const parseRows = (raw: unknown) => {
      const result = raw as unknown as { rows?: Array<{ source: string; cnt: string }> };
      const arr = result.rows ?? (Array.isArray(raw) ? (raw as Array<{ source: string; cnt: string }>) : []);
      const bySource: Record<string, number> = {};
      let total = 0;
      for (const row of arr) {
        const c = Number(row.cnt);
        bySource[row.source] = c;
        total += c;
      }
      return { total, bySource };
    };

    return {
      last24h: parseRows(raw24h),
      last7d: parseRows(raw7d),
    };
  }
}
