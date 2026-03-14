import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'feed-test-api-key';

let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
  await sharedDb.execute(sql`
    CREATE TABLE IF NOT EXISTS pipeline_audit (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL,
      source VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      severity VARCHAR(20),
      ticker VARCHAR(20),
      outcome VARCHAR(30) NOT NULL,
      stopped_at VARCHAR(30) NOT NULL,
      reason TEXT,
      reason_category VARCHAR(30),
      delivery_channels JSONB,
      historical_match BOOLEAN,
      historical_confidence VARCHAR(20),
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  await safeClose(sharedClient);
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'sec-edgar',
    type: '8-K',
    title: 'Default feed event',
    body: 'Default summary',
    timestamp: new Date('2026-03-13T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
      category: 'corporate',
      url: 'https://example.com/default',
    },
    ...overrides,
  };
}

async function seedDeliveredEvent(input: {
  title: string;
  ticker?: string;
  tickers?: string[];
  source?: string;
  summary?: string;
  category?: string;
  url?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventTime: string;
  auditTime: string;
  llmReason?: string;
  metadata?: Record<string, unknown>;
  deliveryChannels?: Array<{ channel: string; ok: boolean }>;
}): Promise<string> {
  const ticker = input.ticker ?? input.tickers?.[0] ?? 'AAPL';
  const rawEvent = makeEvent({
      source: input.source ?? 'sec-edgar',
      title: input.title,
      body: input.summary ?? `${input.title} summary`,
      timestamp: new Date(input.eventTime),
      metadata: {
        ticker,
        tickers: input.tickers ?? [ticker],
        category: input.category ?? 'corporate',
        url: input.url ?? `https://example.com/${input.title.toLowerCase().replace(/\s+/g, '-')}`,
        ...input.metadata,
      },
    });
  const eventId = await storeEvent(sharedDb, {
    event: rawEvent,
    severity: input.severity ?? 'HIGH',
  });

  await sharedDb.execute(sql`
    UPDATE events
    SET
      source_urls = ${JSON.stringify([input.url ?? `https://example.com/${eventId}`])}::jsonb,
      created_at = ${new Date(input.eventTime)},
      received_at = ${new Date(input.eventTime)}
    WHERE id = ${eventId}
  `);

  // Use rawEvent.id (source_event_id) for pipeline_audit, matching production behavior
  await sharedDb.execute(sql`
    INSERT INTO pipeline_audit (
      event_id,
      source,
      title,
      severity,
      ticker,
      outcome,
      stopped_at,
      reason,
      delivery_channels,
      created_at
    ) VALUES (
      ${rawEvent.id},
      ${input.source ?? 'sec-edgar'},
      ${input.title},
      ${input.severity ?? 'HIGH'},
      ${ticker},
      'delivered',
      'delivery',
      ${input.llmReason ?? `LLM approved ${input.title}`},
      ${JSON.stringify(input.deliveryChannels ?? [{ channel: 'discord', ok: true }])}::jsonb,
      ${new Date(input.auditTime)}
    )
  `);

  return eventId;
}

async function seedNonDeliveredAudit(input: {
  title: string;
  eventTime: string;
  auditTime: string;
  outcome: 'filtered' | 'deduped' | 'grace_period' | 'error';
}): Promise<string> {
  const eventId = await storeEvent(sharedDb, {
    event: makeEvent({
      title: input.title,
      body: `${input.title} body`,
      timestamp: new Date(input.eventTime),
    }),
    severity: 'MEDIUM',
  });

  await sharedDb.execute(sql`
    INSERT INTO pipeline_audit (
      event_id,
      source,
      title,
      severity,
      ticker,
      outcome,
      stopped_at,
      reason,
      created_at
    ) VALUES (
      ${eventId},
      'sec-edgar',
      ${input.title},
      'MEDIUM',
      'AAPL',
      ${input.outcome},
      ${input.outcome},
      'Not delivered',
      ${new Date(input.auditTime)}
    )
  `);

  return eventId;
}

describe('GET /api/v1/feed', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql`DELETE FROM pipeline_audit`);

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns 200 without an API key', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
  });

  it('returns delivered events joined with event details', async () => {
    const eventId = await seedDeliveredEvent({
      title: 'Nvidia files material 8-K',
      ticker: 'NVDA',
      source: 'sec-edgar',
      summary: 'Detailed filing summary',
      category: 'corporate',
      url: 'https://example.com/nvda-8k',
      severity: 'CRITICAL',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
      llmReason: 'LLM approved due to immediate corporate disclosure',
    });
    await seedNonDeliveredAudit({
      title: 'Filtered noise',
      outcome: 'filtered',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.cursor).toBeNull();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toEqual({
      id: eventId,
      title: 'Nvidia files material 8-K',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      tickers: ['NVDA'],
      summary: 'Detailed filing summary',
      url: 'https://example.com/nvda-8k',
      time: '2026-03-13T10:00:00.000Z',
      category: 'corporate',
      llmReason: 'LLM approved due to immediate corporate disclosure',
    });
  });

  it('orders feed items by newest delivered audit first', async () => {
    await seedDeliveredEvent({
      title: 'Older event',
      ticker: 'AAPL',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Newer event',
      ticker: 'MSFT',
      eventTime: '2026-03-13T11:00:00.000Z',
      auditTime: '2026-03-13T11:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events.map((event: { title: string }) => event.title)).toEqual([
      'Newer event',
      'Older event',
    ]);
  });

  it('supports the limit query parameter', async () => {
    await seedDeliveredEvent({
      title: 'Event 1',
      ticker: 'AAPL',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Event 2',
      ticker: 'MSFT',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?limit=1',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.events).toHaveLength(1);
    expect(body.cursor).toEqual(expect.any(String));
  });

  it('caps limit at 200', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?limit=999',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.events).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('supports ticker filtering', async () => {
    await seedDeliveredEvent({
      title: 'Tesla headline',
      ticker: 'TSLA',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Apple headline',
      ticker: 'AAPL',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?ticker=tsla',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(1);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].tickers).toEqual(['TSLA']);
  });

  it('returns empty results for unmatched tickers', async () => {
    await seedDeliveredEvent({
      title: 'Only Apple here',
      ticker: 'AAPL',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?ticker=NVDA',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [],
      cursor: null,
      total: 0,
    });
  });

  it('returns a cursor when another page is available', async () => {
    await seedDeliveredEvent({
      title: 'Page 1',
      ticker: 'AAPL',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Page 2',
      ticker: 'MSFT',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?limit=1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().cursor).toEqual(expect.any(String));
  });

  it('supports before cursor pagination', async () => {
    await seedDeliveredEvent({
      title: 'Oldest',
      ticker: 'AAPL',
      eventTime: '2026-03-13T07:00:00.000Z',
      auditTime: '2026-03-13T07:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Middle',
      ticker: 'MSFT',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Newest',
      ticker: 'NVDA',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const pageOne = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?limit=2',
    });

    const cursor = pageOne.json().cursor as string;
    const pageTwo = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/feed?limit=2&before=${encodeURIComponent(cursor)}`,
    });

    expect(pageTwo.statusCode).toBe(200);
    const body = pageTwo.json();
    expect(body.total).toBe(1);
    expect(body.cursor).toBeNull();
    expect(body.events.map((event: { title: string }) => event.title)).toEqual(['Oldest']);
  });

  it('returns 400 for an invalid cursor', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed?before=not-a-valid-cursor',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid cursor' });
  });

  it('returns 503 when the database is not configured', async () => {
    const noDbCtx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await noDbCtx.server.ready();

    const response = await noDbCtx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Database not configured' });

    await safeCloseServer(noDbCtx.server);
  });

  it('skips delivered audit rows without a matching event', async () => {
    await sharedDb.execute(sql`
      INSERT INTO pipeline_audit (
        event_id,
        source,
        title,
        severity,
        ticker,
        outcome,
        stopped_at,
        reason,
        created_at
      ) VALUES (
        'missing-event',
        'sec-edgar',
        'Missing event row',
        'HIGH',
        'AAPL',
        'delivered',
        'delivery',
        'LLM approved',
        ${new Date('2026-03-13T12:00:00.000Z')}
      )
    `);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [],
      cursor: null,
      total: 0,
    });
  });
});

