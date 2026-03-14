import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const LLM_EVENT_TYPES = [
  'earnings_beat',
  'earnings_miss',
  'earnings_guidance',
  'sec_form_8k',
  'sec_form_4',
  'sec_form_10q',
  'sec_form_10k',
  'fda_approval',
  'fda_rejection',
  'fda_orphan_drug',
  'ftc_antitrust',
  'doj_settlement',
  'executive_order',
  'congress_bill',
  'federal_register',
  'economic_data',
  'fed_announcement',
  'unusual_options',
  'insider_large_trade',
  'short_interest',
  'social_volume_spike',
  'reddit_trending',
  'news_breaking',
] as const;

export const LLMEventTypeSchema = z.enum(LLM_EVENT_TYPES);
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
