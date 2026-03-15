import type { ConfidenceLevel, LLMEnrichment, RawEvent, RegimeSnapshot, Severity } from '@event-radar/shared';

/** Historical context from the similarity engine. */
export interface HistoricalContext {
  readonly matchCount: number;
  readonly confidence: 'insufficient' | 'low' | 'medium' | 'high';
  readonly avgAlphaT5: number;
  readonly avgAlphaT20: number;
  readonly avgChange1d?: number;
  readonly avgChange1w?: number;
  readonly winRateT20: number;
  readonly medianAlphaT20: number;
  readonly bestCase?: { ticker: string; alphaT20: number; headline: string };
  readonly worstCase?: { ticker: string; alphaT20: number; headline: string };
  readonly topMatches: ReadonlyArray<{
    ticker: string;
    headline: string;
    source?: string;
    eventDate: string;
    alphaT20: number;
    score: number;
  }>;
  readonly similarEvents?: ReadonlyArray<{
    title: string;
    ticker: string;
    source?: string;
    eventTime: string;
    eventPrice?: number | null;
    change1h?: number | null;
    change1d?: number | null;
    change1w?: number | null;
    change1m?: number | null;
    score: number;
  }>;
  readonly marketContext?: {
    price: number;
    change1d: number;
    change5d: number;
    change20d: number;
    volumeRatio: number;
    rsi14: number;
    high52w: number;
    low52w: number;
    support: number;
    resistance: number;
  };
  readonly patternSummary: string;
}

/** A RawEvent enriched with severity classification for delivery routing. */
export interface AlertEvent {
  readonly event: RawEvent;
  readonly severity: Severity;
  readonly ticker?: string;
  /** Classification confidence score from the alert pipeline when available. */
  readonly classificationConfidence?: number;
  /** Confidence bucket derived from the classification score. */
  readonly confidenceBucket?: ConfidenceLevel;
  /** AI-generated enrichment, present when LLM processing succeeded. */
  readonly enrichment?: LLMEnrichment;
  /** Historical pattern context from similarity engine. */
  readonly historicalContext?: HistoricalContext;
  /** Current market regime snapshot. */
  readonly regimeSnapshot?: RegimeSnapshot;
}

/** Common interface for all delivery channels. */
export interface DeliveryService {
  readonly name: string;
  send(alert: AlertEvent): Promise<void>;
}
