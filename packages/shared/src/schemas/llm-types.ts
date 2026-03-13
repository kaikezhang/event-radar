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

export const LLMEnrichmentActionSchema = z.enum([
  '🔴 立即关注',
  '🟡 持续观察',
  '🟢 仅供参考',
]);
export type LLMEnrichmentAction = z.infer<typeof LLMEnrichmentActionSchema>;

export const LLMEnrichmentTickerSchema = z.object({
  symbol: z.string().min(1),
  direction: LLMDirectionSchema,
});
export type LLMEnrichmentTicker = z.infer<typeof LLMEnrichmentTickerSchema>;

const DEFAULT_ENRICHMENT_ACTION: LLMEnrichmentAction = '🟢 仅供参考';

export const LLMEnrichmentSchema = z.object({
  summary: z.string().min(1),
  impact: z.string().min(1),
  action: z.preprocess(
    (value) => (
      LLMEnrichmentActionSchema.safeParse(value).success
        ? value
        : DEFAULT_ENRICHMENT_ACTION
    ),
    LLMEnrichmentActionSchema,
  ),
  tickers: z.preprocess(
    (value) => Array.isArray(value) ? value : [],
    z.array(LLMEnrichmentTickerSchema),
  ),
  regimeContext: z.preprocess(
    (value) => typeof value === 'string' && value.trim().length > 0 ? value : undefined,
    z.string().optional(),
  ),
});
export type LLMEnrichment = z.infer<typeof LLMEnrichmentSchema>;
