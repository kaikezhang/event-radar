import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    title: 'Default headline',
    body: 'Default summary',
    timestamp: new Date('2026-03-01T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      direction: 'UP',
    },
    ...overrides,
  };
}

async function seedHistoryFixture(db: Database): Promise<void> {
  const fixture = [
    {
      source: 'sec-edgar',
      type: '8-K',
      title: 'Apple launches AI server program',
      timestamp: '2026-03-01T09:00:00.000Z',
      ticker: 'AAPL',
      severity: 'CRITICAL',
      direction: 'UP',
      sector: undefined,
    },
    {
      source: 'fed',
      type: 'Macro',
      title: 'Nvidia reacts to policy commentary',
      timestamp: '2026-03-02T10:00:00.000Z',
      ticker: 'NVDA',
      severity: 'HIGH',
      direction: 'UP',
      sector: undefined,
    },
    {
      source: 'businesswire',
      type: 'Press Release',
      title: 'Pfizer updates clinical timeline',
      timestamp: '2026-03-03T11:00:00.000Z',
      ticker: 'PFE',
      severity: 'MEDIUM',
      direction: 'NEUTRAL',
      sector: undefined,
    },
    {
      source: 'stocktwits',
      type: 'Social',
      title: 'Tesla delivery chatter cools',
      timestamp: '2026-03-04T12:00:00.000Z',
      ticker: 'TSLA',
      severity: 'LOW',
      direction: 'DOWN',
      sector: undefined,
    },
    {
      source: 'white-house',
      type: 'Policy',
      title: 'Exxon faces new energy review',
      timestamp: '2026-03-05T13:00:00.000Z',
      ticker: 'XOM',
      severity: 'HIGH',
      direction: 'DOWN',
      sector: undefined,
    },
    {
      source: 'doj',
      type: 'Enforcement',
      title: 'Custom industrial name with metadata fallback',
      timestamp: '2026-03-06T14:00:00.000Z',
      ticker: 'ZZZZ',
      severity: 'MEDIUM',
      direction: 'DOWN',
      sector: 'Industrials',
    },
  ] as const;

  for (const event of fixture) {
    await storeEvent(db, {
      event: makeEvent({
        source: event.source,
        type: event.type,
        title: event.title,
        body: `${event.title} summary`,
        timestamp: new Date(event.timestamp),
        metadata: {
          ticker: event.ticker,
          direction: event.direction,
          ...(event.sector ? { sector: event.sector } : {}),
        },
      }),
      severity: event.severity,
    });
  }
}

describe('events history routes', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await seedHistoryFixture(sharedDb);

    if (ctx) {
      await safeCloseServer(ctx.server);
    }

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterAll(async () => {
    if (ctx) {
      await safeCloseServer(ctx.server);
    }
  });

  it('returns 401 for history requests without an API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/v1/events/history',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          error: 'Unauthorized',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('returns paginated history rows with pagination metadata', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?page=2&pageSize=2',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        expect.objectContaining({
          ticker: 'TSLA',
          source: 'stocktwits',
          type: 'Social',
          severity: 'LOW',
          headline: 'Tesla delivery chatter cools',
        }),
        expect.objectContaining({
          ticker: 'PFE',
          source: 'businesswire',
          type: 'Press Release',
          severity: 'MEDIUM',
          headline: 'Pfizer updates clinical timeline',
        }),
      ],
      pagination: {
        page: 2,
        pageSize: 2,
        totalCount: 6,
        totalPages: 3,
      },
    });
  });

  it('filters history by date range', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?dateFrom=2026-03-02T00:00:00.000Z&dateTo=2026-03-04T23:59:59.999Z',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pagination.totalCount).toBe(3);
    expect(body.data.map((event: { ticker: string }) => event.ticker)).toEqual([
      'TSLA',
      'PFE',
      'NVDA',
    ]);
  });

  it('filters history by severity', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?severity=HIGH',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pagination.totalCount).toBe(2);
    expect(body.data.every((event: { severity: string }) => event.severity === 'HIGH')).toBe(true);
  });

  it('filters history by comma-separated tickers', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?ticker=nvda,tsla',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pagination.totalCount).toBe(2);
    expect(body.data.map((event: { ticker: string }) => event.ticker)).toEqual([
      'TSLA',
      'NVDA',
    ]);
  });

  it('returns empty results when nothing matches', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?source=sec-edgar&severity=LOW',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 0,
        totalPages: 0,
      },
    });
  });

  it('caps pageSize at 200', async () => {
    await cleanTestDb(sharedDb);

    for (let index = 0; index < 205; index += 1) {
      await storeEvent(sharedDb, {
        event: makeEvent({
          title: `Bulk event ${index + 1}`,
          timestamp: new Date(`2026-03-01T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
          metadata: {
            ticker: `T${String(index).padStart(4, '0')}`.slice(0, 5),
            direction: 'UP',
          },
        }),
        severity: 'MEDIUM',
      });
    }

    await safeCloseServer(ctx.server);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/history?pageSize=999',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(200);
    expect(body.pagination.pageSize).toBe(200);
    expect(body.pagination.totalCount).toBe(205);
  });

  it('returns 401 for sector aggregation without an API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/v1/events/sectors',
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

  it('returns sector aggregation with mapped and fallback sectors', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/sectors',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sectors: expect.arrayContaining([
        expect.objectContaining({
          sector: 'Technology',
          count: 2,
          criticalCount: 1,
          highCount: 1,
          tickers: expect.arrayContaining(['AAPL', 'NVDA']),
        }),
        expect.objectContaining({
          sector: 'Industrials',
          count: 1,
          criticalCount: 0,
          highCount: 0,
          tickers: ['ZZZZ'],
        }),
        expect.objectContaining({
          sector: 'Energy',
          count: 1,
          criticalCount: 0,
          highCount: 1,
          tickers: ['XOM'],
        }),
      ]),
    });
  });

  it('filters sector aggregation by severity and date range', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/sectors?severity=HIGH&dateFrom=2026-03-02T00:00:00.000Z&dateTo=2026-03-05T23:59:59.999Z',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sectors: expect.arrayContaining([
        {
          sector: 'Technology',
          count: 1,
          criticalCount: 0,
          highCount: 1,
          tickers: ['NVDA'],
        },
        {
          sector: 'Energy',
          count: 1,
          criticalCount: 0,
          highCount: 1,
          tickers: ['XOM'],
        },
      ]),
    });
  });
});
