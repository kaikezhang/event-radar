import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const AccuracyDirectionSchema = z.enum(['bullish', 'bearish', 'neutral']);
export type AccuracyDirection = z.infer<typeof AccuracyDirectionSchema>;

export const ClassificationMethodSchema = z.enum(['rule-engine', 'llm', 'hybrid']);
export type ClassificationMethod = z.infer<typeof ClassificationMethodSchema>;

export const AccuracyPeriodSchema = z.enum(['7d', '30d', '90d', 'all']);
export type AccuracyPeriod = z.infer<typeof AccuracyPeriodSchema>;

export const AccuracyGroupBySchema = z.enum(['source', 'eventType']);
export type AccuracyGroupBy = z.infer<typeof AccuracyGroupBySchema>;

export const ClassificationPredictionSchema = z.object({
  eventId: z.string().uuid(),
  predictedSeverity: SeveritySchema,
  predictedDirection: AccuracyDirectionSchema,
  confidence: z.number().min(0).max(1),
  classifiedBy: ClassificationMethodSchema,
  classifiedAt: z.string().datetime(),
});

export type ClassificationPrediction = z.infer<typeof ClassificationPredictionSchema>;

export const ClassificationOutcomeSchema = z.object({
  eventId: z.string().uuid(),
  actualDirection: AccuracyDirectionSchema,
  priceChangePercent1h: z.number(),
  priceChangePercent1d: z.number(),
  priceChangePercent1w: z.number(),
  evaluatedAt: z.string().datetime(),
});

export type ClassificationOutcome = z.infer<typeof ClassificationOutcomeSchema>;

export const AccuracyResultSchema = z.object({
  eventId: z.string().uuid(),
  severityCorrect: z.boolean(),
  directionCorrect: z.boolean(),
  confidenceCalibration: z.number().min(0).max(1),
});

export type AccuracyResult = z.infer<typeof AccuracyResultSchema>;

export const AccuracyGroupStatsEntrySchema = z.object({
  accuracy: z.number().min(0).max(1),
  count: z.number().int().min(0),
});

export type AccuracyGroupStatsEntry = z.infer<typeof AccuracyGroupStatsEntrySchema>;

export const AccuracyStatsSchema = z.object({
  totalEvaluated: z.number().int().min(0),
  severityAccuracy: z.number().min(0).max(1),
  directionAccuracy: z.number().min(0).max(1),
  truePositives: z.number().int().min(0),
  trueNegatives: z.number().int().min(0),
  falsePositives: z.number().int().min(0),
  falseNegatives: z.number().int().min(0),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1Score: z.number().min(0).max(1),
  bySource: z.record(z.string(), AccuracyGroupStatsEntrySchema),
  byEventType: z.record(z.string(), AccuracyGroupStatsEntrySchema),
  period: AccuracyPeriodSchema,
});

export type AccuracyStats = z.infer<typeof AccuracyStatsSchema>;

export const AccuracyStatsOptionsSchema = z.object({
  period: AccuracyPeriodSchema.optional(),
  groupBy: AccuracyGroupBySchema.optional(),
});

export type AccuracyStatsOptions = z.infer<typeof AccuracyStatsOptionsSchema>;

export const AccuracyEventDetailsSchema = z.object({
  prediction: ClassificationPredictionSchema.nullable(),
  outcome: ClassificationOutcomeSchema.nullable(),
  evaluation: AccuracyResultSchema.nullable(),
});

export type AccuracyEventDetails = z.infer<typeof AccuracyEventDetailsSchema>;
