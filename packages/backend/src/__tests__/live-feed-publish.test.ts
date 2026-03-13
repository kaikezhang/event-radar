import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import { createTestDb, cleanTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { LiveFeedEvent } from '../plugins/websocket.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

function makeRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'NVIDIA files export-risk disclosure',
    body: 'Export restrictions could affect China sales.',
    timestamp: new Date('2026-03-13T10:00:00.000Z'),
    metadata: {
      item_types: ['2.05'],
      ticker: 'NVDA',
      url: 'https://example.com/filings/nvda-8k',
    },
    ...overrides,
  };
}

describe('live feed event publishing', () => {
  let db: Database;
  let client: PGlite;
  let dbCtx: AppContext;
  let noDbCtx: AppContext;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    dbCtx = buildApp({ logger: false, db });
    noDbCtx = buildApp({ logger: false });
  }, 20000);

  afterEach(async () => {
    await cleanTestDb(db);
  });

  afterAll(async () => {
    await safeCloseServer(dbCtx.server);
    await safeCloseServer(noDbCtx.server);
    await safeClose(client);
  }, 20000);

  it('publishes live feed events with the stored event id when db storage is enabled', async () => {
    const payloads: LiveFeedEvent[] = [];
    const rawEvent = makeRawEvent({ id: 'source-event-1' });
    const unsubscribe = dbCtx.eventBus.subscribeTopic?.('event:classified', (payload) => {
      payloads.push(payload as LiveFeedEvent);
    });

    await dbCtx.eventBus.publish(rawEvent);

    await vi.waitFor(() => {
      expect(payloads).toHaveLength(1);
    });

    const rows = await db.execute(sql`
      SELECT id, source_event_id
      FROM events
      WHERE source_event_id = ${rawEvent.id}
    `);
    const storedEventId = String(rows.rows[0]?.id ?? '');

    expect(storedEventId).not.toBe('');
    expect(payloads[0]).toMatchObject({
      id: storedEventId,
      source: rawEvent.source,
      title: rawEvent.title,
      summary: rawEvent.body,
      severity: 'HIGH',
      tickers: ['NVDA'],
      url: 'https://example.com/filings/nvda-8k',
      time: rawEvent.timestamp.toISOString(),
    });

    unsubscribe?.();
  }, 10000);

  it('falls back to the raw event id when db storage is disabled', async () => {
    const payloads: LiveFeedEvent[] = [];
    const rawEvent = makeRawEvent({ id: 'source-event-2' });
    const unsubscribe = noDbCtx.eventBus.subscribeTopic?.('event:classified', (payload) => {
      payloads.push(payload as LiveFeedEvent);
    });

    await noDbCtx.eventBus.publish(rawEvent);

    await vi.waitFor(() => {
      expect(payloads).toHaveLength(1);
    });

    expect(payloads[0]).toMatchObject({
      id: rawEvent.id,
      source: rawEvent.source,
      title: rawEvent.title,
      summary: rawEvent.body,
      severity: 'HIGH',
      tickers: ['NVDA'],
      url: 'https://example.com/filings/nvda-8k',
      time: rawEvent.timestamp.toISOString(),
    });

    unsubscribe?.();
  }, 10000);
});
