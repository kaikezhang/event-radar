import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { InMemoryEventBus, type ClassificationOutcome, type ClassificationPrediction, type RawEvent } from '@event-radar/shared';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { buildApp, type AppContext } from '../app.js';
import { storeEvent } from '../db/event-store.js';
import { registerAdaptiveRoutes } from '../routes/adaptive.js';
import { AdaptiveClassifierService } from '../services/adaptive-classifier.js';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import { UserFeedbackService } from '../services/user-feedback.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'adaptive-test-key';

function makeRawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Adaptive classification test event',
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

async function seedEvaluatedEvents(
  db: Database,
  accuracyService: ClassificationAccuracyService,
  options: {
    count: number;
    source: string;
    prediction?: Partial<ClassificationPrediction>;
    outcome?: Partial<ClassificationOutcome>;
  },
): Promise<void> {
  for (let index = 0; index < options.count; index += 1) {
    const eventId = await storeEvent(db, {
      event: makeRawEvent({
        source: options.source,
        id: randomUUID(),
        title: `${options.source} event ${index}`,
      }),
      severity: 'HIGH',
    });

    await accuracyService.recordPrediction(eventId, makePrediction(options.prediction));
    await accuracyService.recordOutcome(eventId, makeOutcome(options.outcome));
  }
}

describe('AdaptiveClassifierService', () => {
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

  it('recalculates weights from source accuracy ratios', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const service = new AdaptiveClassifierService(db, {
      accuracyService,
    });

    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
    });
    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'reddit',
      prediction: {
        predictedSeverity: 'HIGH',
        predictedDirection: 'bullish',
      },
      outcome: {
        actualDirection: 'bearish',
        priceChangePercent1h: -0.2,
        priceChangePercent1d: -0.4,
        priceChangePercent1w: -0.6,
      },
    });

    const weights = await service.recalculateWeights();

    expect(weights.weights['sec-edgar']).toBe(2);
    expect(weights.weights.reddit).toBe(0.1);
    expect(weights.sampleSize).toBe(40);
  });

  it('keeps the default weight when the source sample is below 20', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const service = new AdaptiveClassifierService(db, {
      accuracyService,
    });

    await seedEvaluatedEvents(db, accuracyService, {
      count: 19,
      source: 'truth-social',
    });
    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
      outcome: {
        actualDirection: 'bearish',
        priceChangePercent1h: -0.3,
        priceChangePercent1d: -0.4,
        priceChangePercent1w: -0.5,
      },
    });

    const weights = await service.recalculateWeights();

    expect(weights.weights['truth-social']).toBe(1);
  });

  it('returns an empty weight set when no accuracy data exists', async () => {
    const service = new AdaptiveClassifierService(db);

    const weights = await service.recalculateWeights();

    expect(weights.weights).toEqual({});
    expect(weights.sampleSize).toBe(0);
  });

  it('publishes a weights updated event after recalculation', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const eventBus = new InMemoryEventBus();
    const handler = vi.fn();
    eventBus.subscribeTopic('weights:updated', handler);

    const service = new AdaptiveClassifierService(db, {
      accuracyService,
      eventBus,
    });

    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
    });

    await service.recalculateWeights();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      weights: { 'sec-edgar': 1 },
      sampleSize: 20,
    });
  });

  it('reclassifies when confidence is below 0.5', () => {
    const service = new AdaptiveClassifierService(db);

    const result = service.shouldReclassify({
      eventId: randomUUID(),
      source: 'sec-edgar',
      confidence: 0.49,
      sourceAccuracy: 0.95,
      feedbackVerdict: null,
    });

    expect(result).toBe(true);
  });

  it('reclassifies medium-confidence events when source accuracy is below 0.6', () => {
    const service = new AdaptiveClassifierService(db);

    const result = service.shouldReclassify({
      eventId: randomUUID(),
      source: 'reddit',
      confidence: 0.61,
      sourceAccuracy: 0.45,
      feedbackVerdict: null,
    });

    expect(result).toBe(true);
  });

  it('does not reclassify medium-confidence events when source accuracy is healthy', () => {
    const service = new AdaptiveClassifierService(db);

    const result = service.shouldReclassify({
      eventId: randomUUID(),
      source: 'reddit',
      confidence: 0.61,
      sourceAccuracy: 0.72,
      feedbackVerdict: null,
    });

    expect(result).toBe(false);
  });

  it('reclassifies when user feedback marks the event incorrect', () => {
    const service = new AdaptiveClassifierService(db);

    const result = service.shouldReclassify({
      eventId: randomUUID(),
      source: 'reddit',
      confidence: 0.9,
      sourceAccuracy: 0.95,
      feedbackVerdict: 'incorrect',
    });

    expect(result).toBe(true);
  });

  it('orders the queue by feedback incorrect before low confidence before low source accuracy', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const feedbackService = new UserFeedbackService(db);
    const service = new AdaptiveClassifierService(db, {
      accuracyService,
    });

    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'reddit',
      prediction: {
        predictedSeverity: 'HIGH',
        predictedDirection: 'bullish',
      },
      outcome: {
        actualDirection: 'bearish',
        priceChangePercent1h: -0.3,
        priceChangePercent1d: -0.5,
        priceChangePercent1w: -0.8,
      },
    });

    const feedbackEventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar', id: randomUUID() }),
      severity: 'HIGH',
    });
    await accuracyService.recordPrediction(feedbackEventId, makePrediction({ confidence: 0.93 }));
    await feedbackService.submitFeedback(feedbackEventId, 'incorrect');

    const lowConfidenceEventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar', id: randomUUID() }),
      severity: 'HIGH',
    });
    await accuracyService.recordPrediction(
      lowConfidenceEventId,
      makePrediction({ confidence: 0.41 }),
    );
    await service.enqueueEventIfNeeded({
      eventId: lowConfidenceEventId,
      source: 'sec-edgar',
      confidence: 0.41,
    });

    const lowAccuracyEventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'reddit', id: randomUUID() }),
      severity: 'HIGH',
    });
    await accuracyService.recordPrediction(
      lowAccuracyEventId,
      makePrediction({ confidence: 0.64 }),
    );
    await service.enqueueEventIfNeeded({
      eventId: lowAccuracyEventId,
      source: 'reddit',
      confidence: 0.64,
    });

    const queue = await service.getReclassificationQueue(10);

    expect(queue.map((item) => item.eventId)).toEqual([
      feedbackEventId,
      lowConfidenceEventId,
      lowAccuracyEventId,
    ]);
    expect(queue.map((item) => item.reason)).toEqual([
      'user_feedback_incorrect',
      'low_confidence',
      'low_source_accuracy',
    ]);
  });
});

