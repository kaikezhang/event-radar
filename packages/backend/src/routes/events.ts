import type { FastifyInstance } from 'fastify';
import { eq, sql, and, count, gte, lte, asc } from 'drizzle-orm';
import { events, pipelineAudit, watchlist } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { findSimilarEvents } from '../services/event-similarity.js';
import { resolveRequestUserId } from './user-context.js';

// Query params schema for GET /api/events
const ListEventsQuerySchema = {
  type: 'object',
  properties: {
    ticker: {
      type: 'string',
      pattern: '^[A-Z]{1,5}$',
      description: 'Filter by ticker symbol (1-5 uppercase letters)',
    },
    type: {
      type: 'string',
      description: 'Filter by event type',
    },
    severity: {
      type: 'string',
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      description: 'Filter by severity level',
    },
    source: {
      type: 'string',
      description: 'Filter by event source',
    },
    dateFrom: {
      type: 'string',
      format: 'date-time',
      description: 'Filter events from this date (ISO 8601)',
    },
    dateTo: {
      type: 'string',
      format: 'date-time',
      description: 'Filter events until this date (ISO 8601)',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
      description: 'Maximum number of events to return',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0,
      description: 'Number of events to skip',
    },
    confirmed: {
      type: 'boolean',
      description: 'Filter for multi-source confirmed events (confirmation_count >= 2)',
    },
    watchlist: {
      type: 'boolean',
      description: 'Filter events to only watchlist tickers',
    },
  },
} as const;

// Query params schema for GET /api/events/:id
const EventIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Event UUID',
    },
  },
} as const;

// Similar events query params
const SimilarEventsQuerySchema = {
  type: 'object',
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Maximum similar events to return',
    },
    timeWindow: {
      type: 'integer',
      minimum: 1,
      maximum: 10080,
      default: 60,
      description: 'Time window in minutes to search for similar events',
    },
    minScore: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: 0.5,
      description: 'Minimum similarity score threshold (0-1)',
    },
    sameTickerOnly: {
      type: 'boolean',
      default: false,
      description: 'Only return events with the same ticker',
    },
  },
} as const;

export interface ListEventsQuery {
  ticker?: string;
  type?: string;
  severity?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  confirmed?: boolean;
  watchlist?: boolean;
}

export interface EventParams {
  id: string;
}

