import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { createTestDb, safeClose, safeCloseServer, cleanTestDb } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'test-api-key-search';

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
    body: 'Test body content about earnings results',
    timestamp: new Date(),
    metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
    ...overrides,
  };
}

async function seedDeliveredEvent(
  db: Database,
  event: RawEvent,
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
): Promise<void> {
  await storeEvent(db, { event, severity });
  const ticker =
    event.metadata && typeof event.metadata['ticker'] === 'string'
      ? event.metadata['ticker']
      : null;

  await db.execute(sql`
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
      ${event.id},
      ${event.source},
      ${event.title},
      ${severity},
      ${ticker},
      'delivered',
      'delivery',
      'Passed pipeline'
    )
  `);
}

describe('GET /api/events/search', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    // Seed events for search
    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'NVIDIA earnings beat expectations',
        body: 'NVIDIA reported strong quarterly earnings driven by AI demand',
        metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
      }),
      severity: 'HIGH',
    });

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Apple announces new product launch',
        body: 'Apple unveiled revolutionary new devices at their annual event',
        metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
      }),
      severity: 'MEDIUM',
    });

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Federal Reserve holds interest rates steady',
        body: 'The Fed decided to maintain current monetary policy',
        metadata: { ticker: 'SPY', tickers: ['SPY'] },
        source: 'fed',
      }),
      severity: 'CRITICAL',
    });

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Tesla quarterly delivery numbers released',
        body: 'Tesla reported earnings and vehicle delivery statistics',
        metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
      }),
      severity: 'HIGH',
    });

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Export filing flags China exposure risk',
        body: 'GPU export restrictions may pressure near-term demand expectations',
        metadata: {
          ticker: 'NVDA',
          tickers: ['NVDA'],
          companyName: 'NVIDIA Corporation',
        },
      }),
      severity: 'HIGH',
    });

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Late-stage trial readout hits primary endpoint',
        body: 'Lead therapy showed a statistically significant benefit in the pivotal study',
        metadata: {
          ticker: 'ABIO',
          tickers: ['ABIO'],
          companyName: 'Acme Biologics Holdings',
        },
      }),
      severity: 'MEDIUM',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should return results matching title text', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=earnings',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const titles = body.data.map((e: { title: string }) => e.title.toLowerCase());
    expect(titles.some((t: string) => t.includes('earnings'))).toBe(true);
  });

  it('should return results matching body text', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=monetary+policy',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should match mixed ticker-plus-text queries using ticker metadata', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=NVDA+export',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const titles = body.data.map((event: { title: string }) => event.title);
    expect(titles).toContain('Export filing flags China exposure risk');
  });

  it('should match company names stored only in metadata', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=Biologics',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const titles = body.data.map((event: { title: string }) => event.title);
    expect(titles).toContain('Late-stage trial readout hits primary endpoint');
  });

  it('should handle ticker prefix search (uppercase 1-5 chars)', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const meta = body.data[0].metadata as { ticker?: string };
    expect(meta.ticker).toBe('NVDA');
  });

  it('should return 400 when q is missing', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should respect the limit parameter', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=earnings&limit=1',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeLessThanOrEqual(1);
  });
});

