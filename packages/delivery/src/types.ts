import type { RawEvent, Severity } from '@event-radar/shared';

/** LLM-generated enrichment for an event (Layer 2 of Smart Alert Filter). */
export interface LLMEnrichment {
  readonly summary: string;
  readonly impact: string;
  readonly action: '🔴 立即关注' | '🟡 持续观察' | '🟢 仅供参考';
  readonly tickers: ReadonlyArray<{ symbol: string; direction: 'bullish' | 'bearish' | 'neutral' }>;
}

/** A RawEvent enriched with severity classification for delivery routing. */
export interface AlertEvent {
  readonly event: RawEvent;
  readonly severity: Severity;
  readonly ticker?: string;
  /** AI-generated enrichment, present when LLM processing succeeded. */
  readonly enrichment?: LLMEnrichment;
}

/** Common interface for all delivery channels. */
export interface DeliveryService {
  readonly name: string;
  send(alert: AlertEvent): Promise<void>;
}
