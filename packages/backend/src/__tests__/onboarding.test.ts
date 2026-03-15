import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { createTestDb, safeClose, safeCloseServer, cleanTestDb } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'test-api-key-onboarding';

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
    title: 'Test Filing',
    body: 'Test body',
    timestamp: new Date(),
    metadata: { ticker: 'AAPL', tickers: ['AAPL'] },
    ...overrides,
  };
}

describe('GET /api/v1/onboarding/suggested-tickers', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    await cleanTestDb(sharedDb);

    // Seed events with different tickers and severities
    const now = new Date();

    // NVDA: 3 events (1 CRITICAL=4, 1 HIGH=3, 1 MEDIUM=2) = weighted 9
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'NVDA critical event', metadata: { ticker: 'NVDA', tickers: ['NVDA'] }, timestamp: now }),
      severity: 'CRITICAL',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'NVDA high event', metadata: { ticker: 'NVDA', tickers: ['NVDA'] }, timestamp: now }),
      severity: 'HIGH',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'NVDA medium event', metadata: { ticker: 'NVDA', tickers: ['NVDA'] }, timestamp: now }),
      severity: 'MEDIUM',
    });

    // AAPL: 2 events (1 HIGH=3, 1 LOW=1) = weighted 4
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'AAPL high event', metadata: { ticker: 'AAPL', tickers: ['AAPL'] }, timestamp: now }),
      severity: 'HIGH',
    });
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'AAPL low event', metadata: { ticker: 'AAPL', tickers: ['AAPL'] }, timestamp: now }),
      severity: 'LOW',
    });

    // TSLA: 1 event (1 MEDIUM=2) = weighted 2
    await storeEvent(sharedDb, {
      event: makeEvent({ title: 'TSLA medium event', metadata: { ticker: 'TSLA', tickers: ['TSLA'] }, timestamp: now }),
      severity: 'MEDIUM',
    });

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns top tickers ordered by weighted event count', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/onboarding/suggested-tickers',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tickers.length).toBeGreaterThanOrEqual(3);

    // NVDA should be first (highest weighted score)
    expect(body.tickers[0].symbol).toBe('NVDA');
    expect(body.tickers[0].eventCount7d).toBe(3);

    // AAPL second
    expect(body.tickers[1].symbol).toBe('AAPL');
    expect(body.tickers[1].eventCount7d).toBe(2);

    // TSLA third
    expect(body.tickers[2].symbol).toBe('TSLA');
    expect(body.tickers[2].eventCount7d).toBe(1);
  });

  it('returns sector packs', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/onboarding/suggested-tickers',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    const body = response.json();
    expect(body.packs).toHaveLength(4);
    expect(body.packs[0].name).toBe('Tech Leaders');
    expect(body.packs[0].tickers).toContain('AAPL');
  });

});

describe('POST /api/v1/onboarding/bulk-add', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
  });

  it('adds tickers to watchlist', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/v1/onboarding/bulk-add',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { tickers: ['AAPL', 'NVDA', 'TSLA'] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.added).toBe(3);
    expect(body.total).toBe(3);

    // Verify watchlist
    const listResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
    });
    expect(listResponse.json().data).toHaveLength(3);
  });

  it('skips duplicates', async () => {
    // First add AAPL via regular watchlist endpoint
    await ctx.server.inject({
      method: 'POST',
      url: '/api/watchlist',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { ticker: 'AAPL' },
    });

    // Now bulk-add including AAPL
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/v1/onboarding/bulk-add',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { tickers: ['AAPL', 'NVDA', 'TSLA'] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.added).toBe(2); // Only NVDA and TSLA are new
    expect(body.total).toBe(3); // Total is 3
  });

  it('validates ticker format', async () => {
    const response = await ctx.server.inject({
      method: 'POST',
      url: '/api/v1/onboarding/bulk-add',
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { tickers: ['invalid!'] },
    });

    expect(response.statusCode).toBe(400);
  });
});
