import type { FastifyInstance } from 'fastify';
import { and, eq, gte, sql, isNotNull, inArray } from 'drizzle-orm';
import { events, watchlist } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { requireApiKey } from './auth-middleware.js';
import { ensureUserExists, resolveRequestUserId } from './user-context.js';

export interface OnboardingRouteOptions {
  apiKey?: string;
}

const SECTOR_PACKS = [
  { name: 'Tech Leaders', tickers: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META'] },
  { name: 'Biotech', tickers: ['MRNA', 'PFE', 'ABBV', 'GILD', 'REGN'] },
  { name: 'Energy', tickers: ['XOM', 'CVX', 'OXY', 'SLB', 'COP'] },
  { name: 'Finance', tickers: ['JPM', 'GS', 'BAC', 'MS', 'V'] },
];

export function registerOnboardingRoutes(
  server: FastifyInstance,
  db: Database,
  options?: OnboardingRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  /**
   * GET /api/v1/onboarding/suggested-tickers
   * Returns top tickers by weighted event count in last 7 days + sector packs
   */
  server.get('/api/v1/onboarding/suggested-tickers', { preHandler: withAuth }, async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        symbol: events.ticker,
        eventCount7d: sql<number>`count(*)::int`,
        weightedScore: sql<number>`(
          sum(case
            when ${events.severity} = 'CRITICAL' then 4
            when ${events.severity} = 'HIGH' then 3
            when ${events.severity} = 'MEDIUM' then 2
            when ${events.severity} = 'LOW' then 1
            else 0
          end)
        )::int`,
        latestSignal: sql<string>`max(${events.severity})`,
      })
      .from(events)
      .where(
        and(
          isNotNull(events.ticker),
          gte(events.receivedAt, sevenDaysAgo),
          inArray(events.severity, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
        ),
      )
      .groupBy(events.ticker)
      .orderBy(sql`3 desc`) // order by weightedScore desc
      .limit(10);

    const tickers = rows
      .filter((r) => r.symbol != null)
      .map((r) => ({
        symbol: r.symbol!,
        eventCount7d: r.eventCount7d,
        latestSignal: r.latestSignal,
      }));

    return { tickers, packs: SECTOR_PACKS };
  });

  /**
   * POST /api/v1/onboarding/bulk-add
   * Batch-add tickers to user's watchlist (skip duplicates)
   */
  server.post('/api/v1/onboarding/bulk-add', {
    preHandler: withAuth,
    schema: {
      body: {
        type: 'object',
        required: ['tickers'],
        properties: {
          tickers: {
            type: 'array',
            items: { type: 'string', pattern: '^[A-Z]{1,5}$' },
            maxItems: 30,
          },
        },
      },
    },
  }, async (request) => {
    const { tickers } = request.body as { tickers: string[] };
    const userId = resolveRequestUserId(request);

    await ensureUserExists(db, userId);

    // Get existing tickers to skip duplicates
    const existing = await db
      .select({ ticker: watchlist.ticker })
      .from(watchlist)
      .where(and(eq(watchlist.userId, userId), inArray(watchlist.ticker, tickers)));

    const existingSet = new Set(existing.map((e) => e.ticker));
    const toAdd = tickers.filter((t) => !existingSet.has(t));

    if (toAdd.length > 0) {
      await db
        .insert(watchlist)
        .values(toAdd.map((ticker) => ({ userId, ticker })))
        .onConflictDoNothing();
    }

    // Get total watchlist count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchlist)
      .where(eq(watchlist.userId, userId));

    return { added: toAdd.length, total: countRow?.count ?? toAdd.length };
  });
}
