import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import {
  findSimilarFromOutcomes,
  type OutcomeSimilarityQuery,
} from '../services/outcome-similarity.js';
import { cleanTestDb, createTestDb, safeClose } from './helpers/test-db.js';

let db: Database;
let client: PGlite;

beforeAll(async () => {
  ({ db, client } = await createTestDb());
});

afterAll(async () => {
  await safeClose(client);
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
  await cleanTestDb(db);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'breaking-news',
    type: 'headline',
    title: 'Default event',
    body: 'Default body',
    timestamp: new Date('2026-03-01T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
    },
    ...overrides,
  };
}

async function seedOutcome(input: {
  rawEventId?: string;
  title: string;
  source: string;
  ticker: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: string;
  change1h?: number | null;
  change1d?: number | null;
  changeT5?: number | null;
  changeT20?: number | null;
  change1w?: number | null;
  change1m?: number | null;
}): Promise<{ eventId: string; rawEventId: string }> {
  const rawEventId = input.rawEventId ?? crypto.randomUUID();
  const { id: eventId } = await storeEvent(db, {
    event: makeEvent({
      id: rawEventId,
      source: input.source,
      title: input.title,
      timestamp: new Date(input.eventTime),
      metadata: {
        ticker: input.ticker,
      },
    }),
    severity: input.severity,
  });

  await db.execute(sql`
    INSERT INTO event_outcomes (
      event_id,
      ticker,
      event_time,
      event_price,
      change_1h,
      change_1d,
      change_t5,
      change_t20,
      change_1w,
      change_1m
    ) VALUES (
      ${eventId},
      ${input.ticker},
      ${new Date(input.eventTime)},
      100.00,
      ${input.change1h ?? null},
      ${input.change1d ?? null},
      ${input.changeT5 ?? null},
      ${input.changeT20 ?? null},
      ${input.change1w ?? null},
      ${input.change1m ?? null}
    )
  `);

  return { eventId, rawEventId };
}

async function runQuery(query: OutcomeSimilarityQuery) {
  return findSimilarFromOutcomes(db, query);
}

