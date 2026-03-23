import type { FastifyInstance } from 'fastify';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { events, pipelineAudit, watchlist } from '../db/schema.js';
import { requireApiKey } from './auth-middleware.js';
import { resolveRequestUserId } from './user-context.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

interface BriefingEventRow {
  title: string;
  ticker: string | null;
  severity: string | null;
  source: string;
  createdAt: Date;
}

export interface BriefingRouteOptions {
  apiKey?: string;
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function compareByPriority(a: BriefingEventRow, b: BriefingEventRow): number {
  const severityDiff = (SEVERITY_PRIORITY[b.severity ?? ''] ?? 0) - (SEVERITY_PRIORITY[a.severity ?? ''] ?? 0);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function registerBriefingRoutes(
  server: FastifyInstance,
  db: Database,
  options?: BriefingRouteOptions,
): void {
  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options?.apiKey);

  server.get('/api/v1/briefing/daily', {
    preHandler: withAuth,
  }, async (request) => {
    const now = new Date();
    const since = new Date(now.getTime() - DAY_MS);
    const userId = resolveRequestUserId(request);

    const recentEvents = await db
      .select({
        title: events.title,
        ticker: events.ticker,
        severity: events.severity,
        source: events.source,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(and(
        gte(events.createdAt, since),
        ne(events.source, 'dummy'),
        sql`EXISTS (
          SELECT 1
          FROM ${pipelineAudit}
          WHERE ${pipelineAudit.eventId} = ${events.sourceEventId}
            AND ${pipelineAudit.outcome} = 'delivered'
        )`,
      ));

    const watchlistRows = await db
      .select({ ticker: watchlist.ticker })
      .from(watchlist)
      .where(eq(watchlist.userId, userId));
    const watchlistTickers = new Set(watchlistRows.map((row) => row.ticker.toUpperCase()));

    const bySeverity = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    const bySource: Record<string, number> = {};
    let watchlistEvents = 0;

    for (const event of recentEvents) {
      const severity = event.severity ?? 'LOW';
      if (severity in bySeverity) {
        bySeverity[severity as keyof typeof bySeverity] += 1;
      }

      bySource[event.source] = (bySource[event.source] ?? 0) + 1;

      if (event.ticker && watchlistTickers.has(event.ticker.toUpperCase())) {
        watchlistEvents += 1;
      }
    }

    const topEvents = recentEvents
      .slice()
      .sort(compareByPriority)
      .slice(0, 3)
      .map((event) => ({
        title: event.title,
        ticker: event.ticker,
        severity: event.severity ?? 'LOW',
      }));

    return {
      date: toDateKey(now),
      totalEvents: recentEvents.length,
      bySeverity,
      topEvents,
      bySource,
      watchlistEvents,
    };
  });
}
