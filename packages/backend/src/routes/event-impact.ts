import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { ImpactEvent, ImpactResponse, Severity } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  classificationOutcomes,
  events,
  eventOutcomes,
} from '../db/schema.js';
import { requireApiKey } from './auth-middleware.js';

const ImpactQuerySchema = {
  type: 'object',
  required: ['ticker'],
  properties: {
    ticker: { type: 'string', minLength: 1 },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    severity: {
      type: 'string',
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    },
  },
} as const;

interface EventImpactRouteOptions {
  apiKey?: string;
}

interface EventImpactQuery {
  ticker: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: Severity;
}

function toNumber(value: string | number | null): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildConditions(query: EventImpactQuery): SQL[] {
  const conditions: SQL[] = [
    sql`upper(${events.metadata}->>'ticker') = ${query.ticker.trim().toUpperCase()}`,
  ];

  if (query.dateFrom) {
    conditions.push(gte(events.receivedAt, new Date(query.dateFrom)));
  }

  if (query.dateTo) {
    conditions.push(lte(events.receivedAt, new Date(query.dateTo)));
  }

  if (query.severity) {
    conditions.push(eq(events.severity, query.severity));
  }

  return conditions;
}

function toImpactEvent(row: {
  eventId: string;
  timestamp: Date;
  ticker: string | null;
  headline: string;
  severity: string | null;
  direction: string;
  priceAtEvent: string | null;
  priceChange1h: string;
  priceChange1d: string;
  priceChange1w: string;
}, fallbackTicker: string): ImpactEvent {
  return {
    eventId: row.eventId,
    timestamp: row.timestamp.toISOString(),
    ticker: row.ticker ?? fallbackTicker,
    headline: row.headline,
    severity: (row.severity as Severity | null) ?? null,
    direction: row.direction,
    priceAtEvent: toNumber(row.priceAtEvent),
    priceChange1h: toNumber(row.priceChange1h) ?? 0,
    priceChange1d: toNumber(row.priceChange1d) ?? 0,
    priceChange1w: toNumber(row.priceChange1w) ?? 0,
  };
}

export function registerEventImpactRoutes(
  server: FastifyInstance,
  db: Database,
  options?: EventImpactRouteOptions,
): void {
  server.get('/api/v1/events/impact', {
    schema: { querystring: ImpactQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request): Promise<ImpactResponse> => {
    const query = request.query as EventImpactQuery;
    const fallbackTicker = query.ticker.trim().toUpperCase();
    const where = and(...buildConditions(query));

    const rows = await db
      .select({
        eventId: events.id,
        timestamp: events.receivedAt,
        ticker: sql<string | null>`upper(${events.metadata}->>'ticker')`,
        headline: events.title,
        severity: events.severity,
        direction: classificationOutcomes.actualDirection,
        priceAtEvent: eventOutcomes.eventPrice,
        priceChange1h: classificationOutcomes.priceChange1h,
        priceChange1d: classificationOutcomes.priceChange1d,
        priceChange1w: classificationOutcomes.priceChange1w,
      })
      .from(events)
      .innerJoin(
        classificationOutcomes,
        eq(classificationOutcomes.eventId, events.id),
      )
      .leftJoin(eventOutcomes, eq(eventOutcomes.eventId, events.id))
      .where(where)
      .orderBy(desc(events.receivedAt));

    return {
      events: rows.map((row) => toImpactEvent(row, fallbackTicker)),
    };
  });
}
