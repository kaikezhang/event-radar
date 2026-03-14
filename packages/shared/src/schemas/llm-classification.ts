import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { LLMEventTypeSchema } from './llm-types.js';

export const DirectionSchema = z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'MIXED']);
export type Direction = z.infer<typeof DirectionSchema>;

export const ClassificationSourceSchema = z.enum(['rule', 'llm', 'both']);
export type ClassificationSource = z.infer<typeof ClassificationSourceSchema>;

export const LlmClassificationResultSchema = z.object({
  severity: SeveritySchema,
  direction: DirectionSchema,
  eventType: LLMEventTypeSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
  tags: z.array(z.string()),
  priority: z.number().int().min(0).max(100),
  matchedRules: z.array(z.string()),
});

export type LlmClassificationResult = z.infer<typeof LlmClassificationResultSchema>;
