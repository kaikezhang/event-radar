import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
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

  it('should store top-level classification fields when provided', async () => {
    const event = makeEvent({
      metadata: {
        ticker: 'AAPL',
        llm_judge: {
          direction: 'BULLISH',
          confidence: 0.88,
        },
      },
    });

    const id = await storeEvent(sharedDb, {
      event,
      severity: 'HIGH',
      classification: 'BULLISH',
      classificationConfidence: 0.88,
    });

    const { rows } = await sharedClient.query(
      'SELECT classification, classification_confidence FROM events WHERE id = $1',
      [id],
    );

    expect((rows[0] as Record<string, unknown>).classification).toBe('BULLISH');
    expect(Number((rows[0] as Record<string, unknown>).classification_confidence)).toBeCloseTo(0.88, 5);
  });
});

describe('GET /api/events', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    // Seed test data
    const sources = ['sec-edgar', 'sec-edgar', 'fed', 'fed', 'bls'];
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM'];
    const classifications = ['BULLISH', 'BEARISH', 'NEUTRAL', 'BULLISH', 'BEARISH'];
    const confidences = ['0.91', '0.82', '0.55', '0.77', '0.61'];

    for (let i = 0; i < sources.length; i++) {
      const rawEvent = makeEvent({
        source: sources[i],
        title: `Event ${i + 1}`,
      });

      const eventId = await storeEvent(sharedDb, {
        event: rawEvent,
        severity: severities[i] as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      });

      await sharedDb.execute(sql`
        UPDATE events
        SET classification = ${classifications[i]},
            classification_confidence = ${confidences[i]}
        WHERE id = ${eventId}
      `);

      await sharedDb.execute(sql`
        INSERT INTO pipeline_audit (
          event_id,
          source,
          title,
          severity,
          ticker,
          outcome,
          stopped_at,
          reason
        ) VALUES (
          ${rawEvent.id},
          ${sources[i]},
          ${rawEvent.title},
          ${severities[i]},
          'AAPL',
          'delivered',
          'delivery',
          'Passed pipeline'
        )
      `);
    }

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should require an api key when no authenticated session exists', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/events',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'API key required',
          docs: '/api-docs',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
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

  it('should accept apiKey query params on the list route', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events?apiKey=${TEST_API_KEY}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(5);
  });

  it('should strip rawPayload from list responses', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).not.toHaveProperty('rawPayload');
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

  it('should filter by classification', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?classification=BULLISH',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data.every((event: { classification: string }) => event.classification === 'BULLISH')).toBe(true);
  });

  it('should combine classification and severity filters', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?classification=BULLISH&severity=CRITICAL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      classification: 'BULLISH',
      severity: 'CRITICAL',
    });
  });

  it('should strip rawPayload from event detail responses', async () => {
    const listResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });
    const eventId = listResponse.json().data[0].id as string;

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${eventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('rawPayload');
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

  it('should return 400 for invalid classification enum', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?classification=CRITICAL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid classification: CRITICAL' });
  });

  it('should return top-level classification fields in API responses', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?classification=BEARISH',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data[0]).toEqual(expect.objectContaining({
      classification: 'BEARISH',
      classificationConfidence: expect.any(Number),
    }));
  });

  it('should synthesize Truth Social sourceUrls when older rows are missing them', async () => {
    const truthEventId = await storeEvent(sharedDb, {
      event: makeEvent({
        source: 'truth-social',
        type: 'political-post',
        title: 'Trump Truth post',
        body: 'Tariffs are coming back.',
        metadata: {
          ticker: 'SPY',
          postId: '116278232362967212',
        },
      }),
      severity: 'HIGH',
    });

    await sharedDb.execute(sql`
      UPDATE events
      SET source_urls = NULL
      WHERE id = ${truthEventId}
    `);

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${truthEventId}`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      id: truthEventId,
      sourceUrls: ['https://truthsocial.com/@realDonaldTrump/posts/116278232362967212'],
    }));
  });
});

describe('GET /api/events delivery filtering', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);

    const deliveredEvent = makeEvent({
      source: 'breaking-news',
      title: 'Delivered market-moving event',
      metadata: { ticker: 'SPY' },
    });
    const filteredEvent = makeEvent({
      source: 'breaking-news',
      title: 'Blocked low-quality event',
      metadata: { ticker: 'SPY' },
    });
    const pendingEvent = makeEvent({
      source: 'breaking-news',
      title: 'No audit yet',
      metadata: { ticker: 'QQQ' },
    });

    await storeEvent(sharedDb, { event: deliveredEvent, severity: 'HIGH' });
    await storeEvent(sharedDb, { event: filteredEvent, severity: 'HIGH' });
    await storeEvent(sharedDb, { event: pendingEvent, severity: 'HIGH' });

    await sharedDb.execute(sql`
      INSERT INTO pipeline_audit (
        event_id,
        source,
        title,
        severity,
        ticker,
        outcome,
        stopped_at,
        reason
      ) VALUES
      (
        ${deliveredEvent.id},
        ${deliveredEvent.source},
        ${deliveredEvent.title},
        'HIGH',
        'SPY',
        'delivered',
        'delivery',
        'Passed pipeline'
      ),
      (
        ${filteredEvent.id},
        ${filteredEvent.source},
        ${filteredEvent.title},
        'HIGH',
        'SPY',
        'filtered',
        'llm_judge',
        'Blocked by judge'
      )
    `);

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns only events that were delivered by the pipeline', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      data: [
        expect.objectContaining({
          title: 'Delivered market-moving event',
          source: 'breaking-news',
          severity: 'HIGH',
        }),
      ],
    });
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
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: `/api/events/${storedEventId}`,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'API key required',
          docs: '/api-docs',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
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

  it('requires an api key when no authenticated session exists', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/stats',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'API key required',
          docs: '/api-docs',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });
});

describe('GET /api-docs', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns backend endpoint documentation for API consumers', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api-docs',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual(expect.objectContaining({
      name: 'Event Radar API',
      endpoints: expect.arrayContaining([
        expect.objectContaining({ path: '/api/events', method: 'GET' }),
        expect.objectContaining({ path: '/api/events/search', method: 'GET' }),
        expect.objectContaining({ path: '/api/stats', method: 'GET' }),
      ]),
    }));
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

    const [stored] = await sharedDb
      .select()
      .from(events)
      .where(eq(events.sourceEventId, event.id))
      .limit(1);

    expect(stored).toBeDefined();
    expect(stored.title).toBe('Integration Test Event');
    expect(stored.severity).toBe('HIGH');
  });
});
