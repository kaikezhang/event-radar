import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'briefing-test-key';
const AUTH_HEADERS = { 'x-api-key': TEST_API_KEY };
const DEFAULT_USER_ID = 'default';

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
    title: 'Default briefing event',
    body: 'Default briefing summary',
    timestamp: new Date('2026-03-13T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
      url: 'https://example.com/default',
    },
    ...overrides,
  };
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

async function seedDeliveredEvent(input: {
  title: string;
  ticker?: string;
  source?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: string;
  auditTime?: string;
}): Promise<void> {
  const ticker = input.ticker ?? 'AAPL';
  const rawEvent = makeEvent({
    source: input.source ?? 'sec-edgar',
    title: input.title,
    body: `${input.title} summary`,
    timestamp: new Date(input.eventTime),
    metadata: {
      ticker,
      tickers: [ticker],
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
      ${new Date(input.auditTime ?? input.eventTime)}
    )
  `);
}

describe('GET /api/v1/briefing/daily', () => {
  let ctx: AppContext;
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql`DELETE FROM pipeline_audit`);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T12:00:00.000Z'));
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
    vi.useRealTimers();
    if (previousAuthRequired == null) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = previousAuthRequired;
    }
    if (previousJwtSecret == null) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it('requires authentication', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/briefing/daily',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns aggregated briefing data for the last 24 hours', async () => {
    await seedUser(DEFAULT_USER_ID);
    await addWatchlistTicker(DEFAULT_USER_ID, 'NVDA');
    await addWatchlistTicker(DEFAULT_USER_ID, 'TSLA');

    await seedDeliveredEvent({
      title: 'Nvidia issues urgent filing',
      ticker: 'NVDA',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      eventTime: '2026-03-13T11:30:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Tesla trading halt',
      ticker: 'TSLA',
      source: 'trading-halt',
      severity: 'HIGH',
      eventTime: '2026-03-13T10:15:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Breaking macro headline',
      ticker: 'SPY',
      source: 'breaking-news',
      severity: 'HIGH',
      eventTime: '2026-03-13T11:45:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Apple guidance update',
      ticker: 'AAPL',
      source: 'sec-edgar',
      severity: 'MEDIUM',
      eventTime: '2026-03-13T09:00:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Old alert outside briefing window',
      ticker: 'MSFT',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      eventTime: '2026-03-12T10:59:59.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/briefing/daily',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: '2026-03-13',
      totalEvents: 4,
      bySeverity: {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 1,
        LOW: 0,
      },
      topEvents: [
        {
          title: 'Nvidia issues urgent filing',
          ticker: 'NVDA',
          severity: 'CRITICAL',
        },
        {
          title: 'Breaking macro headline',
          ticker: 'SPY',
          severity: 'HIGH',
        },
        {
          title: 'Tesla trading halt',
          ticker: 'TSLA',
          severity: 'HIGH',
        },
      ],
      bySource: {
        'sec-edgar': 2,
        'trading-halt': 1,
        'breaking-news': 1,
      },
      watchlistEvents: 2,
    });
  });

  it('returns zero watchlist activity when the user has no watchlist', async () => {
    await seedUser(DEFAULT_USER_ID);
    await seedDeliveredEvent({
      title: 'Solo market event',
      ticker: 'AAPL',
      source: 'sec-edgar',
      severity: 'MEDIUM',
      eventTime: '2026-03-13T11:30:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/briefing/daily',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().watchlistEvents).toBe(0);
  });

  it('returns empty aggregates when there are no recent delivered events', async () => {
    await seedUser(DEFAULT_USER_ID);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/briefing/daily',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: '2026-03-13',
      totalEvents: 0,
      bySeverity: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      },
      topEvents: [],
      bySource: {},
      watchlistEvents: 0,
    });
  });
});
