import type { FastifyInstance } from 'fastify';
import {
  and,
  asc,
  count,
  desc,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  HistoryEvent,
  HistoryResponse,
  SectorAggregate,
  SectorAggregateResponse,
  Severity,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { events } from '../db/schema.js';
import { resolveSector } from '../data/sector-map.js';
import { requireApiKey } from './auth-middleware.js';

type EventRow = typeof events.$inferSelect;

const VALID_SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const HistoryQuerySchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string' },
    source: { type: 'string' },
    severity: { type: 'string' },
    type: { type: 'string' },
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, default: 50 },
    sortBy: {
      type: 'string',
      enum: ['timestamp', 'ticker', 'source', 'type', 'severity', 'headline'],
      default: 'timestamp',
    },
    sortOrder: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'desc',
    },
  },
} as const;

const SectorQuerySchema = {
  type: 'object',
  properties: {
    dateFrom: { type: 'string', format: 'date-time' },
    dateTo: { type: 'string', format: 'date-time' },
    severity: { type: 'string' },
  },
} as const;

interface EventsHistoryRouteOptions {
  apiKey?: string;
}

interface HistoryQuery {
  ticker?: string;
  source?: string;
  severity?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'timestamp' | 'ticker' | 'source' | 'type' | 'severity' | 'headline';
  sortOrder?: 'asc' | 'desc';
}

function parseCsv(value?: string, options?: { uppercase?: boolean }): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (options?.uppercase ? part.toUpperCase() : part));
}

function parseSeverities(value?: string): Severity[] {
  const parsed = parseCsv(value, { uppercase: true });

  return parsed.filter((entry): entry is Severity =>
    VALID_SEVERITIES.includes(entry as Severity),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function buildConditions(query: {
  ticker?: string;
  source?: string;
  severity?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}): {
  conditions: SQL[];
  invalidSeverity: boolean;
} {
  const conditions: SQL[] = [];

  const tickers = parseCsv(query.ticker, { uppercase: true });
  const sources = parseCsv(query.source);
  const severities = parseSeverities(query.severity);
  const types = parseCsv(query.type);

  if (query.severity && severities.length === 0) {
    return { conditions, invalidSeverity: true };
  }

  if (tickers.length > 0) {
    const tickerConditions = tickers.map(
      (ticker) => sql`upper(${events.metadata}->>'ticker') = ${ticker}`,
    );
    conditions.push(
      tickerConditions.length === 1
        ? tickerConditions[0]
        : sql`(${sql.join(tickerConditions, sql` OR `)})`,
    );
  }

  if (sources.length > 0) {
    conditions.push(inArray(events.source, sources));
  }

  if (severities.length > 0) {
    conditions.push(inArray(events.severity, severities));
  }

  if (types.length > 0) {
    const typeConditions = types.map(
      (eventType) => sql`${events.rawPayload}->>'type' = ${eventType}`,
    );
    conditions.push(
      typeConditions.length === 1
        ? typeConditions[0]
        : sql`(${sql.join(typeConditions, sql` OR `)})`,
    );
  }

  if (query.dateFrom) {
    conditions.push(gte(events.receivedAt, new Date(query.dateFrom)));
  }

  if (query.dateTo) {
    conditions.push(lte(events.receivedAt, new Date(query.dateTo)));
  }

  return { conditions, invalidSeverity: false };
}

function buildOrderBy(query: HistoryQuery): SQL | typeof events.receivedAt | typeof events.source | typeof events.severity | typeof events.title {
  switch (query.sortBy) {
    case 'ticker':
      return sql`upper(${events.metadata}->>'ticker')`;
    case 'source':
      return events.source;
    case 'type':
      return sql`${events.rawPayload}->>'type'`;
    case 'severity':
      return events.severity;
    case 'headline':
      return events.title;
    case 'timestamp':
    default:
      return events.receivedAt;
  }
}

function toHistoryEvent(row: EventRow): HistoryEvent {
  const metadata = asRecord(row.metadata);
  const rawPayload = asRecord(row.rawPayload);
  const ticker = getString(metadata?.ticker);
  const eventType = getString(rawPayload?.type) ?? 'Unknown';
  const direction = getString(metadata?.direction);

  return {
    id: row.id,
    timestamp: row.receivedAt.toISOString(),
    ticker,
    source: row.source,
    type: eventType,
    severity: (row.severity as Severity | null) ?? null,
    direction,
    headline: row.title,
    summary: row.summary ?? null,
    sector: resolveSector(ticker, metadata),
    metadata,
  };
}

function aggregateSectors(rows: EventRow[]): SectorAggregateResponse {
  const bucket = new Map<string, { count: number; criticalCount: number; highCount: number; tickers: Set<string> }>();

  for (const row of rows) {
    const historyEvent = toHistoryEvent(row);
    const current = bucket.get(historyEvent.sector) ?? {
      count: 0,
      criticalCount: 0,
      highCount: 0,
      tickers: new Set<string>(),
    };

    current.count += 1;
    if (historyEvent.severity === 'CRITICAL') {
      current.criticalCount += 1;
    }
    if (historyEvent.severity === 'HIGH') {
      current.highCount += 1;
    }
    if (historyEvent.ticker) {
      current.tickers.add(historyEvent.ticker);
    }

    bucket.set(historyEvent.sector, current);
  }

  const sectors: SectorAggregate[] = [...bucket.entries()]
    .map(([sector, value]) => ({
      sector,
      count: value.count,
      criticalCount: value.criticalCount,
      highCount: value.highCount,
      tickers: [...value.tickers].sort(),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.sector.localeCompare(right.sector);
    });

  return { sectors };
}

export function registerEventsHistoryRoutes(
  server: FastifyInstance,
  db: Database,
  options?: EventsHistoryRouteOptions,
): void {
  server.get('/api/v1/events/history', {
    schema: { querystring: HistoryQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply): Promise<HistoryResponse | void> => {
    const query = request.query as HistoryQuery;
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const offset = (page - 1) * pageSize;
    const { conditions, invalidSeverity } = buildConditions(query);

    if (invalidSeverity) {
      return reply.status(400).send({
        error: 'Invalid severity filter',
      });
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortExpression = buildOrderBy(query);
    const orderClause =
      query.sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);

    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(events)
        .where(where)
        .orderBy(orderClause, desc(events.receivedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ totalCount: count() }).from(events).where(where),
    ]);

    const totalCount = Number(totals[0]?.totalCount ?? 0);
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

    return {
      data: rows.map(toHistoryEvent),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    };
  });

  server.get('/api/v1/events/history/sources', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    const rows = await db
      .selectDistinct({ source: events.source })
      .from(events)
      .orderBy(events.source);

    return {
      sources: rows.map((row) => row.source),
    };
  });

  server.get('/api/v1/events/history/types', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    const rows = await db
      .selectDistinct({
        type: sql<string>`${events.rawPayload}->>'type'`,
      })
      .from(events)
      .orderBy(sql`${events.rawPayload}->>'type'`);

    return {
      types: rows
        .map((row) => row.type)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    };
  });

  server.get('/api/v1/events/sectors', {
    schema: { querystring: SectorQuerySchema },
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply): Promise<SectorAggregateResponse | void> => {
    const query = request.query as {
      dateFrom?: string;
      dateTo?: string;
      severity?: string;
    };
    const { conditions, invalidSeverity } = buildConditions(query);

    if (invalidSeverity) {
      return reply.status(400).send({
        error: 'Invalid severity filter',
      });
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.receivedAt));

    return aggregateSectors(rows);
  });
}