describe('GET /api/events?q=', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'Tesla',
      body: 'Single-word exact title match for relevance sorting',
      metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
    }), 'HIGH');

    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'Tesla supplier wins battery contract',
      body: 'Battery supplier update with partial Tesla title match',
      metadata: { ticker: 'QS', tickers: ['QS'] },
    }), 'MEDIUM');

    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'Refiner guidance raised after outage',
      body: 'Oil traders reacted to the refinery outage and demand shock.',
      metadata: { ticker: 'XOM', tickers: ['XOM'] },
    }), 'LOW');

    for (let index = 0; index < 55; index += 1) {
      await seedDeliveredEvent(sharedDb, makeEvent({
        title: `Oil setup ${index + 1}`,
        body: `Oil follow-through case ${index + 1}`,
        metadata: { ticker: 'CVX', tickers: ['CVX'] },
      }), 'LOW');
    }

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should search summary text with q', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?q=refinery',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const titles = body.data.map((event: { title: string }) => event.title);
    expect(titles).toContain('Refiner guidance raised after outage');
  });

  it('should rank exact case-insensitive matches before partial matches', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?q=tesla',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data[0].title).toBe('Tesla');
    expect(body.data[1].title).toContain('Tesla supplier');
  });

  it('should match ticker filters against metadata tickers when the top-level ticker is null', async () => {
    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'GPU export risk intensifies',
      body: 'China channel checks softened further this week.',
      metadata: { tickers: ['NVDA'] },
    }), 'HIGH');

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?ticker=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const titles = response.json().data.map((event: { title: string }) => event.title);
    expect(titles).toContain('GPU export risk intensifies');
  });

  it('should match q searches against metadata tickers when the symbol is absent from title and summary', async () => {
    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'GPU export risk intensifies',
      body: 'China channel checks softened further this week.',
      metadata: { tickers: ['NVDA'] },
    }), 'HIGH');

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?q=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const titles = response.json().data.map((event: { title: string }) => event.title);
    expect(titles).toContain('GPU export risk intensifies');
  });

  it('should match q searches against raw body text when summary is empty', async () => {
    const sourceEventId = crypto.randomUUID();

    await sharedDb.execute(sql`
      INSERT INTO events (
        source,
        source_event_id,
        ticker,
        title,
        summary,
        raw_payload,
        metadata,
        severity,
        received_at,
        created_at
      ) VALUES (
        'sec-edgar',
        ${sourceEventId},
        'NVDA',
        'Semiconductor supply chain update',
        NULL,
        ${JSON.stringify({
          body: 'Blackwell demand remained stronger than expected.',
          metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
        })}::jsonb,
        ${JSON.stringify({ ticker: 'NVDA', tickers: ['NVDA'] })}::jsonb,
        'HIGH',
        NOW(),
        NOW()
      )
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
        ${sourceEventId},
        'sec-edgar',
        'Semiconductor supply chain update',
        'HIGH',
        'NVDA',
        'delivered',
        'delivery',
        'Passed pipeline'
      )
    `);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?q=Blackwell',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const titles = response.json().data.map((event: { title: string }) => event.title);
    expect(titles).toContain('Semiconductor supply chain update');
  });

  it('should cap q search results at 50 even when a larger limit is requested', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?q=oil&limit=200',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(50);
  });
});

