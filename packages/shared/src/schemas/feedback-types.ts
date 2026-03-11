import { z } from 'zod';

// Direction metrics for a single time horizon
export const DirectionMetricsSchema = z.object({
  total: z.number().int().min(0),
  accuracy: z.number().min(0).max(1),
  tp: z.number().int().min(0),
  tn: z.number().int().min(0),
  fp: z.number().int().min(0),
  fn: z.number().int().min(0),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
});

export type DirectionMetrics = z.infer<typeof DirectionMetricsSchema>;

// Direction breakdown across time horizons
export const DirectionBreakdownSchema = z.object({
  period: z.string(),
  horizons: z.object({
    '1h': DirectionMetricsSchema,
    '1d': DirectionMetricsSchema,
    '1w': DirectionMetricsSchema,
  }),
});

export type DirectionBreakdown = z.infer<typeof DirectionBreakdownSchema>;

// Confidence calibration bucket
export const CalibrationDataSchema = z.object({
  bucket: z.string(),
  avgConfidence: z.number().min(0).max(1),
  actualAccuracy: z.number().min(0).max(1),
  count: z.number().int().min(0),
});

export type CalibrationData = z.infer<typeof CalibrationDataSchema>;

// Misprediction entry
export const MispredictionSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string(),
  predictedDirection: z.string(),
  actualDirection: z.string(),
  confidence: z.number().min(0).max(1),
  priceChange1d: z.number(),
});

export type Misprediction = z.infer<typeof MispredictionSchema>;

// User feedback verdict
export const FeedbackVerdictSchema = z.enum([
  'correct',
  'incorrect',
  'partially_correct',
]);

export type FeedbackVerdict = z.infer<typeof FeedbackVerdictSchema>;

// User feedback
export const UserFeedbackSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  verdict: FeedbackVerdictSchema,
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type UserFeedback = z.infer<typeof UserFeedbackSchema>;

// Feedback submission input
export const SubmitFeedbackInputSchema = z.object({
  verdict: FeedbackVerdictSchema,
  note: z.string().optional(),
});

export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInputSchema>;

// Feedback stats
export const FeedbackStatsSchema = z.object({
  total: z.number().int().min(0),
  correct: z.number().int().min(0),
  incorrect: z.number().int().min(0),
  partiallyCorrect: z.number().int().min(0),
  agreementRate: z.number().min(0).max(1),
});

export type FeedbackStats = z.infer<typeof FeedbackStatsSchema>;
