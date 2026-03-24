import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { classificationOutcomes, eventOutcomes } from '../db/schema.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'impact-api-key';

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
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Default event',
    body: 'Default event body',
    timestamp: new Date('2026-03-01T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      direction: 'UP',
    },
    ...overrides,
  };
}

async function seedImpactFixture(db: Database): Promise<void> {
  const appleImpactId = await storeEvent(db, {
    event: makeEvent({
      title: 'Apple expands AI server capacity',
      timestamp: new Date('2026-03-01T14:00:00.000Z'),
      metadata: {
        ticker: 'AAPL',
        direction: 'UP',
      },
    }),
    severity: 'CRITICAL',
  });

  await db.insert(classificationOutcomes).values({
    eventId: appleImpactId,
    actualDirection: 'bullish',
    priceChange1h: '1.2500',
    priceChange1d: '3.5000',
    priceChange1w: '5.7500',
    evaluatedAt: new Date('2026-03-08T14:00:00.000Z'),
  });

  await db.insert(eventOutcomes).values({
    eventId: appleImpactId,
    ticker: 'AAPL',
    eventTime: new Date('2026-03-01T14:00:00.000Z'),
    eventPrice: '212.45',
    price1h: '215.11',
    price1d: '219.88',
    price1w: '224.66',
    change1h: '1.2500',
    change1d: '3.5000',
    change1w: '5.7500',
  });

  const secondAppleImpactId = await storeEvent(db, {
    event: makeEvent({
      source: 'businesswire',
      type: 'Press Release',
      title: 'Apple supply chain note trims guidance',
      timestamp: new Date('2026-03-03T15:00:00.000Z'),
      metadata: {
        ticker: 'AAPL',
        direction: 'DOWN',
      },
    }),
    severity: 'HIGH',
  });

  await db.insert(classificationOutcomes).values({
    eventId: secondAppleImpactId,
    actualDirection: 'bearish',
    priceChange1h: '-0.5000',
    priceChange1d: '-2.2500',
    priceChange1w: '-1.7500',
    evaluatedAt: new Date('2026-03-10T15:00:00.000Z'),
  });

  await db.insert(eventOutcomes).values({
    eventId: secondAppleImpactId,
    ticker: 'AAPL',
    eventTime: new Date('2026-03-03T15:00:00.000Z'),
    eventPrice: '208.10',
    price1h: '207.06',
    price1d: '203.42',
    price1w: '204.46',
    change1h: '-0.5000',
    change1d: '-2.2500',
    change1w: '-1.7500',
  });

  const nvidiaImpactId = await storeEvent(db, {
    event: makeEvent({
      source: 'fed',
      type: 'Macro',
      title: 'Nvidia responds to policy commentary',
      timestamp: new Date('2026-03-04T16:00:00.000Z'),
      metadata: {
        ticker: 'NVDA',
        direction: 'UP',
      },
    }),
    severity: 'MEDIUM',
  });

  await db.insert(classificationOutcomes).values({
    eventId: nvidiaImpactId,
    actualDirection: 'neutral',
    priceChange1h: '0.1000',
    priceChange1d: '0.2500',
    priceChange1w: '1.1000',
    evaluatedAt: new Date('2026-03-11T16:00:00.000Z'),
  });

  await db.insert(eventOutcomes).values({
    eventId: nvidiaImpactId,
    ticker: 'NVDA',
    eventTime: new Date('2026-03-04T16:00:00.000Z'),
    eventPrice: '876.33',
    price1h: '877.20',
    price1d: '878.52',
    price1w: '885.97',
    change1h: '0.1000',
    change1d: '0.2500',
    change1w: '1.1000',
  });

  await storeEvent(db, {
    event: makeEvent({
      source: 'reddit',
      type: 'Social',
      title: 'Apple retail buzz without tracked outcome',
      timestamp: new Date('2026-03-05T17:00:00.000Z'),
      metadata: {
        ticker: 'AAPL',
        direction: 'UP',
      },
    }),
    severity: 'LOW',
  });
}

