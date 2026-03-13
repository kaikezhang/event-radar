import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry } from '@event-radar/shared';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import { registry as metricsRegistry } from '../metrics.js';

export interface DashboardDeps {
  db?: Database;
  scannerRegistry: ScannerRegistry;
  marketCache?: MarketContextCache;
  startTime: number;
  version: string;
}

function timeAgo(date: Date | string | null): string {
  if (!date) return 'never';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/**
 * Parse Prometheus text format to extract metric values.
 * Returns a map of metric lines grouped by name.
 */
function parseMetrics(text: string): Map<string, Array<{ labels: Record<string, string>; value: number }>> {
  const result = new Map<string, Array<{ labels: Record<string, string>; value: number }>>();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const match = line.match(/^([a-z_]+)(\{[^}]*\})?\s+(\S+)/);
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    const labels: Record<string, string> = {};
    if (labelsStr) {
      const labelMatches = labelsStr.matchAll(/([a-z_]+)="([^"]*)"/g);
      for (const lm of labelMatches) {
        labels[lm[1]] = lm[2];
      }
    }

    if (!result.has(name)) result.set(name, []);
    result.get(name)!.push({ labels, value });
  }
  return result;
}

function sumMetric(metrics: Map<string, Array<{ labels: Record<string, string>; value: number }>>, name: string, filter?: Record<string, string>): number {
  const entries = metrics.get(name) ?? [];
  return entries
    .filter(e => !filter || Object.entries(filter).every(([k, v]) => e.labels[k] === v))
    .reduce((sum, e) => sum + e.value, 0);
}

function groupMetric(metrics: Map<string, Array<{ labels: Record<string, string>; value: number }>>, name: string, groupBy: string, filter?: Record<string, string>): Record<string, number> {
  const entries = metrics.get(name) ?? [];
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (filter && !Object.entries(filter).every(([k, v]) => e.labels[k] === v)) continue;
    const key = e.labels[groupBy] ?? 'unknown';
    result[key] = (result[key] ?? 0) + e.value;
  }
  return result;
}

interface AuditRow {
  id: number;
  event_id: string;
  source: string;
  title: string;
  severity: string | null;
  ticker: string | null;
  outcome: string;
  stopped_at: string;
  reason: string | null;
  reason_category: string | null;
  delivery_channels: unknown;
  historical_match: boolean | null;
  historical_confidence: string | null;
  duration_ms: number | null;
  created_at: string;
}

const FeedTickerSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().regex(/^[A-Z]{1,5}$/),
);

const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().trim().min(1).optional(),
  ticker: FeedTickerSchema.optional(),
});

const FEED_CATEGORIES = new Set(['policy', 'macro', 'corporate', 'geopolitics', 'other']);

interface FeedCursor {
  createdAt: Date;
  auditId: number;
}

interface FeedRow {
  audit_id: number;
  audit_created_at: string | Date;
  audit_reason: string | null;
  audit_severity: string | null;
  audit_ticker: string | null;
  event_id: string;
  event_source: string;
  event_title: string;
  event_severity: string | null;
  event_summary: string | null;
  event_received_at: string | Date | null;
  event_created_at: string | Date;
  event_metadata: unknown;
  event_raw_payload: unknown;
  event_source_urls: unknown;
}

