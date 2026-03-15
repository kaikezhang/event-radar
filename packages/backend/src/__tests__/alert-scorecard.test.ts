import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { registerAlertScorecardRoutes } from '../routes/alert-scorecard.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'alert-scorecard-test-api-key';

let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
});

afterAll(async () => {
  await safeClose(sharedClient);
});

function makeRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Default scorecard event',
    body: 'Default event summary',
    timestamp: new Date('2026-03-10T14:30:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      direction: 'bullish',
      llm_enrichment: {
        summary: 'AI summary',
        impact: 'AI impact',
        whyNow: 'Why now',
        currentSetup: 'Current setup',
        historicalContext: 'Historical context',
        risks: 'Risks',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      },
    },
    ...overrides,
  };
}

async function seedScorecardEvent(input?: {
  event?: Partial<RawEvent>;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  prediction?: {
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    direction?: 'bullish' | 'bearish' | 'neutral';
    confidence?: number;
    classifiedBy?: 'rule-engine' | 'llm' | 'hybrid';
    classifiedAt?: string;
  } | null;
  outcome?: {
    ticker?: string;
    eventTime?: string;
    eventPrice?: number | null;
    priceT5?: number | null;
    changeT5?: number | null;
    evaluatedT5At?: string | null;
    priceT20?: number | null;
    changeT20?: number | null;
    evaluatedT20At?: string | null;
  } | null;
}): Promise<string> {
  const rawEvent = makeRawEvent(input?.event);
  const eventId = await storeEvent(sharedDb, {
    event: rawEvent,
    severity: input?.severity ?? 'HIGH',
  });

  await sharedDb.execute(sql`
    UPDATE events
    SET
      created_at = ${rawEvent.timestamp},
      received_at = ${rawEvent.timestamp}
    WHERE id = ${eventId}
  `);

  if (input?.prediction !== null) {
    const prediction = input?.prediction ?? {};
    await sharedDb.execute(sql`
      INSERT INTO classification_predictions (
        event_id,
        predicted_severity,
        predicted_direction,
        confidence,
        classified_by,
        classified_at
      ) VALUES (
        ${eventId},
        ${prediction.severity ?? 'HIGH'},
        ${prediction.direction ?? 'bullish'},
        ${String(prediction.confidence ?? 0.82)},
        ${prediction.classifiedBy ?? 'hybrid'},
        ${new Date(prediction.classifiedAt ?? '2026-03-10T14:31:00.000Z')}
      )
    `);
  }

  if (input?.outcome !== null) {
    const outcome = input?.outcome ?? {};
    await sharedDb.execute(sql`
      INSERT INTO event_outcomes (
        event_id,
        ticker,
        event_time,
        event_price,
        price_t5,
        change_t5,
        evaluated_t5_at,
        price_t20,
        change_t20,
        evaluated_t20_at
      ) VALUES (
        ${eventId},
        ${outcome.ticker ?? 'AAPL'},
        ${new Date(outcome.eventTime ?? '2026-03-10T14:30:00.000Z')},
        ${outcome.eventPrice != null ? String(outcome.eventPrice) : null},
        ${outcome.priceT5 != null ? String(outcome.priceT5) : null},
        ${outcome.changeT5 != null ? String(outcome.changeT5) : null},
        ${outcome.evaluatedT5At ? new Date(outcome.evaluatedT5At) : null},
        ${outcome.priceT20 != null ? String(outcome.priceT20) : null},
        ${outcome.changeT20 != null ? String(outcome.changeT20) : null},
        ${outcome.evaluatedT20At ? new Date(outcome.evaluatedT20At) : null}
      )
    `);
  }

  return eventId;
}

