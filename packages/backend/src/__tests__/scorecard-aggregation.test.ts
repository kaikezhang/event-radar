import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { registerAlertScorecardRoutes } from '../routes/alert-scorecard.js';
import { ScorecardAggregationService } from '../services/scorecard-aggregation.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'scorecard-summary-test-api-key';
const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

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
    title: 'Aggregated scorecard event',
    body: 'Default aggregated scorecard event',
    timestamp: new Date('2026-03-10T14:30:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      eventType: 'sec_form_8k',
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

async function seedAggregatedEvent(input?: {
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
        ${new Date(outcome.eventTime ?? rawEvent.timestamp.toISOString())},
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

function createService(): ScorecardAggregationService {
  return new ScorecardAggregationService(sharedDb, {
    now: () => new Date(FIXED_NOW),
  });
}

describe('scorecard aggregation service', () => {
  beforeEach(async () => {
    await cleanTestDb(sharedDb);
  });

  it('aggregates action buckets using the same T+20 first verdict semantics', async () => {
    await seedAggregatedEvent({
      event: {
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
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT5: 4,
        evaluatedT5At: '2026-03-12T14:30:00.000Z',
        changeT20: 12,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        metadata: {
          ticker: 'TSLA',
          direction: 'bullish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'TSLA', direction: 'bullish' }],
          },
        },
      },
      prediction: { direction: 'bullish', confidence: 0.76 },
      outcome: {
        changeT5: 5,
        evaluatedT5At: '2026-03-13T14:30:00.000Z',
        changeT20: -6,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        metadata: {
          ticker: 'MSFT',
          direction: 'bearish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🟡 Monitor',
            tickers: [{ symbol: 'MSFT', direction: 'bearish' }],
          },
        },
      },
      prediction: { direction: 'bearish', confidence: 0.55 },
      outcome: {
        changeT5: -3,
        evaluatedT5At: '2026-03-14T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.overview).toEqual({
      totalEvents: 3,
      sourcesMonitored: 1,
      eventsWithTickers: 3,
      eventsWithPriceOutcomes: 3,
    });
    expect(summary.actionBuckets).toEqual([
      {
        bucket: '🔴 High-Quality Setup',
        totalAlerts: 2,
        alertsWithUsableVerdicts: 2,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 1,
        setupWorkedRate: 0.5,
        avgT5Move: 4.5,
        avgT20Move: 3,
        medianT20Move: 3,
      },
      {
        bucket: '🟡 Monitor',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 1,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 0,
        setupWorkedRate: 0,
        avgT5Move: -3,
        avgT20Move: null,
        medianT20Move: null,
      },
    ]);
  });

  it('aggregates confidence buckets from derived confidence levels', async () => {
    await seedAggregatedEvent({
      prediction: { direction: 'bullish', confidence: 0.81 },
      outcome: {
        changeT20: 10,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      prediction: { direction: 'bearish', confidence: 0.64 },
      outcome: {
        changeT5: -8,
        evaluatedT5At: '2026-03-11T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      prediction: { direction: 'bullish', confidence: 0.45 },
      outcome: {
        changeT20: 0,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.confidenceBuckets).toEqual([
      {
        bucket: 'low',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 0,
        medianT20Move: 0,
      },
      {
        bucket: 'medium',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 1,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 1,
        setupWorkedRate: 1,
        avgT5Move: -8,
        avgT20Move: null,
        medianT20Move: null,
      },
      {
        bucket: 'high',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 10,
        medianT20Move: 10,
      },
    ]);
  });

  it('aggregates source buckets from stored event sources', async () => {
    await seedAggregatedEvent({
      event: {
        source: 'sec-edgar',
        metadata: {
          ticker: 'AAPL',
          eventType: 'sec_form_8k',
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
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT20: 10,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        source: 'sec-edgar',
        metadata: {
          ticker: 'MSFT',
          eventType: 'sec_form_8k',
          direction: 'bearish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🟡 Monitor',
            tickers: [{ symbol: 'MSFT', direction: 'bearish' }],
          },
        },
      },
      prediction: { direction: 'bearish', confidence: 0.57 },
      outcome: {
        changeT5: -4,
        evaluatedT5At: '2026-03-13T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        source: 'breaking-news',
        metadata: {
          ticker: 'NVDA',
          eventType: 'news_breaking',
          direction: 'bullish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
          },
        },
      },
      prediction: { direction: 'bullish', confidence: 0.76 },
      outcome: {
        changeT20: -6,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.sourceBuckets).toEqual([
      {
        bucket: 'sec-edgar',
        totalAlerts: 2,
        alertsWithUsableVerdicts: 1,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 0,
        setupWorkedRate: 0,
        avgT5Move: -4,
        avgT20Move: 10,
        medianT20Move: 10,
      },
      {
        bucket: 'breaking-news',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: -6,
        medianT20Move: -6,
      },
    ]);
  });

  it('aggregates event-type buckets from normalized event metadata', async () => {
    await seedAggregatedEvent({
      event: {
        metadata: {
          ticker: 'AAPL',
          eventType: 'sec_form_8k',
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
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT20: 11,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        source: 'breaking-news',
        metadata: {
          ticker: 'TSLA',
          eventType: 'news_breaking',
          direction: 'bearish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🟡 Monitor',
            tickers: [{ symbol: 'TSLA', direction: 'bearish' }],
          },
        },
      },
      prediction: { direction: 'bearish', confidence: 0.61 },
      outcome: {
        changeT5: -5,
        evaluatedT5At: '2026-03-13T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        source: 'earnings',
        metadata: {
          ticker: 'NVDA',
          eventType: 'earnings_beat',
          direction: 'bullish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
          },
        },
      },
      prediction: { direction: 'bullish', confidence: 0.88 },
      outcome: {
        changeT20: 7,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.eventTypeBuckets).toEqual([
      {
        bucket: 'earnings_beat',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 7,
        medianT20Move: 7,
      },
      {
        bucket: 'news_breaking',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 1,
        directionalCorrectCount: 0,
        directionalHitRate: 0,
        setupWorkedCount: 1,
        setupWorkedRate: 1,
        avgT5Move: -5,
        avgT20Move: null,
        medianT20Move: null,
      },
      {
        bucket: 'sec_form_8k',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 11,
        medianT20Move: 11,
      },
    ]);
  });

  it('filters alerts by a recent days window', async () => {
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-14T10:00:00.000Z'),
      },
      prediction: { direction: 'bullish', confidence: 0.8 },
      outcome: {
        eventTime: '2026-03-14T10:00:00.000Z',
        changeT20: 6,
        evaluatedT20At: '2026-04-03T10:00:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-02-01T10:00:00.000Z'),
      },
      prediction: { direction: 'bullish', confidence: 0.8 },
      outcome: {
        eventTime: '2026-02-01T10:00:00.000Z',
        changeT20: 9,
        evaluatedT20At: '2026-02-21T10:00:00.000Z',
      },
    });

    const summary = await createService().getSummary({ days: 30 });

    expect(summary.totals.totalAlerts).toBe(1);
    expect(summary.actionBuckets).toHaveLength(1);
    expect(summary.actionBuckets[0]).toMatchObject({
      bucket: '🔴 High-Quality Setup',
      avgT20Move: 6,
    });
  });

  it('counts insufficient-data alerts in totals but excludes them from usable verdict rates', async () => {
    await seedAggregatedEvent({
      prediction: { direction: 'neutral', confidence: 0.82 },
      outcome: {
        changeT20: 5,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT5: null,
        changeT20: null,
      },
    });

    const summary = await createService().getSummary();

    expect(summary.overview).toEqual({
      totalEvents: 2,
      sourcesMonitored: 1,
      eventsWithTickers: 2,
      eventsWithPriceOutcomes: 0,
    });
    expect(summary.totals).toMatchObject({
      totalAlerts: 2,
      alertsWithUsableVerdicts: 0,
      directionalCorrectCount: 0,
      directionalHitRate: null,
      setupWorkedCount: 0,
      setupWorkedRate: null,
      avgT5Move: null,
      avgT20Move: 5,
      medianT20Move: 5,
    });
  });

  it('does not create action or confidence buckets when the source label is missing', async () => {
    await seedAggregatedEvent({
      event: {
        metadata: {
          ticker: 'AAPL',
        },
      },
      prediction: null,
      outcome: {
        changeT20: 5,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.totals.totalAlerts).toBe(1);
    expect(summary.actionBuckets).toEqual([]);
    expect(summary.confidenceBuckets).toEqual([]);
  });

  it('excludes alerts without an event type from event-type bucket aggregation', async () => {
    await seedAggregatedEvent({
      event: {
        source: 'sec-edgar',
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
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT20: 5,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        source: 'breaking-news',
        metadata: {
          ticker: 'NVDA',
          eventType: 'news_breaking',
          direction: 'bullish',
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'AI impact',
            whyNow: 'Why now',
            currentSetup: 'Current setup',
            historicalContext: 'Historical context',
            risks: 'Risks',
            action: '🔴 High-Quality Setup',
            tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
          },
        },
      },
      prediction: { direction: 'bullish', confidence: 0.79 },
      outcome: {
        changeT20: 9,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.totals.totalAlerts).toBe(2);
    expect(summary.sourceBuckets).toHaveLength(2);
    expect(summary.eventTypeBuckets).toEqual([
      {
        bucket: 'news_breaking',
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 9,
        medianT20Move: 9,
      },
    ]);
  });

  it('returns an empty summary when there are no alerts', async () => {
    const summary = await createService().getSummary();

    expect(summary).toEqual({
      days: null,
      overview: {
        totalEvents: 0,
        sourcesMonitored: 0,
        eventsWithTickers: 0,
        eventsWithPriceOutcomes: 0,
      },
      totals: {
        totalAlerts: 0,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: null,
        medianT20Move: null,
      },
      actionBuckets: [],
      confidenceBuckets: [],
      sourceBuckets: [],
      eventTypeBuckets: [],
    });
  });

  it('counts price outcomes from T+5 and setup worked from absolute T+5 move', async () => {
    await seedAggregatedEvent({
      prediction: { direction: 'neutral', confidence: 0.82 },
      outcome: {
        changeT5: 5.1,
        evaluatedT5At: '2026-03-12T14:30:00.000Z',
        changeT20: null,
      },
    });
    await seedAggregatedEvent({
      prediction: { direction: 'neutral', confidence: 0.62 },
      outcome: {
        changeT5: -6.4,
        evaluatedT5At: '2026-03-13T14:30:00.000Z',
        changeT20: null,
      },
    });
    await seedAggregatedEvent({
      prediction: { direction: 'neutral', confidence: 0.44 },
      outcome: {
        changeT5: 4.9,
        evaluatedT5At: '2026-03-14T14:30:00.000Z',
        changeT20: 18,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const summary = await createService().getSummary();

    expect(summary.overview).toEqual({
      totalEvents: 3,
      sourcesMonitored: 1,
      eventsWithTickers: 3,
      eventsWithPriceOutcomes: 3,
    });
    expect(summary.totals).toMatchObject({
      totalAlerts: 3,
      alertsWithUsableVerdicts: 3,
      directionalCorrectCount: 0,
      directionalHitRate: 0,
      setupWorkedCount: 2,
      setupWorkedRate: 0.6667,
      avgT5Move: 1.2,
      avgT20Move: 18,
      medianT20Move: 18,
    });
  });
});

describe('scorecard summary route', () => {
  beforeEach(async () => {
    await cleanTestDb(sharedDb);
  });

  afterEach(async () => {
    // The individual tests close their own servers.
  });

  it('requires an api key', async () => {
    await seedAggregatedEvent();
    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/scorecards/summary',
    });

    expect(response.statusCode).toBe(401);
    await safeCloseServer(server);
  });

  it('returns the aggregated response shape', async () => {
    await seedAggregatedEvent({
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        changeT20: 8,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });

    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/scorecards/summary',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      days: null,
      overview: {
        totalEvents: 1,
        sourcesMonitored: 1,
        eventsWithTickers: 1,
        eventsWithPriceOutcomes: 0,
      },
      totals: {
        totalAlerts: 1,
        alertsWithUsableVerdicts: 0,
        directionalCorrectCount: 0,
        directionalHitRate: null,
        setupWorkedCount: 0,
        setupWorkedRate: null,
        avgT5Move: null,
        avgT20Move: 8,
        medianT20Move: 8,
      },
      actionBuckets: [
        {
          bucket: '🔴 High-Quality Setup',
          totalAlerts: 1,
          alertsWithUsableVerdicts: 0,
          directionalCorrectCount: 0,
          directionalHitRate: null,
          setupWorkedCount: 0,
          setupWorkedRate: null,
          avgT5Move: null,
          avgT20Move: 8,
          medianT20Move: 8,
        },
      ],
      confidenceBuckets: [
        {
          bucket: 'high',
          totalAlerts: 1,
          alertsWithUsableVerdicts: 0,
          directionalCorrectCount: 0,
          directionalHitRate: null,
          setupWorkedCount: 0,
          setupWorkedRate: null,
          avgT5Move: null,
          avgT20Move: 8,
          medianT20Move: 8,
        },
      ],
      sourceBuckets: [
        {
          bucket: 'sec-edgar',
          totalAlerts: 1,
          alertsWithUsableVerdicts: 0,
          directionalCorrectCount: 0,
          directionalHitRate: null,
          setupWorkedCount: 0,
          setupWorkedRate: null,
          avgT5Move: null,
          avgT20Move: 8,
          medianT20Move: 8,
        },
      ],
      eventTypeBuckets: [
        {
          bucket: 'sec_form_8k',
          totalAlerts: 1,
          alertsWithUsableVerdicts: 0,
          directionalCorrectCount: 0,
          directionalHitRate: null,
          setupWorkedCount: 0,
          setupWorkedRate: null,
          avgT5Move: null,
          avgT20Move: 8,
          medianT20Move: 8,
        },
      ],
    });

    await safeCloseServer(server);
  });

  it('applies the days filter from the query string', async () => {
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-14T10:00:00.000Z'),
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        eventTime: '2026-03-14T10:00:00.000Z',
        changeT20: 8,
        evaluatedT20At: '2026-03-30T14:30:00.000Z',
      },
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-01-14T10:00:00.000Z'),
      },
      prediction: { direction: 'bullish', confidence: 0.82 },
      outcome: {
        eventTime: '2026-01-14T10:00:00.000Z',
        changeT20: 4,
        evaluatedT20At: '2026-02-03T10:00:00.000Z',
      },
    });

    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/scorecards/summary?days=30',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      days: 30,
      totals: {
        totalAlerts: 1,
      },
    });

    await safeCloseServer(server);
  });

  it('returns 400 for an invalid days query value', async () => {
    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/scorecards/summary?days=0',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(400);
    await safeCloseServer(server);
  });

  it('returns the real severity breakdown ordered from critical to low', async () => {
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-14T10:00:00.000Z'),
      },
      severity: 'HIGH',
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-13T10:00:00.000Z'),
      },
      severity: 'CRITICAL',
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-12T10:00:00.000Z'),
      },
      severity: 'LOW',
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-10T10:00:00.000Z'),
      },
      severity: 'HIGH',
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-01-10T10:00:00.000Z'),
      },
      severity: 'MEDIUM',
    });
    await seedAggregatedEvent({
      event: {
        timestamp: new Date('2026-03-11T10:00:00.000Z'),
      },
      severity: undefined,
    });

    const server = Fastify({ logger: false });
    registerAlertScorecardRoutes(server, sharedDb, { apiKey: TEST_API_KEY });
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/scorecards/severity-breakdown?days=30',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { severity: 'CRITICAL', count: 1 },
      { severity: 'HIGH', count: 3 },
      { severity: 'LOW', count: 1 },
    ]);

    await safeCloseServer(server);
  });
});
