import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { asRecord, parseConfidence, parseJsonValue } from './route-utils.js';

type FeedCategory = 'policy' | 'macro' | 'corporate' | 'geopolitics' | 'other';

interface FeedCursor {
  auditId: number;
  createdAt: string;
}

interface FeedRow {
  audit_id: number;
  audit_created_at: string;
  llm_reason: string | null;
  id: string;
  title: string;
  source: string;
  severity: string | null;
  summary: string | null;
  metadata: unknown;
  source_urls: unknown;
  confirmation_count: number | null;
  confirmed_sources: unknown;
  received_at: string | Date;
  created_at: string | Date;
  audit_ticker: string | null;
  audit_confidence: string | number | null;
  event_type: string | null;
  event_price: string | null;
  change_1d: string | null;
  change_t5: string | null;
  change_t20: string | null;
  price_1d: string | null;
  price_t5: string | null;
  price_t20: string | null;
}

const FEED_CATEGORIES = new Set<FeedCategory>([
  'policy',
  'macro',
  'corporate',
  'geopolitics',
  'other',
]);

function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeFeedCursor(value: string): FeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<FeedCursor>;
    if (
      typeof parsed.auditId !== 'number'
      || !Number.isInteger(parsed.auditId)
      || parsed.auditId < 1
      || typeof parsed.createdAt !== 'string'
      || Number.isNaN(new Date(parsed.createdAt).getTime())
    ) {
      return null;
    }

    return {
      auditId: parsed.auditId,
      createdAt: new Date(parsed.createdAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function getFeedTickers(metadata: Record<string, unknown>, fallbackTicker: string | null): string[] {
  const tickers = asStringArray(metadata['tickers']);
  if (tickers.length > 0) return tickers;

  const singleTicker = metadata['ticker'];
  if (typeof singleTicker === 'string' && singleTicker.length > 0) {
    return [singleTicker];
  }

  const enrichment = metadata['llm_enrichment'];
  if (enrichment && typeof enrichment === 'object' && !Array.isArray(enrichment)) {
    const enrichmentTickers = (enrichment as Record<string, unknown>)['tickers'];
    if (Array.isArray(enrichmentTickers)) {
      const symbols = enrichmentTickers
        .map((ticker) => typeof ticker === 'object' && ticker !== null ? (ticker as Record<string, unknown>)['symbol'] : null)
        .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0);
      if (symbols.length > 0) {
        return symbols;
      }
    }
  }

  return fallbackTicker ? [fallbackTicker] : [];
}

function getFeedDirection(metadata: Record<string, unknown>): string | null {
  const enrichment = metadata['llm_enrichment'];
  if (enrichment && typeof enrichment === 'object' && !Array.isArray(enrichment)) {
    const enrichmentTickers = (enrichment as Record<string, unknown>)['tickers'];
    if (Array.isArray(enrichmentTickers) && enrichmentTickers.length > 0) {
      const firstTicker = enrichmentTickers[0] as Record<string, unknown> | undefined;
      if (firstTicker && typeof firstTicker['direction'] === 'string') {
        return firstTicker['direction'];
      }
    }
  }

  return null;
}

function getFeedConfidence(
  _metadata: Record<string, unknown>,
  auditConfidence: unknown,
): { confidence: number | null; confidenceBucket: string | null } {
  const confidence = parseConfidence(auditConfidence);

  if (confidence == null) {
    return { confidence: null, confidenceBucket: null };
  }

  const confidenceBucket = confidence >= 0.7
    ? 'high'
    : confidence >= 0.5
      ? 'medium'
      : confidence >= 0.3
        ? 'low'
        : 'unconfirmed';

  return { confidence, confidenceBucket };
}

function getFeedUrl(metadata: Record<string, unknown>, sourceUrls: unknown): string | null {
  const urls = asStringArray(sourceUrls);
  if (urls.length > 0) return urls[0] ?? null;

  const metadataUrl = metadata['url'];
  return typeof metadataUrl === 'string' && metadataUrl.length > 0 ? metadataUrl : null;
}

function inferFeedCategory(source: string, metadata: Record<string, unknown>): FeedCategory {
  const explicitCategory = metadata['category'];
  if (typeof explicitCategory === 'string' && FEED_CATEGORIES.has(explicitCategory as FeedCategory)) {
    return explicitCategory as FeedCategory;
  }

  const eventType = metadata['eventType'];
  if (typeof eventType === 'string') {
    if (eventType === 'macro') return 'macro';
    if (eventType === 'political') return 'policy';
  }

  const normalizedSource = source.toLowerCase();
  if (['federal-register', 'truth-social'].includes(normalizedSource)) {
    return 'policy';
  }
  if (['econ-calendar', 'fed', 'bls'].includes(normalizedSource)) {
    return 'macro';
  }
  if (['state-department', 'defense', 'geopolitics'].includes(normalizedSource)) {
    return 'geopolitics';
  }
  if ([
    'sec-edgar',
    'fda',
    'trading-halt',
    'breaking-news',
    'newswire',
    'pr-newswire',
    'businesswire',
    'globenewswire',
  ].includes(normalizedSource)) {
    return 'corporate';
  }

  return 'other';
}

function pick(metadata: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [outputKey, metadataKey] of Object.entries(mapping)) {
    if (metadata[metadataKey] != null) {
      result[outputKey] = metadata[metadataKey];
    }
  }
  return Object.keys(result).length > 0 ? result : {};
}

