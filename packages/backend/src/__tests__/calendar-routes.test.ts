import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';
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
    title: 'Default earnings headline',
    body: 'Default earnings summary',
    timestamp: new Date('2026-03-24T20:00:00.000Z'),
      metadata: {
        ticker: 'AAPL',
        tickers: ['AAPL'],
        eventType: '8-K 2.02',
        report_date: '2026-03-24',
      },
    ...overrides,
  };
}

async function seedEvent(
  db: Database,
  input: {
    title: string;
    timestamp: string;
    source?: string;
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    ticker?: string;
    eventType?: string;
    body?: string;
    metadata?: Record<string, unknown>;
    outcomeT5?: number | null;
  },
): Promise<string> {
  const ticker = input.ticker ?? 'AAPL';
  const eventId = await storeEvent(db, {
    event: makeEvent({
      source: input.source ?? 'sec-edgar',
      title: input.title,
      body: input.body ?? `${input.title} summary`,
      timestamp: new Date(input.timestamp),
      metadata: {
        ticker,
        tickers: [ticker],
        eventType: input.eventType ?? '8-K 2.02',
        report_date: input.timestamp.slice(0, 10),
        ...input.metadata,
      },
    }),
    severity: input.severity ?? 'HIGH',
    ticker,
    eventType: input.eventType ?? '8-K 2.02',
  });

  if (input.outcomeT5 != null) {
    await sharedDb.insert(schema.eventOutcomes).values({
      eventId,
      ticker,
      eventTime: new Date(input.timestamp),
      changeT5: String(input.outcomeT5),
    });
  }

  return eventId;
}

