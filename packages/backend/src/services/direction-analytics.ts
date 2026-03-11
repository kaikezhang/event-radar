import { eq, gte } from 'drizzle-orm';
import type {
  AccuracyDirection,
  AccuracyPeriod,
  CalibrationData,
  DirectionBreakdown,
  DirectionMetrics,
  Misprediction,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  classificationOutcomes,
  classificationPredictions,
  events,
} from '../db/schema.js';

const DIRECTION_THRESHOLD = 1; // ±1% price change threshold

const PERIOD_TO_DAYS: Record<Exclude<AccuracyPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

interface DirectionAnalyticsOptions {
  period?: AccuracyPeriod;
}

interface JoinedRow {
  eventId: string;
  title: string;
  predictedDirection: string;
  confidence: string | number;
  priceChange1h: string | number;
  priceChange1d: string | number;
  priceChange1w: string | number;
  classifiedAt: Date;
}

export class DirectionAnalyticsService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getDirectionBreakdown(
    options?: DirectionAnalyticsOptions,
  ): Promise<DirectionBreakdown> {
    const period = options?.period ?? 'all';
    const rows = await this.getJoinedRows(period);

    return {
      period,
      horizons: {
        '1h': this.computeMetricsForHorizon(rows, '1h'),
        '1d': this.computeMetricsForHorizon(rows, '1d'),
        '1w': this.computeMetricsForHorizon(rows, '1w'),
      },
    };
  }

  async getConfidenceCalibration(
    options?: DirectionAnalyticsOptions,
  ): Promise<CalibrationData[]> {
    const period = options?.period ?? 'all';
    const rows = await this.getJoinedRows(period);

    const buckets = new Map<
      string,
      { totalConfidence: number; correctCount: number; count: number }
    >();

    // Initialize all buckets
    for (const label of [
      '0.0-0.2',
      '0.2-0.4',
      '0.4-0.6',
      '0.6-0.8',
      '0.8-1.0',
    ]) {
      buckets.set(label, { totalConfidence: 0, correctCount: 0, count: 0 });
    }

    for (const row of rows) {
      const confidence = Number(row.confidence);
      const bucketLabel = this.getBucketLabel(confidence);
      const bucket = buckets.get(bucketLabel)!;

      // Calibration uses T+1d horizon as the reference timeframe.
      // This is intentional: 1d provides the best balance of signal availability
      // and prediction relevance. Future work could parameterize the horizon.
      const actualDirection = this.deriveDirection(Number(row.priceChange1d));
      const correct = row.predictedDirection === actualDirection;

      bucket.totalConfidence += confidence;
      bucket.correctCount += correct ? 1 : 0;
      bucket.count += 1;
    }

    return Array.from(buckets.entries()).map(([label, data]) => ({
      bucket: label,
      avgConfidence: data.count > 0 ? data.totalConfidence / data.count : 0,
      actualAccuracy: data.count > 0 ? data.correctCount / data.count : 0,
      count: data.count,
    }));
  }

  async getTopMispredictions(
    options?: DirectionAnalyticsOptions & { limit?: number },
  ): Promise<Misprediction[]> {
    const period = options?.period ?? 'all';
    const limit = options?.limit ?? 20;
    const rows = await this.getJoinedRows(period);

    // Build calibration buckets to compute per-bucket actual accuracy
    const bucketStats = new Map<
      string,
      { correctCount: number; count: number }
    >();
    for (const label of [
      '0.0-0.2',
      '0.2-0.4',
      '0.4-0.6',
      '0.6-0.8',
      '0.8-1.0',
    ]) {
      bucketStats.set(label, { correctCount: 0, count: 0 });
    }
    for (const row of rows) {
      const confidence = Number(row.confidence);
      const bucketLabel = this.getBucketLabel(confidence);
      const bucket = bucketStats.get(bucketLabel)!;
      const actualDirection = this.deriveDirection(Number(row.priceChange1d));
      bucket.count += 1;
      if (row.predictedDirection === actualDirection) {
        bucket.correctCount += 1;
      }
    }

    const bucketAccuracyMap = new Map<string, number>();
    for (const [label, data] of bucketStats) {
      bucketAccuracyMap.set(
        label,
        data.count > 0 ? data.correctCount / data.count : 0,
      );
    }

    const mispredictions: Array<Misprediction & { calibrationDelta: number }> = [];

    for (const row of rows) {
      const actualDirection = this.deriveDirection(Number(row.priceChange1d));
      if (row.predictedDirection !== actualDirection) {
        const confidence = Number(row.confidence);
        const bucketLabel = this.getBucketLabel(confidence);
        const bucketAccuracy = bucketAccuracyMap.get(bucketLabel) ?? 0;
        mispredictions.push({
          eventId: row.eventId,
          title: row.title,
          predictedDirection: row.predictedDirection,
          actualDirection,
          confidence,
          priceChange1d: Number(row.priceChange1d),
          calibrationDelta: Math.abs(confidence - bucketAccuracy),
        });
      }
    }

    // Sort by |confidence - bucket_actual_accuracy| descending.
    // Events where the model was most overconfident relative to its bucket's
    // actual accuracy are the worst mispredictions.
    mispredictions.sort((a, b) => b.calibrationDelta - a.calibrationDelta);

    // Strip internal calibrationDelta before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return mispredictions.slice(0, limit).map(({ calibrationDelta, ...rest }) => rest);
  }

  private computeMetricsForHorizon(
    rows: JoinedRow[],
    horizon: '1h' | '1d' | '1w',
  ): DirectionMetrics {
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;

    for (const row of rows) {
      const priceChange =
        horizon === '1h'
          ? Number(row.priceChange1h)
          : horizon === '1d'
            ? Number(row.priceChange1d)
            : Number(row.priceChange1w);

      const actualDirection = this.deriveDirection(priceChange);

      // Skip neutral predictions and outcomes from binary metrics
      if (
        row.predictedDirection === 'neutral' ||
        actualDirection === 'neutral'
      ) {
        continue;
      }

      if (
        row.predictedDirection === 'bullish' &&
        actualDirection === 'bullish'
      ) {
        tp++;
      } else if (
        row.predictedDirection === 'bearish' &&
        actualDirection === 'bearish'
      ) {
        tn++;
      } else if (
        row.predictedDirection === 'bullish' &&
        actualDirection === 'bearish'
      ) {
        fp++;
      } else if (
        row.predictedDirection === 'bearish' &&
        actualDirection === 'bullish'
      ) {
        fn++;
      }
    }

    const total = tp + tn + fp + fn;
    const accuracy = total > 0 ? (tp + tn) / total : 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return { total, accuracy, tp, tn, fp, fn, precision, recall, f1 };
  }

  private deriveDirection(priceChangePercent: number): AccuracyDirection {
    if (priceChangePercent > DIRECTION_THRESHOLD) {
      return 'bullish';
    }
    if (priceChangePercent < -DIRECTION_THRESHOLD) {
      return 'bearish';
    }
    return 'neutral';
  }

  private getBucketLabel(confidence: number): string {
    if (confidence < 0.2) return '0.0-0.2';
    if (confidence < 0.4) return '0.2-0.4';
    if (confidence < 0.6) return '0.4-0.6';
    if (confidence < 0.8) return '0.6-0.8';
    return '0.8-1.0';
  }

  private async getJoinedRows(period: AccuracyPeriod): Promise<JoinedRow[]> {
    const cutoffDate = this.getPeriodCutoff(period);

    const query = this.db
      .select({
        eventId: classificationPredictions.eventId,
        title: events.title,
        predictedDirection: classificationPredictions.predictedDirection,
        confidence: classificationPredictions.confidence,
        priceChange1h: classificationOutcomes.priceChange1h,
        priceChange1d: classificationOutcomes.priceChange1d,
        priceChange1w: classificationOutcomes.priceChange1w,
        classifiedAt: classificationPredictions.classifiedAt,
      })
      .from(classificationPredictions)
      .innerJoin(
        classificationOutcomes,
        eq(
          classificationOutcomes.eventId,
          classificationPredictions.eventId,
        ),
      )
      .innerJoin(events, eq(events.id, classificationPredictions.eventId));

    const rows = cutoffDate
      ? await query.where(
          gte(classificationPredictions.classifiedAt, cutoffDate),
        )
      : await query;

    return rows.map((row) => ({
      eventId: row.eventId,
      title: row.title,
      predictedDirection: row.predictedDirection,
      confidence: row.confidence,
      priceChange1h: row.priceChange1h,
      priceChange1d: row.priceChange1d,
      priceChange1w: row.priceChange1w,
      classifiedAt: row.classifiedAt,
    }));
  }

  private getPeriodCutoff(period: AccuracyPeriod): Date | null {
    if (period === 'all') {
      return null;
    }
    const days = PERIOD_TO_DAYS[period];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
