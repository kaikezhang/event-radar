import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { WeeklyReportService } from '../services/weekly-report.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'weekly-report-test-api-key';

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
    title: 'Default weekly report event',
    body: 'Default weekly report summary',
    timestamp: new Date('2026-03-23T14:30:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
      direction: 'bullish',
      llm_enrichment: {
        summary: 'Default one-line analysis',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      },
    },
    ...overrides,
  };
}

async function seedWeeklyEvent(input: {
  title: string;
  source: string;
  ticker?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: string;
  sourceEventId?: string;
  summary?: string;
  changeT5?: number | null;
}): Promise<string> {
  const ticker = input.ticker ?? 'AAPL';
  const rawEvent = makeRawEvent({
    id: input.sourceEventId ?? randomUUID(),
    source: input.source,
    title: input.title,
    body: input.summary ?? `${input.title} summary`,
    timestamp: new Date(input.eventTime),
    metadata: {
      ticker,
      tickers: [ticker],
      direction: input.changeT5 == null ? 'neutral' : input.changeT5 >= 0 ? 'bullish' : 'bearish',
      llm_enrichment: {
        summary: input.summary ?? `${input.title} one-line analysis`,
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: ticker, direction: input.changeT5 == null ? 'neutral' : input.changeT5 >= 0 ? 'bullish' : 'bearish' }],
      },
    },
  });

  const eventId = await storeEvent(sharedDb, {
    event: rawEvent,
    severity: input.severity,
  });

  await sharedDb.execute(sql`
    UPDATE events
    SET
      created_at = ${new Date(input.eventTime)},
      received_at = ${new Date(input.eventTime)}
    WHERE id = ${eventId}
  `);

  if (input.changeT5 != null) {
    await sharedDb.execute(sql`
      INSERT INTO event_outcomes (
        event_id,
        ticker,
        event_time,
        event_price,
        price_t5,
        change_t5,
        evaluated_t5_at
      ) VALUES (
        ${eventId},
        ${ticker},
        ${new Date(input.eventTime)},
        '100.00',
        ${String(100 + input.changeT5)},
        ${String(input.changeT5)},
        ${new Date(new Date(input.eventTime).getTime() + 5 * 24 * 60 * 60 * 1000)}
      )
    `);
  }

  return eventId;
}

