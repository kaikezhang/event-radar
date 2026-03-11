import { asc, desc, eq } from 'drizzle-orm';
import type {
  EventBus,
  ReclassificationCandidate,
  ReclassificationItem,
  ReclassificationReason,
  SourceWeights,
} from '@event-radar/shared';
import {
  ReclassificationCandidateSchema,
  ReclassificationItemSchema,
  SourceWeightsSchema,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  classificationPredictions,
  events,
  reclassificationQueue,
  userFeedback,
} from '../db/schema.js';
import { ClassificationAccuracyService } from './classification-accuracy.js';
import { UserFeedbackService } from './user-feedback.js';
import { WeightHistoryService } from './weight-history.js';

const MIN_SAMPLE_SIZE = 20;
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.7;
const LOW_SOURCE_ACCURACY_THRESHOLD = 0.6;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.0;

interface AdaptiveClassifierServiceOptions {
  accuracyService?: ClassificationAccuracyService;
  feedbackService?: UserFeedbackService;
  weightHistoryService?: WeightHistoryService;
  eventBus?: EventBus;
}

interface QueueCandidateInput {
  eventId: string;
  source: string;
  confidence: number;
}

export class AdaptiveClassifierService {
  private readonly db: Database;
  private readonly accuracyService: ClassificationAccuracyService;
  private readonly feedbackService: UserFeedbackService;
  private readonly weightHistoryService: WeightHistoryService;
  private readonly eventBus?: EventBus;
  private lastAutoRecalculatedAt = 0;

  constructor(db: Database, options?: AdaptiveClassifierServiceOptions) {
    this.db = db;
    this.accuracyService =
      options?.accuracyService ?? new ClassificationAccuracyService(db);
    this.feedbackService =
      options?.feedbackService ?? new UserFeedbackService(db);
    this.weightHistoryService =
      options?.weightHistoryService ?? new WeightHistoryService(db);
    this.eventBus = options?.eventBus;
  }

  async getSourceWeights(): Promise<SourceWeights> {
    return this.weightHistoryService.getCurrentWeights();
  }

  async getSourceWeight(source: string): Promise<number> {
    const weights = await this.getSourceWeights();
    return weights.weights[source] ?? 1;
  }

  async recalculateWeights(
    reason = 'accuracy_recalculation',
  ): Promise<SourceWeights> {
    const stats = await this.accuracyService.getAccuracyStats({ groupBy: 'source' });
    const sources = Object.entries(stats.bySource);

    if (sources.length === 0) {
      return SourceWeightsSchema.parse({
        weights: {},
        updatedAt: new Date().toISOString(),
        sampleSize: 0,
      });
    }

    const current = await this.getSourceWeights();
    const averageAccuracy =
      sources.reduce((total, [, value]) => total + value.accuracy, 0) / sources.length;
    const updatedAt = new Date().toISOString();
    const sampleSizes = Object.fromEntries(
      sources.map(([source, value]) => [source, value.count]),
    );
    const totalSampleSize = sources.reduce((total, [, value]) => total + value.count, 0);
    const weights = Object.fromEntries(
      sources.map(([source, value]) => {
        if (value.count < MIN_SAMPLE_SIZE || averageAccuracy <= 0) {
          return [source, 1];
        }

        const baseWeight = current.weights[source] ?? 1;
        const scaledWeight = baseWeight * (value.accuracy / averageAccuracy);
        return [source, this.clampWeight(scaledWeight)];
      }),
    );

    await this.weightHistoryService.recordAdjustment(
      {
        weights,
        updatedAt,
        sampleSize: totalSampleSize,
      },
      reason,
      sampleSizes,
    );

    const nextWeights = await this.getSourceWeights();
    if (this.eventBus?.publishTopic) {
      await this.eventBus.publishTopic('weights:updated', nextWeights);
    }

    return nextWeights;
  }

  shouldReclassify(candidate: ReclassificationCandidate): boolean {
    return this.getReclassificationReason(candidate) !== null;
  }

  async enqueueEventIfNeeded(
    candidate: QueueCandidateInput,
  ): Promise<ReclassificationItem | null> {
    const parsed = ReclassificationCandidateSchema.parse({
      eventId: candidate.eventId,
      source: candidate.source,
      confidence: candidate.confidence,
      sourceAccuracy: await this.getSourceAccuracy(candidate.source),
      feedbackVerdict: (await this.feedbackService.getFeedback(candidate.eventId))
        ?.verdict ?? null,
    });
    const reason = this.getReclassificationReason(parsed);
    if (!reason) {
      return null;
    }

    const item = await this.upsertQueueItem({
      eventId: parsed.eventId,
      reason,
      confidence: parsed.confidence,
      sourceAccuracy: parsed.sourceAccuracy,
    });

    return item;
  }

