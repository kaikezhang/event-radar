import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'watchlist-feed-test-key';
const DEFAULT_USER_ID = 'default';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };

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
    title: 'Default feed event',
    body: 'Default summary',
    timestamp: new Date('2026-03-13T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
      category: 'corporate',
      url: 'https://example.com/default',
    },
    ...overrides,
  };
}

async function seedDeliveredEvent(input: {
  title: string;
  ticker?: string;
  source?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: string;
  auditTime: string;
}): Promise<string> {
  const ticker = input.ticker ?? 'AAPL';
  const rawEvent = makeEvent({
    source: input.source ?? 'sec-edgar',
    title: input.title,
    body: `${input.title} summary`,
    timestamp: new Date(input.eventTime),
    metadata: {
      ticker,
      tickers: [ticker],
      category: 'corporate',
      url: `https://example.com/${input.title.toLowerCase().replace(/\s+/g, '-')}`,
    },
  });
  const eventId = await storeEvent(sharedDb, {
    event: rawEvent,
    severity: input.severity ?? 'HIGH',
  });

  await sharedDb.execute(sql`
    UPDATE events
    SET
      source_urls = ${JSON.stringify([`https://example.com/${eventId}`])}::jsonb,
      created_at = ${new Date(input.eventTime)},
      received_at = ${new Date(input.eventTime)}
    WHERE id = ${eventId}
  `);

  await sharedDb.execute(sql`
    INSERT INTO pipeline_audit (
      event_id, source, title, severity, ticker,
      outcome, stopped_at, reason, created_at
    ) VALUES (
      ${rawEvent.id}, ${input.source ?? 'sec-edgar'}, ${input.title},
      ${input.severity ?? 'HIGH'}, ${ticker},
      'delivered', 'delivery', 'LLM approved',
      ${new Date(input.auditTime)}
    )
  `);

  return eventId;
}

async function seedUser(userId: string): Promise<void> {
  await sharedDb.execute(sql`
    INSERT INTO users (id) VALUES (${userId}) ON CONFLICT DO NOTHING
  `);
}

async function addWatchlistTicker(userId: string, ticker: string): Promise<void> {
  await sharedDb.execute(sql`
    INSERT INTO watchlist (user_id, ticker) VALUES (${userId}, ${ticker})
    ON CONFLICT DO NOTHING
  `);
}

describe('GET /api/v1/feed?watchlist=true', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql`DELETE FROM pipeline_audit`);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('filters feed to only watchlist tickers', async () => {
    await seedUser(DEFAULT_USER_ID);
    await addWatchlistTicker(DEFAULT_USER_ID, 'TSLA');

    await seedDeliveredEvent({
      title: 'Tesla event',
      ticker: 'TSLA',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Apple event',
      ticker: 'AAPL',
      eventTime: '2026-03-13T11:00:00.000Z',
      auditTime: '2026-03-13T11:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?watchlist=true',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].tickers).toEqual(['TSLA']);
  });

  it('returns empty when user has no watchlist items', async () => {
    await seedUser(DEFAULT_USER_ID);

    await seedDeliveredEvent({
      title: 'Some event',
      ticker: 'AAPL',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?watchlist=true',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('matches events via enrichment.tickers[].symbol', async () => {
    await seedUser(DEFAULT_USER_ID);
    await addWatchlistTicker(DEFAULT_USER_ID, 'MSFT');

    const rawEvent = makeEvent({
      source: 'breaking-news',
      title: 'Broad tech news',
      body: 'Affects multiple tickers',
      timestamp: new Date('2026-03-13T10:00:00.000Z'),
      metadata: {
        ticker: 'AAPL',
        tickers: ['AAPL'],
        category: 'corporate',
        url: 'https://example.com/broad',
        llm_enrichment: {
          summary: 'Broad impact',
          impact: 'Multi-ticker',
          tickers: [
            { symbol: 'AAPL', direction: 'neutral' },
            { symbol: 'MSFT', direction: 'bullish' },
          ],
        },
      },
    });
    const eventId = await storeEvent(sharedDb, {
      event: rawEvent,
      severity: 'HIGH',
    });

    await sharedDb.execute(sql`
      UPDATE events
      SET
        source_urls = ${JSON.stringify([`https://example.com/${eventId}`])}::jsonb,
        created_at = ${new Date('2026-03-13T10:00:00.000Z')},
        received_at = ${new Date('2026-03-13T10:00:00.000Z')}
      WHERE id = ${eventId}
    `);

    await sharedDb.execute(sql`
      INSERT INTO pipeline_audit (
        event_id, source, title, severity, ticker,
        outcome, stopped_at, reason, created_at
      ) VALUES (
        ${rawEvent.id}, 'breaking-news', 'Broad tech news',
        'HIGH', 'AAPL',
        'delivered', 'delivery', 'LLM approved',
        ${new Date('2026-03-13T10:01:00.000Z')}
      )
    `);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?watchlist=true',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events).toHaveLength(1);
  });

  it('returns all events when watchlist filter is not set', async () => {
    await seedUser(DEFAULT_USER_ID);
    await addWatchlistTicker(DEFAULT_USER_ID, 'TSLA');

    await seedDeliveredEvent({
      title: 'Tesla event',
      ticker: 'TSLA',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Apple event',
      ticker: 'AAPL',
      eventTime: '2026-03-13T11:00:00.000Z',
      auditTime: '2026-03-13T11:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(2);
  });
});

describe('GET /api/v1/feed/watchlist-summary', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql`DELETE FROM pipeline_audit`);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns per-ticker summary for watchlist', async () => {
    await seedUser(DEFAULT_USER_ID);
    await addWatchlistTicker(DEFAULT_USER_ID, 'TSLA');
    await addWatchlistTicker(DEFAULT_USER_ID, 'NVDA');

    await seedDeliveredEvent({
      title: 'Tesla files 8-K',
      ticker: 'TSLA',
      severity: 'HIGH',
      eventTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      auditTime: new Date(Date.now() - 2 * 60 * 60 * 1000 + 60_000).toISOString(),
    });
    await seedDeliveredEvent({
      title: 'Tesla CEO speaks',
      ticker: 'TSLA',
      severity: 'CRITICAL',
      eventTime: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      auditTime: new Date(Date.now() - 1 * 60 * 60 * 1000 + 60_000).toISOString(),
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed/watchlist-summary',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tickers).toHaveLength(2);

    const tsla = body.tickers.find((t: { ticker: string }) => t.ticker === 'TSLA');
    expect(tsla.eventCount24h).toBe(2);
    expect(tsla.latestEvent).toBeTruthy();
    expect(tsla.latestEvent.title).toBe('Tesla CEO speaks');
    expect(tsla.highestSignal).toBe('🔴');

    const nvda = body.tickers.find((t: { ticker: string }) => t.ticker === 'NVDA');
    expect(nvda.eventCount24h).toBe(0);
    expect(nvda.latestEvent).toBeNull();
    expect(nvda.highestSignal).toBe('🟢');
  });

  it('returns empty tickers array when no watchlist', async () => {
    await seedUser(DEFAULT_USER_ID);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed/watchlist-summary',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tickers: [] });
  });
});
