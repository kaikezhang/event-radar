import { count, eq, gte } from 'drizzle-orm';
import type {
  AccuracyDirection,
  AccuracyEventDetails,
  AccuracyPeriod,
  AccuracyResult,
  AccuracyStats,
  AccuracyStatsOptions,
  ClassificationOutcome,
  ClassificationPrediction,
  EventBus,
  Severity,
} from '@event-radar/shared';
import {
  ClassificationOutcomeSchema,
  ClassificationPredictionSchema,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  classificationOutcomes,
  classificationPredictions,
  events,
} from '../db/schema.js';
import { clampOutcomePercent } from '../utils/outcome-cap.js';

interface ClassificationAccuracyServiceOptions {
  eventBus?: EventBus;
}

interface AccuracyJoinRow {
  prediction: ClassificationPrediction;
  outcome: ClassificationOutcome;
  source: string;
  eventType: string;
}

const PERIOD_TO_DAYS: Record<Exclude<AccuracyPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const SEVERITY_THRESHOLDS: Array<{ severity: Severity; minMagnitude: number }> = [
  { severity: 'CRITICAL', minMagnitude: 5 },
  { severity: 'HIGH', minMagnitude: 3 },
  { severity: 'MEDIUM', minMagnitude: 1 },
  { severity: 'LOW', minMagnitude: 0 },
];

export class ClassificationAccuracyService {
  private readonly db: Database;
  private readonly eventBus?: EventBus;
  private lastEmittedTotal = 0;

  constructor(db: Database, options?: ClassificationAccuracyServiceOptions) {
    this.db = db;
    this.eventBus = options?.eventBus;
  }

  async recordPrediction(
    eventId: string,
    prediction: Omit<ClassificationPrediction, 'eventId'>,
  ): Promise<void> {
    const parsed = ClassificationPredictionSchema.parse({
      ...prediction,
      eventId,
    });

    await this.db
      .insert(classificationPredictions)
      .values({
        eventId: parsed.eventId,
        predictedSeverity: parsed.predictedSeverity,
        predictedDirection: parsed.predictedDirection,
        confidence: String(parsed.confidence),
        classifiedBy: parsed.classifiedBy,
        classifiedAt: new Date(parsed.classifiedAt),
      })
      .onConflictDoUpdate({
        target: classificationPredictions.eventId,
        set: {
          predictedSeverity: parsed.predictedSeverity,
          predictedDirection: parsed.predictedDirection,
          confidence: String(parsed.confidence),
          classifiedBy: parsed.classifiedBy,
          classifiedAt: new Date(parsed.classifiedAt),
        },
      });
  }

  async recordOutcome(
    eventId: string,
    outcome: Omit<ClassificationOutcome, 'eventId'>,
  ): Promise<void> {
    const parsed = ClassificationOutcomeSchema.parse({
      ...outcome,
      eventId,
    });
    const priceChangePercent1h = clampOutcomePercent(parsed.priceChangePercent1h) ?? 0;
    const priceChangePercent1d = clampOutcomePercent(parsed.priceChangePercent1d) ?? 0;
    const priceChangePercent1w = clampOutcomePercent(parsed.priceChangePercent1w) ?? 0;

    await this.db
      .insert(classificationOutcomes)
      .values({
        eventId: parsed.eventId,
        actualDirection: parsed.actualDirection,
        priceChange1h: String(priceChangePercent1h),
        priceChange1d: String(priceChangePercent1d),
        priceChange1w: String(priceChangePercent1w),
        evaluatedAt: new Date(parsed.evaluatedAt),
      })
      .onConflictDoUpdate({
        target: classificationOutcomes.eventId,
        set: {
          actualDirection: parsed.actualDirection,
          priceChange1h: String(priceChangePercent1h),
          priceChange1d: String(priceChangePercent1d),
          priceChange1w: String(priceChangePercent1w),
          evaluatedAt: new Date(parsed.evaluatedAt),
        },
      });

    await this.emitAccuracyUpdateIfNeeded();
  }

  async evaluateAccuracy(eventId: string): Promise<AccuracyResult | null> {
    const details = await this.getEventAccuracy(eventId);
    if (!details?.prediction || !details.outcome) {
      return null;
    }

    return this.buildAccuracyResult(details.prediction, details.outcome);
  }