describe('calendar routes', () => {
  let ctx: AppContext;
  let prevAuthRequired: string | undefined;
  let prevJwtSecret: string | undefined;
  let prevEarningsEnabled: string | undefined;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);

    prevAuthRequired = process.env.AUTH_REQUIRED;
    prevJwtSecret = process.env.JWT_SECRET;
    prevEarningsEnabled = process.env.EARNINGS_ENABLED;

    process.env.AUTH_REQUIRED = 'false';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.EARNINGS_ENABLED = 'false';

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

    process.env.AUTH_REQUIRED = prevAuthRequired;
    process.env.JWT_SECRET = prevJwtSecret;
    process.env.EARNINGS_ENABLED = prevEarningsEnabled;
  });

  it('allows unauthenticated access to the upcoming calendar route when auth is required', async () => {
    await safeCloseServer(ctx.server);

    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';

    const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await authCtx.server.ready();

    try {
      const response = await authCtx.server.inject({
        method: 'GET',
        url: '/api/v1/calendar/upcoming',
      });

      expect(response.statusCode).toBe(200);
    } finally {
      await safeCloseServer(authCtx.server);
      process.env.AUTH_REQUIRED = 'false';
      ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await ctx.server.ready();
    }
  });

  it('returns earnings events with outcomes and average historical move', async () => {
    const currentEventId = await seedEvent(sharedDb, {
      title: 'Apple Q2 earnings scheduled after close',
      timestamp: '2026-03-25T20:00:00.000Z',
      ticker: 'AAPL',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      metadata: {
        report_date: '2026-03-25',
        report_time: 'After Hours',
      },
    });

    await seedEvent(sharedDb, {
      title: 'Apple Q1 earnings beat expectations',
      timestamp: '2025-12-18T21:00:00.000Z',
      ticker: 'AAPL',
      source: 'sec-edgar',
      outcomeT5: 0.08,
    });

    await seedEvent(sharedDb, {
      title: 'Apple quarterly results mixed on margins',
      timestamp: '2025-09-17T20:00:00.000Z',
      ticker: 'AAPL',
      source: 'sec-edgar',
      outcomeT5: -0.06,
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/earnings?from=2026-03-24&to=2026-03-28',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      earningsDataLimited: true,
      events: [
        expect.objectContaining({
          eventId: currentEventId,
          ticker: 'AAPL',
          source: 'sec-edgar',
          title: 'Apple Q2 earnings scheduled after close',
          severity: 'CRITICAL',
          reportDate: '2026-03-25',
          outcomeT5: null,
          historicalAvgMove: 7,
        }),
      ],
    });
  });

  it('filters earnings results by comma-separated tickers', async () => {
    await seedEvent(sharedDb, {
      title: 'Apple earnings scheduled after close',
      timestamp: '2026-03-25T20:00:00.000Z',
      ticker: 'AAPL',
      source: 'sec-edgar',
    });
    await seedEvent(sharedDb, {
      title: 'NVIDIA earnings preview',
      timestamp: '2026-03-26T20:00:00.000Z',
      ticker: 'NVDA',
      source: 'earnings',
      eventType: 'earnings-upcoming',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/earnings?from=2026-03-24&to=2026-03-28&tickers=nvda',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0]).toMatchObject({
      ticker: 'NVDA',
    });
  });

  it('includes allowlisted earnings sources and excludes unrelated filings', async () => {
    await seedEvent(sharedDb, {
      title: 'Tesla quarterly results scheduled for after the bell',
      timestamp: '2026-03-27T20:00:00.000Z',
      ticker: 'TSLA',
      source: 'earnings',
      eventType: 'press-release',
    });
    await seedEvent(sharedDb, {
      title: 'Apple files shelf registration statement',
      timestamp: '2026-03-27T15:00:00.000Z',
      ticker: 'AAPL',
      source: 'sec-edgar',
      eventType: 'S-3',
      body: 'Capital markets filing',
      metadata: {
        report_date: '2026-03-27',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/earnings?from=2026-03-24&to=2026-03-28',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events.map((event: { ticker: string }) => event.ticker)).toContain('TSLA');
    expect(response.json().events.map((event: { title: string }) => event.title)).not.toContain(
      'Apple files shelf registration statement',
    );
  });

  it('filters non-time-bound social and news sources out of both calendar endpoints', async () => {
    await seedEvent(sharedDb, {
      title: 'NVIDIA earnings after the close',
      timestamp: '2026-03-24T20:00:00.000Z',
      ticker: 'NVDA',
      source: 'sec-edgar',
      metadata: {
        report_date: '2026-03-24',
        report_time: 'After Hours',
      },
    });

    for (const source of ['stocktwits', 'reddit', 'truth-social', 'breaking-news']) {
      await seedEvent(sharedDb, {
        title: `${source} revenue chatter says earnings are next`,
        timestamp: '2026-03-24T12:00:00.000Z',
        ticker: 'NVDA',
        source,
        eventType: 'social-post',
        metadata: {
          report_date: '2026-03-24',
          report_time: 'Any Time',
        },
      });
    }

    const earningsResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/earnings?from=2026-03-24&to=2026-03-28',
    });
    const upcomingResponse = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-28',
    });

    expect(earningsResponse.statusCode).toBe(200);
    expect(upcomingResponse.statusCode).toBe(200);

    const earningsTitles = earningsResponse.json().events.map((event: { title: string }) => event.title);
    const upcomingTitles = upcomingResponse.json().dates.flatMap(
      (entry: { events: Array<{ title: string }> }) => entry.events.map((event) => event.title),
    );

    expect(earningsTitles).toContain('NVIDIA earnings after the close');
    expect(upcomingTitles).toContain('NVIDIA earnings after the close');

    for (const title of [
      'stocktwits revenue chatter says earnings are next',
      'reddit revenue chatter says earnings are next',
      'truth-social revenue chatter says earnings are next',
      'breaking-news revenue chatter says earnings are next',
    ]) {
      expect(earningsTitles).not.toContain(title);
      expect(upcomingTitles).not.toContain(title);
    }
  });

  it('groups upcoming events by date across earnings, economic releases, and active halts', async () => {
    const nvdaEventId = await seedEvent(sharedDb, {
      title: 'NVIDIA earnings after the close',
      timestamp: '2026-03-24T20:00:00.000Z',
      ticker: 'NVDA',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      metadata: {
        report_date: '2026-03-24',
        report_time: 'After Hours',
      },
    });

    await seedEvent(sharedDb, {
      title: 'Robinhood trading HALTED — News Pending',
      timestamp: '2026-03-24T14:35:00.000Z',
      ticker: 'HOOD',
      source: 'trading-halt',
      severity: 'HIGH',
      eventType: 'halt',
      metadata: {
        dedupKey: 'HOOD|03/24/2026 10:35:00|T1',
        haltTime: '10:35 AM ET',
        haltReasonCode: 'T1',
        haltReasonDescription: 'News Pending',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-30',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      earningsDataLimited: true,
      dates: expect.arrayContaining([
        expect.objectContaining({
          date: '2026-03-24',
          events: expect.arrayContaining([
            expect.objectContaining({
              eventId: nvdaEventId,
              ticker: 'NVDA',
              source: 'sec-edgar',
              title: 'NVIDIA earnings after the close',
            }),
            expect.objectContaining({
              ticker: 'HOOD',
              source: 'trading-halt',
            }),
          ]),
        }),
        expect.objectContaining({
          date: '2026-03-26',
          events: expect.arrayContaining([
            expect.objectContaining({
              source: 'econ-calendar',
              title: 'Gross Domestic Product (GDP)',
            }),
            expect.objectContaining({
              source: 'econ-calendar',
              title: 'Initial Jobless Claims',
            }),
          ]),
        }),
      ]),
    });
  });

  it('omits halted tickers that already have a matching resume event', async () => {
    await seedEvent(sharedDb, {
      title: 'Widget Holdings trading HALTED — News Dissemination',
      timestamp: '2026-03-24T15:15:00.000Z',
      ticker: 'WXYZ',
      source: 'trading-halt',
      severity: 'HIGH',
      eventType: 'halt',
      metadata: {
        dedupKey: 'WXYZ|03/24/2026 11:15:00|T2',
        haltTime: '11:15 AM ET',
        haltReasonCode: 'T2',
        haltReasonDescription: 'News Dissemination',
      },
    });
    await seedEvent(sharedDb, {
      title: 'Widget Holdings trading RESUMED',
      timestamp: '2026-03-24T15:50:00.000Z',
      ticker: 'WXYZ',
      source: 'trading-halt',
      severity: 'HIGH',
      eventType: 'resume',
      metadata: {
        dedupKey: 'WXYZ|03/24/2026 11:15:00|T2',
        resumeTime: '11:50 AM ET',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-30',
    });

    expect(response.statusCode).toBe(200);
    const allEvents = response.json().dates.flatMap(
      (entry: { events: Array<{ ticker?: string; source: string }> }) => entry.events,
    );
    expect(allEvents.some((event: { ticker?: string; source: string }) =>
      event.source === 'trading-halt' && event.ticker === 'WXYZ')).toBe(false);
  });

  it('reports full earnings coverage when the dedicated scanner is enabled', async () => {
    process.env.EARNINGS_ENABLED = 'true';

    await safeCloseServer(ctx.server);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/calendar/upcoming?from=2026-03-24&to=2026-03-30',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().earningsDataLimited).toBe(false);
  });
});
