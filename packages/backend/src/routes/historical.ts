import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import {
  backfillCoverage,
  companies,
  eventMarketContext,
  eventReturns,
  eventSources,
  eventStockContext,
  eventTypePatterns,
  historicalEvents,
  metricsEarnings,
  metricsOther,
} from '../db/historical-schema.js';
import { findSimilarEvents } from '../services/similarity.js';
import { toNumber } from '../utils/number.js';
import { requireApiKey } from './auth-middleware.js';

const HISTORICAL_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const severitySchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.enum(HISTORICAL_SEVERITIES),
);

const DateFilterSchema = z.union([
  z.string().date(),
  z.string().datetime(),
  z.string().datetime({ offset: true }),
]);

const SimilarityQuerySchema = z.object({
  eventType: z.string().trim().min(1),
  eventSubtype: z.string().trim().min(1).optional(),
  ticker: z.string().trim().min(1).optional(),
  sector: z.string().trim().min(1).optional(),
  severity: severitySchema.optional(),
  vixLevel: z.coerce.number().finite().optional(),
  marketRegime: z.string().trim().min(1).optional(),
  return30d: z.coerce.number().finite().optional(),
  marketCapTier: z.string().trim().min(1).optional(),
  epsSurprisePct: z.coerce.number().finite().optional(),
  consecutiveBeats: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  minScore: z.coerce.number().min(0).max(20).optional(),
});

