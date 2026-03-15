import type { FastifyInstance } from 'fastify';
import type { IMarketRegimeService, ScannerRegistry } from '@event-radar/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import type { MarketContextCache } from '../services/market-context-cache.js';
import type { IDeliveryKillSwitch } from '../services/delivery-kill-switch.js';
import { toDashboardMarketRegime } from '../services/market-regime.js';
import { validateApiKeyValue } from './auth-middleware.js';
import { registry as metricsRegistry } from '../metrics.js';
import { asRecord, parseConfidence, parseJsonValue } from './route-utils.js';
import { getRuntimeScannerStatus } from '../utils/scanner-runtime-status.js';

export interface DashboardDeps {
  apiKey: string;
  db?: Database;
  scannerRegistry: ScannerRegistry;
  marketCache?: MarketContextCache;
  marketRegimeService?: IMarketRegimeService;
  killSwitch?: IDeliveryKillSwitch;
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
  event_metadata: unknown;
}

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

function buildAuditLlmEnrichment(metadataValue: unknown): {
  analysis: string;
  action: string | null;
  signal: string | null;
  tickers: string[];
  regimeContext: string | null;
  confidence: number | null;
} | null {
  const metadata = asRecord(metadataValue);
  const enrichment = asRecord(metadata['llm_enrichment']);
  const summary = typeof enrichment['summary'] === 'string' ? enrichment['summary'].trim() : '';
  const impact = typeof enrichment['impact'] === 'string' ? enrichment['impact'].trim() : '';
  const analysis = [summary, impact].filter(Boolean).join('\n\n');

  if (analysis.length === 0) {
    return null;
  }

  const tickers = Array.isArray(enrichment['tickers'])
    ? enrichment['tickers'].flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return [];
      }

      const symbol = (item as Record<string, unknown>).symbol;
      return typeof symbol === 'string' && symbol.length > 0 ? [symbol] : [];
    })
    : [];
  const judge = asRecord(metadata['llm_judge']);

  const action = typeof enrichment['action'] === 'string' ? enrichment['action'] : null;

  return {
    analysis,
    action,
    signal: action,
    tickers,
    regimeContext: typeof enrichment['regimeContext'] === 'string' ? enrichment['regimeContext'] : null,
    confidence: parseConfidence(judge['confidence']),
  };
}

function asDeliveryChannels(value: unknown): Array<{ channel: string; ok: boolean }> {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.reduce<Array<{ channel: string; ok: boolean }>>((channels, entry) => {
    if (!entry || typeof entry !== 'object') {
      return channels;
    }

    const record = entry as Record<string, unknown>;
    const channel = typeof record.channel === 'string' ? record.channel : null;
    const ok = typeof record.ok === 'boolean' ? record.ok : null;

    if (channel && ok !== null) {
      channels.push({ channel, ok });
    }

    return channels;
  }, []);
}

function getFeedTickers(metadata: Record<string, unknown>, fallbackTicker: string | null): string[] {
  const tickers = asStringArray(metadata['tickers']);
  if (tickers.length > 0) return tickers;

  const singleTicker = metadata['ticker'];
  if (typeof singleTicker === 'string' && singleTicker.length > 0) {
    return [singleTicker];
  }

  return fallbackTicker ? [fallbackTicker] : [];
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
  if (['whitehouse', 'federal-register', 'congress', 'truth-social'].includes(normalizedSource)) {
    return 'policy';
  }
  if (['econ-calendar', 'fedwatch', 'fed', 'bls'].includes(normalizedSource)) {
    return 'macro';
  }
  if (['state-department', 'defense', 'geopolitics'].includes(normalizedSource)) {
    return 'geopolitics';
  }
  if ([
    'sec-edgar',
    'earnings',
    'analyst',
    'fda',
    'doj-antitrust',
    'unusual-options',
    'short-interest',
    'warn',
    'breaking-news',
  ].includes(normalizedSource)) {
    return 'corporate';
  }

  return 'other';
}

