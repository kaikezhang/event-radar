import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import type { PGlite } from '@electric-sql/pglite';
import type { RawEvent } from '@event-radar/shared';
import { buildApp, type AppContext } from '../app.js';
import type { Database } from '../db/connection.js';
import { storeEvent } from '../db/event-store.js';
import { registerJudgeRoutes } from '../routes/judge.js';
import { cleanTestDb, createTestDb, safeClose, safeCloseServer } from './helpers/test-db.js';

const TEST_API_KEY = 'judge-test-api-key';

let sharedDb: Database;
let sharedClient: PGlite;

beforeAll(async () => {
  ({ db: sharedDb, client: sharedClient } = await createTestDb());
});

afterAll(async () => {
  await safeClose(sharedClient);
});

function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    id: crypto.randomUUID(),
    source: 'breaking-news',
    type: 'headline',
    title: 'Default judge event',
    body: 'Default body',
    timestamp: new Date('2026-03-13T12:00:00.000Z'),
    metadata: {
      ticker: 'AAPL',
      tickers: ['AAPL'],
    },
    ...overrides,
  };
}

async function seedJudgeAudit(input: {
  title: string;
  source: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ticker?: string;
  eventTime: string;
  auditTime: string;
  outcome: 'delivered' | 'filtered';
  stoppedAt: 'delivery' | 'llm_judge';
  judgeDecision?: 'PASS' | 'BLOCK';
  judgeConfidence?: number;
  judgeReason?: string;
  llmEnrichment?: {
    summary: string;
    impact: string;
    action: '🔴 High-Quality Setup' | '🟡 Monitor' | '🟢 Background';
    tickers: Array<{ symbol: string; direction: 'bullish' | 'bearish' | 'neutral' }>;
    regimeContext?: string;
  };
}): Promise<string> {
  const ticker = input.ticker ?? 'AAPL';
  const rawEvent = makeEvent({
    source: input.source,
    title: input.title,
      body: `${input.title} body`,
      timestamp: new Date(input.eventTime),
      metadata: {
        ticker,
        tickers: [ticker],
        ...(input.judgeDecision
          ? {
              llm_judge: {
                decision: input.judgeDecision,
                confidence: input.judgeConfidence ?? 0,
                reason: input.judgeReason ?? 'No reason provided',
              },
            }
          : {}),
        ...(input.llmEnrichment ? { llm_enrichment: input.llmEnrichment } : {}),
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
      reason_category,
      created_at
    ) VALUES (
      ${rawEvent.id},
      ${input.source},
      ${input.title},
      ${input.severity},
      ${ticker},
      ${input.outcome},
      ${input.stoppedAt},
      ${input.judgeReason
        ? `LLM: ${input.judgeReason} (confidence: ${input.judgeConfidence ?? 0})`
        : 'No judge reason'},
      ${input.stoppedAt === 'llm_judge' ? 'llm_judge' : 'filter_pass'},
      ${new Date(input.auditTime)}
    )
  `);

  return rawEvent.id;
}

describe('judge routes', () => {
  let ctx: AppContext;

  beforeEach(async () => {
    await cleanTestDb(sharedDb);
    ctx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
    await ctx.server.ready();
  });

  afterEach(async () => {
    await safeCloseServer(ctx.server);
  });

  it('returns recent pass and block judgments ordered by newest audit record first', async () => {
    const passedId = await seedJudgeAudit({
      title: 'Apple confirms major supplier shift',
      source: 'breaking-news',
      severity: 'HIGH',
      ticker: 'AAPL',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:02:00.000Z',
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.84,
      judgeReason: 'material supply-chain change with immediate read-through',
    });

    const blockedId = await seedJudgeAudit({
      title: 'Rumor account repeats old tariff story',
      source: 'x-scanner',
      severity: 'LOW',
      ticker: 'TSLA',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:05:00.000Z',
      outcome: 'filtered',
      stoppedAt: 'llm_judge',
      judgeDecision: 'BLOCK',
      judgeConfidence: 0.27,
      judgeReason: 'stale rumor without new facts',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/recent?limit=10',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: [
        {
          id: blockedId,
          title: 'Rumor account repeats old tariff story',
          source: 'x-scanner',
          severity: 'LOW',
          decision: 'BLOCK',
          confidence: 0.27,
          reason: 'stale rumor without new facts',
          ticker: 'TSLA',
          at: '2026-03-13T10:05:00.000Z',
        },
        {
          id: passedId,
          title: 'Apple confirms major supplier shift',
          source: 'breaking-news',
          severity: 'HIGH',
          decision: 'PASS',
          confidence: 0.84,
          reason: 'material supply-chain change with immediate read-through',
          ticker: 'AAPL',
          at: '2026-03-13T09:02:00.000Z',
        },
      ],
    });
  });

  it('applies the recent limit to judge events', async () => {
    await seedJudgeAudit({
      title: 'First judge event',
      source: 'breaking-news',
      severity: 'MEDIUM',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.91,
      judgeReason: 'fresh filing',
    });
    await seedJudgeAudit({
      title: 'Second judge event',
      source: 'breaking-news',
      severity: 'MEDIUM',
      eventTime: '2026-03-13T08:30:00.000Z',
      auditTime: '2026-03-13T08:31:00.000Z',
      outcome: 'filtered',
      stoppedAt: 'llm_judge',
      judgeDecision: 'BLOCK',
      judgeConfidence: 0.16,
      judgeReason: 'commentary only',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/recent?limit=1',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].title).toBe('Second judge event');
  });

  it('aggregates judge pass and block totals by source', async () => {
    await seedJudgeAudit({
      title: 'SEC filing passes',
      source: 'sec-edgar',
      severity: 'HIGH',
      eventTime: '2026-03-13T08:00:00.000Z',
      auditTime: '2026-03-13T08:01:00.000Z',
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.88,
      judgeReason: 'regulatory filing',
    });
    await seedJudgeAudit({
      title: 'Second filing passes',
      source: 'sec-edgar',
      severity: 'HIGH',
      eventTime: '2026-03-13T09:00:00.000Z',
      auditTime: '2026-03-13T09:01:00.000Z',
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.83,
      judgeReason: 'follow-on filing',
    });
    await seedJudgeAudit({
      title: 'Social rumor blocked',
      source: 'reddit',
      severity: 'LOW',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:01:00.000Z',
      outcome: 'filtered',
      stoppedAt: 'llm_judge',
      judgeDecision: 'BLOCK',
      judgeConfidence: 0.12,
      judgeReason: 'speculative rumor',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/stats',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bySource: {
        'sec-edgar': { passed: 2, blocked: 0 },
        reddit: { passed: 0, blocked: 1 },
      },
      total: {
        passed: 2,
        blocked: 1,
      },
    });
  });

  it('filters judge stats by the requested time window', async () => {
    const recentEventTime = new Date(Date.now() - 30 * 60 * 1000);
    const recentAuditTime = new Date(Date.now() - 29 * 60 * 1000);

    await seedJudgeAudit({
      title: 'Older blocked item',
      source: 'reddit',
      severity: 'LOW',
      eventTime: '2026-03-12T01:00:00.000Z',
      auditTime: '2026-03-12T01:05:00.000Z',
      outcome: 'filtered',
      stoppedAt: 'llm_judge',
      judgeDecision: 'BLOCK',
      judgeConfidence: 0.2,
      judgeReason: 'out of window',
    });
    await seedJudgeAudit({
      title: 'Fresh passed item',
      source: 'breaking-news',
      severity: 'HIGH',
      eventTime: recentEventTime.toISOString(),
      auditTime: recentAuditTime.toISOString(),
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.9,
      judgeReason: 'fresh and material',
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/stats?since=1h',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bySource: {
        'breaking-news': { passed: 1, blocked: 0 },
      },
      total: {
        passed: 1,
        blocked: 0,
      },
    });
  });

  it('rejects unsupported time windows for judge stats', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/stats?since=30m',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid since window' });
  });

  it('rejects invalid recent limits instead of silently falling back', async () => {
    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/judge/recent?limit=abc',
      headers: {
        'x-api-key': TEST_API_KEY,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid limit' });
  });

  it('requires an API key for judge routes', async () => {
    const prev = process.env.AUTH_REQUIRED;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'test-jwt-secret';
    try {
      const authCtx = buildApp({ logger: false, db: sharedDb, apiKey: TEST_API_KEY });
      await authCtx.server.ready();
      try {
        const response = await authCtx.server.inject({
          method: 'GET',
          url: '/api/v1/judge/recent',
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
      } finally {
        await safeCloseServer(authCtx.server);
      }
    } finally {
      process.env.AUTH_REQUIRED = prev;
      delete process.env.JWT_SECRET;
    }
  });

  it('returns llm enrichment details on audit events when present', async () => {
    const eventId = await seedJudgeAudit({
      title: 'Judge enrichment event',
      source: 'sec-edgar',
      severity: 'CRITICAL',
      ticker: 'NVDA',
      eventTime: '2026-03-13T10:00:00.000Z',
      auditTime: '2026-03-13T10:02:00.000Z',
      outcome: 'delivered',
      stoppedAt: 'delivery',
      judgeDecision: 'PASS',
      judgeConfidence: 0.93,
      judgeReason: 'clear fundamental catalyst',
      llmEnrichment: {
        summary: 'Nvidia disclosed a material customer commitment.',
        impact: 'Revenue visibility improves and peers may rerate.',
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
        regimeContext: 'Risk-on tape could amplify the reaction.',
      },
    });

    const response = await ctx.server.inject({
      method: 'GET',
      url: '/api/v1/audit?limit=10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      count: 1,
      events: [
        expect.objectContaining({
          event_id: eventId,
          title: 'Judge enrichment event',
          llm_enrichment: {
            analysis: 'Nvidia disclosed a material customer commitment.\n\nRevenue visibility improves and peers may rerate.',
            action: '🔴 High-Quality Setup',
            signal: '🔴 High-Quality Setup',
            tickers: ['NVDA'],
            regimeContext: 'Risk-on tape could amplify the reaction.',
            confidence: 0.93,
          },
        }),
      ],
    });
  });

  it('returns 503 from judge routes when the database is not configured', async () => {
    const noDbCtx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await noDbCtx.server.ready();

    const [recentResponse, statsResponse] = await Promise.all([
      noDbCtx.server.inject({
        method: 'GET',
        url: '/api/v1/judge/recent',
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      }),
      noDbCtx.server.inject({
        method: 'GET',
        url: '/api/v1/judge/stats',
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      }),
    ]);

    expect(recentResponse.statusCode).toBe(503);
    expect(statsResponse.statusCode).toBe(503);

    await safeCloseServer(noDbCtx.server);
  });

  it('applies a default stats query cap when no since window is provided', async () => {
    const dialect = new PgDialect();
    const execute = async (query: {
      toQuery: (config: {
        casing: { getColumnCasing: (column: string) => string };
        escapeName: (name: string) => string;
        escapeParam: (num: number, value: unknown) => string;
        escapeString: (value: string) => string;
        prepareTyping: () => 'none';
        inlineParams: boolean;
        paramStartIndex: { value: number };
      }) => { sql: string; params: unknown[] };
    }) => {
      const compiled = query.toQuery({
        casing: { getColumnCasing: (column: string) => column },
        escapeName: dialect.escapeName,
        escapeParam: dialect.escapeParam,
        escapeString: dialect.escapeString,
        prepareTyping: () => 'none',
        inlineParams: false,
        paramStartIndex: { value: 0 },
      });

      expect(compiled.sql).toContain('LIMIT $1');
      expect(compiled.params.at(-1)).toBe(10_000);

      return { rows: [] };
    };
    const server = Fastify({ logger: false });

    registerJudgeRoutes(server, { execute } as unknown as Database);
    await server.ready();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/judge/stats',
    });

    expect(response.statusCode).toBe(200);

    await safeCloseServer(server);
  });
});