describe('WeeklyReportService', () => {
  let service: WeeklyReportService;
  let ctx: AppContext;
  const previousAuthRequired = process.env.AUTH_REQUIRED;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    service = new WeeklyReportService(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
    if (previousAuthRequired == null) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = previousAuthRequired;
    }
    if (previousJwtSecret == null) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it('builds weekly aggregates, top signals, worst signals, and source leaderboard', async () => {
    await seedWeeklyEvent({
      title: 'Trading Halt on NVDA',
      source: 'trading-halt',
      ticker: 'NVDA',
      severity: 'CRITICAL',
      eventTime: '2026-03-23T15:00:00.000Z',
      changeT5: 12.4,
    });
    await seedWeeklyEvent({
      title: 'SEC 8-K Filing AAPL',
      source: 'sec-edgar',
      ticker: 'AAPL',
      severity: 'HIGH',
      eventTime: '2026-03-22T14:00:00.000Z',
      changeT5: 8.2,
    });
    await seedWeeklyEvent({
      title: 'Truth Social Iran Post',
      source: 'truth-social',
      ticker: 'SPY',
      severity: 'CRITICAL',
      eventTime: '2026-03-20T12:00:00.000Z',
      changeT5: 5.1,
    });
    await seedWeeklyEvent({
      title: 'Breaking News TSLA',
      source: 'breaking-news',
      ticker: 'TSLA',
      severity: 'HIGH',
      eventTime: '2026-03-19T16:00:00.000Z',
      changeT5: -3.2,
    });
    await seedWeeklyEvent({
      title: 'Follow-up Halt on AMD',
      source: 'trading-halt',
      ticker: 'AMD',
      severity: 'MEDIUM',
      eventTime: '2026-03-18T10:00:00.000Z',
      changeT5: 6,
    });

    const report = await service.generateWeeklyReport('2026-03-23');

    expect(report.periodStart).toBe('2026-03-17');
    expect(report.periodEnd).toBe('2026-03-23');
    expect(report.summary).toEqual({
      eventsDetected: 5,
      sourcesMonitored: 4,
      highOrCriticalEvents: 4,
      eventsWithPriceOutcomes: 5,
    });
    expect(report.topSignals.map((item) => item.title)).toEqual([
      'Trading Halt on NVDA',
      'SEC 8-K Filing AAPL',
      'Follow-up Halt on AMD',
    ]);
    expect(report.worstSignals.map((item) => item.title)).toEqual([
      'Breaking News TSLA',
      'Truth Social Iran Post',
      'Follow-up Halt on AMD',
    ]);
    expect(report.sourceLeaderboard).toEqual([
      {
        source: 'trading-halt',
        events: 2,
        setupWorkedRate: 1,
        avgT5Move: 9.2,
      },
      {
        source: 'sec-edgar',
        events: 1,
        setupWorkedRate: 1,
        avgT5Move: 8.2,
      },
      {
        source: 'truth-social',
        events: 1,
        setupWorkedRate: 1,
        avgT5Move: 5.1,
      },
      {
        source: 'breaking-news',
        events: 1,
        setupWorkedRate: 0,
        avgT5Move: -3.2,
      },
    ]);
    expect(report.insight).toContain('trading-halt');
    expect(report.insight).toContain('100.0%');
  });

  it('ignores excluded sources and events outside the requested week', async () => {
    await seedWeeklyEvent({
      title: 'Valid SEC filing',
      source: 'sec-edgar',
      severity: 'HIGH',
      eventTime: '2026-03-22T14:00:00.000Z',
      changeT5: 4.1,
    });
    await seedWeeklyEvent({
      title: 'Excluded dummy event',
      source: 'dummy',
      severity: 'CRITICAL',
      eventTime: '2026-03-22T15:00:00.000Z',
      changeT5: 20,
    });
    await seedWeeklyEvent({
      title: 'Old halt event',
      source: 'trading-halt',
      severity: 'CRITICAL',
      eventTime: '2026-03-16T15:00:00.000Z',
      changeT5: 15,
    });

    const report = await service.generateWeeklyReport('2026-03-23');

    expect(report.summary.eventsDetected).toBe(1);
    expect(report.summary.sourcesMonitored).toBe(1);
    expect(report.topSignals).toHaveLength(1);
    expect(report.topSignals[0]?.title).toBe('Valid SEC filing');
  });

  it('marks setup worked rate from absolute T+5 moves of 5 percent or more', async () => {
    await seedWeeklyEvent({
      title: 'Small positive move',
      source: 'sec-edgar',
      severity: 'HIGH',
      eventTime: '2026-03-22T14:00:00.000Z',
      changeT5: 4.9,
    });
    await seedWeeklyEvent({
      title: 'Large negative move',
      source: 'sec-edgar',
      severity: 'HIGH',
      eventTime: '2026-03-21T14:00:00.000Z',
      changeT5: -7.5,
    });

    const report = await service.generateWeeklyReport('2026-03-23');

    expect(report.sourceLeaderboard).toEqual([
      {
        source: 'sec-edgar',
        events: 2,
        setupWorkedRate: 0.5,
        avgT5Move: -1.3,
      },
    ]);
  });

  it('renders markdown with the required sections', async () => {
    await seedWeeklyEvent({
      title: 'Trading Halt on NVDA',
      source: 'trading-halt',
      ticker: 'NVDA',
      severity: 'CRITICAL',
      eventTime: '2026-03-23T15:00:00.000Z',
      changeT5: 12.4,
    });

    const report = await service.generateWeeklyReport('2026-03-23');

    expect(report.markdown).toContain('# Event Radar Weekly Scorecard — Week of March 17-23, 2026');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Top Performing Signals');
    expect(report.markdown).toContain('## Worst Calls');
    expect(report.markdown).toContain('## Source Leaderboard');
    expect(report.markdown).toContain('## This Week\'s Insight');
  });

  it('returns an empty report when the week has no events', async () => {
    const report = await service.generateWeeklyReport('2026-03-23');

    expect(report.summary).toEqual({
      eventsDetected: 0,
      sourcesMonitored: 0,
      highOrCriticalEvents: 0,
      eventsWithPriceOutcomes: 0,
    });
    expect(report.topSignals).toEqual([]);
    expect(report.worstSignals).toEqual([]);
    expect(report.sourceLeaderboard).toEqual([]);
    expect(report.insight).toContain('No reportable events');
  });

  it('requires authentication on the weekly report route', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/reports/weekly?date=2026-03-23',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns JSON by default from the weekly report route', async () => {
    await seedWeeklyEvent({
      title: 'Trading Halt on NVDA',
      source: 'trading-halt',
      ticker: 'NVDA',
      severity: 'CRITICAL',
      eventTime: '2026-03-23T15:00:00.000Z',
      changeT5: 12.4,
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/reports/weekly?date=2026-03-23',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json().summary.eventsDetected).toBe(1);
  });

  it('returns raw markdown when format=markdown is requested', async () => {
    await seedWeeklyEvent({
      title: 'Trading Halt on NVDA',
      source: 'trading-halt',
      ticker: 'NVDA',
      severity: 'CRITICAL',
      eventTime: '2026-03-23T15:00:00.000Z',
      changeT5: 12.4,
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/reports/weekly?date=2026-03-23&format=markdown',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.body).toContain('# Event Radar Weekly Scorecard');
  });
});