describe('Adaptive API', () => {
  let db: Database;
  let client: PGlite;
  let server: FastifyInstance;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    server = Fastify({ logger: false });
    registerAdaptiveRoutes(server, db, { apiKey: TEST_API_KEY });
    await server.ready();
  });

  afterAll(async () => {
    await safeCloseServer(server);
    await safeClose(client);
  });

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('requires an API key to read weights', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/adaptive/weights',
    });

    expect(response.statusCode).toBe(401);
  });

  it('recalculates weights through the API', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/adaptive/recalculate',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      weights: { 'sec-edgar': 1 },
      sampleSize: 20,
    });
  });

  it('returns the pending queue via the API', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const service = new AdaptiveClassifierService(db, { accuracyService });
    const eventId = await storeEvent(db, {
      event: makeRawEvent({ source: 'sec-edgar', id: randomUUID() }),
      severity: 'HIGH',
    });

    await accuracyService.recordPrediction(eventId, makePrediction({ confidence: 0.42 }));
    await service.enqueueEventIfNeeded({
      eventId,
      source: 'sec-edgar',
      confidence: 0.42,
    });

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/adaptive/queue?limit=5',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      eventId,
      reason: 'low_confidence',
    });
  });

  it('returns weight adjustment history via the API', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const service = new AdaptiveClassifierService(db, { accuracyService });

    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
    });
    await service.recalculateWeights('manual seed');

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/adaptive/history?limit=5',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0]).toMatchObject({
      reason: 'manual seed',
    });
  });
});

describe('Adaptive pipeline integration', () => {
  let db: Database;
  let client: PGlite;
  let appCtx: AppContext;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    appCtx = buildApp({ logger: false, db, apiKey: TEST_API_KEY });
  }, 20000);

  afterAll(async () => {
    await safeCloseServer(appCtx.server);
    await safeClose(client);
  }, 20000);

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('recalculates weights when the accuracy update topic reaches 500 evaluated outcomes', async () => {
    const accuracyService = new ClassificationAccuracyService(db);
    const handler = vi.fn();
    appCtx.eventBus.subscribeTopic?.('weights:updated', handler);

    await seedEvaluatedEvents(db, accuracyService, {
      count: 20,
      source: 'sec-edgar',
    });

    await appCtx.eventBus.publishTopic?.('accuracy:updated', {
      totalEvaluated: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    const adaptiveService = new AdaptiveClassifierService(db);
    const weights = await adaptiveService.getSourceWeights();

    expect(weights.weights['sec-edgar']).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
  });
});
