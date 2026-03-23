import { and, count, eq, gt, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { ConfidenceLevel } from '@event-radar/shared';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import {
  classificationPredictions,
  events,
  eventOutcomes,
} from '../db/schema.js';
import {
  asRecord,
  getEnrichment,
  getString,
  resolveConfidenceBucket,
  resolveProductEventType,
  toNumber,
} from './scorecard-semantics.js';

/** Sources excluded from scorecard aggregation (test/internal data). */
const EXCLUDED_SOURCES = ['dummy', 'test', 'internal'];

/** Canonical label for each emoji-prefix tier. */
const EMOJI_PREFIX_CANONICAL: Record<string, string> = {
  '🔴': '🔴 High-Quality Setup',
  '🟡': '🟡 Monitor',
  '🟢': '🟢 Background',
};

/**
 * Extract the emoji prefix bucket from an action label.
 * Both legacy ("🔴 ACT NOW") and canonical ("🔴 High-Quality Setup")
 * labels resolve to the same canonical bucket.
 */
function actionToBucket(actionLabel: string): string {
  const prefix = [...actionLabel][0]; // first Unicode char (emoji)
  return EMOJI_PREFIX_CANONICAL[prefix] ?? actionLabel;
}

const ScorecardAggregateMetricsSchema = z.object({
  totalAlerts: z.number().int().nonnegative(),
  alertsWithUsableVerdicts: z.number().int().nonnegative(),
  directionalCorrectCount: z.number().int().nonnegative(),
  directionalHitRate: z.number().min(0).max(1).nullable(),
  setupWorkedCount: z.number().int().nonnegative(),
  setupWorkedRate: z.number().min(0).max(1).nullable(),
  avgT5Move: z.number().nullable(),
  avgT20Move: z.number().nullable(),
  medianT20Move: z.number().nullable(),
});

const BucketSummarySchema = ScorecardAggregateMetricsSchema.extend({
  bucket: z.string(),
});

const ScorecardOverviewSchema = z.object({
  totalEvents: z.number().int().nonnegative(),
  sourcesMonitored: z.number().int().nonnegative(),
  eventsWithTickers: z.number().int().nonnegative(),
  eventsWithPriceOutcomes: z.number().int().nonnegative(),
});

export const ScorecardSummarySchema = z.object({
  days: z.number().int().positive().nullable(),
  overview: ScorecardOverviewSchema,
  totals: ScorecardAggregateMetricsSchema,
  actionBuckets: z.array(BucketSummarySchema),
  confidenceBuckets: z.array(BucketSummarySchema),
  sourceBuckets: z.array(BucketSummarySchema),
  eventTypeBuckets: z.array(BucketSummarySchema),
});

export type ScorecardSummary = z.infer<typeof ScorecardSummarySchema>;

const ScorecardSeverityBreakdownItemSchema = z.object({
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  count: z.number().int().nonnegative(),
});

export const ScorecardSeverityBreakdownSchema = z.array(ScorecardSeverityBreakdownItemSchema);

export type ScorecardSeverityBreakdownItem = z.infer<typeof ScorecardSeverityBreakdownItemSchema>;

interface ScorecardAggregationServiceOptions {
  now?: () => Date;
}

interface SummaryOptions {
  days?: number;
}

interface AggregationQueryRow {
  eventId: string;
  source: string;
  rawPayload: unknown;
  metadata: unknown;
  receivedAt: Date;
  eventTime: Date | null;
  changeT5: string | null;
  changeT20: string | null;
  predictedDirection: string | null;
  predictionConfidence: string | null;
}

interface NormalizedAlertScorecardRow {
  timestamp: Date;
  source: string | null;
  eventType: string | null;
  actionLabel: string | null;
  confidenceBucket: ConfidenceLevel | null;
  changeT5: number | null;
  changeT20: number | null;
}

interface AggregateAccumulator {
  totalAlerts: number;
  alertsWithUsableVerdicts: number;
  directionalCorrectCount: number;
  setupWorkedCount: number;
  t5Moves: number[];
  t20Moves: number[];
}

const CONFIDENCE_BUCKET_ORDER: ConfidenceLevel[] = [
  'low',
  'medium',
  'high',
  'unconfirmed',
];

export class ScorecardAggregationService {
  private readonly db: Database;
  private readonly now: () => Date;

  constructor(db: Database, options?: ScorecardAggregationServiceOptions) {
    this.db = db;
    this.now = options?.now ?? (() => new Date());
  }

  async getSummary(options?: SummaryOptions): Promise<ScorecardSummary> {
    const rows = await this.getRows();
    const normalizedRows = rows
      .map((row) => this.normalizeRow(row))
      .filter((row) => this.isInWindow(row, options?.days));
    const overview = await this.getOverview(options);

    return ScorecardSummarySchema.parse({
      days: options?.days ?? null,
      overview,
      totals: this.finalizeAggregate(this.aggregateRows(normalizedRows)),
      actionBuckets: this.buildBuckets(
        normalizedRows,
        (row) => row.actionLabel ? actionToBucket(row.actionLabel) : null,
        (left, right) =>
          right.totalAlerts - left.totalAlerts || left.bucket.localeCompare(right.bucket),
      ),
      confidenceBuckets: this.buildBuckets(
        normalizedRows,
        (row) => row.confidenceBucket,
        (left, right) =>
          CONFIDENCE_BUCKET_ORDER.indexOf(left.bucket as ConfidenceLevel)
          - CONFIDENCE_BUCKET_ORDER.indexOf(right.bucket as ConfidenceLevel),
      ),
      sourceBuckets: this.buildBuckets(
        normalizedRows,
        (row) => row.source,
        (left, right) =>
          right.totalAlerts - left.totalAlerts || left.bucket.localeCompare(right.bucket),
      ),
      eventTypeBuckets: this.buildBuckets(
        normalizedRows,
        (row) => row.eventType,
        (left, right) =>
          right.totalAlerts - left.totalAlerts || left.bucket.localeCompare(right.bucket),
      ),
    });
  }

  async getSeverityBreakdown(options?: SummaryOptions): Promise<ScorecardSeverityBreakdownItem[]> {
    const conditions = this.buildEventConditions(options, true);

    const rows = await this.db
      .select({
        severity: events.severity,
        count: count(),
      })
      .from(events)
      .where(and(...conditions))
      .groupBy(events.severity)
      .orderBy(sql`CASE ${events.severity}
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        ELSE 5
      END`);

    return ScorecardSeverityBreakdownSchema.parse(rows);
  }

  private async getOverview(options?: SummaryOptions): Promise<z.infer<typeof ScorecardOverviewSchema>> {
    const eventRows = await this.db
      .select({
        source: events.source,
      })
      .from(events)
      .where(and(...this.buildEventConditions(options)));

    const outcomeRows = await this.db
      .select({
        eventId: events.id,
        hasPriceOutcome: eventOutcomes.changeT5,
      })
      .from(events)
      .innerJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
      .where(and(...this.buildEventConditions(options)));

    return ScorecardOverviewSchema.parse({
      totalEvents: eventRows.length,
      sourcesMonitored: new Set(eventRows.map((row) => row.source)).size,
      eventsWithTickers: outcomeRows.length,
      eventsWithPriceOutcomes: outcomeRows.filter((row) => row.hasPriceOutcome != null).length,
    });
  }

  private async getRows(): Promise<AggregationQueryRow[]> {
    return this.db
      .select({
        eventId: events.id,
        source: events.source,
        rawPayload: events.rawPayload,
        metadata: events.metadata,
        receivedAt: events.receivedAt,
        eventTime: eventOutcomes.eventTime,
        changeT5: eventOutcomes.changeT5,
        changeT20: eventOutcomes.changeT20,
        predictedDirection: classificationPredictions.predictedDirection,
        predictionConfidence: classificationPredictions.confidence,
      })
      .from(events)
      .innerJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
      .leftJoin(
        classificationPredictions,
        eq(classificationPredictions.eventId, events.id),
      )
      .where(notInArray(events.source, EXCLUDED_SOURCES));
  }

  private normalizeRow(row: AggregationQueryRow): NormalizedAlertScorecardRow {
    const metadata = asRecord(row.metadata);
    const enrichment = getEnrichment(metadata?.['llm_enrichment']);

    return {
      timestamp: row.eventTime ?? row.receivedAt,
      source: getString(row.source),
      eventType: resolveProductEventType({
        metadata,
        rawPayload: row.rawPayload,
      }),
      actionLabel: enrichment?.action ?? null,
      confidenceBucket: resolveConfidenceBucket(row.predictionConfidence),
      changeT5: toNumber(row.changeT5),
      changeT20: toNumber(row.changeT20),
    };
  }

  private buildEventConditions(options?: SummaryOptions, requireSeverity = false) {
    const conditions = [notInArray(events.source, EXCLUDED_SOURCES)];

    if (requireSeverity) {
      conditions.push(isNotNull(events.severity));
    }

    if (options?.days != null) {
      const cutoff = new Date(this.now().getTime() - options.days * 24 * 60 * 60 * 1000);
      conditions.push(gt(events.createdAt, cutoff));
    }

    return conditions;
  }

  private isInWindow(row: NormalizedAlertScorecardRow, days?: number): boolean {
    if (days == null) {
      return true;
    }

    const cutoff = this.now().getTime() - days * 86_400_000;
    return row.timestamp.getTime() >= cutoff;
  }

  private buildBuckets(
    rows: NormalizedAlertScorecardRow[],
    getBucket: (row: NormalizedAlertScorecardRow) => string | null,
    sortBuckets: (
      left: z.infer<typeof BucketSummarySchema>,
      right: z.infer<typeof BucketSummarySchema>,
    ) => number,
  ): Array<z.infer<typeof BucketSummarySchema>> {
    const buckets = new Map<string, NormalizedAlertScorecardRow[]>();

    for (const row of rows) {
      const bucket = getBucket(row);
      if (bucket == null) {
        continue;
      }

      const current = buckets.get(bucket) ?? [];
      current.push(row);
      buckets.set(bucket, current);
    }

    return [...buckets.entries()]
      .map(([bucket, bucketRows]) => ({
        bucket,
        ...this.finalizeAggregate(this.aggregateRows(bucketRows)),
      }))
      .sort(sortBuckets);
  }

  private aggregateRows(rows: NormalizedAlertScorecardRow[]): AggregateAccumulator {
    return rows.reduce<AggregateAccumulator>((accumulator, row) => {
      accumulator.totalAlerts += 1;

      if (row.changeT5 != null) {
        accumulator.alertsWithUsableVerdicts += 1;
        if (Math.abs(row.changeT5) >= 5) {
          accumulator.setupWorkedCount += 1;
        }
      }

      if (row.changeT5 != null) {
        accumulator.t5Moves.push(row.changeT5);
      }
      if (row.changeT20 != null) {
        accumulator.t20Moves.push(row.changeT20);
      }

      return accumulator;
    }, {
      totalAlerts: 0,
      alertsWithUsableVerdicts: 0,
      directionalCorrectCount: 0,
      setupWorkedCount: 0,
      t5Moves: [],
      t20Moves: [],
    });
  }

  private finalizeAggregate(
    aggregate: AggregateAccumulator,
  ): z.infer<typeof ScorecardAggregateMetricsSchema> {
    return {
      totalAlerts: aggregate.totalAlerts,
      alertsWithUsableVerdicts: aggregate.alertsWithUsableVerdicts,
      directionalCorrectCount: aggregate.directionalCorrectCount,
      directionalHitRate: divide(
        aggregate.directionalCorrectCount,
        aggregate.alertsWithUsableVerdicts,
      ),
      setupWorkedCount: aggregate.setupWorkedCount,
      setupWorkedRate: divide(
        aggregate.setupWorkedCount,
        aggregate.alertsWithUsableVerdicts,
      ),
      avgT5Move: averageNumbers(aggregate.t5Moves),
      avgT20Move: averageNumbers(aggregate.t20Moves),
      medianT20Move: medianNumbers(aggregate.t20Moves),
    };
  }
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

function medianNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2, 4);
  }

  return round(sorted[middle] ?? 0, 4);
}

function divide(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return round(numerator / denominator, 4);
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}
