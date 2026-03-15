import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
    const olderResult = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });
    const olderId = olderResult.id;
    await db.execute(sql`
      UPDATE events
      SET created_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${olderId}
    `);

    const newerEvent = makeRawEvent({
      id: '660e8400-e29b-41d4-a716-446655440000',
      source: 'newswire',
      title: 'Newswire echoes NVDA filing',
      url: 'https://example.com/nvda-newswire',
    });
    const newerResult = await storeEvent(db, {
      event: newerEvent,
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });
    const newerId = newerResult.id;

    const [olderEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, olderId))
      .limit(1);
    const [storedNewerEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, newerId))
      .limit(1);

    expect(olderEvent?.ticker).toBe('NVDA');
    expect(olderEvent?.eventType).toBe('sec_form_8k');
    expect(olderEvent?.confirmationCount).toBe(2);
    expect(olderEvent?.confirmedSources).toEqual(['sec-edgar', 'newswire']);
    expect(olderEvent?.mergedFrom).toEqual([newerId]);
    expect(storedNewerEvent?.ticker).toBe('NVDA');
    expect(storedNewerEvent?.eventType).toBe('sec_form_8k');
  });

  it('returns confirmation details without writing aggregate confirmation metadata onto the newer event', async () => {
    const olderId = (await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    })).id;
    await db.execute(sql`
      UPDATE events
      SET created_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${olderId}
    `);

    const newerEvent = makeRawEvent({
      id: '6f0e8400-e29b-41d4-a716-446655440000',
      source: 'newswire',
      title: 'Newswire confirms NVDA filing',
      url: 'https://example.com/nvda-confirmation',
    });
    const storeResult = await storeEvent(db, {
      event: newerEvent,
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    expect(storeResult).toMatchObject({
      id: expect.any(String),
      confirmationCount: 2,
      confirmedSources: ['sec-edgar', 'newswire'],
    });
    expect(newerEvent.metadata).toEqual({
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    });

    const [storedNewerEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, storeResult.id))
      .limit(1);

    expect(storedNewerEvent?.confirmationCount).toBe(1);
    expect(storedNewerEvent?.confirmedSources).toEqual(['newswire']);
    expect(storedNewerEvent?.metadata).toMatchObject({
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
      confirmedEventId: olderId,
    });
    expect((storedNewerEvent?.metadata as Record<string, unknown>)['confirmationCount']).toBeUndefined();
    expect((storedNewerEvent?.metadata as Record<string, unknown>)['confirmedSources']).toBeUndefined();
  });

  it('does not confirm matches outside the 30-minute window', async () => {
    const olderId = (await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    })).id;
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
    const olderId = (await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    })).id;

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
    const olderId = (await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    })).id;

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
    const eventId = (await storeEvent(db, {
      event: makeRawEvent({
        id: 'aa0e8400-e29b-41d4-a716-446655440000',
        metadata: {},
      }),
      severity: 'HIGH',
    })).id;

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
    const eventId = (await storeEvent(db, {
      event: makeRawEvent({
        id: 'bb0e8400-e29b-41d4-a716-446655440000',
        url: 'https://example.com/source/primary',
      }),
      severity: 'HIGH',
      ticker: 'NVDA',
      eventType: 'sec_form_8k',
    })).id;

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

  it('keeps the ticker/type/time confirmation index aligned on DESC created_at', async () => {
    const migrationPath = join(process.cwd(), 'src/db/migrations/004-add-event-ticker-type-confirmation.sql');
    const testDbPath = join(process.cwd(), 'src/__tests__/helpers/test-db.ts');
    const schemaPath = join(process.cwd(), 'src/db/schema.ts');
    const [migration, testDbSource] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(testDbPath, 'utf8'),
    ]);
    const normalizedMigration = migration.replace(/\s+/g, ' ');
    const normalizedTestDb = testDbSource.replace(/\s+/g, ' ');
    const normalizedSchema = (await readFile(schemaPath, 'utf8')).replace(/\s+/g, ' ');

    expect(normalizedMigration).toContain('CREATE INDEX idx_events_ticker_type_time ON events(ticker, event_type, created_at DESC);');
    expect(normalizedTestDb).toContain('ON events (ticker, event_type, created_at DESC)');
    expect(normalizedSchema).toContain("index('idx_events_ticker_type_time').on(table.ticker, table.eventType, table.createdAt.desc())");
    expect(normalizedSchema).not.toContain("index('idx_events_ticker_type_time').on(table.ticker, table.eventType, table.createdAt)");
  });
});