describe('Watchlist CRUD', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
  });

  it('should add a ticker to the watchlist', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.ticker).toBe('AAPL');
    expect(body.id).toBeDefined();
  });

  it('should list watchlist tickers', async () => {
    // Add two tickers for the default user
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'NVDA' },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(2);
    const tickers = body.data.map((w: { ticker: string }) => w.ticker);
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('NVDA');
  });

  it('should include company name from ticker_reference in watchlist response', async () => {
    // Seed ticker_reference
    await sharedDb.execute(sql`
      INSERT INTO ticker_reference (ticker, name, sector, exchange) VALUES
        ('GOOG', 'Alphabet Inc', 'Technology', 'NASDAQ')
    `);

    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'GOOG' },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const googItem = body.data.find((w: { ticker: string }) => w.ticker === 'GOOG');
    expect(googItem).toBeDefined();
    expect(googItem.name).toBe('Alphabet Inc');
  });

  it('should reject duplicate ticker', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('should ignore x-user-id header (impersonation removed)', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    // x-user-id is now ignored, so this should conflict with the same default user
    const secondResponse = await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY, 'x-user-id': 'user-2' },
      payload: { ticker: 'AAPL' },
    });

    expect(secondResponse.statusCode).toBe(409);
  });

  it('should delete a ticker from the watchlist', async () => {
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    const deleteResponse = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/watchlist/AAPL',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(deleteResponse.statusCode).toBe(200);

    const listResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(listResponse.json().data).toHaveLength(0);
  });

  it('should not delete a non-existent ticker (x-user-id ignored)', async () => {
    // x-user-id is ignored, so both requests go to 'default' user
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    // This deletes from 'default' user (x-user-id header is ignored)
    const deleteResponse = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/watchlist/AAPL',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(deleteResponse.statusCode).toBe(200);

    const listResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(0);
  });

  it('should return 404 when deleting non-existent ticker', async () => {
    const response = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/watchlist/XXXX',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/events?watchlist=true', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    // Seed events
    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'AAPL event',
      metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
    }), 'HIGH');
    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'NVDA event',
      metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
    }), 'MEDIUM');
    await seedDeliveredEvent(sharedDb, makeEvent({
      title: 'TSLA event',
      metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
    }), 'LOW');

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    // Add AAPL and NVDA to the default user watchlist
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'NVDA' },
    });
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should filter events to only watchlist tickers', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?watchlist=true',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Should only have AAPL and NVDA events, not TSLA
    expect(body.data).toHaveLength(2);
    const tickers = body.data.map((e: { metadata: { ticker: string } }) => e.metadata.ticker);
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('NVDA');
    expect(tickers).not.toContain('TSLA');
  });

  it('should ignore x-user-id header when filtering by watchlist', async () => {
    // x-user-id is ignored, so this returns the default user's watchlist (AAPL, NVDA)
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?watchlist=true',
      headers: { 'x-api-key': TEST_API_KEY, 'x-user-id': 'user-2' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Returns default user's watchlist tickers (AAPL, NVDA), not user-2's
    expect(body.data).toHaveLength(2);
  });

  it('should return empty when watchlist is empty', async () => {
    // Create a fresh DB with no watchlist
    const { db: emptyDb, client: emptyClient } = await createTestDb();

    // Add an event but no watchlist entries
    await storeEvent(emptyDb, {
      event: makeEvent({ title: 'Orphan event' }),
      severity: 'LOW',
    });

    const emptyCtx = buildApp({ logger: false, db: emptyDb, apiKey: TEST_API_KEY });
    await emptyCtx.server.ready();

    const response = await emptyCtx.server.inject({
      method: 'GET',
      url: '/api/events?watchlist=true',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(0);

    await safeCloseServer(emptyCtx.server);
    await safeClose(emptyClient);
  });

  it('should ignore x-user-id and return default user watchlist events', async () => {
    // x-user-id is ignored, so 'empty-user' resolves to 'default' which has watchlist entries
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events?watchlist=true',
      headers: { 'x-api-key': TEST_API_KEY, 'x-user-id': 'empty-user' },
    });

    expect(response.statusCode).toBe(200);
    // Returns default user's watchlist (AAPL, NVDA), not empty
    expect(response.json().data).toHaveLength(2);
  });
});

describe('Watchlist auth regression', () => {
  it('should return 401 for GET /api/watchlist without API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/watchlist',
        });
        expect(response.statusCode).toBe(401);
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('should return 401 for POST /api/watchlist without API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'POST',
          url: '/api/watchlist',
          payload: { ticker: 'AAPL' },
        });
        expect(response.statusCode).toBe(401);
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('should return 401 for DELETE /api/watchlist/:ticker without API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'DELETE',
          url: '/api/watchlist/AAPL',
        });
        expect(response.statusCode).toBe(401);
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });
});

describe('Search case normalization', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'NVIDIA earnings beat',
        metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
      }),
      severity: 'HIGH',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should match ticker search with lowercase input', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=nvda',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const meta = body.data[0].metadata as { ticker?: string };
    expect(meta.ticker).toBe('NVDA');
  });

  it('should match ticker search with mixed-case input', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/events/search?q=Nvda',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});