const EventsQuerySchema = z.object({
  ticker: z.string().trim().min(1).optional(),
  eventType: z.string().trim().min(1).optional(),
  from: DateFilterSchema.optional(),
  to: DateFilterSchema.optional(),
  severity: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const EventIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const PatternsQuerySchema = z.object({
  eventType: z.string().trim().min(1).optional(),
  eventSubtype: z.string().trim().min(1).optional(),
  sector: z.string().trim().min(1).optional(),
  marketCapTier: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface HistoricalRouteOptions {
  apiKey?: string;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError): void {
  void reply.status(400).send({
    error: 'Invalid request',
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return value;
}

type SeverityLogger = Pick<FastifyBaseLogger, 'debug'>;

export function parseSeverityCsv(raw?: string, logger?: SeverityLogger): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value): value is z.infer<typeof severitySchema> => {
      const isKnownSeverity = HISTORICAL_SEVERITIES.includes(
        value as (typeof HISTORICAL_SEVERITIES)[number],
      );

      if (!isKnownSeverity) {
        logger?.debug(
          { severity: value },
          'Ignoring unrecognized historical severity filter',
        );
      }

      return isKnownSeverity;
    });
}

function buildEventsWhere(
  query: z.infer<typeof EventsQuerySchema>,
  logger?: SeverityLogger,
): SQL[] {
  const conditions: SQL[] = [];

  if (query.ticker) {
    conditions.push(eq(sql`upper(${historicalEvents.tickerAtTime})`, query.ticker.trim().toUpperCase()));
  }

  if (query.eventType) {
    conditions.push(eq(historicalEvents.eventType, query.eventType));
  }

  if (query.from) {
    conditions.push(gte(historicalEvents.eventTs, new Date(query.from)));
  }

  if (query.to) {
    conditions.push(lte(historicalEvents.eventTs, new Date(query.to)));
  }

  const severities = parseSeverityCsv(query.severity, logger);
  if (severities.length > 0) {
    conditions.push(inArray(historicalEvents.severity, severities));
  }

  return conditions;
}

function mapHistoricalRow(row: {
  id: string;
  eventDate: Date;
  eventType: string;
  eventSubtype: string | null;
  severity: string;
  headline: string;
  description: string | null;
  ticker: string | null;
  sector: string | null;
  marketCapTier: string | null;
  priceAtEvent: string | null;
  marketCapB: string | null;
  return30d: string | null;
  vixLevel: string | null;
  marketRegime: string | null;
  returnT1: string | null;
  returnT5: string | null;
  returnT20: string | null;
  alphaT1: string | null;
  alphaT5: string | null;
  alphaT20: string | null;
}) {
  return {
    id: row.id,
    eventDate: row.eventDate.toISOString(),
    eventType: row.eventType,
    eventSubtype: row.eventSubtype,
    severity: row.severity,
    headline: row.headline,
    description: row.description,
    ticker: row.ticker,
    sector: row.sector,
    stockContext: {
      priceAtEvent: toNumber(row.priceAtEvent),
      marketCapB: toNumber(row.marketCapB),
      marketCapTier: row.marketCapTier,
      return30d: toNumber(row.return30d),
    },
    marketContext: {
      vixLevel: toNumber(row.vixLevel),
      marketRegime: row.marketRegime,
    },
    returns: {
      returnT1: toNumber(row.returnT1),
      returnT5: toNumber(row.returnT5),
      returnT20: toNumber(row.returnT20),
      alphaT1: toNumber(row.alphaT1),
      alphaT5: toNumber(row.alphaT5),
      alphaT20: toNumber(row.alphaT20),
    },
  };
}

export function registerHistoricalRoutes(
  server: FastifyInstance,
  db: Database,
  options?: HistoricalRouteOptions,
): void {
  server.get('/api/historical/similar', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const parsed = SimilarityQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    return findSimilarEvents(db, parsed.data);
  });

  server.get('/api/historical/events', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const parsed = EventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const query = parsed.data;
    const conditions = buildEventsWhere(query, request.log);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totals] = await Promise.all([
      db
        .select({
          id: historicalEvents.id,
          eventDate: historicalEvents.eventTs,
          eventType: historicalEvents.eventType,
          eventSubtype: historicalEvents.eventSubtype,
          severity: historicalEvents.severity,
          headline: historicalEvents.headline,
          description: historicalEvents.description,
          ticker: historicalEvents.tickerAtTime,
          sector: companies.sector,
          marketCapTier: eventStockContext.marketCapTier,
          priceAtEvent: eventStockContext.priceAtEvent,
          marketCapB: eventStockContext.marketCapB,
          return30d: eventStockContext.return30d,
          vixLevel: eventMarketContext.vixClose,
          marketRegime: eventMarketContext.marketRegime,
          returnT1: eventReturns.returnT1,
          returnT5: eventReturns.returnT5,
          returnT20: eventReturns.returnT20,
          alphaT1: eventReturns.alphaT1,
          alphaT5: eventReturns.alphaT5,
          alphaT20: eventReturns.alphaT20,
        })
        .from(historicalEvents)
        .leftJoin(companies, eq(companies.id, historicalEvents.companyId))
        .leftJoin(eventStockContext, eq(eventStockContext.eventId, historicalEvents.id))
        .leftJoin(eventMarketContext, eq(eventMarketContext.eventId, historicalEvents.id))
        .leftJoin(eventReturns, eq(eventReturns.eventId, historicalEvents.id))
        .where(where)
        .orderBy(desc(historicalEvents.eventTs))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: count() }).from(historicalEvents).where(where),
    ]);

    return {
      data: rows.map(mapHistoricalRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: Number(totals[0]?.total ?? 0),
      },
    };
  });

  server.get('/api/historical/events/:id', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const params = EventIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendValidationError(reply, params.error);
    }

    const [row] = await db
      .select({
        id: historicalEvents.id,
        eventDate: historicalEvents.eventTs,
        eventType: historicalEvents.eventType,
        eventSubtype: historicalEvents.eventSubtype,
        severity: historicalEvents.severity,
        headline: historicalEvents.headline,
        description: historicalEvents.description,
        ticker: historicalEvents.tickerAtTime,
        sector: companies.sector,
        marketCapTier: eventStockContext.marketCapTier,
        priceAtEvent: eventStockContext.priceAtEvent,
        marketCapB: eventStockContext.marketCapB,
        return30d: eventStockContext.return30d,
        vixLevel: eventMarketContext.vixClose,
        marketRegime: eventMarketContext.marketRegime,
        returnT1: eventReturns.returnT1,
        returnT5: eventReturns.returnT5,
        returnT20: eventReturns.returnT20,
        alphaT1: eventReturns.alphaT1,
        alphaT5: eventReturns.alphaT5,
        alphaT20: eventReturns.alphaT20,
        epsSurprisePct: metricsEarnings.epsSurprisePct,
        consecutiveBeats: metricsEarnings.consecutiveBeats,
        metricsOther: metricsOther.metrics,
      })
      .from(historicalEvents)
      .leftJoin(companies, eq(companies.id, historicalEvents.companyId))
      .leftJoin(eventStockContext, eq(eventStockContext.eventId, historicalEvents.id))
      .leftJoin(eventMarketContext, eq(eventMarketContext.eventId, historicalEvents.id))
      .leftJoin(eventReturns, eq(eventReturns.eventId, historicalEvents.id))
      .leftJoin(metricsEarnings, eq(metricsEarnings.eventId, historicalEvents.id))
      .leftJoin(metricsOther, eq(metricsOther.eventId, historicalEvents.id))
      .where(eq(historicalEvents.id, params.data.id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: 'Historical event not found' });
    }

    const sources = await db
      .select({
        id: eventSources.id,
        sourceType: eventSources.sourceType,
        sourceName: eventSources.sourceName,
        sourceUrl: eventSources.sourceUrl,
        sourceNativeId: eventSources.sourceNativeId,
        publishedAt: eventSources.publishedAt,
        confidence: eventSources.confidence,
      })
      .from(eventSources)
      .where(eq(eventSources.eventId, row.id))
      .orderBy(desc(eventSources.publishedAt), asc(eventSources.sourceType));

    return {
      ...mapHistoricalRow(row),
      metrics: {
        earnings: row.epsSurprisePct != null || row.consecutiveBeats != null
          ? {
              epsSurprisePct: toNumber(row.epsSurprisePct),
              consecutiveBeats: row.consecutiveBeats,
            }
          : null,
        other: row.metricsOther ?? null,
      },
      sources: sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        sourceNativeId: source.sourceNativeId,
        publishedAt: source.publishedAt?.toISOString() ?? null,
        confidence: toNumber(source.confidence),
      })),
    };
  });

  server.get('/api/historical/patterns', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async (request, reply) => {
    const parsed = PatternsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    const query = parsed.data;
    const conditions: SQL[] = [];

    if (query.eventType) {
      conditions.push(eq(eventTypePatterns.eventType, query.eventType));
    }
    if (query.eventSubtype) {
      conditions.push(eq(eventTypePatterns.eventSubtype, query.eventSubtype));
    }
    if (query.sector) {
      conditions.push(eq(eventTypePatterns.sector, query.sector));
    }
    if (query.marketCapTier) {
      conditions.push(eq(eventTypePatterns.marketCapTier, query.marketCapTier));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: eventTypePatterns.id,
        eventType: eventTypePatterns.eventType,
        eventSubtype: eventTypePatterns.eventSubtype,
        sector: eventTypePatterns.sector,
        marketCapTier: eventTypePatterns.marketCapTier,
        sampleSize: eventTypePatterns.sampleSize,
        dateRangeStart: eventTypePatterns.dateRangeStart,
        dateRangeEnd: eventTypePatterns.dateRangeEnd,
        avgAlphaT5: eventTypePatterns.avgAlphaT5,
        avgAlphaT20: eventTypePatterns.avgAlphaT20,
        avgAlphaT60: eventTypePatterns.avgAlphaT60,
        medianAlphaT20: eventTypePatterns.medianAlphaT20,
        stdDevAlphaT20: eventTypePatterns.stdDevAlphaT20,
        winRateT5: eventTypePatterns.winRateT5,
        winRateT20: eventTypePatterns.winRateT20,
        typicalPattern: eventTypePatterns.typicalPattern,
        keyDifferentiators: eventTypePatterns.keyDifferentiators,
      })
      .from(eventTypePatterns)
      .where(where)
      .orderBy(desc(eventTypePatterns.sampleSize), desc(eventTypePatterns.avgAlphaT20))
      .limit(query.limit)
      .offset(query.offset);

    return {
      data: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        eventSubtype: row.eventSubtype,
        sector: row.sector,
        marketCapTier: row.marketCapTier,
        sampleSize: row.sampleSize,
        dateRangeStart: toIsoString(row.dateRangeStart),
        dateRangeEnd: toIsoString(row.dateRangeEnd),
        avgAlphaT5: toNumber(row.avgAlphaT5),
        avgAlphaT20: toNumber(row.avgAlphaT20),
        avgAlphaT60: toNumber(row.avgAlphaT60),
        medianAlphaT20: toNumber(row.medianAlphaT20),
        stdDevAlphaT20: toNumber(row.stdDevAlphaT20),
        winRateT5: toNumber(row.winRateT5),
        winRateT20: toNumber(row.winRateT20),
        typicalPattern: row.typicalPattern,
        keyDifferentiators: row.keyDifferentiators,
      })),
    };
  });

  server.get('/api/historical/stats', {
    preHandler: async (request, reply) =>
      requireApiKey(request, reply, options?.apiKey),
  }, async () => {
    const [
      totalEventsRow,
      eventsWithReturnsRow,
      eventsWithMarketContextRow,
      eventsWithStockContextRow,
      uniqueTickersRow,
      timeRangeRow,
      eventTypes,
      topTickers,
      coverageRows,
    ] = await Promise.all([
      db.select({ total: count() }).from(historicalEvents),
      db.select({ total: count() }).from(eventReturns).where(isNotNull(eventReturns.eventId)),
      db.select({ total: count() }).from(eventMarketContext),
      db.select({ total: count() }).from(eventStockContext),
      db
        .select({
          total: sql<number>`count(distinct ${historicalEvents.tickerAtTime})`,
        })
        .from(historicalEvents),
      db
        .select({
          earliest: sql<Date | null>`min(${historicalEvents.eventTs})`,
          latest: sql<Date | null>`max(${historicalEvents.eventTs})`,
        })
        .from(historicalEvents),
      db
        .select({
          eventType: historicalEvents.eventType,
          count: count(),
        })
        .from(historicalEvents)
        .groupBy(historicalEvents.eventType)
        .orderBy(desc(count())),
      db
        .select({
          ticker: historicalEvents.tickerAtTime,
          count: count(),
        })
        .from(historicalEvents)
        .where(isNotNull(historicalEvents.tickerAtTime))
        .groupBy(historicalEvents.tickerAtTime)
        .orderBy(desc(count()), asc(historicalEvents.tickerAtTime))
        .limit(10),
      db
        .select({
          scans: count(),
          completedScans: sql<number>`coalesce(sum(case when ${backfillCoverage.scanCompleted} then 1 else 0 end), 0)`,
          totalEventsFound: sql<number>`coalesce(sum(${backfillCoverage.eventsFound}), 0)`,
        })
        .from(backfillCoverage),
    ]);

    return {
      totalEvents: Number(totalEventsRow[0]?.total ?? 0),
      eventsWithReturns: Number(eventsWithReturnsRow[0]?.total ?? 0),
      eventsWithMarketContext: Number(eventsWithMarketContextRow[0]?.total ?? 0),
      eventsWithStockContext: Number(eventsWithStockContextRow[0]?.total ?? 0),
      uniqueTickers: Number(uniqueTickersRow[0]?.total ?? 0),
      timeRange: {
        earliest: toIsoString(timeRangeRow[0]?.earliest),
        latest: toIsoString(timeRangeRow[0]?.latest),
      },
      eventTypes: eventTypes.map((row) => ({
        eventType: row.eventType,
        count: Number(row.count),
      })),
      topTickers: topTickers.map((row) => ({
        ticker: row.ticker,
        count: Number(row.count),
      })),
      coverage: {
        scans: Number(coverageRows[0]?.scans ?? 0),
        completedScans: Number(coverageRows[0]?.completedScans ?? 0),
        totalEventsFound: Number(coverageRows[0]?.totalEventsFound ?? 0),
      },
    };
  });
}