function extractSourceMetadata(
  source: string,
  metadata: Record<string, unknown>,
  eventType?: string | null,
): Record<string, unknown> | undefined {
  switch (source) {
    case 'breaking-news':
      return pick(metadata, {
        url: 'url',
        headline: 'headline',
        sourceFeed: 'source_feed',
      });
    case 'sec-edgar': {
      const result = pick(metadata, {
        formType: 'form_type',
        filingLink: 'filing_link',
        itemDescriptions: 'item_descriptions',
      });
      const companyName = metadata.company_name ?? metadata.issuer_name;
      if (companyName != null) result.companyName = companyName;
      return result;
    }
    case 'trading-halt': {
      const result = pick(metadata, {
        haltReasonCode: 'haltReasonCode',
        haltReasonDescription: 'haltReasonDescription',
        haltTime: 'haltTime',
        resumeTime: 'resumeTime',
        market: 'market',
      });
      if (Object.keys(result).length === 0) return undefined;
      result.isResume = eventType === 'resume';
      return result;
    }
    case 'econ-calendar':
      return pick(metadata, {
        indicatorName: 'indicator_name',
        scheduledTime: 'scheduled_time',
        frequency: 'frequency',
        tags: 'tags',
      });
    default:
      return undefined;
  }
}

export function registerFeedRoutes(server: FastifyInstance, db?: Database): void {
  server.get('/api/v1/feed/watchlist-summary', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    try {
      const { eq: eqOperator } = await import('drizzle-orm');
      const { watchlist: watchlistTable } = await import('../db/schema.js');
      const { resolveRequestUserId: resolveUserId } = await import('../utils/request-user.js');

      const userId = resolveUserId(request);
      const watchlistRows = await db
        .select({ ticker: watchlistTable.ticker })
        .from(watchlistTable)
        .where(eqOperator(watchlistTable.userId, userId));

      if (watchlistRows.length === 0) {
        return { tickers: [] };
      }

      const tickers = watchlistRows.map((row) => row.ticker);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const tickerConditions = tickers.map(
        (watchlistTicker) => sql`(
          UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${watchlistTicker}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(e.metadata->'llm_enrichment'->'tickers') AS et
            WHERE UPPER(et->>'symbol') = ${watchlistTicker}
          )
        )`,
      );
      const tickerWhere = tickerConditions.reduce(
        (combined, condition) => sql`${combined} OR ${condition}`,
      );
      const result = await db.execute(sql`
        SELECT
          UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) AS ticker,
          COUNT(*)::int AS event_count,
          COUNT(*) FILTER (WHERE pa.created_at >= ${since24h})::int AS event_count_24h,
          MAX(pa.created_at) AS latest_at,
          (array_agg(e.title ORDER BY pa.created_at DESC))[1] AS latest_title,
          (array_agg(e.severity ORDER BY pa.created_at DESC))[1] AS latest_severity,
          MAX(
            CASE e.severity
              WHEN 'CRITICAL' THEN 4
              WHEN 'HIGH' THEN 3
              WHEN 'MEDIUM' THEN 2
              WHEN 'LOW' THEN 1
              ELSE 0
            END
          ) AS max_severity_rank
        FROM pipeline_audit pa
        INNER JOIN events e ON e.source_event_id = pa.event_id
        WHERE pa.outcome = 'delivered'
          AND pa.created_at >= ${since7d}
          AND (${tickerWhere})
        GROUP BY UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', ''))
      `) as unknown as {
        rows: Array<{
          ticker: string;
          event_count: number;
          event_count_24h: number;
          latest_at: string | Date;
          latest_title: string;
          latest_severity: string;
          max_severity_rank: number;
        }>;
      };
      const severitySignal: Record<number, string> = {
        4: '🔴',
        3: '🔴',
        2: '🟡',
        1: '🟢',
        0: '🟢',
      };
      const tickerMap = new Map(result.rows.map((row) => [row.ticker, row]));

      return {
        tickers: tickers.map((ticker) => {
          const row = tickerMap.get(ticker);

          return {
            ticker,
            eventCount24h: row?.event_count_24h ?? 0,
            eventCount7d: row?.event_count ?? 0,
            latestEvent: row
              ? {
                  title: row.latest_title,
                  severity: row.latest_severity ?? 'MEDIUM',
                  timestamp: new Date(row.latest_at).toISOString(),
                }
              : null,
            highestSignal: row ? severitySignal[row.max_severity_rank] ?? '🟢' : '🟢',
          };
        }),
      };
    } catch (error) {
      server.log.error({ err: error, msg: 'watchlist summary query failed' });
      return reply.code(500).send({ error: 'Watchlist summary query failed' });
    }
  });

  server.get<{
    Querystring: {
      limit?: string;
      before?: string;
      ticker?: string;
      watchlist?: string;
      mode?: string;
    };
  }>('/api/v1/feed', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const rawLimit = Number(request.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50;
    const ticker = request.query.ticker?.trim().toUpperCase();
    const feedMode = request.query.mode;
    const watchlistFilter = feedMode !== 'smart' && request.query.watchlist === 'true';
    const cursor = request.query.before ? decodeFeedCursor(request.query.before) : null;

    if (request.query.before && !cursor) {
      return reply.code(400).send({ error: 'Invalid cursor' });
    }

    try {
      const { sql: sqlTag, eq } = await import('drizzle-orm');
      const { watchlist } = await import('../db/schema.js');
      const { resolveRequestUserId } = await import('../utils/request-user.js');

      const conditions: ReturnType<typeof sqlTag>[] = [sqlTag`pa.outcome = 'delivered'`];

      if (feedMode === 'smart') {
        const userId = resolveRequestUserId(request);
        const watchlistRows = await db
          .select({ ticker: watchlist.ticker })
          .from(watchlist)
          .where(eq(watchlist.userId, userId));
        const tickers = watchlistRows.map((row) => row.ticker);
        const smartConditions: ReturnType<typeof sqlTag>[] = [];

        if (tickers.length > 0) {
          const tickerConditions = tickers.map(
            (watchlistTicker) => sqlTag`(
              UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${watchlistTicker}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(e.metadata->'llm_enrichment'->'tickers') AS et
                WHERE UPPER(et->>'symbol') = ${watchlistTicker}
              )
            )`,
          );
          smartConditions.push(tickerConditions.reduce((left, right) => sqlTag`${left} OR ${right}`));
        }

        smartConditions.push(sqlTag`(UPPER(COALESCE(e.severity, '')) = 'CRITICAL')`);
        smartConditions.push(sqlTag`(UPPER(COALESCE(e.severity, '')) = 'HIGH' AND LOWER(e.source) IN ('breaking-news', 'sec-edgar', 'trading-halt', 'newswire'))`);

        conditions.push(sqlTag`(${smartConditions.reduce((left, right) => sqlTag`${left} OR ${right}`)})`);
        conditions.push(sqlTag`LOWER(e.source) NOT IN ('federal-register')`);
      } else if (watchlistFilter) {
        const userId = resolveRequestUserId(request);
        const watchlistRows = await db
          .select({ ticker: watchlist.ticker })
          .from(watchlist)
          .where(eq(watchlist.userId, userId));
        const tickers = watchlistRows.map((row) => row.ticker);

        if (tickers.length === 0) {
          return reply.send({ events: [], cursor: null, total: 0 });
        }

        const tickerConditions = tickers.map(
          (watchlistTicker) => sqlTag`(
            UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${watchlistTicker}
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(e.metadata->'llm_enrichment'->'tickers') AS et
              WHERE UPPER(et->>'symbol') = ${watchlistTicker}
            )
          )`,
        );
        conditions.push(sqlTag`(${tickerConditions.reduce((left, right) => sqlTag`${left} OR ${right}`)})`);
      }

      if (ticker) {
        conditions.push(sqlTag`UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${ticker}`);
      }

      if (cursor) {
        conditions.push(sqlTag`(
          pa.created_at < ${new Date(cursor.createdAt)}
          OR (pa.created_at = ${new Date(cursor.createdAt)} AND pa.id < ${cursor.auditId})
        )`);
      }

      const whereClause = conditions.reduce((left, right) => sqlTag`${left} AND ${right}`);
      const countQuery = sqlTag`
        SELECT COUNT(*)::int AS total
        FROM pipeline_audit pa
        INNER JOIN events e ON e.source_event_id = pa.event_id
        WHERE ${whereClause}
      `;
      const dataQuery = sqlTag`
        SELECT
          pa.id AS audit_id,
          pa.created_at AS audit_created_at,
          pa.reason AS llm_reason,
          pa.ticker AS audit_ticker,
          pa.confidence AS audit_confidence,
          e.id,
          e.title,
          e.source,
          e.severity,
          e.summary,
          e.metadata,
          e.source_urls,
          e.confirmation_count,
          e.confirmed_sources,
          e.received_at,
          e.created_at,
          e.event_type,
          eo.event_price,
          eo.change_1d,
          eo.change_t5,
          eo.change_t20,
          eo.price_1d,
          eo.price_t5,
          eo.price_t20
        FROM pipeline_audit pa
        INNER JOIN events e ON e.source_event_id = pa.event_id
        LEFT JOIN event_outcomes eo ON eo.event_id = e.id
        WHERE ${whereClause}
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ${limit + 1}
      `;

      const [countResult, dataResult] = await Promise.all([db.execute(countQuery), db.execute(dataQuery)]);
      const total = (countResult as unknown as { rows: Array<{ total: number }> }).rows[0]?.total ?? 0;
      const rows = (dataResult as unknown as { rows: FeedRow[] }).rows;
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const lastRow = pageRows[pageRows.length - 1];

      return reply.send({
        events: pageRows.map((row) => {
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
            category: inferFeedCategory(row.source, metadata),
            llmReason: row.llm_reason ?? '',
            confirmationCount: row.confirmation_count
              ?? (typeof metadata.confirmationCount === 'number' ? metadata.confirmationCount : 1),
            confirmedSources: asStringArray(row.confirmed_sources).length > 0
              ? asStringArray(row.confirmed_sources)
              : asStringArray(metadata['confirmedSources']),
            direction: getFeedDirection(metadata),
            ...getFeedConfidence(metadata, row.audit_confidence),
            sourceMetadata: extractSourceMetadata(row.source, metadata, row.event_type),
            ...(row.event_price != null ? {
              eventPrice: parseFloat(row.event_price),
              change1d: row.change_1d != null ? parseFloat(row.change_1d) : null,
              change5d: row.change_t5 != null ? parseFloat(row.change_t5) : null,
              change20d: row.change_t20 != null ? parseFloat(row.change_t20) : null,
              price1d: row.price_1d != null ? parseFloat(row.price_1d) : null,
              price5d: row.price_t5 != null ? parseFloat(row.price_t5) : null,
              price20d: row.price_t20 != null ? parseFloat(row.price_t20) : null,
            } : {}),
          };
        }),
        cursor: hasMore && lastRow
          ? encodeFeedCursor({
              auditId: lastRow.audit_id,
              createdAt: new Date(lastRow.audit_created_at).toISOString(),
            })
          : null,
        total,
      });
    } catch (error) {
      server.log.error({ err: error, msg: 'feed query failed' });
      return reply.code(500).send({ error: 'Feed query failed' });
    }
  });

}