describe('alert scorecard route', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns 401 without an api key', async () => {
    const eventId = await seedScorecardEvent();
    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
    });

    expect(response.statusCode).toBe(401);
    await safeCloseServer(server);
  });

  it('builds a bullish scorecard as correct and worked from T+20 data', async () => {
    const eventId = await seedScorecardEvent({
      outcome: {
        eventPrice: 100,
        priceT5: 108,
        changeT5: 8,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
        priceT20: 117.5,
        changeT20: 17.5,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventId,
      title: 'Default scorecard event',
      ticker: 'AAPL',
      source: 'sec-edgar',
      originalAlert: {
        actionLabel: '🔴 High-Quality Setup',
        direction: 'bullish',
        confidence: 0.82,
        confidenceBucket: 'high',
      },
      outcome: {
        entryPrice: 100,
        tPlus5: {
          price: 108,
          movePercent: 8,
        },
        tPlus20: {
          price: 117.5,
          movePercent: 17.5,
        },
        directionVerdict: 'correct',
        setupVerdict: 'worked',
      },
      notes: {
        verdictWindow: 'T+20',
      },
    });
  });

  it('falls back to T+5 when T+20 data is missing', async () => {
    const eventId = await seedScorecardEvent({
      prediction: {
        direction: 'bearish',
        confidence: 0.61,
      },
      outcome: {
        eventPrice: 50,
        priceT5: 44,
        changeT5: -12,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
        priceT20: null,
        changeT20: null,
        evaluatedT20At: null,
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventId,
      originalAlert: {
        direction: 'bearish',
        confidenceBucket: 'medium',
      },
      outcome: {
        directionVerdict: 'correct',
        setupVerdict: 'worked',
        tPlus5: {
          movePercent: -12,
        },
        tPlus20: {
          movePercent: null,
        },
      },
      notes: {
        verdictWindow: 'T+5',
      },
    });
  });

  it('marks a bullish call as incorrect when the selected outcome window is negative', async () => {
    const eventId = await seedScorecardEvent({
      outcome: {
        eventPrice: 100,
        priceT5: 95,
        changeT5: -5,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
        priceT20: 93,
        changeT20: -7,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      outcome: {
        directionVerdict: 'incorrect',
        setupVerdict: 'failed',
      },
      notes: {
        verdictWindow: 'T+20',
      },
    });
  });

  it('returns unclear and insufficient-data when both T+5 and T+20 changes are missing', async () => {
    const eventId = await seedScorecardEvent({
      outcome: {
        eventPrice: 100,
        priceT5: null,
        changeT5: null,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
        priceT20: null,
        changeT20: null,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      outcome: {
        directionVerdict: 'unclear',
        setupVerdict: 'insufficient-data',
      },
      notes: {
        verdictWindow: null,
      },
    });
  });

  it('returns unclear and insufficient-data for neutral predictions', async () => {
    const eventId = await seedScorecardEvent({
      prediction: {
        direction: 'neutral',
        confidence: 0.4,
      },
      outcome: {
        eventPrice: 100,
        priceT5: 104,
        changeT5: 4,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalAlert: {
        direction: 'neutral',
        confidenceBucket: 'low',
      },
      outcome: {
        directionVerdict: 'unclear',
        setupVerdict: 'insufficient-data',
      },
    });
  });

  it('falls back to metadata direction when no prediction row exists', async () => {
    const eventId = await seedScorecardEvent({
      prediction: null,
      event: {
        metadata: {
          ticker: 'TSLA',
          direction: 'bearish',
        },
      },
      outcome: {
        ticker: 'TSLA',
        eventPrice: 200,
        priceT5: 190,
        changeT5: -5,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ticker: 'TSLA',
      originalAlert: {
        direction: 'bearish',
        confidence: null,
        confidenceBucket: null,
      },
      outcome: {
        directionVerdict: 'correct',
      },
    });
  });

  it('prefers AI thesis fields over the stored event summary when available', async () => {
    const eventId = await seedScorecardEvent({
      event: {
        body: 'Stored event summary',
      },
      outcome: {
        eventPrice: 100,
        priceT5: 101,
        changeT5: 1,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalAlert: {
        summary: 'AI summary',
        thesis: {
          impact: 'AI impact',
          whyNow: 'Why now',
          currentSetup: 'Current setup',
          historicalContext: 'Historical context',
          risks: 'Risks',
        },
      },
    });
  });

  it('falls back to the stored event summary when AI summary fields are absent', async () => {
    const eventId = await seedScorecardEvent({
      event: {
        body: 'Stored event summary',
        metadata: {
          ticker: 'AAPL',
        },
      },
      outcome: {
        eventPrice: 100,
        priceT5: 103,
        changeT5: 3,
        evaluatedT5At: '2026-03-15T14:30:00.000Z',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      originalAlert: {
        summary: 'Stored event summary',
        thesis: {
          impact: null,
          whyNow: null,
          currentSetup: null,
          historicalContext: null,
          risks: null,
        },
      },
    });
  });

  it('returns an event scorecard even when no outcome row exists yet', async () => {
    const eventId = await seedScorecardEvent({
      outcome: null,
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventId,
      outcome: {
        entryPrice: null,
        tPlus5: {
          movePercent: null,
        },
        tPlus20: {
          movePercent: null,
        },
        directionVerdict: 'unclear',
        setupVerdict: 'insufficient-data',
      },
    });
  });

  it('uses the event timestamp when no tracked outcome timestamp exists', async () => {
    const eventId = await seedScorecardEvent({
      outcome: null,
      event: {
        timestamp: new Date('2026-03-09T09:15:00.000Z'),
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      eventTimestamp: '2026-03-09T09:15:00.000Z',
    });
  });

  it('returns 404 when the event does not exist', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/scorecards/${randomUUID()}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'Scorecard not found',
    });
  });
});
