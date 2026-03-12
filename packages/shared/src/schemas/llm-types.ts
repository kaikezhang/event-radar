import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const LLMEventTypeSchema = z.enum([
  'filing',
  'earnings',
  'insider',
  'macro',
  'political',
  'analyst',
  'social',
]);
export type LLMEventType = z.infer<typeof LLMEventTypeSchema>;

export const LLMSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const LLMDirectionSchema = z.enum(['bullish', 'bearish', 'neutral']);
export type LLMDirection = z.infer<typeof LLMDirectionSchema>;

export const LLMClassificationSchema = z.object({
  eventType: LLMEventTypeSchema,
  severity: SeveritySchema,
  direction: LLMDirectionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type LLMClassification = z.infer<typeof LLMClassificationSchema>;

export const LLMClassificationMethodSchema = z.enum(['rule', 'llm', 'hybrid']);
export type LLMClassificationMethod = z.infer<typeof LLMClassificationMethodSchema>;