const CONFIRMATION_WINDOW_MS = 30 * 60 * 1000;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export function registerEventRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  /**
   * GET /api/events
   * List events with filters
   * Requires API key authentication
   */
  server.get('/api/events', {
    schema: {
      querystring: ListEventsQuerySchema,
    },
  }, async (request) => {
    const query = request.query as ListEventsQuery;

    const pageLimit = Math.min(query.limit || 50, 200);
    const pageOffset = query.offset || 0;

    const conditions = [];

    // Filter by ticker (search in metadata->>'ticker')
    if (query.ticker) {
      conditions.push(eq(events.ticker, query.ticker));
    }

    // Filter by classified event type
    if (query.type) {
      conditions.push(eq(events.eventType, query.type));
    }

    // Filter by severity
    if (query.severity) {
      conditions.push(eq(events.severity, query.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'));
    }

    // Filter by source
    if (query.source) {
      conditions.push(eq(events.source, query.source));
    }

    // Filter by dateFrom (receivedAt >= dateFrom)
    if (query.dateFrom) {
      const fromDate = new Date(query.dateFrom);
      conditions.push(gte(events.receivedAt, fromDate));
    }

    // Filter by dateTo (receivedAt <= dateTo)
    if (query.dateTo) {
      const toDate = new Date(query.dateTo);
      conditions.push(lte(events.receivedAt, toDate));
    }

    // Filter for multi-source confirmed events
    if (query.confirmed) {
      conditions.push(gte(events.confirmationCount, 2));
    }

    // Filter by watchlist tickers
    if (query.watchlist) {
      const userId = resolveRequestUserId(request);
      const watchlistTickers = await db
        .select({ ticker: watchlist.ticker })
        .from(watchlist)
        .where(eq(watchlist.userId, userId));
      const tickers = watchlistTickers.map((w) => w.ticker);
      if (tickers.length > 0) {
        conditions.push(
          sql`(${events.ticker} IN (${sql.join(tickers.map(t => sql`${t}`), sql`, `)}) OR ${events.metadata}->'tickers' ?| array[${sql.join(tickers.map(t => sql`${t}`), sql`, `)}])`,
        );
      } else {
        // No watchlist tickers — return empty
        conditions.push(sql`false`);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(events)
        .where(where)
        .orderBy(sql`${events.receivedAt} desc`)
        .limit(pageLimit)
        .offset(pageOffset),
      db.select({ total: count() }).from(events).where(where),
    ]);

    return { data, total };
  });

  /**
   * GET /api/events/search
   * Full-text search across event title, body, and tickers
   */
  server.get('/api/events/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1, description: 'Search query' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        required: ['q'],
      },
    },
  }, async (request) => {
    const { q, limit: rawLimit } = request.query as { q: string; limit?: number };
    const searchLimit = Math.min(rawLimit || 20, 100);

    // Normalize and check if query is a ticker-like pattern (1-5 letters)
    const trimmed = q.trim().toUpperCase();
    const isTickerQuery = /^[A-Z]{1,5}$/.test(trimmed);

    // Full-text search using to_tsvector / plainto_tsquery
    const searchVector = sql`to_tsvector('english', coalesce(${events.title}, '') || ' ' || coalesce(${events.summary}, ''))`;
    const tsQuery = sql`plainto_tsquery('english', ${q})`;

    if (isTickerQuery) {
      // Ticker-like query: do both ticker match AND full-text search, union results
      const ticker = trimmed;
      const tickerCondition = sql`(${events.ticker} = ${ticker} OR ${events.metadata}->'tickers' @> ${JSON.stringify([ticker])}::jsonb)`;
      const textCondition = sql`${searchVector} @@ ${tsQuery}`;

      const data = await db
        .select()
        .from(events)
        .where(sql`(${tickerCondition} OR ${textCondition})`)
        .orderBy(sql`${events.receivedAt} DESC`)
        .limit(searchLimit);

      return { data, total: data.length };
    }

    const data = await db
      .select({
        id: events.id,
        source: events.source,
        sourceEventId: events.sourceEventId,
        ticker: events.ticker,
        eventType: events.eventType,
        title: events.title,
        summary: events.summary,
        rawPayload: events.rawPayload,
        metadata: events.metadata,
        severity: events.severity,
        receivedAt: events.receivedAt,
        createdAt: events.createdAt,
        mergedFrom: events.mergedFrom,
        sourceUrls: events.sourceUrls,
        isDuplicate: events.isDuplicate,
        confirmedSources: events.confirmedSources,
        confirmationCount: events.confirmationCount,
        rank: sql<number>`ts_rank(${searchVector}, ${tsQuery})`.as('rank'),
      })
      .from(events)
      .where(sql`${searchVector} @@ ${tsQuery}`)
      .orderBy(sql`ts_rank(${searchVector}, ${tsQuery}) DESC`, sql`${events.receivedAt} DESC`)
      .limit(searchLimit);

    return { data, total: data.length };
  });

  /**
   * GET /api/events/sources
   * Returns unique event sources
   */
  server.get('/api/events/sources', async () => {
    const rows = await db
      .selectDistinct({ source: events.source })
      .from(events)
      .orderBy(events.source);

    return { sources: rows.map((r) => r.source) };
  });

  /**
   * GET /api/events/:id
   * Get full event detail by ID
   * Requires API key authentication
   */
  server.get('/api/events/:id', {
    schema: {
      params: EventIdParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as EventParams;

    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const provenanceRows =
      event.ticker && event.eventType
        ? await db
            .select({
              id: events.id,
              source: events.source,
              title: events.title,
              receivedAt: events.receivedAt,
              createdAt: events.createdAt,
              sourceUrls: events.sourceUrls,
            })
            .from(events)
            .where(sql`
              ${events.ticker} = ${event.ticker}
              AND ${events.eventType} = ${event.eventType}
              AND ${events.createdAt} >= ${new Date(event.createdAt.getTime() - CONFIRMATION_WINDOW_MS)}
              AND ${events.createdAt} <= ${new Date(event.createdAt.getTime() + CONFIRMATION_WINDOW_MS)}
            `)
            .orderBy(asc(events.createdAt))
        : [];

    // Fetch pipeline audit trail for this event (join on sourceEventId)
    const auditRows = event.sourceEventId
      ? await db
          .select({
            outcome: pipelineAudit.outcome,
            stoppedAt: pipelineAudit.stoppedAt,
            reason: pipelineAudit.reason,
            confidence: pipelineAudit.confidence,
            historicalMatch: pipelineAudit.historicalMatch,
            historicalConfidence: pipelineAudit.historicalConfidence,
            deliveryChannels: pipelineAudit.deliveryChannels,
            durationMs: pipelineAudit.durationMs,
            createdAt: pipelineAudit.createdAt,
          })
          .from(pipelineAudit)
          .where(eq(pipelineAudit.eventId, event.sourceEventId))
          .orderBy(asc(pipelineAudit.createdAt))
          .limit(1)
      : [];

    const auditRecord = auditRows[0] ?? null;

    const confirmedSources = uniqueStrings([
      event.source,
      ...((event.confirmedSources as string[] | null) ?? []),
      ...provenanceRows.map((row) => row.source),
    ]);
    const confirmationCount = Math.max(event.confirmationCount ?? 1, confirmedSources.length);

    return {
      ...event,
      confirmationCount,
      confirmedSources,
      audit: auditRecord
        ? {
            outcome: auditRecord.outcome,
            stoppedAt: auditRecord.stoppedAt,
            reason: auditRecord.reason,
            confidence: auditRecord.confidence ? Number(auditRecord.confidence) : null,
            historicalMatch: auditRecord.historicalMatch,
            historicalConfidence: auditRecord.historicalConfidence,
            deliveryChannels: auditRecord.deliveryChannels,
            enrichedAt: auditRecord.createdAt?.toISOString() ?? null,
          }
        : null,
      provenance: provenanceRows.map((row) => {
        const urls = Array.isArray(row.sourceUrls)
          ? row.sourceUrls
          : typeof row.sourceUrls === 'string'
            ? (() => {
                try {
                  return JSON.parse(row.sourceUrls) as unknown[];
                } catch {
                  return [];
                }
              })()
            : [];

        return {
          id: row.id,
          source: row.source,
          title: row.title,
          receivedAt: row.receivedAt,
          createdAt: row.createdAt,
          url: urls.find((value): value is string => typeof value === 'string') ?? null,
        };
      }),
    };
  });

  /**
   * GET /api/events/:id/similar
   * Find similar events using weighted similarity scoring
   * Factors: ticker overlap (0.4), time proximity (0.3), content similarity (0.3)
   */
  server.get('/api/events/:id/similar', {
    schema: {
      params: EventIdParamsSchema,
      querystring: SimilarEventsQuerySchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as EventParams;
    const query = request.query as {
      limit?: number;
      timeWindow?: number;
      minScore?: number;
      sameTickerOnly?: boolean;
    };

    // Check that the event exists
    const [sourceEvent] = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!sourceEvent) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    const similar = await findSimilarEvents(db, id, {
      maxResults: query.limit,
      timeWindowMinutes: query.timeWindow,
      minScore: query.minScore,
      sameTickerOnly: query.sameTickerOnly,
    });

    return { data: similar };
  });

  /**
   * GET /api/stats
   * Returns event statistics
   */
  server.get('/api/stats', async () => {
    const [bySource, bySeverity, [{ total }]] = await Promise.all([
      db
        .select({ source: events.source, count: count() })
        .from(events)
        .groupBy(events.source),
      db
        .select({ severity: events.severity, count: count() })
        .from(events)
        .groupBy(events.severity),
      db.select({ total: count() }).from(events),
    ]);

    return { bySource, bySeverity, total };
  });
}