  async getReclassificationQueue(limit = 20): Promise<ReclassificationItem[]> {
    await this.syncIncorrectFeedbackQueue();

    const rows = await this.db
      .select({
        eventId: reclassificationQueue.eventId,
        reason: reclassificationQueue.reason,
        priority: reclassificationQueue.priority,
        confidence: classificationPredictions.confidence,
        source: events.source,
      })
      .from(reclassificationQueue)
      .innerJoin(
        classificationPredictions,
        eq(classificationPredictions.eventId, reclassificationQueue.eventId),
      )
      .innerJoin(events, eq(events.id, reclassificationQueue.eventId))
      .where(eq(reclassificationQueue.status, 'pending'))
      .orderBy(desc(reclassificationQueue.priority), asc(reclassificationQueue.createdAt))
      .limit(limit);

    const stats = await this.accuracyService.getAccuracyStats({ groupBy: 'source' });

    return rows.map((row) =>
      ReclassificationItemSchema.parse({
        eventId: row.eventId,
        reason: row.reason as ReclassificationReason,
        confidence: Number(row.confidence),
        sourceAccuracy: stats.bySource[row.source]?.accuracy ?? null,
        priority: row.priority,
      }),
    );
  }

  async recalculateWeightsIfNeeded(
    totalEvaluated: number,
  ): Promise<SourceWeights | null> {
    if (
      totalEvaluated <= 0 ||
      totalEvaluated % 500 !== 0 ||
      totalEvaluated === this.lastAutoRecalculatedAt
    ) {
      return null;
    }

    this.lastAutoRecalculatedAt = totalEvaluated;
    return this.recalculateWeights(`auto_recalculate_${totalEvaluated}_outcomes`);
  }

  private getReclassificationReason(
    candidate: ReclassificationCandidate,
  ): ReclassificationReason | null {
    if (candidate.feedbackVerdict === 'incorrect') {
      return 'user_feedback_incorrect';
    }

    if (candidate.confidence < LOW_CONFIDENCE_THRESHOLD) {
      return 'low_confidence';
    }

    if (
      candidate.confidence >= LOW_CONFIDENCE_THRESHOLD &&
      candidate.confidence < MEDIUM_CONFIDENCE_THRESHOLD &&
      candidate.sourceAccuracy != null &&
      candidate.sourceAccuracy < LOW_SOURCE_ACCURACY_THRESHOLD
    ) {
      return 'low_source_accuracy';
    }

    return null;
  }

  private async syncIncorrectFeedbackQueue(): Promise<void> {
    const rows = await this.db
      .select({
        eventId: userFeedback.eventId,
        confidence: classificationPredictions.confidence,
        source: events.source,
        verdict: userFeedback.verdict,
      })
      .from(userFeedback)
      .innerJoin(
        classificationPredictions,
        eq(classificationPredictions.eventId, userFeedback.eventId),
      )
      .innerJoin(events, eq(events.id, userFeedback.eventId))
      .where(eq(userFeedback.verdict, 'incorrect'));

    for (const row of rows) {
      await this.upsertQueueItem({
        eventId: row.eventId,
        reason: 'user_feedback_incorrect',
        confidence: Number(row.confidence),
        sourceAccuracy: await this.getSourceAccuracy(row.source),
      });
    }
  }

  private async upsertQueueItem(input: {
    eventId: string;
    reason: ReclassificationReason;
    confidence: number;
    sourceAccuracy: number | null;
  }): Promise<ReclassificationItem> {
    const priority = this.getPriority(
      input.reason,
      input.confidence,
      input.sourceAccuracy,
    );

    await this.db
      .insert(reclassificationQueue)
      .values({
        eventId: input.eventId,
        reason: input.reason,
        priority,
        status: 'pending',
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: reclassificationQueue.eventId,
        set: {
          reason: input.reason,
          priority,
          status: 'pending',
          createdAt: new Date(),
        },
      });

    return ReclassificationItemSchema.parse({
      eventId: input.eventId,
      reason: input.reason,
      confidence: input.confidence,
      sourceAccuracy: input.sourceAccuracy,
      priority,
    });
  }

  private async getSourceAccuracy(source: string): Promise<number | null> {
    const stats = await this.accuracyService.getAccuracyStats({ groupBy: 'source' });
    return stats.bySource[source]?.accuracy ?? null;
  }

  private getPriority(
    reason: ReclassificationReason,
    confidence: number,
    sourceAccuracy: number | null,
  ): number {
    if (reason === 'user_feedback_incorrect') {
      return 300;
    }

    if (reason === 'low_confidence') {
      return 200 + Math.round((LOW_CONFIDENCE_THRESHOLD - confidence) * 100);
    }

    const accuracyPenalty =
      sourceAccuracy == null
        ? 0
        : Math.round((LOW_SOURCE_ACCURACY_THRESHOLD - sourceAccuracy) * 100);
    return 100 + Math.max(0, accuracyPenalty);
  }

  private clampWeight(weight: number): number {
    return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Number(weight.toFixed(4))));
  }
}
