import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  InMemoryEventBus,
  type RawEvent,
  type ClassificationPrediction,
  type ClassificationOutcome,
} from '@event-radar/shared';
import { sql } from 'drizzle-orm';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import { OutcomeTracker } from '../services/outcome-tracker.js';
import {
  createTestDb,
  cleanTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';
import { registerAccuracyRoutes } from '../routes/accuracy.js';

const TEST_API_KEY = 'accuracy-api-key';

function makeRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test event',
    body: 'Body',
    timestamp: new Date('2026-03-11T12:00:00.000Z'),
    metadata: { ticker: 'AAPL' },
    ...overrides,
  };
}

function makePrediction(
  overrides: Partial<ClassificationPrediction> = {},
): Omit<ClassificationPrediction, 'eventId'> {
  return {
    predictedSeverity: 'HIGH',
    predictedDirection: 'bullish',
    confidence: 0.82,
    classifiedBy: 'hybrid',
    classifiedAt: '2026-03-11T12:00:00.000Z',
    ...overrides,
  };
}

function makeOutcome(
  overrides: Partial<ClassificationOutcome> = {},
): Omit<ClassificationOutcome, 'eventId'> {
  return {
    actualDirection: 'bullish',
    priceChangePercent1h: 1.2,
    priceChangePercent1d: 3.8,
    priceChangePercent1w: 4.1,
    evaluatedAt: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

async function createAccuracyTables(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classification_predictions (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      predicted_severity VARCHAR(20) NOT NULL,
      predicted_direction VARCHAR(20) NOT NULL,
      confidence DECIMAL(5, 4) NOT NULL,
      classified_by VARCHAR(20) NOT NULL,
      classified_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classification_outcomes (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      actual_direction VARCHAR(20) NOT NULL,
      price_change_1h DECIMAL(10, 4) NOT NULL,
      price_change_1d DECIMAL(10, 4) NOT NULL,
      price_change_1w DECIMAL(10, 4) NOT NULL,
      evaluated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS event_outcomes (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      ticker VARCHAR(10) NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      event_price DECIMAL(10, 2),
      price_1h DECIMAL(10, 2),
      price_1d DECIMAL(10, 2),
      price_1w DECIMAL(10, 2),
      price_1m DECIMAL(10, 2),
      change_1h DECIMAL(10, 4),
      change_1d DECIMAL(10, 4),
      change_1w DECIMAL(10, 4),
      change_1m DECIMAL(10, 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

describe('ClassificationAccuracyService', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    await createAccuracyTables(db);
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('records predictions', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    await service.recordPrediction(eventId, makePrediction());

    const details = await service.getEventAccuracy(eventId);
    expect(details?.prediction?.predictedDirection).toBe('bullish');
    expect(details?.prediction?.classifiedBy).toBe('hybrid');
  });

  it('records outcomes', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    await service.recordOutcome(eventId, makeOutcome());

    const details = await service.getEventAccuracy(eventId);
    expect(details?.outcome?.actualDirection).toBe('bullish');
    expect(details?.outcome?.priceChangePercent1d).toBe(3.8);
  });

  it('evaluates bullish direction as a true positive', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await service.recordPrediction(eventId, makePrediction({ predictedDirection: 'bullish' }));
    await service.recordOutcome(eventId, makeOutcome({ actualDirection: 'bullish' }));

    const evaluation = await service.evaluateAccuracy(eventId);
    expect(evaluation?.directionCorrect).toBe(true);
  });

  it('evaluates bearish direction as a true negative', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await service.recordPrediction(
      eventId,
      makePrediction({ predictedDirection: 'bearish', predictedSeverity: 'MEDIUM' }),
    );
    await service.recordOutcome(
      eventId,
      makeOutcome({
        actualDirection: 'bearish',
        priceChangePercent1h: -0.8,
        priceChangePercent1d: -1.5,
        priceChangePercent1w: -2.1,
      }),
    );

    const stats = await service.getAccuracyStats();
    expect(stats.trueNegatives).toBe(1);
  });

  it('counts false positives and false negatives', async () => {
    const service = new ClassificationAccuracyService(db);
    const bullishEventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    const bearishEventId = await storeEvent(
      db,
      { event: makeRawEvent({ source: 'truth-social' }), severity: 'HIGH' },
    );

    await service.recordPrediction(
      bullishEventId,
      makePrediction({ predictedDirection: 'bullish', predictedSeverity: 'HIGH' }),
    );
    await service.recordOutcome(
      bullishEventId,
      makeOutcome({ actualDirection: 'bearish', priceChangePercent1d: -3.4 }),
    );

    await service.recordPrediction(
      bearishEventId,
      makePrediction({ predictedDirection: 'bearish', predictedSeverity: 'HIGH' }),
    );
    await service.recordOutcome(
      bearishEventId,
      makeOutcome({ actualDirection: 'bullish', priceChangePercent1d: 3.4 }),
    );

    const stats = await service.getAccuracyStats();
    expect(stats.falsePositives).toBe(1);
    expect(stats.falseNegatives).toBe(1);
  });

  it('computes severity accuracy from price move magnitude', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await service.recordPrediction(eventId, makePrediction({ predictedSeverity: 'CRITICAL' }));
    await service.recordOutcome(
      eventId,
      makeOutcome({
        priceChangePercent1h: 0.5,
        priceChangePercent1d: 2.4,
        priceChangePercent1w: 2.6,
      }),
    );

    const evaluation = await service.evaluateAccuracy(eventId);
    expect(evaluation?.severityCorrect).toBe(false);
  });

  it('returns zeroed stats for empty data', async () => {
    const service = new ClassificationAccuracyService(db);

    const stats = await service.getAccuracyStats();
    expect(stats.totalEvaluated).toBe(0);
    expect(stats.f1Score).toBe(0);
    expect(stats.bySource).toEqual({});
    expect(stats.byEventType).toEqual({});
  });

  it('groups accuracy by source', async () => {
    const service = new ClassificationAccuracyService(db);
    const firstId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar' }),
      severity: 'HIGH',
    });
    const secondId = await storeEvent(db, {
      event: makeRawEvent({ source: 'reddit' }),
      severity: 'LOW',
    });

    await service.recordPrediction(firstId, makePrediction({ predictedSeverity: 'HIGH' }));
    await service.recordOutcome(firstId, makeOutcome({ actualDirection: 'bullish' }));
    await service.recordPrediction(secondId, makePrediction({ predictedSeverity: 'LOW' }));
    await service.recordOutcome(
      secondId,
      makeOutcome({
        actualDirection: 'bearish',
        priceChangePercent1h: -0.4,
        priceChangePercent1d: -0.7,
        priceChangePercent1w: -0.8,
      }),
    );

    const stats = await service.getAccuracyStats({ groupBy: 'source' });
    expect(stats.bySource['sec-edgar']?.count).toBe(1);
    expect(stats.bySource['reddit']?.count).toBe(1);
  });

  it('groups accuracy by event type', async () => {
    const service = new ClassificationAccuracyService(db);
    const filingId = await storeEvent(db, {
      event: makeRawEvent({ type: '8-K' }),
      severity: 'HIGH',
    });
    const postId = await storeEvent(db, {
      event: makeRawEvent({ type: 'political-post', source: 'truth-social' }),
      severity: 'HIGH',
    });

    await service.recordPrediction(filingId, makePrediction({ predictedSeverity: 'HIGH' }));
    await service.recordOutcome(filingId, makeOutcome());
    await service.recordPrediction(postId, makePrediction({ predictedSeverity: 'HIGH' }));
    await service.recordOutcome(postId, makeOutcome({ actualDirection: 'bearish' }));

    const stats = await service.getAccuracyStats({ groupBy: 'eventType' });
    expect(stats.byEventType['8-K']?.count).toBe(1);
    expect(stats.byEventType['political-post']?.count).toBe(1);
  });

  it('filters stats by time window', async () => {
    const service = new ClassificationAccuracyService(db);
    const oldId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    const recentId = await storeEvent(
      db,
      { event: makeRawEvent({ source: 'fed' }), severity: 'HIGH' },
    );

    await service.recordPrediction(
      oldId,
      makePrediction({ classifiedAt: '2025-10-01T12:00:00.000Z' }),
    );
    await service.recordOutcome(
      oldId,
      makeOutcome({ evaluatedAt: '2025-10-02T12:00:00.000Z' }),
    );

    await service.recordPrediction(recentId, makePrediction());
    await service.recordOutcome(recentId, makeOutcome());

    const stats = await service.getAccuracyStats({ period: '30d' });
    expect(stats.totalEvaluated).toBe(1);
    expect(stats.period).toBe('30d');
  });

  it('computes confidence calibration', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await service.recordPrediction(eventId, makePrediction({ confidence: 0.9 }));
    await service.recordOutcome(eventId, makeOutcome({ actualDirection: 'bearish' }));

    const evaluation = await service.evaluateAccuracy(eventId);
    expect(evaluation?.confidenceCalibration).toBeCloseTo(0.1, 5);
  });

  it('computes F1 score', async () => {
    const service = new ClassificationAccuracyService(db);
    const ids = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        storeEvent(db, {
          event: makeRawEvent({ source: `source-${index}` }),
          severity: 'HIGH',
        }),
      ),
    );

    await service.recordPrediction(ids[0]!, makePrediction({ predictedDirection: 'bullish' }));
    await service.recordOutcome(ids[0]!, makeOutcome({ actualDirection: 'bullish' }));

    await service.recordPrediction(ids[1]!, makePrediction({ predictedDirection: 'bullish' }));
    await service.recordOutcome(ids[1]!, makeOutcome({ actualDirection: 'bearish' }));

    await service.recordPrediction(ids[2]!, makePrediction({ predictedDirection: 'bearish' }));
    await service.recordOutcome(ids[2]!, makeOutcome({ actualDirection: 'bullish' }));

    await service.recordPrediction(ids[3]!, makePrediction({ predictedDirection: 'bearish' }));
    await service.recordOutcome(ids[3]!, makeOutcome({ actualDirection: 'bearish' }));

    const stats = await service.getAccuracyStats();
    expect(stats.precision).toBeCloseTo(0.5, 5);
    expect(stats.recall).toBeCloseTo(0.5, 5);
    expect(stats.f1Score).toBeCloseTo(0.5, 5);
  });

  it('emits accuracy updates every 100 evaluated events', async () => {
    const eventBus = new InMemoryEventBus();
    const handler = vi.fn();
    eventBus.subscribeTopic('accuracy:updated', handler);

    const service = new ClassificationAccuracyService(db, { eventBus });

    for (let index = 0; index < 100; index++) {
      const eventId = await storeEvent(db, {
        event: makeRawEvent({ source: `source-${index}` }),
        severity: 'HIGH',
      });
      await service.recordPrediction(eventId, makePrediction());
      await service.recordOutcome(eventId, makeOutcome());
    }

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Classification accuracy API and pipeline integration', () => {
  let db: Database;
  let client: PGlite;
  let appCtx: AppContext;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    await createAccuracyTables(db);
    appCtx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
    apiServer = Fastify({ logger: false });
    registerAccuracyRoutes(apiServer, db);
    await apiServer.ready();
  }, 20000);

  afterAll(async () => {
    await safeCloseServer(apiServer);
    await safeCloseServer(appCtx.server);
    await safeClose(client);
  }, 20000);

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('records predictions automatically when an event is ingested', async () => {
    await appCtx.eventBus.publish(makeRawEvent());
    await new Promise((resolve) => setTimeout(resolve, 50));

    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM classification_predictions
    `);

    expect(Number(rows.rows[0]?.total ?? 0)).toBe(1);
  }, 10000);

  it('records outcomes from the outcome tracker and evaluates accuracy', async () => {
    const eventId = await storeEvent(db, {
      event: makeRawEvent(),
      severity: 'HIGH',
    });
    const service = new ClassificationAccuracyService(db);
    await service.recordPrediction(eventId, makePrediction());

    const tracker = new OutcomeTracker(db, {
      getPriceAt: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: 100 })
        .mockResolvedValueOnce({ ok: true, value: 103 })
        .mockResolvedValueOnce({ ok: true, value: 104 })
        .mockResolvedValueOnce({ ok: true, value: 105 })
        .mockResolvedValueOnce({ ok: true, value: 106 }),
    } as never, service);

    await tracker.scheduleOutcomeTrackingForEvent(
      eventId,
      makeRawEvent({
        timestamp: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      }),
    );
    await tracker.processOutcomes();

    const evaluation = await service.evaluateAccuracy(eventId);
    expect(evaluation).not.toBeNull();
  });

  it('returns accuracy stats from the API', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar', type: '8-K' }),
      severity: 'HIGH',
    });
    await service.recordPrediction(eventId, makePrediction());
    await service.recordOutcome(eventId, makeOutcome());

    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/accuracy/stats?period=30d&groupBy=source',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.totalEvaluated).toBe(1);
    expect(body.groups['sec-edgar'].count).toBe(1);
  }, 10000);

  it('returns prediction versus outcome for a single event', async () => {
    const service = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar', type: '8-K' }),
      severity: 'HIGH',
    });
    await service.recordPrediction(eventId, makePrediction());
    await service.recordOutcome(eventId, makeOutcome());

    const response = await apiServer.inject({
      method: 'GET',
      url: `/api/v1/accuracy/events/${eventId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.prediction.predictedSeverity).toBe('HIGH');
    expect(body.outcome.actualDirection).toBe('bullish');
    expect(body.evaluation.directionCorrect).toBe(true);
  }, 10000);
});
