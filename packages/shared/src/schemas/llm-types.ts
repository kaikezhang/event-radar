import { z } from 'zod';
import { SeveritySchema } from './severity.js';

export const LLM_EVENT_TYPES = [
  // Earnings & guidance
  'earnings_beat',
  'earnings_miss',
  'earnings_guidance',
  'earnings',
  'earnings_preannouncement',
  'guidance_update',
  // SEC filings
  'sec_form_8k',
  'sec_form_4',
  'sec_form_10q',
  'sec_form_10k',
  'sec_investigation',
  'regulation_fd',
  // FDA / healthcare
  'fda_approval',
  'fda_rejection',
  'fda_orphan_drug',
  'drug_trial',
  // Government / regulatory
  'ftc_antitrust',
  'doj_settlement',
  'executive_order',
  'congress_bill',
  'federal_register',
  'antitrust_action',
  'regulatory_enforcement',
  'sanctions',
  'export_control',
  'tax_policy',
  'trade_policy',
  // Macro / economic
  'economic_data',
  'fed_announcement',
  'macro_policy',
  // Trading activity
  'unusual_options',
  'insider_large_trade',
  'short_interest',
  'options_flow',
  'insider_purchase',
  'insider_sale',
  'trading_halt',
  // Social / sentiment
  'social_volume_spike',
  'reddit_trending',
  'rumor',
  'opinion',
  // Corporate actions
  'acquisition_disposition',
  'bankruptcy',
  'buyback',
  'conference_appearance',
  'contract_material',
  'credit_downgrade',
  'cybersecurity_incident',
  'delisting',
  'dividend_change',
  'financing',
  'labor_disruption',
  'leadership_change',
  'legal_ruling',
  'licensing',
  'plant_shutdown',
  'rating_upgrade',
  'restructuring',
  'service_outage',
  'share_offering',
  'shareholder_vote',
  'stock_split',
  'strategic_review',
  'supply_chain',
  // Catch-all
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

/**
 * Canonical signal labels (post-WP1 product language).
 * Legacy labels (🔴 ACT NOW, 🟡 WATCH, 🟢 FYI) are normalized via
 * {@link normalizeLegacyActionLabel} at parse time.
 */
export const LLMEnrichmentActionSchema = z.enum([
  '🔴 High-Quality Setup',
  '🟡 Monitor',
  '🟢 Background',
]);

const LEGACY_ACTION_MAP: Record<string, z.infer<typeof LLMEnrichmentActionSchema>> = {
  '🔴 ACT NOW': '🔴 High-Quality Setup',
  '🟡 WATCH': '🟡 Monitor',
  '🟢 FYI': '🟢 Background',
};

export function normalizeLegacyActionLabel(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return LEGACY_ACTION_MAP[value] ?? value;
}
export type LLMEnrichmentAction = z.infer<typeof LLMEnrichmentActionSchema>;

export const LLMEnrichmentTickerSchema = z.object({
  symbol: z.string().min(1),
  direction: LLMDirectionSchema,
});
export type LLMEnrichmentTicker = z.infer<typeof LLMEnrichmentTickerSchema>;

const DEFAULT_ENRICHMENT_ACTION: LLMEnrichmentAction = '🟢 Background';
const OptionalEnrichmentFieldSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined,
  z.string().min(1).optional(),
);

export const LLMEnrichmentSchema = z.object({
  summary: z.string().min(1),
  impact: z.string().min(1),
  whyNow: OptionalEnrichmentFieldSchema,
  currentSetup: OptionalEnrichmentFieldSchema,
  historicalContext: OptionalEnrichmentFieldSchema,
  risks: OptionalEnrichmentFieldSchema,
  action: z.preprocess(
    (value) => {
      const normalized = normalizeLegacyActionLabel(value);
      return LLMEnrichmentActionSchema.safeParse(normalized).success
        ? normalized
        : DEFAULT_ENRICHMENT_ACTION;
    },
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
