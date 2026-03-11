import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RawEvent, ClassificationPrediction, ClassificationOutcome } from '@event-radar/shared';
import { storeEvent } from '../db/event-store.js';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import { DirectionAnalyticsService } from '../services/direction-analytics.js';
import { registerAccuracyRoutes } from '../routes/accuracy.js';
import {
  createTestDb,
  cleanTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'direction-test-key';

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
    priceChangePercent1h: 1.5,
    priceChangePercent1d: 3.8,
    priceChangePercent1w: 4.1,
    evaluatedAt: '2026-03-12T12:00:00.000Z',
    ...overrides,
  };
}

describe('DirectionAnalyticsService', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });

  afterAll(async () => {
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('returns zeroed metrics for empty data', async () => {
    const service = new DirectionAnalyticsService(db);
    const breakdown = await service.getDirectionBreakdown();

    expect(breakdown.horizons['1h'].total).toBe(0);
    expect(breakdown.horizons['1d'].total).toBe(0);
    expect(breakdown.horizons['1w'].total).toBe(0);
    expect(breakdown.horizons['1d'].accuracy).toBe(0);
  });

  it('computes T+1d direction breakdown with TP', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await accuracy.recordPrediction(eventId, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eventId, makeOutcome({
      priceChangePercent1h: 0.5,  // neutral (< 1%)
      priceChangePercent1d: 3.8,  // bullish (> 1%)
      priceChangePercent1w: 4.1,  // bullish (> 1%)
    }));

    const breakdown = await service.getDirectionBreakdown();

    // T+1h: 0.5% is neutral, so bullish prediction vs neutral outcome → excluded
    expect(breakdown.horizons['1h'].total).toBe(0);

    // T+1d: bullish predicted, +3.8% actual → TP
    expect(breakdown.horizons['1d'].total).toBe(1);
    expect(breakdown.horizons['1d'].tp).toBe(1);
    expect(breakdown.horizons['1d'].accuracy).toBe(1);

    // T+1w: bullish predicted, +4.1% actual → TP
    expect(breakdown.horizons['1w'].total).toBe(1);
    expect(breakdown.horizons['1w'].tp).toBe(1);
  });

  it('produces different results for T+1h vs T+1d', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await accuracy.recordPrediction(eventId, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eventId, makeOutcome({
      priceChangePercent1h: -2.0,  // bearish
      priceChangePercent1d: 3.0,   // bullish
      priceChangePercent1w: 5.0,   // bullish
    }));

    const breakdown = await service.getDirectionBreakdown();

    // T+1h: bullish predicted, bearish actual → FP
    expect(breakdown.horizons['1h'].fp).toBe(1);
    expect(breakdown.horizons['1h'].accuracy).toBe(0);

    // T+1d: bullish predicted, bullish actual → TP
    expect(breakdown.horizons['1d'].tp).toBe(1);
    expect(breakdown.horizons['1d'].accuracy).toBe(1);
  });

  it('computes F1 score correctly', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    // TP: bullish predicted, bullish actual
    const e1 = await storeEvent(db, { event: makeRawEvent({ source: 's1' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e1, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e1, makeOutcome({ priceChangePercent1d: 5.0 }));

    // FP: bullish predicted, bearish actual
    const e2 = await storeEvent(db, { event: makeRawEvent({ source: 's2' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e2, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e2, makeOutcome({ priceChangePercent1d: -5.0 }));

    const breakdown = await service.getDirectionBreakdown();
    const m = breakdown.horizons['1d'];

    expect(m.precision).toBe(0.5); // 1 TP / (1 TP + 1 FP)
    expect(m.recall).toBe(1);      // 1 TP / (1 TP + 0 FN)
    expect(m.f1).toBeCloseTo(2 / 3, 5); // 2 * 0.5 * 1 / (0.5 + 1)
  });

  it('handles threshold boundary (+1% exactly = neutral)', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await accuracy.recordPrediction(eventId, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eventId, makeOutcome({
      priceChangePercent1h: 1.0,   // exactly 1% = neutral (not > 1%)
      priceChangePercent1d: 1.0,
      priceChangePercent1w: 1.0,
    }));

    const breakdown = await service.getDirectionBreakdown();

    // 1% exactly is neutral, so bullish vs neutral is excluded from binary metrics
    expect(breakdown.horizons['1d'].total).toBe(0);
  });

  it('computes confidence calibration buckets', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    // High confidence correct prediction
    const e1 = await storeEvent(db, { event: makeRawEvent({ source: 's1' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e1, makePrediction({ confidence: 0.9, predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e1, makeOutcome({ priceChangePercent1d: 5.0 }));

    // High confidence wrong prediction
    const e2 = await storeEvent(db, { event: makeRawEvent({ source: 's2' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e2, makePrediction({ confidence: 0.85, predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e2, makeOutcome({ priceChangePercent1d: -5.0 }));

    const calibration = await service.getConfidenceCalibration();

    expect(calibration).toHaveLength(5);
    const highBucket = calibration.find((b) => b.bucket === '0.8-1.0');
    expect(highBucket).toBeDefined();
    expect(highBucket!.count).toBe(2);
    expect(highBucket!.avgConfidence).toBeCloseTo(0.875, 3);
    expect(highBucket!.actualAccuracy).toBe(0.5); // 1 correct out of 2
  });

  it('returns empty calibration buckets when no data', async () => {
    const service = new DirectionAnalyticsService(db);
    const calibration = await service.getConfidenceCalibration();

    expect(calibration).toHaveLength(5);
    for (const bucket of calibration) {
      expect(bucket.count).toBe(0);
      expect(bucket.avgConfidence).toBe(0);
      expect(bucket.actualAccuracy).toBe(0);
    }
  });

  it('sorts mispredictions by |confidence - bucket_accuracy| not raw confidence', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    // Setup: 3 correct predictions in 0.8-1.0 bucket to make bucket accuracy high (75%)
    for (let i = 0; i < 3; i++) {
      const eid = await storeEvent(db, { event: makeRawEvent({ source: `correct-hi-${i}` }), severity: 'HIGH' });
      await accuracy.recordPrediction(eid, makePrediction({ confidence: 0.85, predictedDirection: 'bullish' }));
      await accuracy.recordOutcome(eid, makeOutcome({ priceChangePercent1d: 5.0 })); // correct
    }

    // Misprediction A: confidence=0.9, bucket 0.8-1.0 (bucket accuracy = 3/4 = 0.75)
    // calibration delta = |0.9 - 0.75| = 0.15
    const eA = await storeEvent(db, { event: makeRawEvent({ source: 'misA', title: 'Mis A high conf' }), severity: 'HIGH' });
    await accuracy.recordPrediction(eA, makePrediction({ confidence: 0.9, predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eA, makeOutcome({ priceChangePercent1d: -5.0 })); // wrong

    // Misprediction B: confidence=0.55, bucket 0.4-0.6 (bucket accuracy = 0/1 = 0.0)
    // calibration delta = |0.55 - 0.0| = 0.55
    const eB = await storeEvent(db, { event: makeRawEvent({ source: 'misB', title: 'Mis B low conf' }), severity: 'HIGH' });
    await accuracy.recordPrediction(eB, makePrediction({ confidence: 0.55, predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eB, makeOutcome({ priceChangePercent1d: -3.0 })); // wrong

    const mispredictions = await service.getTopMispredictions({ limit: 10 });

    expect(mispredictions).toHaveLength(2);
    // By raw confidence: A (0.9) > B (0.55) — A would be first
    // By calibration delta: B (0.55) > A (0.15) — B should be first
    expect(mispredictions[0]!.title).toBe('Mis B low conf');
    expect(mispredictions[1]!.title).toBe('Mis A high conf');
  });

  it('respects mispredictions limit', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    for (let i = 0; i < 5; i++) {
      const eventId = await storeEvent(db, {
        event: makeRawEvent({ source: `s${i}` }),
        severity: 'HIGH',
      });
      await accuracy.recordPrediction(eventId, makePrediction({
        confidence: 0.8 + i * 0.01,
        predictedDirection: 'bullish',
      }));
      await accuracy.recordOutcome(eventId, makeOutcome({ priceChangePercent1d: -5.0 }));
    }

    const mispredictions = await service.getTopMispredictions({ limit: 3 });
    expect(mispredictions).toHaveLength(3);
  });

  it('filters direction breakdown by period', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new DirectionAnalyticsService(db);

    // Old event
    const e1 = await storeEvent(db, { event: makeRawEvent({ source: 's1' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e1, makePrediction({
      predictedDirection: 'bullish',
      classifiedAt: '2025-01-01T12:00:00.000Z',
    }));
    await accuracy.recordOutcome(e1, makeOutcome({
      priceChangePercent1d: 5.0,
      evaluatedAt: '2025-01-02T12:00:00.000Z',
    }));

    // Recent event
    const e2 = await storeEvent(db, { event: makeRawEvent({ source: 's2' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e2, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e2, makeOutcome({ priceChangePercent1d: 5.0 }));

    const breakdown = await service.getDirectionBreakdown({ period: '30d' });
    expect(breakdown.period).toBe('30d');
    expect(breakdown.horizons['1d'].total).toBe(1); // only recent
  });
});

describe('Direction analytics API', () => {
  let db: Database;
  let client: PGlite;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    apiServer = Fastify({ logger: false });
    registerAccuracyRoutes(apiServer, db, { apiKey: TEST_API_KEY });
    await apiServer.ready();
  }, 20000);

  afterAll(async () => {
    await safeCloseServer(apiServer);
    await safeClose(client);
  }, 20000);

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('requires API key for direction endpoint', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/accuracy/direction',
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns direction breakdown from API', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    await accuracy.recordPrediction(eventId, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(eventId, makeOutcome({ priceChangePercent1d: 5.0 }));

    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/accuracy/direction?period=30d',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.period).toBe('30d');
    expect(body.horizons['1d'].tp).toBe(1);
  });

  it('returns calibration data from API', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/accuracy/calibration',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(5);
  });

  it('returns mispredictions from API', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/accuracy/mispredictions?limit=10',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
