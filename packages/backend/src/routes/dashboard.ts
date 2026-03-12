import type { FastifyInstance } from 'fastify';
import type { ScannerRegistry } from '@event-radar/shared';
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

    let whereClause = '';
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (outcome) {
      conditions.push(`outcome = $${paramIdx++}`);
      params.push(outcome);
    }
    if (source) {
      conditions.push(`source = $${paramIdx++}`);
      params.push(source);
    }
    if (ticker) {
      conditions.push(`ticker = $${paramIdx++}`);
      params.push(ticker.toUpperCase());
    }
    if (search) {
      conditions.push(`title ILIKE $${paramIdx++}`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    params.push(limit);

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
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to query audit stats' });
    }
  });
}
