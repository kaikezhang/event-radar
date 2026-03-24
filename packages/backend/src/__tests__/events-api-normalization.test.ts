import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
  safeCloseServer,
} from './helpers/test-db.js';

const TEST_API_KEY = 'events-normalization-test-api-key';

let sharedDb: Database;
let sharedClient: PGlite;
let ctx: AppContext | null = null;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
});

afterAll(async () => {
  if (ctx) {
    await safeCloseServer(ctx.server);
  }
  await safeClose(sharedClient);
});

beforeEach(async () => {
  await cleanTestDb(sharedDb);
  if (ctx) {
    await safeCloseServer(ctx.server);
    ctx = null;
  }
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: randomUUID(),
    source: 'breaking-news',
    type: 'breaking',
    title: 'Default event title',
    body: 'Default event body',
    timestamp: new Date('2026-03-21T14:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
    },
    ...overrides,
  };
}

async function seedDeliveredEvent(input?: {
  event?: Partial<RawEvent>;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  outcomePrice?: number | null;
}): Promise<{ eventId: string; rawEvent: RawEvent }> {
  const rawEvent = makeEvent(input?.event);
  const eventId = await storeEvent(sharedDb, {
    event: rawEvent,
    severity: input?.severity ?? 'HIGH',
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
      reason
    ) VALUES (
      ${rawEvent.id},
      ${rawEvent.source},
      ${rawEvent.title},
      ${input?.severity ?? 'HIGH'},
      ${typeof rawEvent.metadata?.ticker === 'string' ? rawEvent.metadata.ticker : null},
      'delivered',
      'delivery',
      'Passed pipeline'
    )
  `);

  if (input?.outcomePrice !== undefined) {
    await sharedDb.execute(sql`
      INSERT INTO event_outcomes (
        event_id,
        ticker,
        event_time,
        event_price
      ) VALUES (
        ${eventId},
        ${typeof rawEvent.metadata?.ticker === 'string' ? rawEvent.metadata.ticker : 'SPY'},
        ${rawEvent.timestamp},
        ${input.outcomePrice != null ? String(input.outcomePrice) : null}
      )
    `);
  }

  return { eventId, rawEvent };
}

async function startApp(): Promise<AppContext> {
  ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
  await ctx.server.ready();
  return ctx;
}

describe('events API normalization', () => {
  it('normalizes enriched list responses into top-level fields', async () => {
    await seedDeliveredEvent({
      event: {
        title: 'Iran &amp; Hormuz &#x2014; risk rising',
        body: 'Headline &amp; summary',
        metadata: {
          ticker: 'NVDA',
          rawContent: 'Primary source text',
          url: 'https://example.com/source',
          llm_judge: {
            confidence: '0.84',
          },
          llm_enrichment: {
            summary: 'AI summary',
            impact: 'Margin risk',
            risks: 'Execution risk',
            action: 'Wait for confirmation',
            whyNow: 'Export rules tightened',
            historicalContext: 'Prior semiconductor crackdowns',
            regimeContext: 'Risk-off tape',
            tickers: [{ symbol: 'NVDA', direction: 'bearish' }],
          },
        },
      },
      outcomePrice: 912.34,
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]).toMatchObject({
      title: 'Iran & Hormuz — risk rising',
      summary: 'Headline & summary',
      sourceUrl: 'https://example.com/source',
      evidence: 'Primary source text',
      direction: 'BEARISH',
      confidence: 0.84,
      priceAtEvent: 912.34,
      analysis: {
        summary: 'AI summary',
        impact: 'Margin risk',
        risks: 'Execution risk',
        action: 'Wait for confirmation',
        whyNow: 'Export rules tightened',
        historicalContext: 'Prior semiconductor crackdowns',
        regimeContext: 'Risk-off tape',
      },
    });
  });

  it('normalizes enriched detail responses into top-level fields', async () => {
    const { eventId } = await seedDeliveredEvent({
      event: {
        title: 'Detail &amp; catalyst',
        body: 'Detail &amp; summary',
        metadata: {
          ticker: 'AAPL',
          sourceUrl: 'https://example.com/detail',
          rawContent: 'Detailed source evidence',
          llm_judge: {
            confidence: '0.67',
          },
          llm_enrichment: {
            summary: 'Detail summary',
            impact: 'Demand improves',
            risks: 'Valuation is rich',
            action: 'Monitor pullbacks',
            whyNow: 'Channel checks improved',
            historicalContext: 'Matches prior iPhone ramps',
            regimeContext: 'Large-cap leadership remains firm',
            tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
          },
        },
      },
      outcomePrice: 201.15,
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: `/api/events/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      title: 'Detail & catalyst',
      summary: 'Detail & summary',
      sourceUrl: 'https://example.com/detail',
      evidence: 'Detailed source evidence',
      direction: 'BULLISH',
      confidence: 0.67,
      priceAtEvent: 201.15,
      analysis: {
        summary: 'Detail summary',
        impact: 'Demand improves',
        risks: 'Valuation is rich',
        action: 'Monitor pullbacks',
        whyNow: 'Channel checks improved',
        historicalContext: 'Matches prior iPhone ramps',
        regimeContext: 'Large-cap leadership remains firm',
      },
    });
  });

  it('uses sourceUrls before metadata fallbacks when building sourceUrl', async () => {
    await seedDeliveredEvent({
      event: {
        url: 'https://example.com/raw-event-url',
        metadata: {
          ticker: 'MSFT',
          url: 'https://example.com/metadata-url',
          sourceUrl: 'https://example.com/metadata-source-url',
          source_feed_url: 'https://example.com/feed-url',
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=MSFT',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]?.sourceUrl).toBe('https://example.com/raw-event-url');
  });

  it('falls back sourceUrl to metadata.source_feed_url when direct urls are missing', async () => {
    const { eventId } = await seedDeliveredEvent({
      event: {
        metadata: {
          ticker: 'QQQ',
          source_feed_url: 'https://example.com/feed-only',
        },
      },
    });

    await sharedDb.execute(sql`
      UPDATE events
      SET source_urls = NULL
      WHERE id = ${eventId}
    `);

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: `/api/events/${eventId}`,
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sourceUrl).toBe('https://example.com/feed-only');
  });

  it('prefers metadata.body for evidence when rawContent is absent', async () => {
    await seedDeliveredEvent({
      event: {
        metadata: {
          ticker: 'TSLA',
          body: 'Expanded body evidence',
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=TSLA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]?.evidence).toBe('Expanded body evidence');
  });

  it('falls back evidence to the stored summary when source text is unavailable', async () => {
    await seedDeliveredEvent({
      event: {
        body: 'Fallback summary evidence',
        metadata: {
          ticker: 'AMD',
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=AMD',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]?.evidence).toBe('Fallback summary evidence');
  });

  it('uses metadata.event_price for priceAtEvent when no outcome row exists', async () => {
    await seedDeliveredEvent({
      event: {
        metadata: {
          ticker: 'META',
          event_price: '601.45',
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=META',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]?.priceAtEvent).toBe(601.45);
  });

  it('extracts priceAtEvent from llm_enrichment.currentSetup when no stored price exists', async () => {
    await seedDeliveredEvent({
      event: {
        metadata: {
          ticker: 'AVGO',
          llm_enrichment: {
            currentSetup: 'Broadcom is coiling just above $478.55 with buyers defending the breakout.',
          },
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=AVGO',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { data: Array<Record<string, unknown>> };
    expect(payload.data[0]?.priceAtEvent).toBe(478.55);
  });

  it('matches ticker filters against llm_enrichment ticker symbols when the direct ticker is missing', async () => {
    await seedDeliveredEvent({
      event: {
        body: 'GPU export restrictions intensified overnight.',
        metadata: {
          llm_enrichment: {
            tickers: [{ symbol: 'NVDA', direction: 'bearish' }],
          },
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const titles = (response.json() as { data: Array<{ title: string }> }).data.map((event) => event.title);
    expect(titles).toContain('Default event title');
  });

  it('does not return events that only mention the ticker in title or body text', async () => {
    await seedDeliveredEvent({
      event: {
        title: 'NVDA mentioned in commentary, but this is a Tesla event',
        body: 'Analysts compared NVDA demand while discussing TSLA delivery risk.',
        metadata: {
          ticker: 'TSLA',
          tickers: ['TSLA'],
        },
      },
    });

    await seedDeliveredEvent({
      event: {
        title: 'Real NVDA catalyst',
        metadata: {
          ticker: 'NVDA',
          tickers: ['NVDA'],
        },
      },
    });

    const app = await startApp();
    const response = await app.server.inject({
      method: 'GET',
      url: '/api/events?ticker=NVDA',
      headers: { 'x-api-key': TEST_API_KEY },
    });

    expect(response.statusCode).toBe(200);
    const titles = (response.json() as { data: Array<{ title: string }> }).data.map((event) => event.title);
    expect(titles).toContain('Real NVDA catalyst');
    expect(titles).not.toContain('NVDA mentioned in commentary, but this is a Tesla event');
  });
});
