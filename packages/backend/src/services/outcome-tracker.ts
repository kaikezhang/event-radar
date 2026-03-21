import { eq, count, sql } from 'drizzle-orm';
import type {
  AccuracyDirection,
  ClassificationOutcome,
  Result,
  OutcomeStats,
  RawEvent,
} from '@event-radar/shared';
import { ok, err } from '@event-radar/shared';
import { PriceService } from './price-service.js';
import { eventOutcomes } from '../db/schema.js';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { ClassificationAccuracyService } from './classification-accuracy.js';

interface TrackingInterval {
  hours: number;
  column: string;
  changeCol: string;
  label: string;
  evaluatedAtCol?: string;
}

/** Intervals in hours: 1h, 1d, 1w, 1m plus T+5/T+20. */
const TRACKING_INTERVALS: TrackingInterval[] = [
  { hours: 1, column: 'price_1h', changeCol: 'change_1h', label: 'T+1h' },
  { hours: 24, column: 'price_1d', changeCol: 'change_1d', label: 'T+1d' },
  {
    hours: 120,
    column: 'price_t5',
    changeCol: 'change_t5',
    label: 'T+5d',
    evaluatedAtCol: 'evaluated_t5_at',
  },
  {
    hours: 480,
    column: 'price_t20',
    changeCol: 'change_t20',
    label: 'T+20d',
    evaluatedAtCol: 'evaluated_t20_at',
  },
  { hours: 168, column: 'price_1w', changeCol: 'change_1w', label: 'T+1w' },
  { hours: 720, column: 'price_1m', changeCol: 'change_1m', label: 'T+1m' },
] as const;