describe('findSimilarFromOutcomes', () => {
  it('prioritizes exact ticker matches and returns the highest-scoring candidates first', async () => {
    await seedOutcome({
      title: 'Apple raises guidance after earnings beat',
      source: 'breaking-news',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.08,
      change1w: 0.14,
    });
    await seedOutcome({
      title: 'Broader market reacts to Apple headline',
      source: 'breaking-news',
      ticker: 'MSFT',
      severity: 'HIGH',
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.02,
      change1w: 0.03,
    });

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'breaking-news',
      severity: 'high',
      titleKeywords: ['apple', 'earnings'],
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.ticker).toBe('AAPL');
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
  });

  it('awards the recency bonus to events within the last 90 days', async () => {
    await seedOutcome({
      title: 'Apple product launch drives supplier rally',
      source: 'newswire',
      ticker: 'AAPL',
      severity: 'MEDIUM',
      eventTime: '2026-03-01T12:00:00.000Z',
      change1d: 0.04,
      change1w: 0.07,
    });
    await seedOutcome({
      title: 'Apple product launch boosts suppliers',
      source: 'newswire',
      ticker: 'AAPL',
      severity: 'MEDIUM',
      eventTime: '2025-09-01T12:00:00.000Z',
      change1d: 0.03,
      change1w: 0.05,
    });

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'newswire',
      titleKeywords: ['apple', 'launch'],
    });

    expect(result[0]?.eventTime).toBe('2026-03-01T12:00:00.000Z');
    expect((result[0]?.score ?? 0) - (result[1]?.score ?? 0)).toBeCloseTo(0.05, 4);
  });

  it('treats adjacent severities as similar', async () => {
    await seedOutcome({
      title: 'Apple executives discuss demand trends',
      source: 'breaking-news',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-02T12:00:00.000Z',
      change1d: 0.01,
      change1w: 0.02,
    });

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'breaking-news',
      severity: 'critical',
      titleKeywords: ['apple'],
    });

    expect(result[0]?.score).toBeCloseTo(1, 4);
  });

  it('applies a strong penalty to low-value sources during similarity scoring', async () => {
    await seedOutcome({
      title: 'Meta layoffs cut 20000 jobs in restructuring plan',
      source: 'breaking-news',
      ticker: 'META',
      severity: 'HIGH',
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.05,
      change1w: 0.09,
    });
    await seedOutcome({
      title: 'Meta chatter ties layoffs to restructuring',
      source: 'stocktwits',
      ticker: 'META',
      severity: 'HIGH',
      eventTime: '2026-03-09T12:00:00.000Z',
      change1d: 0.02,
      change1w: 0.03,
    });

    const result = await runQuery({
      ticker: 'META',
      source: 'breaking-news',
      severity: 'high',
      titleKeywords: ['layoffs', 'jobs', 'restructuring'],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      source: 'breaking-news',
      score: 1,
    });
    expect(result[1]).toMatchObject({
      source: 'stocktwits',
    });
    expect(result[1]?.score).toBeCloseTo(0.255, 4);
  });

  it('matches on title keyword overlap for events from the same source', async () => {
    await seedOutcome({
      title: 'Trading halt resumes after volatility spike',
      source: 'trading-halt',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-05T12:00:00.000Z',
      change1d: -0.03,
      change1w: -0.01,
    });

    const result = await runQuery({
      source: 'trading-halt',
      severity: 'high',
      titleKeywords: ['volatility', 'halt'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBeGreaterThan(0.6);
  });

  it('returns T+5 and T+20 changes when they are present on the outcome row', async () => {
    await seedOutcome({
      title: 'Apple launches AI server platform',
      source: 'breaking-news',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.03,
      changeT5: 0.11,
      changeT20: 0.22,
      change1w: 0.09,
      change1m: 0.2,
    });

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'breaking-news',
      titleKeywords: ['apple', 'server'],
    });

    expect(result[0]).toMatchObject({
      changeT5: 0.11,
      changeT20: 0.22,
    });
  });

  it('deduplicates candidates by normalized title and keeps the most recent match', async () => {
    await seedOutcome({
      title: 'META entered StockTwits trending',
      source: 'stocktwits',
      ticker: 'META',
      severity: 'HIGH',
      eventTime: '2026-03-08T12:00:00.000Z',
      change1d: 0.01,
      change1w: 0.02,
    });
    await seedOutcome({
      title: '  meta entered stocktwits trending  ',
      source: 'stocktwits',
      ticker: 'META',
      severity: 'HIGH',
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.03,
      change1w: 0.04,
    });
    await seedOutcome({
      title: 'Meta announces restructuring layoffs',
      source: 'breaking-news',
      ticker: 'META',
      severity: 'HIGH',
      eventTime: '2026-03-09T12:00:00.000Z',
      change1d: 0.08,
      change1w: 0.12,
    });

    const result = await runQuery({
      ticker: 'META',
      severity: 'high',
      titleKeywords: ['meta'],
      limit: 10,
    });

    expect(result.filter((match) => match.title.toLowerCase().includes('stocktwits trending'))).toHaveLength(1);
    expect(result.find((match) => match.title.toLowerCase().includes('stocktwits trending'))).toMatchObject({
      eventTime: '2026-03-10T12:00:00.000Z',
      change1d: 0.03,
    });
  });

  it('excludes the current event when excludeEventId matches the source_event_id', async () => {
    const excluded = await seedOutcome({
      rawEventId: 'raw-event-1',
      title: 'Apple launches new AI server products',
      source: 'breaking-news',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-08T12:00:00.000Z',
      change1d: 0.06,
      change1w: 0.09,
    });
    await seedOutcome({
      rawEventId: 'raw-event-2',
      title: 'Apple launches updated AI server products',
      source: 'breaking-news',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-07T12:00:00.000Z',
      change1d: 0.05,
      change1w: 0.08,
    });

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'breaking-news',
      severity: 'high',
      titleKeywords: ['apple', 'server'],
      excludeEventId: excluded.rawEventId,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.eventId).not.toBe(excluded.eventId);
  });

  it('defaults to five results when more matches are available', async () => {
    for (let index = 0; index < 6; index += 1) {
      await seedOutcome({
        title: `Apple event ${index}`,
        source: 'breaking-news',
        ticker: 'AAPL',
        severity: 'HIGH',
        eventTime: `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        change1d: 0.01,
        change1w: 0.02,
      });
    }

    const result = await runQuery({
      ticker: 'AAPL',
      source: 'breaking-news',
      severity: 'high',
      titleKeywords: ['apple'],
    });

    expect(result).toHaveLength(5);
  });
});
