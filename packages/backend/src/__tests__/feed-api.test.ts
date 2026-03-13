import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'feed-api-key';

let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
  await sharedDb.execute(sql`
    CREATE TABLE IF NOT EXISTS pipeline_audit (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL,
      source VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      severity VARCHAR(20),
      ticker VARCHAR(20),
      outcome VARCHAR(30) NOT NULL,
      stopped_at VARCHAR(30) NOT NULL,
      reason TEXT,
      reason_category VARCHAR(30),
      delivery_channels JSONB,
      historical_match BOOLEAN,
      historical_confidence VARCHAR(20),
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  await safeClose(sharedClient);
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Default feed event',
    body: 'Default feed body',
    url: 'https://example.com/default-feed-event',
    timestamp: new Date('2026-03-01T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      category: 'corporate',
    },
    ...overrides,
  };
}

async function insertAuditRow(input: {
  eventId: string;
  source: string;
  title: string;
  severity?: string;
  ticker?: string;
  outcome?: string;
  reason?: string;
  createdAt: string;
}): Promise<void> {
  await sharedDb.execute(sql`
    INSERT INTO pipeline_audit (
      event_id,
      source,
      title,
      severity,
      ticker,
      outcome,
      stopped_at,
      reason,
      created_at
    )
    VALUES (
      ${input.eventId},
      ${input.source},
      ${input.title},
      ${input.severity ?? null},
      ${input.ticker ?? null},
      ${input.outcome ?? 'delivered'},
      ${input.outcome === 'delivered' ? 'delivery' : 'alert_filter'},
      ${input.reason ?? null},
      ${input.createdAt}
    )
  `);
}

async function seedDeliveredEventFixture(): Promise<{
  newestEventId: string;
  secondCursor: string;
}> {
  const rawNewest = makeEvent({
    source: 'whitehouse',
    title: 'White House issues semiconductor order',
    body: 'The administration issued a new semiconductor executive order.',
    url: 'https://whitehouse.gov/briefing-room/semiconductors',
    timestamp: new Date('2026-03-03T16:35:00.000Z'),
    metadata: {
      ticker: 'NVDA',
      tickers: ['NVDA', 'AMD'],
      category: 'policy',
    },
  });
  const newestEventId = await storeEvent(sharedDb, {
    event: rawNewest,
    severity: 'CRITICAL',
  });

  const rawSecond = makeEvent({
    source: 'sec-edgar',
    title: 'Apple files 8-K on AI datacenter buildout',
    body: 'Apple filed an 8-K discussing accelerated datacenter expansion.',
    url: 'https://sec.gov/filing/apple-ai-datacenter',
    timestamp: new Date('2026-03-03T15:20:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      category: 'corporate',
    },
  });
  const secondEventId = await storeEvent(sharedDb, {
    event: rawSecond,
    severity: 'HIGH',
  });

  const rawThird = makeEvent({
    source: 'econ-calendar',
    title: 'CPI cools for a second month',
    body: 'Inflation data came in softer than expected.',
    url: 'https://bls.gov/cpi-release',
    timestamp: new Date('2026-03-03T13:00:00.000Z'),
    metadata: {
      ticker: 'SPY',
      category: 'macro',
    },
  });
  await storeEvent(sharedDb, {
    event: rawThird,
    severity: 'MEDIUM',
  });

  const rawFiltered = makeEvent({
    source: 'reddit',
    title: 'Retail chatter about Apple accessories',
    body: 'This event should not appear in the delivered feed.',
    url: 'https://reddit.com/r/stocks/example',
    timestamp: new Date('2026-03-03T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      category: 'other',
    },
  });
  await storeEvent(sharedDb, {
    event: rawFiltered,
    severity: 'LOW',
  });

  await insertAuditRow({
    eventId: rawNewest.id,
    source: rawNewest.source,
    title: rawNewest.title,
    severity: 'CRITICAL',
    ticker: 'NVDA',
    reason: 'LLM judge passed on direct policy relevance',
    createdAt: '2026-03-03T16:36:00.000Z',
  });
  await insertAuditRow({
    eventId: secondEventId,
    source: rawSecond.source,
    title: rawSecond.title,
    severity: 'HIGH',
    ticker: 'AAPL',
    reason: 'LLM judge passed on filed capex signal',
    createdAt: '2026-03-03T15:21:00.000Z',
  });
  await insertAuditRow({
    eventId: rawThird.id,
    source: rawThird.source,
    title: rawThird.title,
    severity: 'MEDIUM',
    ticker: 'SPY',
    reason: 'LLM judge passed on macro release surprise',
    createdAt: '2026-03-03T13:01:00.000Z',
  });
  await insertAuditRow({
    eventId: rawFiltered.id,
    source: rawFiltered.source,
    title: rawFiltered.title,
    severity: 'LOW',
    ticker: 'AAPL',
    outcome: 'filtered',
    reason: 'blocked in filter',
    createdAt: '2026-03-03T12:01:00.000Z',
  });

  return {
    newestEventId,
    secondCursor: '2026-03-03T15:21:00.000Z|2',
  };
}

describe('GET /api/v1/feed', () => {
  let ctx: AppContext;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql.raw('TRUNCATE TABLE pipeline_audit RESTART IDENTITY'));
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns 503 when the database is not configured', async () => {
    const noDbCtx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await noDbCtx.server.ready();

    const response = await noDbCtx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Database not configured' });

    await safeCloseServer(noDbCtx.server);
  });

  it('allows public access without an API key', async () => {
    await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns delivered events joined with event data', async () => {
    const { newestEventId } = await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        {
          id: newestEventId,
          title: 'White House issues semiconductor order',
          source: 'whitehouse',
          severity: 'CRITICAL',
          tickers: ['NVDA', 'AMD'],
          summary: 'The administration issued a new semiconductor executive order.',
          url: 'https://whitehouse.gov/briefing-room/semiconductors',
          time: '2026-03-03T16:35:00.000Z',
          category: 'policy',
          llmReason: 'LLM judge passed on direct policy relevance',
        },
        {
          id: expect.any(String),
          title: 'Apple files 8-K on AI datacenter buildout',
          source: 'sec-edgar',
          severity: 'HIGH',
          tickers: ['AAPL'],
          summary: 'Apple filed an 8-K discussing accelerated datacenter expansion.',
          url: 'https://sec.gov/filing/apple-ai-datacenter',
          time: '2026-03-03T15:20:00.000Z',
          category: 'corporate',
          llmReason: 'LLM judge passed on filed capex signal',
        },
        {
          id: expect.any(String),
          title: 'CPI cools for a second month',
          source: 'econ-calendar',
          severity: 'MEDIUM',
          tickers: ['SPY'],
          summary: 'Inflation data came in softer than expected.',
          url: 'https://bls.gov/cpi-release',
          time: '2026-03-03T13:00:00.000Z',
          category: 'macro',
          llmReason: 'LLM judge passed on macro release surprise',
        },
      ],
      cursor: null,
      total: 3,
    });
  });

  it('excludes non-delivered audit rows', async () => {
    await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { events: Array<{ title: string }> };
    expect(body.events.map((event) => event.title)).not.toContain(
      'Retail chatter about Apple accessories',
    );
  });

  it('supports limit and returns a next-page cursor', async () => {
    await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?limit=2',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [
        { title: 'White House issues semiconductor order' },
        { title: 'Apple files 8-K on AI datacenter buildout' },
      ],
      cursor: '2026-03-03T15:21:00.000Z|2',
      total: 3,
    });
  });

  it('supports before cursor pagination', async () => {
    const { secondCursor } = await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/feed?limit=1&before=${encodeURIComponent(secondCursor)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        {
          id: expect.any(String),
          title: 'CPI cools for a second month',
          source: 'econ-calendar',
          severity: 'MEDIUM',
          tickers: ['SPY'],
          summary: 'Inflation data came in softer than expected.',
          url: 'https://bls.gov/cpi-release',
          time: '2026-03-03T13:00:00.000Z',
          category: 'macro',
          llmReason: 'LLM judge passed on macro release surprise',
        },
      ],
      cursor: null,
      total: 3,
    });
  });

  it('filters by ticker using metadata.ticker', async () => {
    await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?ticker=aapl',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [
        {
          title: 'Apple files 8-K on AI datacenter buildout',
          tickers: ['AAPL'],
        },
      ],
      total: 1,
    });
  });

  it('filters by ticker using metadata.tickers arrays', async () => {
    await seedDeliveredEventFixture();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?ticker=AMD',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [
        {
          title: 'White House issues semiconductor order',
          tickers: ['NVDA', 'AMD'],
        },
      ],
      total: 1,
    });
  });

  it('joins audit rows that reference the stored event UUID directly', async () => {
    const rawEvent = makeEvent({
      source: 'federal-register',
      title: 'Federal Register tariff notice',
      body: 'A tariff notice was published in the federal register.',
      url: 'https://federalregister.gov/tariff-notice',
      timestamp: new Date('2026-03-04T10:00:00.000Z'),
      metadata: {
        ticker: 'CAT',
      },
    });
    const eventId = await storeEvent(sharedDb, {
      event: rawEvent,
      severity: 'HIGH',
    });
    await insertAuditRow({
      eventId,
      source: rawEvent.source,
      title: rawEvent.title,
      severity: 'HIGH',
      ticker: 'CAT',
      reason: 'Joined by DB UUID fallback',
      createdAt: '2026-03-04T10:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [
        {
          id: eventId,
          title: 'Federal Register tariff notice',
          llmReason: 'Joined by DB UUID fallback',
        },
      ],
      total: 1,
    });
  });

  it('returns 400 for an invalid cursor', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?before=not-a-valid-cursor',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Invalid request',
    });
  });

  it('returns 400 for an invalid ticker', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?ticker=INVALID123',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'Invalid request',
    });
  });
});
