import type { FastifyInstance } from 'fastify';
import { eq, sql, and, count, gte, lte } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { Database } from '../db/connection.js';
import { findSimilarEvents } from '../services/event-similarity.js';

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
}

export interface EventParams {
  id: string;
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
      conditions.push(eq(events.metadata, JSON.stringify({ ticker: query.ticker })) as ReturnType<typeof eq>);
    }

    // Filter by type (stored in source field for 8-K, etc.)
    if (query.type) {
      conditions.push(eq(events.sourceEventId, query.type));
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

    return event;
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