function sendValidationError(
  reply: { status(code: number): { send(payload: unknown): void } },
  details: Array<{ path: string; message: string }>,
): void {
  reply.status(400).send({
    error: 'Invalid request',
    details,
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

  return null;
}

function parseFeedCursor(raw: string): FeedCursor | null {
  const pieces = raw.split('|');
  if (pieces.length !== 2) {
    return null;
  }

  const [createdAtRaw, auditIdRaw] = pieces;
  const createdAt = new Date(createdAtRaw);
  const auditId = Number.parseInt(auditIdRaw, 10);

  if (Number.isNaN(createdAt.getTime()) || !Number.isInteger(auditId) || auditId < 1) {
    return null;
  }

  return { createdAt, auditId };
}

function encodeFeedCursor(createdAt: string | Date, auditId: number): string {
  const iso = toIsoString(createdAt);
  return iso ? `${iso}|${auditId}` : String(auditId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function extractTickers(metadataValue: unknown, fallbackTicker: string | null): string[] {
  const metadata = asRecord(metadataValue);
  const tickersValue = metadata?.['tickers'];

  if (Array.isArray(tickersValue)) {
    const tickers = tickersValue
      .filter((ticker): ticker is string => typeof ticker === 'string' && ticker.length > 0)
      .map((ticker) => ticker.toUpperCase());
    if (tickers.length > 0) {
      return [...new Set(tickers)];
    }
  }

  const singleTicker = getString(metadata?.['ticker']) ?? fallbackTicker;
  return singleTicker ? [singleTicker.toUpperCase()] : [];
}

function extractCategory(metadataValue: unknown): string {
  const metadata = asRecord(metadataValue);
  const category = getString(metadata?.['category']);
  return category && FEED_CATEGORIES.has(category) ? category : 'other';
}

function extractUrl(
  sourceUrlsValue: unknown,
  metadataValue: unknown,
  rawPayloadValue: unknown,
): string | null {
  if (Array.isArray(sourceUrlsValue)) {
    for (const item of sourceUrlsValue) {
      if (typeof item === 'string' && item.length > 0) {
        return item;
      }

      const nestedUrl = getString(asRecord(item)?.['url']);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  const metadataUrl = getString(asRecord(metadataValue)?.['url']);
  if (metadataUrl) {
    return metadataUrl;
  }

  return getString(asRecord(rawPayloadValue)?.['url']);
}

function buildFeedWhere(
  ticker: string | undefined,
  beforeCursor?: FeedCursor,
): SQL {
  const conditions: SQL[] = [sql`pa.outcome = 'delivered'`];

  if (ticker) {
    conditions.push(sql`(
      upper(coalesce(pa.ticker, '')) = ${ticker}
      OR upper(coalesce(e.metadata->>'ticker', '')) = ${ticker}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(e.metadata->'tickers') = 'array' THEN e.metadata->'tickers'
            ELSE '[]'::jsonb
          END
        ) AS ticker_value(value)
        WHERE upper(ticker_value.value) = ${ticker}
      )
    )`);
  }

  if (beforeCursor) {
    conditions.push(sql`(
      pa.created_at < ${beforeCursor.createdAt}
      OR (pa.created_at = ${beforeCursor.createdAt} AND pa.id < ${beforeCursor.auditId})
    )`);
  }

  return conditions.reduce((left, right) => sql`${left} AND ${right}`);
}

function mapFeedRow(row: FeedRow): {
  id: string;
  title: string;
  source: string;
  severity: string;
  tickers: string[];
  summary: string;
  url: string | null;
  time: string;
  category: string;
  llmReason: string;
} {
  const rawPayload = asRecord(row.event_raw_payload);
  const summary = row.event_summary ?? getString(rawPayload?.['body']) ?? '';
  const time = toIsoString(row.event_received_at)
    ?? toIsoString(row.event_created_at)
    ?? toIsoString(row.audit_created_at)
    ?? new Date(0).toISOString();

  return {
    id: row.event_id,
    title: row.event_title,
    source: row.event_source,
    severity: row.event_severity ?? row.audit_severity ?? 'MEDIUM',
    tickers: extractTickers(row.event_metadata, row.audit_ticker),
    summary,
    url: extractUrl(row.event_source_urls, row.event_metadata, row.event_raw_payload),
    time,
    category: extractCategory(row.event_metadata),
    llmReason: row.audit_reason ?? '',
  };
}

export function registerDashboardRoutes(
  server: FastifyInstance,
  deps: DashboardDeps,
): void {
  server.get('/api/v1/dashboard', async (_request, reply) => {
    const uptimeS = (Date.now() - deps.startTime) / 1000;
    const graceActive = uptimeS < 90;

    // Parse all metrics at once
    const metricsText = await metricsRegistry.metrics();
    const m = parseMetrics(metricsText);

    // Scanner status
    const healthList = deps.scannerRegistry.healthAll();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const scannerDetails = healthList.map(h => {
      let status: string = h.status;
      if (h.lastScanAt) {
        const lastScan = new Date(h.lastScanAt).getTime();
        if (lastScan < fiveMinAgo) status = 'down';
        else if (h.errorCount > 5) status = 'degraded';
      } else if (h.errorCount > 0) status = 'down';

      return {
        name: h.scanner,
        status,
        last_scan: timeAgo(h.lastScanAt),
        error_count: h.errorCount,
        consecutive_errors: h.consecutiveErrors,
        in_backoff: h.inBackoff,
      };
    });

    // Pipeline funnel
    const ingested = sumMetric(m, 'pipeline_funnel_total', { stage: 'ingested' });
    const deduped = sumMetric(m, 'pipeline_funnel_total', { stage: 'deduped' });
    const stored = sumMetric(m, 'pipeline_funnel_total', { stage: 'stored' });
    const filteredOut = sumMetric(m, 'pipeline_funnel_total', { stage: 'filtered_out' });
    const filterPassed = sumMetric(m, 'pipeline_funnel_total', { stage: 'filter_passed' });
    const delivered = sumMetric(m, 'pipeline_funnel_total', { stage: 'delivered' });

    // Filter breakdown (blocked reasons)
    const filterBreakdown = groupMetric(m, 'alert_filter_total', 'reason_category', { decision: 'block' });

    // Historical enrichment
    const histHits = sumMetric(m, 'historical_enrichment_total', { result: 'hit' });
    const histMisses = sumMetric(m, 'historical_enrichment_total', { result: 'miss' });
    const histTimeouts = sumMetric(m, 'historical_enrichment_total', { result: 'timeout' });
    const histTotal = histHits + histMisses + histTimeouts;

    // Delivery by channel
    const deliveryChannels: Record<string, { sent: number; errors: number }> = {};
    const deliveryEntries = m.get('deliveries_sent_total') ?? [];
    for (const e of deliveryEntries) {
      const ch = e.labels.channel ?? 'unknown';
      if (!deliveryChannels[ch]) deliveryChannels[ch] = { sent: 0, errors: 0 };
      if (e.labels.status === 'success') deliveryChannels[ch].sent += e.value;
      else deliveryChannels[ch].errors += e.value;
    }

    // Grace period
    const graceSuppressed = sumMetric(m, 'grace_period_suppressed_total');

    // Market context
    const marketCtx = deps.marketCache?.get?.();

    // System alerts
    const alerts: Array<{ level: string; message: string }> = [];
    for (const s of scannerDetails) {
      if (s.status === 'down') alerts.push({ level: 'error', message: `${s.name} scanner is DOWN` });
      else if (s.in_backoff) alerts.push({ level: 'warn', message: `${s.name} in backoff (${s.consecutive_errors} errors)` });
    }
    if (graceActive) alerts.push({ level: 'info', message: `Startup grace period (${Math.round(90 - uptimeS)}s left)` });

    // DB stats
    let dbEventCount = 0;
    let lastEventTime: string | null = null;
    if (deps.db) {
      try {
        const rows = await deps.db.execute('SELECT COUNT(*)::int as count, MAX(created_at) as last FROM events');
        const row = (rows as unknown as { rows: Array<{ count: number; last: string | null }> }).rows[0];
        if (row) {
          dbEventCount = row.count;
          lastEventTime = row.last;
        }
      } catch { /* ignore */ }
    }

    return reply.send({
      system: {
        status: alerts.some(a => a.level === 'error') ? 'degraded' : 'healthy',
        version: deps.version,
        uptime_seconds: Math.round(uptimeS),
        started_at: new Date(deps.startTime).toISOString(),
        grace_period_active: graceActive,
        grace_period_suppressed: graceSuppressed,
        db: deps.db ? 'connected' : 'not_configured',
        memory_mb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
      },
      scanners: {
        total: scannerDetails.length,
        healthy: scannerDetails.filter(s => s.status === 'healthy').length,
        degraded: scannerDetails.filter(s => s.status === 'degraded').length,
        down: scannerDetails.filter(s => s.status === 'down').length,
        details: scannerDetails,
      },
      pipeline: {
        funnel: {
          ingested,
          deduplicated: deduped,
          unique: stored,
          filtered_out: filteredOut,
          filter_passed: filterPassed,
          delivered,
        },
        filter_breakdown: filterBreakdown,
        conversion: ingested > 0 ? `${((delivered / ingested) * 100).toFixed(1)}%` : 'N/A',
      },
      historical: {
        db_events: dbEventCount,
        enrichment: {
          hits: histHits,
          misses: histMisses,
          timeouts: histTimeouts,
          hit_rate: histTotal > 0 ? `${Math.round((histHits / histTotal) * 100)}%` : 'N/A',
        },
        market_context: marketCtx ? {
          vix: marketCtx.vixLevel,
          spy: marketCtx.spyClose,
          regime: marketCtx.marketRegime,
          updated: timeAgo(marketCtx.updatedAt),
        } : null,
      },
      delivery: deliveryChannels,
      db: {
        total_events: dbEventCount,
        last_event: lastEventTime ? timeAgo(lastEventTime) : 'never',
      },
      alerts,
    });
  });

  /**
   * GET /api/v1/feed
   * Public delivered-event feed for the web app.
   */
  server.get('/api/v1/feed', async (request, reply) => {
    if (!deps.db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const parsedQuery = FeedQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })));
    }

    const { limit, before, ticker } = parsedQuery.data;
    const beforeCursor = before ? parseFeedCursor(before) : null;

    if (before && !beforeCursor) {
      return sendValidationError(reply, [{ path: 'before', message: 'Invalid cursor' }]);
    }

    const joinSql = sql.raw(`
      FROM pipeline_audit pa
      JOIN LATERAL (
        SELECT e.*
        FROM events e
        WHERE e.source_event_id = pa.event_id OR CAST(e.id AS text) = pa.event_id
        ORDER BY CASE WHEN CAST(e.id AS text) = pa.event_id THEN 0 ELSE 1 END, e.created_at DESC
        LIMIT 1
      ) e ON TRUE
    `);

    try {
      const [eventsResult, totalResult] = await Promise.all([
        deps.db.execute(sql`
          SELECT
            pa.id AS audit_id,
            pa.created_at AS audit_created_at,
            pa.reason AS audit_reason,
            pa.severity AS audit_severity,
            pa.ticker AS audit_ticker,
            e.id AS event_id,
            e.source AS event_source,
            e.title AS event_title,
            e.severity AS event_severity,
            e.summary AS event_summary,
            e.received_at AS event_received_at,
            e.created_at AS event_created_at,
            e.metadata AS event_metadata,
            e.raw_payload AS event_raw_payload,
            e.source_urls AS event_source_urls
          ${joinSql}
          WHERE ${buildFeedWhere(ticker, beforeCursor ?? undefined)}
          ORDER BY pa.created_at DESC, pa.id DESC
          LIMIT ${limit + 1}
        `),
        deps.db.execute(sql`
          SELECT COUNT(*)::int AS total
          ${joinSql}
          WHERE ${buildFeedWhere(ticker)}
        `),
      ]);

      const rows = (eventsResult as unknown as { rows: FeedRow[] }).rows;
      const totalRow = (totalResult as unknown as { rows: Array<{ total: number }> }).rows[0];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const lastRow = pageRows.at(-1);

      return reply.send({
        events: pageRows.map(mapFeedRow),
        cursor: hasMore && lastRow
          ? encodeFeedCursor(lastRow.audit_created_at, lastRow.audit_id)
          : null,
        total: totalRow?.total ?? 0,
      });
    } catch (err) {
      server.log.error({ err, msg: 'feed query failed' });
      return reply.code(500).send({ error: 'Feed query failed' });
    }
  });

  /**
   * GET /api/v1/audit
   * Query pipeline audit trail — see every event's journey through the pipeline.
   * 
   * Query params:
   *   limit (default 50, max 200)
   *   outcome (delivered|filtered|deduped|grace_period|error)
   *   source (breaking-news|whitehouse|congress|...)
   *   ticker (TSLA|NVDA|...)
   *   search (text search in title)
   */
  server.get<{
    Querystring: {
      limit?: string;
      outcome?: string;
      source?: string;
      ticker?: string;
      search?: string;
    };
  }>('/api/v1/audit', async (request, reply) => {
    if (!deps.db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const limit = Math.min(Number(request.query.limit) || 50, 200);
    const { outcome, source, ticker, search } = request.query;

    try {
      const { sql: sqlTag } = await import('drizzle-orm');

      // Build WHERE clause dynamically using drizzle sql template
      const pieces: ReturnType<typeof sqlTag>[] = [];
      pieces.push(sqlTag`SELECT * FROM pipeline_audit`);

      const conds: ReturnType<typeof sqlTag>[] = [];
      if (outcome) conds.push(sqlTag`outcome = ${outcome}`);
      if (source) conds.push(sqlTag`source = ${source}`);
      if (ticker) conds.push(sqlTag`ticker = ${ticker.toUpperCase()}`);
      if (search) conds.push(sqlTag`title ILIKE ${'%' + search + '%'}`);

      if (conds.length > 0) {
        pieces.push(sqlTag`WHERE`);
        pieces.push(conds.reduce((a, b) => sqlTag`${a} AND ${b}`));
      }

      pieces.push(sqlTag`ORDER BY created_at DESC LIMIT ${limit}`);

      const query = pieces.reduce((a, b) => sqlTag`${a} ${b}`);
      const result = await deps.db.execute(query);
      const rows = (result as unknown as { rows: AuditRow[] }).rows;

      return reply.send({
        count: rows.length,
        events: rows.map(row => ({
          id: row.id,
          event_id: row.event_id,
          source: row.source,
          title: row.title,
          severity: row.severity,
          ticker: row.ticker,
          outcome: row.outcome,
          stopped_at: row.stopped_at,
          reason: row.reason,
          reason_category: row.reason_category,
          delivery_channels: row.delivery_channels,
          historical_match: row.historical_match,
          historical_confidence: row.historical_confidence,
          duration_ms: row.duration_ms,
          at: row.created_at,
        })),
      });
    } catch (err) {
      server.log.error({ err, msg: 'audit query failed' });
      return reply.code(500).send({ error: 'Audit query failed' });
    }
  });

  /**
   * GET /api/v1/audit/stats
   * Summary stats from the audit trail.
   */
  server.get('/api/v1/audit/stats', async (_request, reply) => {
    if (!deps.db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    try {
      const { sql: sqlTag } = await import('drizzle-orm');
      const result = await deps.db.execute(sqlTag.raw(`
        SELECT 
          outcome,
          stopped_at,
          reason_category,
          COUNT(*) as count
        FROM pipeline_audit 
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY outcome, stopped_at, reason_category
        ORDER BY count DESC
      `));

      return reply.send({
        window: '24h',
        breakdown: (result as unknown as { rows: Array<{ outcome: string; stopped_at: string; reason_category: string | null; count: string }> }).rows.map(r => ({
          outcome: r.outcome,
          stopped_at: r.stopped_at,
          reason_category: r.reason_category,
          count: Number(r.count),
        })),
      });
    } catch {
      return reply.code(500).send({ error: 'Failed to query audit stats' });
    }
  });
}
