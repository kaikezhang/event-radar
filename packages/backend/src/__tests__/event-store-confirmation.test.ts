import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { storeEvent } from '../db/event-store.js';
import { events } from '../db/schema.js';
import {
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

import type { RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';

function makeRawEvent(overrides?: Partial<RawEvent>): RawEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source: 'sec-edgar',
    type: '8-K',
    title: 'NVDA filing update',
    body: 'NVIDIA files a material update.',
    url: 'https://example.com/nvda',
    timestamp: new Date('2026-03-15T10:00:00.000Z'),
    metadata: {
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    },
    ...overrides,
  };
}

describe('storeEvent multi-source confirmation', () => {
  let db: Database;
  let client: PGlite;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    client = testDb.client;
  });

  afterEach(async () => {
    await safeClose(client);
  });

  it('confirms the oldest matching event within the 30-minute window', async () => {
    const olderId = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });
    await db.execute(sql`
      UPDATE events
      SET created_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${olderId}
    `);

    const newerId = await storeEvent(db, {
      event: makeRawEvent({
        id: '660e8400-e29b-41d4-a716-446655440000',
        source: 'newswire',
        title: 'Newswire echoes NVDA filing',
        url: 'https://example.com/nvda-newswire',
      }),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    const [olderEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, olderId))
      .limit(1);
    const [newerEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, newerId))
      .limit(1);

    expect(olderEvent?.ticker).toBe('NVDA');
    expect(olderEvent?.eventType).toBe('sec_form_8k');
    expect(olderEvent?.confirmationCount).toBe(2);
    expect(olderEvent?.confirmedSources).toEqual(['sec-edgar', 'newswire']);
    expect(olderEvent?.mergedFrom).toEqual([newerId]);
    expect(newerEvent?.ticker).toBe('NVDA');
    expect(newerEvent?.eventType).toBe('sec_form_8k');
  });

  it('does not confirm matches outside the 30-minute window', async () => {
    const olderId = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });
    await db.execute(sql`
      UPDATE events
      SET created_at = NOW() - INTERVAL '31 minutes'
      WHERE id = ${olderId}
    `);

    await storeEvent(db, {
      event: makeRawEvent({
        id: '770e8400-e29b-41d4-a716-446655440000',
        source: 'newswire',
      }),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    const [olderEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, olderId))
      .limit(1);

    expect(olderEvent?.confirmationCount).toBe(1);
    expect(olderEvent?.confirmedSources).toEqual(['sec-edgar']);
    expect(olderEvent?.mergedFrom).toBeNull();
  });

  it('does not confirm events with a different ticker', async () => {
    const olderId = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    await storeEvent(db, {
      event: makeRawEvent({
        id: '880e8400-e29b-41d4-a716-446655440000',
        source: 'newswire',
        metadata: { ticker: 'AAPL', eventType: 'sec_form_8k' },
      }),
      severity: 'HIGH',
      ticker: 'AAPL',
      eventType: 'sec_form_8k',
    });

    const [olderEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, olderId))
      .limit(1);

    expect(olderEvent?.confirmationCount).toBe(1);
    expect(olderEvent?.mergedFrom).toBeNull();
  });

  it('does not confirm events with a different event type', async () => {
    const olderId = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    await storeEvent(db, {
      event: makeRawEvent({
        id: '990e8400-e29b-41d4-a716-446655440000',
        source: 'newswire',
        metadata: { ticker: 'NVDA', eventType: 'news_breaking' },
      }),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'news_breaking',
    });

    const [olderEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, olderId))
      .limit(1);

    expect(olderEvent?.confirmationCount).toBe(1);
    expect(olderEvent?.confirmedSources).toEqual(['sec-edgar']);
  });

  it('leaves confirmation state unchanged when ticker or event type is missing', async () => {
    const eventId = await storeEvent(db, {
      event: makeRawEvent({
        id: 'aa0e8400-e29b-41d4-a716-446655440000',
        metadata: {},
      }),
      severity: 'HIGH',
    });

    const [storedEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    expect(storedEvent?.ticker).toBeNull();
    expect(storedEvent?.eventType).toBeNull();
    expect(storedEvent?.confirmationCount).toBe(1);
    expect(storedEvent?.confirmedSources).toEqual(['sec-edgar']);
  });

  it('stores the initial source URL for provenance tracking', async () => {
    const eventId = await storeEvent(db, {
      event: makeRawEvent({
        id: 'bb0e8400-e29b-41d4-a716-446655440000',
        url: 'https://example.com/source/primary',
      }),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    const [storedEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    expect(storedEvent?.sourceUrls).toEqual(['https://example.com/source/primary']);
  });

  it('includes the schema backfill statements in the migration and the SQL backfills legacy rows', async () => {
    const migrationPath = new URL('../db/migrations/004-add-event-ticker-type-confirmation.sql', import.meta.url);
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('ALTER TABLE events ADD COLUMN ticker');
    expect(migration).toContain("ticker = metadata->>'ticker'");
    expect(migration).toContain("event_type = metadata->>'eventType'");

    const insertResult = await db.execute(sql`
      INSERT INTO events (
        id,
        source,
        source_event_id,
        title,
        summary,
        metadata,
        severity,
        confirmed_sources,
        confirmation_count
      )
      VALUES (
        gen_random_uuid(),
        'sec-edgar',
        'legacy-event',
        'Legacy event',
        'Legacy summary',
        '{"ticker":"NVDA","eventType":"sec_form_8k"}'::jsonb,
        'HIGH',
        '["sec-edgar"]'::jsonb,
        1
      )
      RETURNING id
    `);
    const legacyId = (insertResult as unknown as { rows: Array<{ id: string }> }).rows[0]!.id;

    await db.execute(sql`
      UPDATE events
      SET
        ticker = metadata->>'ticker',
        event_type = metadata->>'eventType'
      WHERE id = ${legacyId}
    `);

    const [legacyEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, legacyId))
      .limit(1);

    expect(legacyEvent?.ticker).toBe('NVDA');
    expect(legacyEvent?.eventType).toBe('sec_form_8k');
  });
});
