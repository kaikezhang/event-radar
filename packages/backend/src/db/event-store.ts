import { events } from './schema.js';
import type { RawEvent, Severity } from '@event-radar/shared';
import type { Database } from './connection.js';

export interface StoreEventInput {
  event: RawEvent;
  severity?: Severity;
}

export async function storeEvent(
  db: Database,
  input: StoreEventInput,
): Promise<string> {
  const { event, severity } = input;

  const [row] = await db
    .insert(events)
    .values({
      source: event.source,
      sourceEventId: event.id,
      title: event.title,
      summary: event.body,
      rawPayload: event as unknown as Record<string, unknown>,
      metadata: event.metadata ?? null,
      severity: severity ?? null,
      receivedAt: event.timestamp,
    })
    .returning({ id: events.id });

  return row.id;
}
