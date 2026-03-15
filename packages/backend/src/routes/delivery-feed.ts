import type { HistoricalContext } from '@event-radar/delivery';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/connection.js';

interface FeedCursor {
  auditId: number;
  createdAt: string;
}

interface DeliveryFeedRow {
  audit_id: number;
  audit_created_at: string;
  delivery_channels: unknown;
  llm_reason: string | null;
  audit_ticker: string | null;
  id: string;
  title: string;
  source: string;
  severity: string | null;
  summary: string | null;
  metadata: unknown;
  source_urls: unknown;
  received_at: string | Date;
  created_at: string | Date;
}

const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().optional(),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((value) => value.toUpperCase())
    .optional(),
});

const FeedCursorSchema = z.object({
  auditId: z.number().int().min(1),
  createdAt: z.string().datetime(),
});

function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeFeedCursor(value: string): FeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const result = FeedCursorSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return {
      auditId: result.data.auditId,
      createdAt: new Date(result.data.createdAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function parseJsonValue<T>(value: unknown): T | unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue<Record<string, unknown>>(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

function asStringArray(value: unknown): string[] {
  const parsed = parseJsonValue<unknown[]>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function asDeliveryChannels(value: unknown): Array<{ channel: string; ok: boolean }> {
  const parsed = parseJsonValue<unknown[]>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const channel = typeof record.channel === 'string' ? record.channel : null;
    const ok = typeof record.ok === 'boolean' ? record.ok : null;

    if (!channel || ok == null) {
      return [];
    }

    return [{ channel, ok }];
  });
}

function getFeedTickers(metadata: Record<string, unknown>, fallbackTicker: string | null): string[] {
  const tickers = asStringArray(metadata['tickers']);
  if (tickers.length > 0) {
    return tickers;
  }

  const singleTicker = metadata['ticker'];
  if (typeof singleTicker === 'string' && singleTicker.length > 0) {
    return [singleTicker];
  }

  return fallbackTicker ? [fallbackTicker] : [];
}

function getFeedUrl(metadata: Record<string, unknown>, sourceUrls: unknown): string | null {
  const urls = asStringArray(sourceUrls);
  if (urls.length > 0) {
    return urls[0] ?? null;
  }

  const metadataUrl = metadata['url'];
  return typeof metadataUrl === 'string' && metadataUrl.length > 0 ? metadataUrl : null;
}

function getLlmEnrichment(metadata: Record<string, unknown>): Record<string, unknown> {
  return asRecord(metadata['llm_enrichment']);
}

function getHistoricalContext(metadata: Record<string, unknown>): HistoricalContext | null {
  const parsed = parseJsonValue<Record<string, unknown>>(metadata['historical_context']);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as HistoricalContext;
}

async function queryDeliveryFeed(
  db: Database,
  options: {
    defaultLimit: number;
    limit?: string;
    before?: string;
    ticker?: string;
  },
): Promise<{
  total: number;
  cursor: string | null;
  rows: DeliveryFeedRow[];
}> {
  const parsedQuery = FeedQuerySchema.safeParse(options);
  const limit = parsedQuery.success && parsedQuery.data.limit != null
    ? parsedQuery.data.limit
    : options.defaultLimit;
  const ticker = parsedQuery.success ? parsedQuery.data.ticker : undefined;
  const cursor = options.before ? decodeFeedCursor(options.before) : null;

  if (options.before && !cursor) {
    throw new Error('Invalid cursor');
  }

  const { sql } = await import('drizzle-orm');
  const conditions: ReturnType<typeof sql>[] = [sql`pa.outcome = 'delivered'`];

  if (ticker) {
    conditions.push(sql`(
      UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${ticker}
      OR COALESCE(e.metadata->'tickers', '[]'::jsonb) @> ${JSON.stringify([ticker])}::jsonb
    )`);
  }

  if (cursor) {
    conditions.push(
      sql`(
        pa.created_at < ${new Date(cursor.createdAt)}
        OR (pa.created_at = ${new Date(cursor.createdAt)} AND pa.id < ${cursor.auditId})
      )`,
    );
  }

  const whereClause = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
  const countQuery = sql`
    SELECT COUNT(*)::int AS total
    FROM pipeline_audit pa
    INNER JOIN events e ON e.source_event_id = pa.event_id
    WHERE ${whereClause}
  `;
  const dataQuery = sql`
    SELECT
      pa.id AS audit_id,
      pa.created_at AS audit_created_at,
      pa.delivery_channels,
      pa.reason AS llm_reason,
      pa.ticker AS audit_ticker,
      e.id,
      e.title,
      e.source,
      e.severity,
      e.summary,
      e.metadata,
      e.source_urls,
      e.received_at,
      e.created_at
    FROM pipeline_audit pa
    INNER JOIN events e ON e.source_event_id = pa.event_id
    WHERE ${whereClause}
    ORDER BY pa.created_at DESC, pa.id DESC
    LIMIT ${limit + 1}
  `;

  const [countResult, dataResult] = await Promise.all([
    db.execute(countQuery),
    db.execute(dataQuery),
  ]);

  const total = (countResult as unknown as { rows: Array<{ total: number }> }).rows[0]?.total ?? 0;
  const rows = (dataResult as unknown as { rows: DeliveryFeedRow[] }).rows;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    total,
    rows: pageRows,
    cursor: hasMore && lastRow
      ? encodeFeedCursor({
          auditId: lastRow.audit_id,
          createdAt: new Date(lastRow.audit_created_at).toISOString(),
        })
      : null,
  };
}

export function registerDeliveryFeedRoutes(server: FastifyInstance, db?: Database): void {
  server.get<{
    Querystring: {
      limit?: string;
      before?: string;
      ticker?: string;
    };
  }>('/api/v1/delivery/feed', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    try {
      const result = await queryDeliveryFeed(db, {
        defaultLimit: 20,
        limit: request.query.limit,
        before: request.query.before,
        ticker: request.query.ticker,
      });

      return reply.send({
        total: result.total,
        cursor: result.cursor,
        events: result.rows.map((row) => {
          const metadata = asRecord(row.metadata);
          const enrichment = getLlmEnrichment(metadata);
          const historical = getHistoricalContext(metadata);

          return {
            id: row.id,
            title: row.title,
            source: row.source,
            severity: row.severity ?? 'MEDIUM',
            tickers: getFeedTickers(metadata, row.audit_ticker),
            analysis: typeof enrichment.summary === 'string' ? enrichment.summary : '',
            impact: typeof enrichment.impact === 'string' ? enrichment.impact : '',
            action: typeof enrichment.action === 'string' ? enrichment.action : null,
            signal: typeof enrichment.action === 'string' ? enrichment.action : null,
            regime_context:
              typeof enrichment.regimeContext === 'string' ? enrichment.regimeContext : null,
            delivery_channels: asDeliveryChannels(row.delivery_channels),
            historical,
            delivered_at: new Date(row.audit_created_at).toISOString(),
          };
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid cursor') {
        return reply.code(400).send({ error: 'Invalid cursor' });
      }

      server.log.error({ err: error, msg: 'delivery feed query failed' });
      return reply.code(500).send({ error: 'Delivery feed query failed' });
    }
  });
}

export function mapLegacyFeedItem(row: DeliveryFeedRow) {
  const metadata = asRecord(row.metadata);
  const timeValue = row.received_at ?? row.created_at;

  return {
    id: row.id,
    title: row.title,
    source: row.source,
    severity: row.severity ?? 'MEDIUM',
    tickers: getFeedTickers(metadata, row.audit_ticker),
    summary: row.summary ?? '',
    url: getFeedUrl(metadata, row.source_urls),
    time: new Date(timeValue).toISOString(),
    category: typeof metadata.category === 'string' ? metadata.category : 'other',
    llmReason: row.llm_reason ?? '',
  };
}

export async function queryLegacyFeed(
  db: Database,
  options: {
    limit?: string;
    before?: string;
    ticker?: string;
  },
): Promise<{
  total: number;
  cursor: string | null;
  events: ReturnType<typeof mapLegacyFeedItem>[];
}> {
  const result = await queryDeliveryFeed(db, {
    defaultLimit: 50,
    limit: options.limit,
    before: options.before,
    ticker: options.ticker,
  });

  return {
    total: result.total,
    cursor: result.cursor,
    events: result.rows.map((row) => mapLegacyFeedItem(row)),
  };
}