  async getAccuracyStats(options?: AccuracyStatsOptions): Promise<AccuracyStats> {
    const period = options?.period ?? 'all';
    const rows = await this.getJoinedRows(period);
    if (rows.length === 0) {
      return {
        totalEvaluated: 0,
        severityAccuracy: 0,
        directionAccuracy: 0,
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        bySource: {},
        byEventType: {},
        period,
      };
    }

    let severityCorrectCount = 0;
    let directionCorrectCount = 0;
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let directionEvaluatedCount = 0;

    const bySource = new Map<string, { totalScore: number; count: number }>();
    const byEventType = new Map<string, { totalScore: number; count: number }>();

    for (const row of rows) {
      const result = this.buildAccuracyResult(row.prediction, row.outcome);
      const includeBinaryDirection = this.shouldIncludeBinaryDirectionMetrics(
        row.prediction.predictedDirection,
        row.outcome.actualDirection,
      );
      const score = includeBinaryDirection
        ? (Number(result.severityCorrect) + Number(result.directionCorrect)) / 2
        : Number(result.severityCorrect);

      severityCorrectCount += Number(result.severityCorrect);

      if (includeBinaryDirection) {
        directionEvaluatedCount++;
        directionCorrectCount += Number(result.directionCorrect);

        if (
          row.prediction.predictedDirection === 'bullish' &&
          row.outcome.actualDirection === 'bullish'
        ) {
          truePositives++;
        } else if (
          row.prediction.predictedDirection === 'bearish' &&
          row.outcome.actualDirection === 'bearish'
        ) {
          trueNegatives++;
        } else if (
          row.prediction.predictedDirection === 'bullish' &&
          row.outcome.actualDirection === 'bearish'
        ) {
          falsePositives++;
        } else if (
          row.prediction.predictedDirection === 'bearish' &&
          row.outcome.actualDirection === 'bullish'
        ) {
          falseNegatives++;
        }
      }

      this.addGroupedScore(bySource, row.source, score);
      this.addGroupedScore(byEventType, row.eventType, score);
    }

    const precision = this.safeDivide(truePositives, truePositives + falsePositives);
    const recall = this.safeDivide(truePositives, truePositives + falseNegatives);
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return {
      totalEvaluated: rows.length,
      severityAccuracy: this.safeDivide(severityCorrectCount, rows.length),
      directionAccuracy: this.safeDivide(
        directionCorrectCount,
        directionEvaluatedCount,
      ),
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1Score,
      bySource: this.mapGroupedScore(bySource),
      byEventType: this.mapGroupedScore(byEventType),
      period,
    };
  }

  async getEventAccuracy(eventId: string): Promise<AccuracyEventDetails | null> {
    const [predictionRow] = await this.db
      .select()
      .from(classificationPredictions)
      .where(eq(classificationPredictions.eventId, eventId))
      .limit(1);
    const [outcomeRow] = await this.db
      .select()
      .from(classificationOutcomes)
      .where(eq(classificationOutcomes.eventId, eventId))
      .limit(1);

    if (!predictionRow && !outcomeRow) {
      return null;
    }

    const prediction = predictionRow
      ? this.toPrediction({
          eventId,
          predictedSeverity: predictionRow.predictedSeverity,
          predictedDirection: predictionRow.predictedDirection,
          confidence: predictionRow.confidence,
          classifiedBy: predictionRow.classifiedBy,
          classifiedAt: predictionRow.classifiedAt,
        })
      : null;
    const outcome = outcomeRow
      ? this.toOutcome({
          eventId,
          actualDirection: outcomeRow.actualDirection,
          priceChange1h: outcomeRow.priceChange1h,
          priceChange1d: outcomeRow.priceChange1d,
          priceChange1w: outcomeRow.priceChange1w,
          evaluatedAt: outcomeRow.evaluatedAt,
        })
      : null;

    return {
      prediction,
      outcome,
      evaluation:
        prediction && outcome
          ? this.buildAccuracyResult(prediction, outcome)
          : null,
    };
  }

  private async emitAccuracyUpdateIfNeeded(): Promise<void> {
    if (!this.eventBus?.publishTopic) {
      return;
    }

    const [{ totalEvaluated }] = await this.db
      .select({ totalEvaluated: count() })
      .from(classificationPredictions)
      .innerJoin(
        classificationOutcomes,
        eq(classificationOutcomes.eventId, classificationPredictions.eventId),
      );
    const total = Number(totalEvaluated);

    if (
      total > 0 &&
      total % 100 === 0 &&
      total !== this.lastEmittedTotal
    ) {
      this.lastEmittedTotal = total;
      const stats = await this.getAccuracyStats();
      await this.eventBus.publishTopic('accuracy:updated', stats);
    }
  }

