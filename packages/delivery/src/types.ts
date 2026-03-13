import type { LLMEnrichment, RawEvent, Severity, RegimeSnapshot } from '@event-radar/shared';

/** Historical context from the similarity engine. */
export interface HistoricalContext {
  readonly matchCount: number;
  readonly confidence: 'insufficient' | 'low' | 'medium' | 'high';
  readonly avgAlphaT5: number;
  readonly avgAlphaT20: number;
  readonly winRateT20: number;
  readonly medianAlphaT20: number;
  readonly bestCase?: { ticker: string; alphaT20: number; headline: string };
  readonly worstCase?: { ticker: string; alphaT20: number; headline: string };
  readonly topMatches: ReadonlyArray<{
    ticker: string;
    headline: string;
    eventDate: string;
    alphaT20: number;
    score: number;
  }>;
  readonly patternSummary: string;
}

/** A RawEvent enriched with severity classification for delivery routing. */
export interface AlertEvent {
  readonly event: RawEvent;
  readonly severity: Severity;
  readonly ticker?: string;
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