export function registerDashboardRoutes(
  server: FastifyInstance,
  deps: DashboardDeps,
): void {
  server.get('/api/v1/dashboard', async (request, reply) => {
    const uptimeS = (Date.now() - deps.startTime) / 1000;
    const graceActive = uptimeS < 90;
    const providedApiKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key']
      : undefined;
    const apiKeyAuthenticated = validateApiKeyValue(providedApiKey, deps.apiKey).ok;

    if (apiKeyAuthenticated) {
      request.apiKeyAuthenticated = true;
    }

    // Parse all metrics at once
    const metricsText = await metricsRegistry.metrics();
    const m = parseMetrics(metricsText);

    // Scanner status
    const healthList = deps.scannerRegistry.healthAll();
    const nowMs = Date.now();
    const scannerDetails = healthList.map(h => {
      const status = getRuntimeScannerStatus(h, nowMs);
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
    const [regimeSnapshot, killSwitchStatus] = await Promise.all([
      deps.marketRegimeService?.getRegimeSnapshot?.() ?? Promise.resolve(null),
      deps.killSwitch?.getStatus?.() ?? Promise.resolve(null),
    ]);

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
    const deliveryLastSuccessAt: Record<string, string | null> = {};
    if (deps.db) {
      try {
        const rows = await deps.db.execute('SELECT COUNT(*)::int as count, MAX(created_at) as last FROM events');
        const row = (rows as unknown as { rows: Array<{ count: number; last: string | null }> }).rows[0];
        if (row) {
          dbEventCount = row.count;
          lastEventTime = row.last;
        }
      } catch { /* ignore */ }

      try {
        const rows = await deps.db.execute(sql`
          SELECT created_at, delivery_channels
          FROM pipeline_audit
          WHERE outcome = 'delivered'
          ORDER BY created_at DESC
          LIMIT 200
        `);
        const deliveredRows = (rows as unknown as {
          rows: Array<{ created_at: string | Date; delivery_channels: unknown }>;
        }).rows;

        for (const row of deliveredRows) {
          const deliveredAt = new Date(row.created_at).toISOString();
          const channels = asDeliveryChannels(row.delivery_channels);
          for (const channel of channels) {
            if (channel.ok && !deliveryLastSuccessAt[channel.channel]) {
              deliveryLastSuccessAt[channel.channel] = deliveredAt;
            }
          }
        }
      } catch { /* ignore */ }

      try {
        if (
          Object.keys(deliveryLastSuccessAt).length === 0
          && Object.values(deliveryChannels).some((stats) => stats.sent > 0)
        ) {
          const rows = await deps.db.execute(sql`
            SELECT MAX(created_at) AS last
            FROM pipeline_audit
            WHERE outcome = 'delivered'
          `);
          const lastDeliveredAt = (rows as unknown as {
            rows: Array<{ last: string | Date | null }>;
          }).rows[0]?.last;

          if (lastDeliveredAt) {
            const fallbackTime = new Date(lastDeliveredAt).toISOString();
            for (const [channel, stats] of Object.entries(deliveryChannels)) {
              if (stats.sent > 0) {
                deliveryLastSuccessAt[channel] = fallbackTime;
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    const deliveryWithSuccessTimes = Object.fromEntries(
      Object.entries(deliveryChannels).map(([channel, stats]) => [
        channel,
        {
          ...stats,
          last_success_at: deliveryLastSuccessAt[channel] ?? null,
        },
      ]),
    );

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
      regime: regimeSnapshot ? {
        ...regimeSnapshot,
        market_regime: toDashboardMarketRegime(regimeSnapshot.score),
      } : null,
      ...(apiKeyAuthenticated
        ? {
            delivery_control: killSwitchStatus ? {
              enabled: killSwitchStatus.enabled,
              last_operation_at: killSwitchStatus.updatedAt,
              operator: killSwitchStatus.updatedBy,
            } : null,
          }
        : {}),
      delivery: deliveryWithSuccessTimes,
      db: {
        total_events: dbEventCount,
        last_event: lastEventTime ? timeAgo(lastEventTime) : 'never',
      },
      alerts,
    });
  });

  server.get<{
    Querystring: {
      limit?: string;
      before?: string;
      ticker?: string;
      watchlist?: string;
    };
  }>('/api/v1/feed', async (request, reply) => {
    if (!deps.db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const rawLimit = Number(request.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 200)
      : 50;
    const ticker = request.query.ticker?.trim().toUpperCase();
    const watchlistFilter = request.query.watchlist === 'true';
    const cursor = request.query.before
      ? decodeFeedCursor(request.query.before)
      : null;

    if (request.query.before && !cursor) {
      return reply.code(400).send({ error: 'Invalid cursor' });
    }

    try {
      const { sql: sqlTag } = await import('drizzle-orm');
      const { eq } = await import('drizzle-orm');
      const { watchlist } = await import('../db/schema.js');
      const { resolveRequestUserId } = await import('./user-context.js');

      const conds: ReturnType<typeof sqlTag>[] = [
        sqlTag`pa.outcome = 'delivered'`,
      ];

      if (watchlistFilter) {
        const userId = resolveRequestUserId(request);
        const watchlistRows = await deps.db
          .select({ ticker: watchlist.ticker })
          .from(watchlist)
          .where(eq(watchlist.userId, userId));
        const tickers = watchlistRows.map((w) => w.ticker);

        if (tickers.length > 0) {
          const tickerConditions = tickers.map(
            (t) => sqlTag`(
              UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${t}
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(e.metadata->'llm_enrichment'->'tickers') AS et
                WHERE UPPER(et->>'symbol') = ${t}
              )
            )`,
          );
          const combined = tickerConditions.reduce(
            (acc, cond) => sqlTag`${acc} OR ${cond}`,
          );
          conds.push(sqlTag`(${combined})`);
        } else {
          // No watchlist items — return empty
          return reply.send({ events: [], cursor: null, total: 0 });
        }
      }

      if (ticker) {
        conds.push(sqlTag`UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${ticker}`);
      }

      if (cursor) {
        conds.push(
          sqlTag`(
            pa.created_at < ${new Date(cursor.createdAt)}
            OR (pa.created_at = ${new Date(cursor.createdAt)} AND pa.id < ${cursor.auditId})
          )`,
        );
      }

      const whereClause = conds.reduce((acc, condition) => sqlTag`${acc} AND ${condition}`);
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
          e.created_at
        FROM pipeline_audit pa
        INNER JOIN events e ON e.source_event_id = pa.event_id
        WHERE ${whereClause}
        ORDER BY pa.created_at DESC, pa.id DESC
        LIMIT ${limit + 1}
      `;

      const [countResult, dataResult] = await Promise.all([
        deps.db.execute(countQuery),
        deps.db.execute(dataQuery),
      ]);

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
            confirmationCount:
              row.confirmation_count
              ?? (typeof metadata['confirmationCount'] === 'number'
                ? metadata['confirmationCount']
                : 1),
            confirmedSources: asStringArray(row.confirmed_sources).length > 0
              ? asStringArray(row.confirmed_sources)
              : asStringArray(metadata['confirmedSources']),
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
    } catch (err) {
      server.log.error({ err, msg: 'feed query failed' });
      return reply.code(500).send({ error: 'Feed query failed' });
    }
  });

  /**
   * GET /api/v1/feed/watchlist-summary
   * Per-ticker summary for authenticated user's watchlist
   */
  server.get('/api/v1/feed/watchlist-summary', async (request, reply) => {
    if (!deps.db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    try {
      const { eq } = await import('drizzle-orm');
      const { watchlist } = await import('../db/schema.js');
      const { resolveRequestUserId } = await import('./user-context.js');

      const userId = resolveRequestUserId(request);
      const watchlistRows = await deps.db
        .select({ ticker: watchlist.ticker })
        .from(watchlist)
        .where(eq(watchlist.userId, userId));

      if (watchlistRows.length === 0) {
        return reply.send({ tickers: [] });
      }

      const tickers = watchlistRows.map((w) => w.ticker);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const { sql: sqlTag } = await import('drizzle-orm');

      // Query per-ticker stats from delivered events in last 24h
      const tickerConditions = tickers.map(
        (t) => sqlTag`(
          UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) = ${t}
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(e.metadata->'llm_enrichment'->'tickers') AS et
            WHERE UPPER(et->>'symbol') = ${t}
          )
        )`,
      );
      const tickerWhere = tickerConditions.reduce(
        (acc, cond) => sqlTag`${acc} OR ${cond}`,
      );

      const rows = (await deps.db.execute(sqlTag`
        SELECT
          UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', '')) AS ticker,
          COUNT(*)::int AS event_count,
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
          AND pa.created_at >= ${since24h}
          AND (${tickerWhere})
        GROUP BY UPPER(COALESCE(pa.ticker, e.metadata->>'ticker', ''))
      `)) as unknown as { rows: Array<{
        ticker: string;
        event_count: number;
        latest_at: string | Date;
        latest_title: string;
        latest_severity: string;
        max_severity_rank: number;
      }> };

      const severitySignal: Record<number, string> = {
        4: '🔴',
        3: '🔴',
        2: '🟡',
        1: '🟢',
        0: '🟢',
      };

      const tickerMap = new Map(rows.rows.map((r) => [r.ticker, r]));

      const result = tickers.map((ticker) => {
        const row = tickerMap.get(ticker);
        return {
          ticker,
          eventCount24h: row?.event_count ?? 0,
          latestEvent: row
            ? {
                title: row.latest_title,
                severity: row.latest_severity ?? 'MEDIUM',
                timestamp: new Date(row.latest_at).toISOString(),
              }
            : null,
          highestSignal: row
            ? severitySignal[row.max_severity_rank] ?? '🟢'
            : '🟢',
        };
      });

      return reply.send({ tickers: result });
    } catch (err) {
      server.log.error({ err, msg: 'watchlist summary query failed' });
      return reply.code(500).send({ error: 'Watchlist summary query failed' });
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
      pieces.push(sqlTag`
        SELECT
          pa.*,
          e.metadata AS event_metadata
        FROM pipeline_audit pa
        LEFT JOIN events e ON e.source_event_id = pa.event_id
      `);

      const conds: ReturnType<typeof sqlTag>[] = [];
      if (outcome) conds.push(sqlTag`pa.outcome = ${outcome}`);
      if (source) conds.push(sqlTag`pa.source = ${source}`);
      if (ticker) conds.push(sqlTag`pa.ticker = ${ticker.toUpperCase()}`);
      if (search) conds.push(sqlTag`pa.title ILIKE ${'%' + search + '%'}`);

      if (conds.length > 0) {
        pieces.push(sqlTag`WHERE`);
        pieces.push(conds.reduce((a, b) => sqlTag`${a} AND ${b}`));
      }

      pieces.push(sqlTag`ORDER BY pa.created_at DESC LIMIT ${limit}`);

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
          llm_enrichment: buildAuditLlmEnrichment(row.event_metadata),
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