describe('event impact route', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await seedImpactFixture(sharedDb);

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

  it('rejects requests without an API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/v1/events/impact?ticker=AAPL',
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

  it('rejects requests with an invalid API key', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/v1/events/impact?ticker=AAPL',
          headers: {
            'x-api-key': 'wrong-key',
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({
          error: 'Unauthorized',
          message: 'Invalid API key',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('requires a ticker query parameter', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns impact events with price changes and event price', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=AAPL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        {
          eventId: expect.any(String),
          timestamp: '2026-03-03T15:00:00.000Z',
          ticker: 'AAPL',
          headline: 'Apple supply chain note trims guidance',
          severity: 'HIGH',
          direction: 'bearish',
          priceAtEvent: 208.1,
          priceChange1h: -0.5,
          priceChange1d: -2.25,
          priceChange1w: -1.75,
        },
        {
          eventId: expect.any(String),
          timestamp: '2026-03-01T14:00:00.000Z',
          ticker: 'AAPL',
          headline: 'Apple expands AI server capacity',
          severity: 'CRITICAL',
          direction: 'bullish',
          priceAtEvent: 212.45,
          priceChange1h: 1.25,
          priceChange1d: 3.5,
          priceChange1w: 5.75,
        },
      ],
    });
  });

  it('filters impact events by date range', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=AAPL&dateFrom=2026-03-02T00:00:00.000Z&dateTo=2026-03-04T23:59:59.999Z',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        expect.objectContaining({
          headline: 'Apple supply chain note trims guidance',
        }),
      ],
    });
  });

  it('filters impact events by severity', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=AAPL&severity=CRITICAL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        expect.objectContaining({
          headline: 'Apple expands AI server capacity',
          severity: 'CRITICAL',
        }),
      ],
    });
  });

  it('returns an empty array when no impact events match', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=MSFT',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ events: [] });
  });

  it('limits results to the requested ticker', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=NVDA',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        expect.objectContaining({
          ticker: 'NVDA',
          headline: 'Nvidia responds to policy commentary',
          direction: 'neutral',
        }),
      ],
    });
  });

  it('excludes events that do not have an impact outcome yet', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=AAPL',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .events
        .every((event: { headline: string }) => event.headline !== 'Apple retail buzz without tracked outcome'),
    ).toBe(true);
  });

  it('treats ticker filters case-insensitively', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=aapl',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(2);
  });

  it('rejects malformed ISO dates', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=AAPL&dateFrom=not-a-date',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('caps returned outcome percentages at +/-200 for StockTwits-style events', async () => {
    const eventId = await storeEvent(sharedDb, {
      event: makeEvent({
        source: 'stocktwits',
        type: 'Social',
        title: 'PEP sentiment squeeze on StockTwits',
        timestamp: new Date('2026-03-06T18:00:00.000Z'),
        metadata: {
          ticker: 'PEP',
          direction: 'UP',
        },
      }),
      severity: 'HIGH',
    });

    await sharedDb.insert(classificationOutcomes).values({
      eventId,
      actualDirection: 'bullish',
      priceChange1h: '448.8000',
      priceChange1d: '448.8000',
      priceChange1w: '-448.8000',
      evaluatedAt: new Date('2026-03-13T18:00:00.000Z'),
    });

    await sharedDb.insert(eventOutcomes).values({
      eventId,
      ticker: 'PEP',
      eventTime: new Date('2026-03-06T18:00:00.000Z'),
      eventPrice: '1',
      price1h: '5.488',
      price1d: '5.488',
      price1w: '-3.488',
      change1h: '200',
      change1d: '200',
      change1w: '-200',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/events/impact?ticker=PEP',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        expect.objectContaining({
          ticker: 'PEP',
          headline: 'PEP sentiment squeeze on StockTwits',
          priceChange1h: 200,
          priceChange1d: 200,
          priceChange1w: -200,
        }),
      ],
    });
  });
});
