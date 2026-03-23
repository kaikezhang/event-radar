import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { createTestDb, safeClose, safeCloseServer, cleanTestDb } from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';

const findSimilarEventsMock = vi.hoisted(() => vi.fn());

vi.mock('../services/event-similarity.js', () => ({
  findSimilarEvents: findSimilarEventsMock,
}));

const TEST_API_KEY = 'test-api-key-12345';

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

describe('GET /api/events/:id/similar', () => {
  let ctx: AppContext;
  let sourceId: string;
  let bestEventId: string;
  let worstEventId: string;
  let pendingEventId: string;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    findSimilarEventsMock.mockReset();

    sourceId = await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Source event',
        metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
        timestamp: new Date('2026-03-10T14:30:00.000Z'),
      }),
      severity: 'CRITICAL',
    });

    bestEventId = await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Prior breakout',
        metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
        timestamp: new Date('2026-02-15T14:30:00.000Z'),
      }),
      severity: 'HIGH',
    });

    worstEventId = await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Prior failed setup',
        metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
        timestamp: new Date('2026-03-01T14:30:00.000Z'),
      }),
      severity: 'HIGH',
    });

    pendingEventId = await storeEvent(sharedDb, {
      event: makeEvent({
        title: 'Pending reaction event',
        metadata: { ticker: 'AMD', tickers: ['AMD'] },
        timestamp: new Date('2026-03-05T14:30:00.000Z'),
      }),
      severity: 'MEDIUM',
    });

    await sharedDb.execute(sql`
      INSERT INTO event_outcomes (
        event_id,
        ticker,
        event_time,
        change_t5,
        event_price,
        price_t5
      ) VALUES
      (
        ${bestEventId},
        'NVDA',
        ${new Date('2026-02-15T14:30:00.000Z')},
        12.4,
        100,
        112.4
      ),
      (
        ${worstEventId},
        'TSLA',
        ${new Date('2026-03-01T14:30:00.000Z')},
        -8.1,
        100,
        91.9
      )
    `);

    findSimilarEventsMock.mockResolvedValue([
      {
        eventId: bestEventId,
        score: 0.91,
        tickerScore: 1,
        timeScore: 0.84,
        contentScore: 0.73,
        event: {
          id: bestEventId,
          title: 'Prior breakout',
          source: 'sec-edgar',
          receivedAt: new Date('2026-02-15T14:30:00.000Z'),
          metadata: { ticker: 'NVDA', tickers: ['NVDA'] },
          severity: 'HIGH',
        },
      },
      {
        eventId: worstEventId,
        score: 0.75,
        tickerScore: 0.4,
        timeScore: 0.72,
        contentScore: 0.65,
        event: {
          id: worstEventId,
          title: 'Prior failed setup',
          source: 'sec-edgar',
          receivedAt: new Date('2026-03-01T14:30:00.000Z'),
          metadata: { ticker: 'TSLA', tickers: ['TSLA'] },
          severity: 'HIGH',
        },
      },
      {
        eventId: pendingEventId,
        score: 0.68,
        tickerScore: 0.3,
        timeScore: 0.67,
        contentScore: 0.62,
        event: {
          id: pendingEventId,
          title: 'Pending reaction event',
          source: 'pr-newswire',
          receivedAt: new Date('2026-03-05T14:30:00.000Z'),
          metadata: { ticker: 'AMD', tickers: ['AMD'] },
          severity: 'MEDIUM',
        },
      },
    ]);

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns similar events with joined T+5 outcomes and aggregate stats', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${sourceId}/similar`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [
        expect.objectContaining({
          eventId: bestEventId,
          title: 'Prior breakout',
          ticker: 'NVDA',
          changeT5: 12.4,
        }),
        expect.objectContaining({
          eventId: worstEventId,
          title: 'Prior failed setup',
          ticker: 'TSLA',
          changeT5: -8.1,
        }),
        expect.objectContaining({
          eventId: pendingEventId,
          title: 'Pending reaction event',
          ticker: 'AMD',
          changeT5: null,
        }),
      ],
      outcomeStats: {
        totalWithOutcomes: 2,
        avgMoveT5: 2.2,
        setupWorkedPct: 50,
        bestOutcome: {
          ticker: 'NVDA',
          changeT5: 12.4,
          date: '2026-02-15',
        },
        worstOutcome: {
          ticker: 'TSLA',
          changeT5: -8.1,
          date: '2026-03-01',
        },
      },
    });
  });

  it('keeps events without outcomes but excludes them from aggregate calculations', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${sourceId}/similar`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events).toHaveLength(3);
    expect(body.events.find((event: { eventId: string; changeT5: number | null }) => event.eventId === pendingEventId))
      .toMatchObject({ changeT5: null });
    expect(body.outcomeStats.totalWithOutcomes).toBe(2);
  });

  it('passes query options through to the similarity service', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${sourceId}/similar?limit=7&timeWindow=120&minScore=0.65&sameTickerOnly=true`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(findSimilarEventsMock).toHaveBeenCalledWith(sharedDb, sourceId, {
      maxResults: 7,
      timeWindowMinutes: 120,
      minScore: 0.65,
      sameTickerOnly: true,
    });
  });

  it('returns 404 when the source event does not exist', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/events/${crypto.randomUUID()}/similar`,
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Event not found' });
  });
});
