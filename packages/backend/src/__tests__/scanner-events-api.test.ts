import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'scanner-events-test-key';

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
    title: 'Default scanner event',
    body: 'Default scanner body',
    timestamp: new Date('2026-03-13T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
      url: 'https://example.com/default-scanner-event',
    },
    ...overrides,
  };
}

async function seedScannerEvent(input: {
  source: string;
  title: string;
  summary?: string;
  tickers?: string[];
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  receivedAt: string;
}): Promise<string> {
  const tickers = input.tickers ?? ['AAPL'];

  return storeEvent(sharedDb, {
    event: makeEvent({
      source: input.source,
      title: input.title,
      body: input.summary ?? `${input.title} body`,
      timestamp: new Date(input.receivedAt),
      metadata: {
        ticker: tickers[0] ?? null,
        tickers,
        url: `https://example.com/${input.source}/${input.title.toLowerCase().replace(/\s+/g, '-')}`,
      },
    }),
    severity: input.severity ?? 'MEDIUM',
  });
}

describe('GET /api/v1/scanners/:name/events', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns recent events for a scanner ordered by newest first', async () => {
    await seedScannerEvent({
      source: 'sec-edgar',
      title: 'Older filing',
      tickers: ['AAPL'],
      receivedAt: '2026-03-13T08:00:00.000Z',
    });
    const newerId = await seedScannerEvent({
      source: 'sec-edgar',
      title: 'Newer filing',
      tickers: ['NVDA', 'AMD'],
      severity: 'HIGH',
      receivedAt: '2026-03-13T10:30:00.000Z',
    });
    await seedScannerEvent({
      source: 'whitehouse',
      title: 'Other scanner event',
      tickers: ['SPY'],
      receivedAt: '2026-03-13T11:00:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/scanners/sec-edgar/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scanner: 'sec-edgar',
      count: 2,
      events: [
        {
          id: newerId,
          title: 'Newer filing',
          summary: 'Newer filing body',
          severity: 'HIGH',
          tickers: ['NVDA', 'AMD'],
          received_at: '2026-03-13T10:30:00.000Z',
        },
        {
          id: expect.any(String),
          title: 'Older filing',
          summary: 'Older filing body',
          severity: 'MEDIUM',
          tickers: ['AAPL'],
          received_at: '2026-03-13T08:00:00.000Z',
        },
      ],
    });
  });

  it('applies the limit query parameter', async () => {
    await seedScannerEvent({
      source: 'reddit',
      title: 'Post 1',
      receivedAt: '2026-03-13T08:00:00.000Z',
    });
    await seedScannerEvent({
      source: 'reddit',
      title: 'Post 2',
      receivedAt: '2026-03-13T09:00:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/scanners/reddit/events?limit=1',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().count).toBe(1);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].title).toBe('Post 2');
  });

  it('defaults to 10 events when no limit is provided', async () => {
    for (let index = 0; index < 12; index++) {
      await seedScannerEvent({
        source: 'breaking-news',
        title: `Headline ${index + 1}`,
        receivedAt: `2026-03-13T${String(index).padStart(2, '0')}:00:00.000Z`,
      });
    }

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/scanners/breaking-news/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().count).toBe(10);
    expect(response.json().events[0].title).toBe('Headline 12');
    expect(response.json().events.at(-1).title).toBe('Headline 3');
  });

  it('returns an empty list when the scanner has produced no events', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/scanners/nonexistent/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scanner: 'nonexistent',
      count: 0,
      events: [],
    });
  });

  it('returns 503 when the database is not configured', async () => {
    const noDbCtx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await noDbCtx.server.ready();

    const response = await noDbCtx.server.inject({
      method: 'GET',
      url: '/api/v1/scanners/sec-edgar/events',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Database not configured' });

    await safeCloseServer(noDbCtx.server);
  });
});
