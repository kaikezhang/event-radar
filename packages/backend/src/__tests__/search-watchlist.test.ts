import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
    // Add two tickers
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
    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'AAPL event',
        metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
      }),
      severity: 'HIGH',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'NVDA event',
        metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
      }),
      severity: 'MEDIUM',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'TSLA event',
        metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
      }),
      severity: 'LOW',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    // Add AAPL and NVDA to watchlist
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
});

describe('Watchlist auth regression', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('should return 401 for GET /api/watchlist without API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return 401 for POST /api/watchlist without API key', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      payload: { ticker: 'AAPL' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return 401 for DELETE /api/watchlist/:ticker without API key', async () => {
    const response = await ctx.server.inject({
      method: 'DELETE',
      url: '/api/watchlist/AAPL',
    });
    expect(response.statusCode).toBe(401);
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
