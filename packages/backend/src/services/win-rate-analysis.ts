import { sql } from 'drizzle-orm';
import type {
  WinRateBreakdown,
  DirectionAccuracy,
  SignalPerformance,
  PerformanceTrend,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';

/**
 * Win Rate Analysis Service — P4.2.3
 *
 * Provides deep analytics for backtesting:
 * win rates sliced by event type, severity, source, ticker,
 * time period, and direction signal accuracy.
 */
export class WinRateAnalysis {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Win rate broken down by event source.
   * @param interval - Optional SQL interval filter, e.g. '30 days'
   */
  async getWinRateBySource(interval?: string): Promise<WinRateBreakdown[]> {
    return this.getWinRateByGroup('e.source', interval);
  }

  /**
   * Win rate broken down by severity level.
   * @param interval - Optional SQL interval filter, e.g. '30 days'
   */
  async getWinRateBySeverity(interval?: string): Promise<WinRateBreakdown[]> {
    return this.getWinRateByGroup('e.severity', interval);
  }

  /**
   * Win rate broken down by event type (metadata ->> 'eventType' or source).
   * Falls back to source if eventType is not in metadata.
   * @param interval - Optional SQL interval filter
   */
  async getWinRateByEventType(interval?: string): Promise<WinRateBreakdown[]> {
    return this.getWinRateByGroup(
      "COALESCE(e.raw_payload->>'eventType', e.source)",
      interval,
    );
  }

  /**
   * How accurate are direction predictions (BULLISH / BEARISH / NEUTRAL)?
   * Compares the predicted direction in event metadata with actual 1d price change.
   */
  async getDirectionAccuracy(): Promise<DirectionAccuracy> {
    const rows = await this.db.execute(sql.raw(`
      SELECT
        COALESCE(e.raw_payload->>'direction', 'NEUTRAL') AS direction,
        COUNT(*)::int AS total,
        COUNT(CASE
          WHEN (e.raw_payload->>'direction' = 'BULLISH' AND eo.change_1d::float > 0)
            OR (e.raw_payload->>'direction' = 'BEARISH' AND eo.change_1d::float < 0)
            OR (e.raw_payload->>'direction' = 'NEUTRAL' AND ABS(eo.change_1d::float) < 1)
          THEN 1
        END)::int AS correct
      FROM event_outcomes eo
      JOIN events e ON e.id = eo.event_id
      WHERE eo.change_1d IS NOT NULL
        AND e.raw_payload->>'direction' IS NOT NULL
      GROUP BY direction
    `));

    const rowArr = this.extractRows(rows);

    let totalPredictions = 0;
    let correctPredictions = 0;
    const byDirection = {
      bullish: { total: 0, correct: 0, accuracy: 0 },
      bearish: { total: 0, correct: 0, accuracy: 0 },
      neutral: { total: 0, correct: 0, accuracy: 0 },
    };

    for (const r of rowArr) {
      const dir = String(r['direction'] ?? '').toLowerCase();
      const total = Number(r['total'] ?? 0);
      const correct = Number(r['correct'] ?? 0);

      totalPredictions += total;
      correctPredictions += correct;

      if (dir === 'bullish' || dir === 'bearish' || dir === 'neutral') {
        byDirection[dir] = {
          total,
          correct,
          accuracy: total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0,
        };
      }
    }

    return {
      totalPredictions,
      correctPredictions,
      accuracy:
        totalPredictions > 0
          ? Math.round((correctPredictions / totalPredictions) * 100 * 100) / 100
          : 0,
      byDirection,
    };
  }

  /**
   * Best event-type + source combos by Sharpe-like ratio.
   * @param limit - Max number of results (default 10)
   */
  async getTopPerformingSignals(limit = 10): Promise<SignalPerformance[]> {
    const rows = await this.db.execute(sql.raw(`
      SELECT
        COALESCE(e.raw_payload->>'eventType', e.source) AS event_type,
        e.source,
        COUNT(*)::int AS cnt,
        COALESCE(
          COUNT(CASE WHEN eo.change_1d::float > 0 THEN 1 END)::float /
          NULLIF(COUNT(eo.change_1d), 0) * 100,
          0
        ) AS win_rate_1d,
        COALESCE(AVG(eo.change_1d::float), 0) AS avg_return_1d,
        CASE
          WHEN STDDEV_POP(eo.change_1d::float) > 0
          THEN AVG(eo.change_1d::float) / STDDEV_POP(eo.change_1d::float)
          ELSE 0
        END AS sharpe_ratio
      FROM event_outcomes eo
      JOIN events e ON e.id = eo.event_id
      WHERE eo.change_1d IS NOT NULL
      GROUP BY event_type, e.source
      HAVING COUNT(*) >= 3
      ORDER BY sharpe_ratio DESC
      LIMIT ${limit}
    `));

    const rowArr = this.extractRows(rows);

    return rowArr.map((r) => ({
      eventType: String(r['event_type'] ?? 'unknown'),
      source: String(r['source'] ?? 'unknown'),
      count: Number(r['cnt'] ?? 0),
      winRate1d: Math.round(Number(r['win_rate_1d'] ?? 0) * 100) / 100,
      avgReturn1d: Math.round(Number(r['avg_return_1d'] ?? 0) * 10000) / 10000,
      sharpeRatio: Math.round(Number(r['sharpe_ratio'] ?? 0) * 100) / 100,
    }));
  }

  /**
   * Performance accuracy trend over time (bucketed by days).
   * @param bucketDays - Days per bucket (default 7)
   */
  async getPerformanceOverTime(bucketDays = 7): Promise<PerformanceTrend[]> {
    const rows = await this.db.execute(sql.raw(`
      SELECT
        date_trunc('day', eo.event_time) -
          ((EXTRACT(DOY FROM eo.event_time)::int % ${bucketDays}) || ' days')::interval
          AS bucket_start,
        COUNT(*)::int AS total_events,
        COALESCE(
          COUNT(CASE WHEN eo.change_1d::float > 0 THEN 1 END)::float /
          NULLIF(COUNT(eo.change_1d), 0) * 100,
          0
        ) AS win_rate_1d,
        COALESCE(AVG(eo.change_1d::float), 0) AS avg_return_1d
      FROM event_outcomes eo
      WHERE eo.change_1d IS NOT NULL
      GROUP BY bucket_start
      ORDER BY bucket_start
    `));

    const rowArr = this.extractRows(rows);

    return rowArr.map((r) => {
      const start = new Date(String(r['bucket_start']));
      const end = new Date(start.getTime() + bucketDays * 86_400_000);
      return {
        bucketStart: start,
        bucketEnd: end,
        totalEvents: Number(r['total_events'] ?? 0),
        winRate1d: Math.round(Number(r['win_rate_1d'] ?? 0) * 100) / 100,
        avgReturn1d: Math.round(Number(r['avg_return_1d'] ?? 0) * 10000) / 10000,
      };
    });
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Generic win-rate-by-group query.
   * Groups by the given SQL expression and returns WinRateBreakdown[].
   */
  private async getWinRateByGroup(
    groupExpr: string,
    interval?: string,
  ): Promise<WinRateBreakdown[]> {
    const intervalFilter = interval
      ? `AND eo.event_time >= NOW() - INTERVAL '${interval}'`
      : '';

    const rows = await this.db.execute(sql.raw(`
      SELECT
        ${groupExpr} AS category,
        COUNT(DISTINCT e.id)::int AS total_events,
        COUNT(DISTINCT eo.event_id)::int AS tracked_events,
        COALESCE(
          COUNT(CASE WHEN eo.change_1h::float > 0 THEN 1 END)::float /
          NULLIF(COUNT(eo.change_1h), 0) * 100, 0
        ) AS win_rate_1h,
        COALESCE(
          COUNT(CASE WHEN eo.change_1d::float > 0 THEN 1 END)::float /
          NULLIF(COUNT(eo.change_1d), 0) * 100, 0
        ) AS win_rate_1d,
        COALESCE(
          COUNT(CASE WHEN eo.change_1w::float > 0 THEN 1 END)::float /
          NULLIF(COUNT(eo.change_1w), 0) * 100, 0
        ) AS win_rate_1w,
        COALESCE(AVG(eo.change_1d::float), 0) AS avg_return_1d,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY eo.change_1d::float), 0) AS median_return_1d,
        COALESCE(MAX(eo.change_1d::float), 0) AS best_return,
        COALESCE(MIN(eo.change_1d::float), 0) AS worst_return
      FROM event_outcomes eo
      JOIN events e ON e.id = eo.event_id
      WHERE eo.change_1d IS NOT NULL ${intervalFilter}
      GROUP BY category
      ORDER BY tracked_events DESC
    `));

    const rowArr = this.extractRows(rows);

    return rowArr.map((r) => ({
      category: String(r['category'] ?? 'unknown'),
      totalEvents: Number(r['total_events'] ?? 0),
      trackedEvents: Number(r['tracked_events'] ?? 0),
      winRate1h: Math.round(Number(r['win_rate_1h'] ?? 0) * 100) / 100,
      winRate1d: Math.round(Number(r['win_rate_1d'] ?? 0) * 100) / 100,
      winRate1w: Math.round(Number(r['win_rate_1w'] ?? 0) * 100) / 100,
      avgReturn1d: Math.round(Number(r['avg_return_1d'] ?? 0) * 10000) / 10000,
      medianReturn1d: Math.round(Number(r['median_return_1d'] ?? 0) * 10000) / 10000,
      bestReturn: Math.round(Number(r['best_return'] ?? 0) * 10000) / 10000,
      worstReturn: Math.round(Number(r['worst_return'] ?? 0) * 10000) / 10000,
    }));
  }

  /**
   * Extract row array from drizzle execute result.
   * Handles both `{ rows: [...] }` and plain array forms.
   */
  private extractRows(
    result: unknown,
  ): Record<string, unknown>[] {
    const res = result as { rows?: Record<string, unknown>[] };
    return res.rows ?? (Array.isArray(result) ? result : []);
  }
}