  private async getJoinedRows(period: AccuracyPeriod): Promise<AccuracyJoinRow[]> {
    const cutoffDate = this.getPeriodCutoff(period);
    const query = this.db
      .select({
        eventId: classificationPredictions.eventId,
        predictedSeverity: classificationPredictions.predictedSeverity,
        predictedDirection: classificationPredictions.predictedDirection,
        confidence: classificationPredictions.confidence,
        classifiedBy: classificationPredictions.classifiedBy,
        classifiedAt: classificationPredictions.classifiedAt,
        actualDirection: classificationOutcomes.actualDirection,
        priceChange1h: classificationOutcomes.priceChange1h,
        priceChange1d: classificationOutcomes.priceChange1d,
        priceChange1w: classificationOutcomes.priceChange1w,
        evaluatedAt: classificationOutcomes.evaluatedAt,
        source: events.source,
        rawPayload: events.rawPayload,
      })
      .from(classificationPredictions)
      .innerJoin(
        classificationOutcomes,
        eq(classificationOutcomes.eventId, classificationPredictions.eventId),
      )
      .innerJoin(events, eq(events.id, classificationPredictions.eventId));
    const rows = cutoffDate
      ? await query.where(gte(classificationPredictions.classifiedAt, cutoffDate))
      : await query;

    return rows
      .map((row) => {
        const prediction = this.toPrediction({
          eventId: row.eventId,
          predictedSeverity: row.predictedSeverity,
          predictedDirection: row.predictedDirection,
          confidence: row.confidence,
          classifiedBy: row.classifiedBy,
          classifiedAt: row.classifiedAt,
        });
        const outcome = this.toOutcome({
          eventId: row.eventId,
          actualDirection: row.actualDirection,
          priceChange1h: row.priceChange1h,
          priceChange1d: row.priceChange1d,
          priceChange1w: row.priceChange1w,
          evaluatedAt: row.evaluatedAt,
        });
        const eventType = this.extractEventType(row.rawPayload);

        return { prediction, outcome, source: row.source, eventType };
      });
  }

  private buildAccuracyResult(
    prediction: ClassificationPrediction,
    outcome: ClassificationOutcome,
  ): AccuracyResult {
    const severityCorrect =
      prediction.predictedSeverity === this.deriveActualSeverity(outcome);
    const directionCorrect =
      prediction.predictedDirection === outcome.actualDirection;

    return {
      eventId: prediction.eventId,
      severityCorrect,
      directionCorrect,
      confidenceCalibration: Math.max(
        0,
        1 - Math.abs(prediction.confidence - Number(directionCorrect)),
      ),
    };
  }

  private deriveActualSeverity(outcome: ClassificationOutcome): Severity {
    const magnitude = Math.max(
      Math.abs(outcome.priceChangePercent1h),
      Math.abs(outcome.priceChangePercent1d),
      Math.abs(outcome.priceChangePercent1w),
    );

    const matched =
      SEVERITY_THRESHOLDS.find((threshold) => magnitude >= threshold.minMagnitude)
      ?? SEVERITY_THRESHOLDS[SEVERITY_THRESHOLDS.length - 1]!;

    return matched.severity;
  }

  private addGroupedScore(
    target: Map<string, { totalScore: number; count: number }>,
    key: string,
    score: number,
  ): void {
    const current = target.get(key) ?? { totalScore: 0, count: 0 };
    current.totalScore += score;
    current.count += 1;
    target.set(key, current);
  }

  private mapGroupedScore(
    source: Map<string, { totalScore: number; count: number }>,
  ): Record<string, { accuracy: number; count: number }> {
    return Object.fromEntries(
      Array.from(source.entries()).map(([key, value]) => [
        key,
        {
          accuracy: this.safeDivide(value.totalScore, value.count),
          count: value.count,
        },
      ]),
    );
  }

  private extractEventType(rawPayload: unknown): string {
    if (rawPayload && typeof rawPayload === 'object') {
      const type = (rawPayload as Record<string, unknown>)['type'];
      if (typeof type === 'string' && type.length > 0) {
        return type;
      }
    }

    return 'unknown';
  }

  private getPeriodCutoff(period: AccuracyPeriod): Date | null {
    if (period === 'all') {
      return null;
    }

    const days = PERIOD_TO_DAYS[period];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private shouldIncludeBinaryDirectionMetrics(
    predictedDirection: AccuracyDirection,
    actualDirection: AccuracyDirection,
  ): boolean {
    // Neutral predictions/outcomes are excluded from the binary confusion matrix.
    // This keeps TP/TN/FP/FN, precision, recall, and F1 aligned to bullish/bearish
    // classification until we add a dedicated neutral bucket to AccuracyStats.
    return predictedDirection !== 'neutral' && actualDirection !== 'neutral';
  }

  private toPrediction(row: {
    eventId: string;
    predictedSeverity: string;
    predictedDirection: string;
    confidence: string | number;
    classifiedBy: string;
    classifiedAt: Date;
  }): ClassificationPrediction {
    return {
      eventId: row.eventId,
      predictedSeverity: row.predictedSeverity as Severity,
      predictedDirection: row.predictedDirection as AccuracyDirection,
      confidence: Number(row.confidence),
      classifiedBy: row.classifiedBy as ClassificationPrediction['classifiedBy'],
      classifiedAt: row.classifiedAt.toISOString(),
    };
  }

  private toOutcome(row: {
    eventId: string;
    actualDirection: string;
    priceChange1h: string | number;
    priceChange1d: string | number;
    priceChange1w: string | number;
    evaluatedAt: Date;
  }): ClassificationOutcome {
    return {
      eventId: row.eventId,
      actualDirection: row.actualDirection as AccuracyDirection,
      priceChangePercent1h: Number(row.priceChange1h),
      priceChangePercent1d: Number(row.priceChange1d),
      priceChangePercent1w: Number(row.priceChange1w),
      evaluatedAt: row.evaluatedAt.toISOString(),
    };
  }

  private safeDivide(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0;
  }
}
