import { z } from 'zod';
import { FeedbackVerdictSchema } from './feedback-types.js';

export const SourceWeightsSchema = z.object({
  weights: z.record(z.string(), z.number().min(0.1).max(2.0)),
  updatedAt: z.string().datetime(),
  sampleSize: z.number().int().min(0),
});

export type SourceWeights = z.infer<typeof SourceWeightsSchema>;

export const ReclassificationReasonSchema = z.enum([
  'low_confidence',
  'low_source_accuracy',
  'user_feedback_incorrect',
]);

export type ReclassificationReason = z.infer<typeof ReclassificationReasonSchema>;

export const ReclassificationItemSchema = z.object({
  eventId: z.string().uuid(),
  reason: ReclassificationReasonSchema,
  confidence: z.number().min(0).max(1),
  sourceAccuracy: z.number().min(0).max(1).nullable(),
  priority: z.number(),
});

export type ReclassificationItem = z.infer<typeof ReclassificationItemSchema>;

export const WeightAdjustmentSchema = z.object({
  id: z.string().uuid(),
  previousWeights: z.record(z.string(), z.number()),
  newWeights: z.record(z.string(), z.number()),
  reason: z.string(),
  createdAt: z.string().datetime(),
});

export type WeightAdjustment = z.infer<typeof WeightAdjustmentSchema>;

export const ReclassificationCandidateSchema = z.object({
  eventId: z.string().uuid(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
  sourceAccuracy: z.number().min(0).max(1).nullable(),
  feedbackVerdict: FeedbackVerdictSchema.nullable(),
});

export type ReclassificationCandidate = z.infer<typeof ReclassificationCandidateSchema>;
