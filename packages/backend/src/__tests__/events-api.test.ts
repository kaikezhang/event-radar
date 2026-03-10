import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { createTestDb, safeClose } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'test-api-key-12345';

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test 8-K Filing',
    body: 'Test body content',
    timestamp: new Date(),
    metadata: { item_types: ['2.02'], ticker: 'AAPL' },
    ...overrides,
  };
}

describe('Event Store', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  it('should store an event and return the DB id', async () => {
    const event = makeEvent();
    const id = await storeEvent(db, { event, severity: 'MEDIUM' });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should store event fields correctly', async () => {
    const event = makeEvent({
      source: 'test-source',
      title: 'Specific Title',
      body: 'Specific Body',
    });

    const id = await storeEvent(db, { event, severity: 'HIGH' });

    const { rows } = await client.query(
      'SELECT * FROM events WHERE id = $1',
      [id],
    );
    const row = rows[0] as Record<string, unknown>;

    expect(row.source).toBe('test-source');
    expect(row.title).toBe('Specific Title');
    expect(row.summary).toBe('Specific Body');
    expect(row.severity).toBe('HIGH');
    expect(row.source_event_id).toBe(event.id);
  });

  it('should store event without severity', async () => {
    const event = makeEvent();
    const id = await storeEvent(db, { event });

    const { rows } = await client.query(
      'SELECT severity FROM events WHERE id = $1',
      [id],
    );
    expect((rows[0] as Record<string, unknown>).severity).toBeNull();
  });
});

describe('GET /api/events', () => {
  let ctx: AppContext;
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());

    // Seed test data
    const sources = ['sec-edgar', 'sec-edgar', 'fed', 'fed', 'bls'];
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM'];

    for (let i = 0; i < sources.length; i++) {
      await storeEvent(db, {
        event: makeEvent({
          source: sources[i],
          title: `Event ${i + 1}`,
        }),
        severity: severities[i] as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      });
    }

    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
    await safeClose(client);
  });

  it('should return 401 without API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should return paginated events with valid API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(5);
    expect(body.total).toBe(5);
  });

  it('should filter by source', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?source=sec-edgar',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data.every((e: { source: string }) => e.source === 'sec-edgar')).toBe(true);
  });

  it('should filter by severity', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?severity=MEDIUM',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('should support limit and offset', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?limit=2&offset=0',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('should combine source and severity filters', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?source=sec-edgar&severity=CRITICAL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('should return empty array for no matches', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?source=nonexistent',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('should return 400 for invalid ticker format', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?ticker=INVALID123',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for invalid severity enum', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?severity=INVALID',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/events/:id', () => {
  let ctx: AppContext;
  let db: Database;
  let client: PGlite;
  let storedEventId: string;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());

    storedEventId = await storeEvent(db, {
      event: makeEvent({ title: 'Detail Test Event' }),
      severity: 'HIGH',
    });

    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
    await safeClose(client);
  });

  it('should return 401 without API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return a single event by id with valid API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(storedEventId);
    expect(body.title).toBe('Detail Test Event');
    expect(body.severity).toBe('HIGH');
  });

  it('should return 404 for nonexistent event', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/00000000-0000-0000-0000-000000000000',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBe('Event not found');
  });
});

describe('GET /api/events/sources', () => {
  let ctx: AppContext;
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());

    const sources = ['sec-edgar', 'fed', 'sec-edgar', 'bls'];
    for (const source of sources) {
      await storeEvent(db, {
        event: makeEvent({ source }),
        severity: 'MEDIUM',
      });
    }

    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
    await safeClose(client);
  });

  it('should return unique sources sorted alphabetically', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/sources',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sources).toEqual(['bls', 'fed', 'sec-edgar']);
  });

  it('should return empty array when no events exist', async () => {
    const { db: emptyDb, client: emptyClient } = await createTestDb();
    const emptyCtx = buildApp({ logger: false, db: emptyDb, apiKey: TEST_API_KEY });
    await emptyCtx.server.ready();

    const response = await emptyCtx.server.inject({
      method: 'GET',
      url: '/api/events/sources',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.sources).toEqual([]);

    await emptyCtx.server.close();
    await emptyClient.close();
  });
});

describe('GET /api/stats', () => {
  let ctx: AppContext;
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());

    await storeEvent(db, {
      event: makeEvent({ source: 'sec-edgar' }),
      severity: 'CRITICAL',
    });
    await storeEvent(db, {
      event: makeEvent({ source: 'sec-edgar' }),
      severity: 'HIGH',
    });
    await storeEvent(db, {
      event: makeEvent({ source: 'fed' }),
      severity: 'HIGH',
    });

    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
    await safeClose(client);
  });

  it('should return event stats', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/stats',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.total).toBe(3);
    expect(body.bySource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'sec-edgar', count: 2 }),
        expect.objectContaining({ source: 'fed', count: 1 }),
      ]),
    );
    expect(body.bySeverity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'CRITICAL', count: 1 }),
        expect.objectContaining({ severity: 'HIGH', count: 2 }),
      ]),
    );
  });
});

describe('GET /health', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
  });

  it('should return 200 without API key (public endpoint)', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
  });
});

describe('EventBus → DB storage integration', () => {
  let ctx: AppContext;
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    ctx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await ctx.server.close();
    await safeClose(client);
  });

  it('should persist events published via ingest endpoint', async () => {
    const event = {
      id: crypto.randomUUID(),
      source: 'sec-edgar',
      type: '8-K',
      title: 'Integration Test Event',
      body: 'Integration test body',
      timestamp: new Date().toISOString(),
      metadata: { item_types: ['2.05'], ticker: 'MSFT' },
    };

    await ctx.server.inject({
      method: 'POST',
      url: '/api/events/ingest',
      payload: event,
    });

    // Wait for async event bus handler
    await new Promise((r) => setTimeout(r, 100));

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?source=sec-edgar',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    const body = response.json();
    expect(body.total).toBeGreaterThanOrEqual(1);

    const stored = body.data.find(
      (e: { sourceEventId: string }) => e.sourceEventId === event.id,
    );
    expect(stored).toBeDefined();
    expect(stored.title).toBe('Integration Test Event');
    expect(stored.severity).toBe('HIGH');
  });
});
