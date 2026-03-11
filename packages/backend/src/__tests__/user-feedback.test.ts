import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RawEvent, ClassificationPrediction, ClassificationOutcome } from '@event-radar/shared';
import { storeEvent } from '../db/event-store.js';
import { ClassificationAccuracyService } from '../services/classification-accuracy.js';
import { UserFeedbackService } from '../services/user-feedback.js';
import { registerFeedbackRoutes } from '../routes/feedback.js';
import {
  createTestDb,
  cleanTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';

const TEST_API_KEY = 'feedback-test-key';

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

describe('UserFeedbackService', () => {
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

  it('submits feedback for an event', async () => {
    const service = new UserFeedbackService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    await service.submitFeedback(eventId, 'correct', 'Spot on!');

    const feedback = await service.getFeedback(eventId);
    expect(feedback).not.toBeNull();
    expect(feedback!.verdict).toBe('correct');
    expect(feedback!.note).toBe('Spot on!');
    expect(feedback!.eventId).toBe(eventId);
  });

  it('upserts feedback on duplicate submission', async () => {
    const service = new UserFeedbackService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    await service.submitFeedback(eventId, 'correct');
    await service.submitFeedback(eventId, 'incorrect', 'Changed my mind');

    const feedback = await service.getFeedback(eventId);
    expect(feedback!.verdict).toBe('incorrect');
    expect(feedback!.note).toBe('Changed my mind');
  });

  it('returns null for non-existent feedback', async () => {
    const service = new UserFeedbackService(db);
    const feedback = await service.getFeedback(randomUUID());
    expect(feedback).toBeNull();
  });

  it('submits feedback without a note', async () => {
    const service = new UserFeedbackService(db);
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    await service.submitFeedback(eventId, 'partially_correct');

    const feedback = await service.getFeedback(eventId);
    expect(feedback!.verdict).toBe('partially_correct');
    expect(feedback!.note).toBeNull();
  });

  it('computes feedback stats', async () => {
    const service = new UserFeedbackService(db);

    const e1 = await storeEvent(db, { event: makeRawEvent({ source: 's1' }), severity: 'HIGH' });
    const e2 = await storeEvent(db, { event: makeRawEvent({ source: 's2' }), severity: 'HIGH' });
    const e3 = await storeEvent(db, { event: makeRawEvent({ source: 's3' }), severity: 'HIGH' });

    await service.submitFeedback(e1, 'correct');
    await service.submitFeedback(e2, 'incorrect');
    await service.submitFeedback(e3, 'partially_correct');

    const stats = await service.getFeedbackStats();
    expect(stats.total).toBe(3);
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(1);
    expect(stats.partiallyCorrect).toBe(1);
  });

  it('returns zeroed stats when no feedback exists', async () => {
    const service = new UserFeedbackService(db);
    const stats = await service.getFeedbackStats();

    expect(stats.total).toBe(0);
    expect(stats.correct).toBe(0);
    expect(stats.incorrect).toBe(0);
    expect(stats.partiallyCorrect).toBe(0);
    expect(stats.agreementRate).toBe(0);
  });

  it('calculates agreement rate between feedback and auto-evaluation', async () => {
    const accuracy = new ClassificationAccuracyService(db);
    const service = new UserFeedbackService(db);

    // Event where prediction matches outcome (auto says correct)
    const e1 = await storeEvent(db, { event: makeRawEvent({ source: 's1' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e1, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e1, makeOutcome({ actualDirection: 'bullish' }));
    await service.submitFeedback(e1, 'correct'); // agrees with auto

    // Event where prediction does NOT match outcome (auto says incorrect)
    const e2 = await storeEvent(db, { event: makeRawEvent({ source: 's2' }), severity: 'HIGH' });
    await accuracy.recordPrediction(e2, makePrediction({ predictedDirection: 'bullish' }));
    await accuracy.recordOutcome(e2, makeOutcome({ actualDirection: 'bearish' }));
    await service.submitFeedback(e2, 'correct'); // disagrees with auto

    const stats = await service.getFeedbackStats();
    expect(stats.total).toBe(2);
    expect(stats.agreementRate).toBe(0.5); // 1 agreement out of 2
  });
});

describe('Feedback API', () => {
  let db: Database;
  let client: PGlite;
  let apiServer: FastifyInstance;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    apiServer = Fastify({ logger: false });
    registerFeedbackRoutes(apiServer, db, { apiKey: TEST_API_KEY });
    await apiServer.ready();
  }, 20000);

  afterAll(async () => {
    await safeCloseServer(apiServer);
    await safeClose(client);
  }, 20000);

  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('requires API key for feedback submission', async () => {
    const response = await apiServer.inject({
      method: 'POST',
      url: `/api/v1/feedback/${randomUUID()}`,
      payload: { verdict: 'correct' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('submits feedback via API', async () => {
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });

    const response = await apiServer.inject({
      method: 'POST',
      url: `/api/v1/feedback/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
      payload: { verdict: 'correct', note: 'Good call' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().success).toBe(true);
  });

  it('retrieves feedback via API', async () => {
    const eventId = await storeEvent(db, { event: makeRawEvent(), severity: 'HIGH' });
    const service = new UserFeedbackService(db);
    await service.submitFeedback(eventId, 'incorrect', 'Bad call');

    const response = await apiServer.inject({
      method: 'GET',
      url: `/api/v1/feedback/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.verdict).toBe('incorrect');
    expect(body.note).toBe('Bad call');
  });

  it('returns 404 for non-existent feedback', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: `/api/v1/feedback/${randomUUID()}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns feedback stats via API', async () => {
    const response = await apiServer.inject({
      method: 'GET',
      url: '/api/v1/feedback/stats',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(0);
    expect(body).toHaveProperty('agreementRate');
  });
});
