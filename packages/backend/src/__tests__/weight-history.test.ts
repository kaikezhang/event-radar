import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { WeightHistoryService } from '../services/weight-history.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

describe('WeightHistoryService', () => {
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

  it('records the first adjustment with empty previous weights', async () => {
    const service = new WeightHistoryService(db);

    await service.recordAdjustment({
      weights: { 'sec-edgar': 1.25 },
      updatedAt: '2026-03-11T12:00:00.000Z',
      sampleSize: 24,
    }, 'initial calibration');

    const history = await service.getHistory(10);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      previousWeights: {},
      newWeights: { 'sec-edgar': 1.25 },
      reason: 'initial calibration',
    });
  });

  it('captures previous weights on subsequent adjustments', async () => {
    const service = new WeightHistoryService(db);

    await service.recordAdjustment({
      weights: { 'sec-edgar': 1.1 },
      updatedAt: '2026-03-11T12:00:00.000Z',
      sampleSize: 22,
    }, 'round one');
    await service.recordAdjustment({
      weights: { 'sec-edgar': 0.95, reddit: 0.7 },
      updatedAt: '2026-03-11T13:00:00.000Z',
      sampleSize: 45,
    }, 'round two');

    const history = await service.getHistory(10);

    expect(history[0]).toMatchObject({
      previousWeights: { 'sec-edgar': 1.1 },
      newWeights: { 'sec-edgar': 0.95, reddit: 0.7 },
      reason: 'round two',
    });
  });

  it('returns newest-first history with limit applied', async () => {
    const service = new WeightHistoryService(db);

    await service.recordAdjustment({
      weights: { a: 1.1 },
      updatedAt: '2026-03-11T10:00:00.000Z',
      sampleSize: 20,
    }, 'first');
    await service.recordAdjustment({
      weights: { a: 1.2 },
      updatedAt: '2026-03-11T11:00:00.000Z',
      sampleSize: 21,
    }, 'second');
    await service.recordAdjustment({
      weights: { a: 1.3 },
      updatedAt: '2026-03-11T12:00:00.000Z',
      sampleSize: 22,
    }, 'third');

    const history = await service.getHistory(2);

    expect(history).toHaveLength(2);
    expect(history.map((item) => item.reason)).toEqual(['third', 'second']);
  });

  it('updates the current source weight table when recording history', async () => {
    const service = new WeightHistoryService(db);

    await service.recordAdjustment({
      weights: { 'sec-edgar': 1.4, reddit: 0.6 },
      updatedAt: '2026-03-11T12:00:00.000Z',
      sampleSize: 40,
    }, 'persist current weights');

    const current = await service.getCurrentWeights();

    expect(current.weights).toEqual({
      'sec-edgar': 1.4,
      reddit: 0.6,
    });
    expect(current.sampleSize).toBe(40);
  });
});