describe('GET /api/v1/delivery/feed', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    await sharedDb.execute(sql`DELETE FROM pipeline_audit`);

    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns delivered alerts with llm enrichment and delivery channel details', async () => {
    const eventId = await seedDeliveredEvent({
      title: 'Nvidia files material 8-K',
      ticker: 'NVDA',
      source: 'sec-edgar',
      summary: 'Detailed filing summary',
      severity: 'CRITICAL',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
      metadata: {
        llm_enrichment: {
          summary: 'AI summary',
          impact: 'AI impact',
          action: '🔴 ACT NOW',
          tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
          regimeContext: 'Risk appetite is supportive.',
        },
      },
      deliveryChannels: [
        { channel: 'discord', ok: true },
        { channel: 'bark', ok: true },
      ],
    });
    await sharedDb.execute(sql`
      UPDATE events
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{historical_context}',
        ${JSON.stringify({
          matchCount: 2,
          confidence: 'low',
          avgAlphaT5: 0.04,
          avgAlphaT20: 0.1,
          winRateT20: 100,
          medianAlphaT20: 0.1,
          avgChange1d: 0.06,
          avgChange1w: 0.11,
          topMatches: [],
          similarEvents: [
            {
              title: 'Nvidia raised AI guidance',
              ticker: 'NVDA',
              source: 'sec-edgar',
              eventTime: '2026-03-10T10:00:00.000Z',
              score: 0.88,
              eventPrice: 100,
              change1h: 0.01,
              change1d: 0.08,
              change1w: 0.12,
              change1m: 0.2,
            },
          ],
          patternSummary: '2 similar outcome matches',
        })}::jsonb
      )
      WHERE id = ${eventId}
    `);

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/delivery/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      total: 1,
      cursor: null,
      events: [
        {
          id: eventId,
          title: 'Nvidia files material 8-K',
          source: 'sec-edgar',
          severity: 'CRITICAL',
          tickers: ['NVDA'],
          analysis: 'AI summary',
          impact: 'AI impact',
          action: '🔴 ACT NOW',
          regime_context: 'Risk appetite is supportive.',
          delivery_channels: [
            { channel: 'discord', ok: true },
            { channel: 'bark', ok: true },
          ],
          historical: {
            matchCount: 2,
            confidence: 'low',
            avgAlphaT5: 0.04,
            avgAlphaT20: 0.1,
            winRateT20: 100,
            medianAlphaT20: 0.1,
            avgChange1d: 0.06,
            avgChange1w: 0.11,
            topMatches: [],
            similarEvents: [
              {
                title: 'Nvidia raised AI guidance',
                ticker: 'NVDA',
                source: 'sec-edgar',
                eventTime: '2026-03-10T10:00:00.000Z',
                score: 0.88,
                eventPrice: 100,
                change1h: 0.01,
                change1d: 0.08,
                change1w: 0.12,
                change1m: 0.2,
              },
            ],
            patternSummary: '2 similar outcome matches',
          },
          delivered_at: '2026-03-13T10:01:00.000Z',
        },
      ],
    });
  });

  it('falls back to event metadata tickers and empty enrichment when llm enrichment is missing', async () => {
    await seedDeliveredEvent({
      title: 'Apple headline',
      ticker: 'AAPL',
      summary: 'Summary only',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
      metadata: {
        tickers: ['AAPL', 'QQQ'],
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/delivery/feed',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events[0]).toMatchObject({
      tickers: ['AAPL', 'QQQ'],
      analysis: '',
      impact: '',
      action: null,
      regime_context: null,
      historical: null,
    });
  });

  it('supports cursor pagination on the delivery feed', async () => {
    await seedDeliveredEvent({
      title: 'Oldest',
      ticker: 'AAPL',
      eventTime: '2026-03-13T07:00:00.000Z',
      auditTime: '2026-03-13T07:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Middle',
      ticker: 'MSFT',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
    });
    await seedDeliveredEvent({
      title: 'Newest',
      ticker: 'NVDA',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
    });

    const pageOne = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/delivery/feed?limit=2',
    });

    expect(pageOne.statusCode).toBe(200);
    expect(pageOne.json().events.map((event: { title: string }) => event.title)).toEqual([
      'Newest',
      'Middle',
    ]);

    const pageTwo = await ctx.server.inject({
      method: 'GET',
      url: `/api/v1/delivery/feed?limit=2&before=${encodeURIComponent(pageOne.json().cursor as string)}`,
    });

    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.json().events.map((event: { title: string }) => event.title)).toEqual(['Oldest']);
  });
});
