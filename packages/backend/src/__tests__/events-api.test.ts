import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { events } from '../db/schema.js';
import { createTestDb, safeClose, safeCloseServer, cleanTestDb } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'test-api-key-12345';

// Single shared PGlite instance for all describe blocks
let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
});

afterAll(async () => {
  await safeClose(sharedClient);
});

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
  beforeEach(async () => {
    await cleanTestDb(sharedDb);
  });

  it('should store an event and return the DB id', async () => {
    const event = makeEvent();
    const id = await storeEvent(sharedDb, { event, severity: 'MEDIUM' });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should store event fields correctly', async () => {
    const event = makeEvent({
      source: 'test-source',
      title: 'Specific Title',
      body: 'Specific Body',
    });

    const id = await storeEvent(sharedDb, { event, severity: 'HIGH' });

    const { rows } = await sharedClient.query(
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
    const id = await storeEvent(sharedDb, { event });

    const { rows } = await sharedClient.query(
      'SELECT severity FROM events WHERE id = $1',
      [id],
    );
    expect((rows[0] as Record<string, unknown>).severity).toBeNull();
  });
});

describe('GET /api/events', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    // Seed test data
    const sources = ['sec-edgar', 'sec-edgar', 'fed', 'fed', 'bls'];
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM'];

    for (let i = 0; i < sources.length; i++) {
      await storeEvent(sharedDb, {
        event: makeEvent({
          source: sources[i],
          title: `Event ${i + 1}`,
        }),
        severity: severities[i] as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      });
    }

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should return 401 without API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: 'Unauthorized',
    });
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
  let storedEventId: string;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    storedEventId = await storeEvent(sharedDb, {
      event: makeEvent({ title: 'Detail Test Event' }),
      severity: 'HIGH',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should return 401 without API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: 'Unauthorized',
    });
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

  it('should include market data when a ticker quote is available', async () => {
    const marketDataCache = {
      getOrFetch: vi.fn(async () => ({
        symbol: 'AAPL',
        price: 178.42,
        change1d: 2.3,
        change5d: 5.6,
        change20d: 8.9,
        volumeRatio: 1.7,
        rsi14: 54,
        high52w: 201,
        low52w: 132,
        support: 170,
        resistance: 182,
      })),
    };

    const ctxWithMarketData = buildApp({
      logger: false,
      db: sharedDb,
      apiKey: TEST_API_KEY,
      marketDataCache,
    } as Parameters<typeof buildApp>[0]);
    await ctxWithMarketData.server.ready();

    const response = await ctxWithMarketData.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      marketData: {
        price: 178.42,
        change1d: 2.3,
        change5d: 5.6,
        rsi14: 54,
        volumeRatio: 1.7,
      },
    });
    expect(marketDataCache.getOrFetch).toHaveBeenCalledWith('AAPL');

    await safeCloseServer(ctxWithMarketData.server);
  });

  it('should return null marketData when quote lookup misses', async () => {
    const marketDataCache = {
      getOrFetch: vi.fn(async () => undefined),
    };

    const ctxWithMarketData = buildApp({
      logger: false,
      db: sharedDb,
      apiKey: TEST_API_KEY,
      marketDataCache,
    } as Parameters<typeof buildApp>[0]);
    await ctxWithMarketData.server.ready();

    const response = await ctxWithMarketData.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      marketData: null,
    });

    await safeCloseServer(ctxWithMarketData.server);
  });

  it('should return audit trail when pipeline_audit has a matching record', async () => {
    // Seed an audit record keyed on sourceEventId
    const [event] = await sharedDb
      .select()
      .from(events)
      .where(eq(events.id, storedEventId))
      .limit(1);

    if (event?.sourceEventId) {
      await sharedClient.query(
        `INSERT INTO pipeline_audit (event_id, source, title, outcome, stopped_at, confidence, historical_match, historical_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [event.sourceEventId, 'sec-edgar', 'Detail Test Event', 'delivered', 'delivery', '0.82', true, 'medium'],
      );
    }

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${storedEventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.audit).not.toBeNull();
    expect(body.audit.outcome).toBe('delivered');
    expect(body.audit.stoppedAt).toBe('delivery');
    expect(body.audit.confidence).toBe(0.82);
    expect(body.audit.historicalMatch).toBe(true);
    expect(body.audit.historicalConfidence).toBe('medium');
  });

  it('should return null audit when no pipeline_audit record exists', async () => {
    await cleanTestDb(sharedDb);
    const eventId = await storeEvent(sharedDb, {
      event: makeEvent({ title: 'No Audit Event' }),
      severity: 'LOW',
    });

    // Rebuild app for the clean DB state
    const ctx2 = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx2.server.ready();

    const response = await ctx2.server.inject({
      method: 'GET',
      url: `/api/events/${eventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.audit).toBeNull();

    await safeCloseServer(ctx2.server);
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

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    const sources = ['sec-edgar', 'fed', 'sec-edgar', 'bls'];
    for (const source of sources) {
      await storeEvent(sharedDb, {
        event: makeEvent({ source }),
        severity: 'MEDIUM',
      });
    }

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
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
    // Use a separate clean DB for this specific test
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

    await safeCloseServer(emptyCtx.server);
    await safeClose(emptyClient);
  });
});

describe('GET /api/stats', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    await storeEvent(sharedDb, {
      event: makeEvent({ source: 'sec-edgar' }),
      severity: 'CRITICAL',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({ source: 'sec-edgar' }),
      severity: 'HIGH',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({ source: 'fed' }),
      severity: 'HIGH',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
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
    await safeCloseServer(ctx.server);
  });

  it('should return 200 without API key (public endpoint)', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBeDefined();
  });
});

describe('EventBus → DB storage integration', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
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
