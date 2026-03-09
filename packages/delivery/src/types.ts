import type { RawEvent, Severity } from '@event-radar/shared';

/** A RawEvent enriched with severity classification for delivery routing. */
export interface AlertEvent {
  readonly event: RawEvent;
  readonly severity: Severity;
  readonly ticker?: string;
}

/** Common interface for all delivery channels. */
export interface DeliveryService {
  readonly name: string;
  send(alert: AlertEvent): Promise<void>;
}
