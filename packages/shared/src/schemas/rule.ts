import { z } from 'zod';
import { SeveritySchema } from './severity.js';

// ── Confidence Level ───────────────────────────────────────────────────

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low', 'unconfirmed']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export function deriveConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'unconfirmed';
}

// ── Condition Types ──────────────────────────────────────────────────

export const SourceEqualsConditionSchema = z.object({
  type: z.literal('sourceEquals'),
  value: z.string().min(1),
});

export const ItemTypeContainsConditionSchema = z.object({
  type: z.literal('itemTypeContains'),
  value: z.string().min(1),
});

export const TitleContainsConditionSchema = z.object({
  type: z.literal('titleContains'),
  value: z.string().min(1),
});

export const TickerInListConditionSchema = z.object({
  type: z.literal('tickerInList'),
  values: z.array(z.string().min(1)).min(1),
});

export const ConditionSchema = z.discriminatedUnion('type', [
  SourceEqualsConditionSchema,
  ItemTypeContainsConditionSchema,
  TitleContainsConditionSchema,
  TickerInListConditionSchema,
]);

export type Condition = z.infer<typeof ConditionSchema>;

// ── Action Types ─────────────────────────────────────────────────────

export const SetSeverityActionSchema = z.object({
  type: z.literal('setSeverity'),
  value: SeveritySchema,
});

export const AddTagsActionSchema = z.object({
  type: z.literal('addTags'),
  values: z.array(z.string().min(1)).min(1),
});

export const SetPriorityActionSchema = z.object({
  type: z.literal('setPriority'),
  value: z.number().int().min(0).max(100),
});

export const SetConfidenceActionSchema = z.object({
  type: z.literal('setConfidence'),
  value: z.number().min(0).max(1),
});

export const ActionSchema = z.discriminatedUnion('type', [
  SetSeverityActionSchema,
  AddTagsActionSchema,
  SetPriorityActionSchema,
  SetConfidenceActionSchema,
]);

export type Action = z.infer<typeof ActionSchema>;

// ── Rule ─────────────────────────────────────────────────────────────

export const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conditions: z.array(ConditionSchema).min(1),
  actions: z.array(ActionSchema).min(1),
  /** Lower number = higher priority. Rules with lower priority values are applied first. */
  priority: z.number().int().min(0).default(50),
  enabled: z.boolean().default(true),
});

export type Rule = z.infer<typeof RuleSchema>;

// ── Classification Result ────────────────────────────────────────────

export const ClassificationResultSchema = z.object({
  severity: SeveritySchema,
  tags: z.array(z.string()),
  priority: z.number().int().min(0).max(100),
  matchedRules: z.array(z.string()),
  confidence: z.number().min(0).max(1).default(0.8),
  confidenceLevel: ConfidenceLevelSchema.optional(),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