export interface OutcomeRecord {
  id: number;
  eventId: string;
  ticker: string;
  eventTime: Date;
  eventPrice: string | null;
  price1h: string | null;
  price1d: string | null;
  priceT5: string | null;
  priceT20: string | null;
  price1w: string | null;
  price1m: string | null;
  change1h: string | null;
  change1d: string | null;
  changeT5: string | null;
  changeT20: string | null;
  change1w: string | null;
  change1m: string | null;
  evaluatedT5At: Date | null;
  evaluatedT20At: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class OutcomeTracker {
  private readonly db: Database;
  private readonly priceService: PriceService;
  private readonly accuracyService?: ClassificationAccuracyService;

  constructor(
    db: Database,
    priceService?: PriceService,
    accuracyService?: ClassificationAccuracyService,
  ) {
    this.db = db;
    this.priceService = priceService ?? new PriceService();
    this.accuracyService = accuracyService;
  }

  /**
   * Schedule outcome tracking for a new event.
   * Creates a row in event_outcomes with the event price and null interval prices.
   */
  async scheduleOutcomeTracking(event: RawEvent): Promise<Result<void, Error>> {
    return this.scheduleTrackingForId(event.id, event);
  }

  async scheduleOutcomeTrackingForEvent(
    eventId: string,
    event: RawEvent,
  ): Promise<Result<void, Error>> {
    return this.scheduleTrackingForId(eventId, event);
  }

  private async scheduleTrackingForId(
    eventId: string,
    event: RawEvent,
  ): Promise<Result<void, Error>> {
    const ticker = this.extractTicker(event);
    if (!ticker) {
      return err(new Error(`No ticker found for event ${event.id}`));
    }

    const eventTime = event.timestamp ?? new Date();
    const priceResult = await this.priceService.getPriceAt(ticker, eventTime);
    const eventPrice = priceResult.ok ? priceResult.value : null;

    try {
      await this.db
        .insert(eventOutcomes)
        .values({
          eventId,
          ticker,
          eventTime,
          eventPrice: eventPrice != null ? String(eventPrice) : null,
        })
        .onConflictDoNothing();

      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Process all pending outcomes whose interval is now due.
   * Checks each interval (1h, 1d, 1w, 1m) and fills in prices that are due.
   */
  async processOutcomes(): Promise<void> {
    const now = new Date();

    for (const interval of TRACKING_INTERVALS) {
      const cutoff = new Date(now.getTime() - interval.hours * 3_600_000);

      // Find outcomes where this interval is null and the event is old enough
      const pendingRows = await this.db
        .select()
        .from(eventOutcomes)
        .where(
          sql`${eventOutcomes.eventTime} <= ${cutoff} AND ${
            interval.evaluatedAtCol
              ? eventOutcomes[this.evaluatedAtColumnKey(interval.evaluatedAtCol)]
              : eventOutcomes[this.priceColumnKey(interval.column)]
          } IS NULL`,
        )
        .limit(50);

      for (const row of pendingRows) {
        await this.fillInterval(row, interval);
      }
    }
  }

  /**
   * Get outcome data for a specific event.
   */
  async getOutcome(eventId: string): Promise<OutcomeRecord | null> {
    const [row] = await this.db
      .select()
      .from(eventOutcomes)
      .where(eq(eventOutcomes.eventId, eventId))
      .limit(1);

    return (row as OutcomeRecord | undefined) ?? null;
  }

  /**
   * Get outcomes for a specific ticker.
   */
  async getOutcomesByTicker(
    ticker: string,
    limit = 50,
  ): Promise<OutcomeRecord[]> {
    const rows = await this.db
      .select()
      .from(eventOutcomes)
      .where(eq(eventOutcomes.ticker, ticker))
      .orderBy(sql`${eventOutcomes.eventTime} DESC`)
      .limit(limit);

    return rows as OutcomeRecord[];
  }

  /**
   * Compute aggregate outcome statistics with optional filters.
   */
  async getOutcomeStats(filters?: {
    eventType?: string;
    severity?: string;
    source?: string;
  }): Promise<OutcomeStats> {
    // Total events
    const [{ total: totalEvents }] = await this.db
      .select({ total: count() })
      .from(events);

    // Tracked events
    const [{ total: trackedEvents }] = await this.db
      .select({ total: count() })
      .from(eventOutcomes);

    // Build filter conditions by joining events
    const filterConditions: ReturnType<typeof sql>[] = [];
    if (filters?.source) {
      filterConditions.push(sql`${events.source} = ${filters.source}`);
    }
    if (filters?.severity) {
      filterConditions.push(sql`${events.severity} = ${filters.severity}`);
    }

    const whereClause =
      filterConditions.length > 0
        ? sql`WHERE ${sql.join(filterConditions, sql` AND `)}`
        : sql``;

    // By interval stats
    const byInterval = await this.computeIntervalStats(whereClause);

    // By event type (source as proxy)
    const byEventType = await this.computeGroupStats('source', whereClause);

    // By source
    const bySource = await this.computeGroupStats('source', whereClause);

    return {
      totalEvents,
      trackedEvents,
      byInterval,
      byEventType,
      bySource,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private extractTicker(event: RawEvent): string | null {
    if (event.metadata && typeof event.metadata === 'object') {
      const meta = event.metadata as Record<string, unknown>;
      if (typeof meta['ticker'] === 'string') return meta['ticker'].toUpperCase();
      if (Array.isArray(meta['tickers']) && typeof meta['tickers'][0] === 'string') {
        return (meta['tickers'][0] as string).toUpperCase();
      }
      // Check LLM enrichment tickers (e.g. breaking-news events)
      const enrichment = meta['llm_enrichment'] as Record<string, unknown> | undefined;
      if (enrichment && Array.isArray(enrichment['tickers'])) {
        const first = enrichment['tickers'][0] as Record<string, unknown> | undefined;
        if (first && typeof first['symbol'] === 'string') {
          return first['symbol'].toUpperCase();
        }
      }
    }
    return null;
  }

  private priceColumnKey(col: string): keyof typeof eventOutcomes.$inferSelect {
    const map: Record<string, keyof typeof eventOutcomes.$inferSelect> = {
      price_1h: 'price1h',
      price_1d: 'price1d',
      price_t5: 'priceT5',
      price_t20: 'priceT20',
      price_1w: 'price1w',
      price_1m: 'price1m',
    };
    return map[col]!;
  }

  private evaluatedAtColumnKey(
    col: string,
  ): keyof typeof eventOutcomes.$inferSelect {
    const map: Record<string, keyof typeof eventOutcomes.$inferSelect> = {
      evaluated_t5_at: 'evaluatedT5At',
      evaluated_t20_at: 'evaluatedT20At',
    };
    return map[col]!;
  }

  private async fillInterval(
    row: typeof eventOutcomes.$inferSelect,
    interval: TrackingInterval,
  ): Promise<void> {
    const targetTime = new Date(
      row.eventTime.getTime() + interval.hours * 3_600_000,
    );

    const priceResult = await this.priceService.getPriceAt(
      row.ticker,
      targetTime,
    );

    const updates: Record<string, string | Date> = {
      updatedAt: new Date(),
    };
    if (interval.evaluatedAtCol) {
      updates[this.evaluatedAtColumnKey(interval.evaluatedAtCol)] = new Date();
    }

    if (!priceResult.ok || priceResult.value == null) {
      if (!interval.evaluatedAtCol) {
        return;
      }

      await this.db
        .update(eventOutcomes)
        .set(updates)
        .where(eq(eventOutcomes.id, row.id));
      return;
    }

    const price = priceResult.value;
    const eventPrice = row.eventPrice ? Number(row.eventPrice) : null;
    const change =
      eventPrice != null && eventPrice !== 0
        ? Math.round(((price - eventPrice) / eventPrice) * 100 * 10000) / 10000
        : null;

    updates[this.priceColumnKey(interval.column)] = String(price);
    if (change != null) {
      updates[this.changeColumnKey(interval.changeCol)] = String(change);
    }

    await this.db
      .update(eventOutcomes)
      .set(updates)
      .where(eq(eventOutcomes.id, row.id));

    if (this.accuracyService) {
      const updatedRow = {
        ...row,
        [this.priceColumnKey(interval.column)]: String(price),
        ...(change != null
          ? { [this.changeColumnKey(interval.changeCol)]: String(change) }
          : {}),
      };
      await this.syncAccuracyOutcome(updatedRow);
    }
  }

  private changeColumnKey(col: string): keyof typeof eventOutcomes.$inferSelect {
    const map: Record<string, keyof typeof eventOutcomes.$inferSelect> = {
      change_1h: 'change1h',
      change_1d: 'change1d',
      change_t5: 'changeT5',
      change_t20: 'changeT20',
      change_1w: 'change1w',
      change_1m: 'change1m',
    };
    return map[col]!;
  }

  private async syncAccuracyOutcome(
    row: typeof eventOutcomes.$inferSelect,
  ): Promise<void> {
    if (
      row.change1h == null ||
      row.change1d == null ||
      row.change1w == null ||
      !this.accuracyService
    ) {
      return;
    }

    const outcome = this.buildClassificationOutcome(row);
    await this.accuracyService.recordOutcome(row.eventId, outcome);
    await this.accuracyService.evaluateAccuracy(row.eventId);
  }

  private buildClassificationOutcome(
    row: typeof eventOutcomes.$inferSelect,
  ): Omit<ClassificationOutcome, 'eventId'> {
    const change1h = Number(row.change1h ?? 0);
    const change1d = Number(row.change1d ?? 0);
    const change1w = Number(row.change1w ?? 0);
    const directionalMove = this.pickDirectionalMove(change1h, change1d, change1w);

    return {
      actualDirection: this.toAccuracyDirection(directionalMove),
      priceChangePercent1h: change1h,
      priceChangePercent1d: change1d,
      priceChangePercent1w: change1w,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private pickDirectionalMove(...changes: number[]): number {
    const byMagnitude = [...changes].sort(
      (left, right) => Math.abs(right) - Math.abs(left),
    );
    return byMagnitude[0] ?? 0;
  }

  private toAccuracyDirection(change: number): AccuracyDirection {
    if (change >= 0.25) {
      return 'bullish';
    }
    if (change <= -0.25) {
      return 'bearish';
    }
    return 'neutral';
  }

  private async computeIntervalStats(
    _whereClause: ReturnType<typeof sql>, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<OutcomeStats['byInterval']> {
    const intervals = [
      { label: 'T+1h', col: 'change_1h' },
      { label: 'T+1d', col: 'change_1d' },
      { label: 'T+5d', col: 'change_t5' },
      { label: 'T+20d', col: 'change_t20' },
      { label: 'T+1w', col: 'change_1w' },
      { label: 'T+1m', col: 'change_1m' },
    ];

    const results: OutcomeStats['byInterval'] = [];

    for (const { label, col } of intervals) {
      const rows = await this.db.execute(
        sql.raw(
          `SELECT
            COUNT(*)::int AS sample_size,
            COALESCE(AVG(eo.${col}::float), 0) AS avg_change,
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY eo.${col}::float), 0) AS median_change,
            COALESCE(
              COUNT(CASE WHEN eo.${col}::float > 0 THEN 1 END)::float /
              NULLIF(COUNT(eo.${col}), 0) * 100,
              0
            ) AS win_rate
          FROM event_outcomes eo
          JOIN events e ON e.id = eo.event_id
          WHERE eo.${col} IS NOT NULL`,
        ),
      );

      const rowsResult = rows as unknown as { rows?: Record<string, unknown>[] };
      const rowArr = rowsResult.rows ?? (Array.isArray(rows) ? rows : []);
      const r = (rowArr[0] ?? {}) as Record<string, unknown>;

      results.push({
        label,
        avgChange: Number(r['avg_change'] ?? 0),
        medianChange: Number(r['median_change'] ?? 0),
        winRate: Number(r['win_rate'] ?? 0),
        sampleSize: Number(r['sample_size'] ?? 0),
      });
    }

    return results;
  }

    private async computeGroupStats(
    groupBy: 'source',
    _whereClause: ReturnType<typeof sql>, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Record<string, { count: number; avgChange1d: number; winRate1d: number }>> {
    const rows = await this.db.execute(
      sql.raw(
        `SELECT
          e.${groupBy} AS group_key,
          COUNT(*)::int AS cnt,
          COALESCE(AVG(eo.change_1d::float), 0) AS avg_change_1d,
          COALESCE(
            COUNT(CASE WHEN eo.change_1d::float > 0 THEN 1 END)::float /
            NULLIF(COUNT(eo.change_1d), 0) * 100,
            0
          ) AS win_rate_1d
        FROM event_outcomes eo
        JOIN events e ON e.id = eo.event_id
        WHERE eo.change_1d IS NOT NULL
        GROUP BY e.${groupBy}`,
      ),
    );

    const result: Record<string, { count: number; avgChange1d: number; winRate1d: number }> = {};
    const rowsResult = rows as unknown as { rows?: Record<string, unknown>[] };
    const rowArr = rowsResult.rows ?? (Array.isArray(rows) ? rows : []);
    for (const r of rowArr as Record<string, unknown>[]) {
      const key = String(r['group_key'] ?? 'unknown');
      result[key] = {
        count: Number(r['cnt'] ?? 0),
        avgChange1d: Number(r['avg_change_1d'] ?? 0),
        winRate1d: Number(r['win_rate_1d'] ?? 0),
      };
    }

    return result;
  }
}
