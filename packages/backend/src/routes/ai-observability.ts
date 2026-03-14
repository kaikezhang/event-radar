import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import type { ScannerRegistry } from '@event-radar/shared';
import { registry as metricsRegistry } from '../metrics.js';
import { validateApiKeyValue } from './auth-middleware.js';

// ---- Types ----

interface ScannerStatus {
  name: string;
  eventsInWindow: number;
  lastSeenAt: string | null;
  status: 'active' | 'silent' | 'down';
}

interface TrendData {
  previous: number | null;
  current: number;
  delta: number | null;
  deltaPercent: number | null;
  direction: 'up' | 'flat' | 'down' | 'unknown';
}

interface StructuredAlert {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  actual?: number;
  threshold?: number;
  scanner?: string;
}

interface QuestionableBlock {
  eventId: string;
  title: string;
  source: string;
  ticker: string | null;
  severity: string | null;
  confidence: number;
  reason: string | null;
  blockedAt: string;
}

interface AnomalyRecord {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  scanner?: string;
  detail: string;
  detectedAt: string;
}

interface PulseResponse {
  timestamp: string;
  window: string;
  windowStart: string;
  meta: {
    dbAvailable: boolean;
    metricsAvailable: boolean;
    metricsUptimeSeconds: number;
    dataCompleteness: 'full' | 'partial' | 'insufficient';
  };
  health: {
    score: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
    alerts: StructuredAlert[];
  };
  scanners: ScannerStatus[];
  pipeline: {
    ingested: number;
    deduped: number;
    filtered: number;
    gracePeriod: number;
    delivered: number;
    conversionRate: number;
    trend: TrendData;
    sampleSize: number;
  };
  judge: {
    totalJudged: number;
    passRate: number;
    avgConfidence: number | null;
    sampleSize: number;
    topBlockReasons: Array<{ reason: string; count: number; percentage: number }>;
    questionableBlocks: QuestionableBlock[];
  };
  enrichment: {
    llmSuccessRate: number | null;
    llmAvgLatencyMs: number | null;
    historicalMatchRate: number | null;
    metricsWindowReliable: boolean;
  };
  anomalies: AnomalyRecord[];
}

// ---- Helpers ----

const VALID_WINDOWS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function computeTrend(current: number, previous: number | null): TrendData {
  if (previous == null || previous === 0) {
    return {
      previous,
      current,
      delta: previous != null ? current - previous : null,
      deltaPercent: null,
      direction: previous == null ? 'unknown' : (current > 0 ? 'up' : 'flat'),
    };
  }
  const delta = current - previous;
  const deltaPercent = Math.round((delta / previous) * 1000) / 10; // 1 decimal
  let direction: TrendData['direction'] = 'flat';
  if (Math.abs(deltaPercent) > 10) {
    direction = delta > 0 ? 'up' : 'down';
  }
  return { previous, current, delta, deltaPercent, direction };
}

function computeHealthScore(
  scanners: ScannerStatus[],
  anomalies: AnomalyRecord[],
  gracePeriodActive: boolean,
): { score: number; status: 'healthy' | 'degraded' | 'unhealthy' } {
  let score = 100;

  // Scanner coverage penalty
  const totalScanners = scanners.length;
  const silentScanners = scanners.filter(s => s.status !== 'active').length;
  if (totalScanners > 0) {
    score -= Math.round((silentScanners / totalScanners) * 30);
  }

  // Grace period penalty
  if (gracePeriodActive) score -= 10;

  // Anomaly penalty
  for (const a of anomalies) {
    if (a.severity === 'critical') score -= 10;
    else if (a.severity === 'warning') score -= 5;
    else score -= 2;
  }

  score = Math.max(0, Math.min(100, score));

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (score < 50) status = 'unhealthy';
  else if (score < 80) status = 'degraded';

  return { score, status };
}

// Parse Prometheus text format (shared helper)
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

function sumMetric(
  metrics: Map<string, Array<{ labels: Record<string, string>; value: number }>>,
  name: string,
  filter?: Record<string, string>,
): number {
  const entries = metrics.get(name) ?? [];
  return entries
    .filter(e => !filter || Object.entries(filter).every(([k, v]) => e.labels[k] === v))
    .reduce((sum, e) => sum + e.value, 0);
}

// ---- Route Registration ----

export interface AiObservabilityDeps {
  apiKey: string;
  db?: Database;
  scannerRegistry: ScannerRegistry;
  startTime: number;
}

export function registerAiObservabilityRoutes(
  server: FastifyInstance,
  deps: AiObservabilityDeps,
): void {
  const { apiKey, db, scannerRegistry, startTime } = deps;

  server.get<{
    Querystring: { window?: string };
  }>('/api/v1/ai/pulse', async (request, reply) => {
    const providedKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key']
      : undefined;
    const authResult = validateApiKeyValue(providedKey, apiKey);
    if (!authResult.ok) {
      return reply.status(401).send({ error: 'Unauthorized', message: authResult.message });
    }

    const windowStr = (request.query.window ?? '30m') as string;
    const windowMs = VALID_WINDOWS[windowStr];
    if (!windowMs) {
      return reply.status(400).send({
        error: `Invalid window. Valid: ${Object.keys(VALID_WINDOWS).join(', ')}`,
      });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    const prevWindowStart = new Date(windowStart.getTime() - windowMs);
    const uptimeSeconds = Math.round((now.getTime() - startTime) / 1000);
    const metricsWindowReliable = uptimeSeconds * 1000 >= windowMs;

    // ---- DB Queries (all time-windowed via pipeline_audit) ----
    if (!db) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    // 1. Pipeline funnel for current window
    const funnelRows = await db.execute(sql`
      SELECT outcome, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
      GROUP BY outcome
    `);
    const funnel: Record<string, number> = {};
    for (const r of funnelRows.rows) {
      funnel[r.outcome as string] = Number(r.count);
    }
    const ingested = (funnel['delivered'] ?? 0) + (funnel['filtered'] ?? 0)
      + (funnel['deduped'] ?? 0) + (funnel['grace_period'] ?? 0) + (funnel['error'] ?? 0);
    const delivered = funnel['delivered'] ?? 0;
    const filtered = funnel['filtered'] ?? 0;
    const deduped = funnel['deduped'] ?? 0;
    const gracePeriod = funnel['grace_period'] ?? 0;

    // 2. Pipeline funnel for previous window (trend)
    const prevFunnelRows = await db.execute(sql`
      SELECT outcome, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${prevWindowStart} AND created_at < ${windowStart}
      GROUP BY outcome
    `);
    let prevIngested = 0;
    for (const r of prevFunnelRows.rows) {
      prevIngested += Number(r.count);
    }

    // 3. Scanner event rates in window
    const scannerRateRows = await db.execute(sql`
      SELECT source, COUNT(*) as count, MAX(created_at) as last_seen
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
      GROUP BY source
    `);
    const scannerRates: Record<string, { count: number; lastSeen: string }> = {};
    for (const r of scannerRateRows.rows) {
      scannerRates[r.source as string] = {
        count: Number(r.count),
        lastSeen: (r.last_seen as Date).toISOString(),
      };
    }

    // Get all-time last seen for silent scanners
    const allLastSeenRows = await db.execute(sql`
      SELECT source, MAX(created_at) as last_seen
      FROM pipeline_audit
      GROUP BY source
    `);
    const allLastSeen: Record<string, string> = {};
    for (const r of allLastSeenRows.rows) {
      allLastSeen[r.source as string] = (r.last_seen as Date).toISOString();
    }

    // Build scanner status array
    const registeredScanners = scannerRegistry.healthAll().map(s => s.scanner);
    const allScannerNames = new Set([...registeredScanners, ...Object.keys(allLastSeen)]);
    const scanners: ScannerStatus[] = [];
    for (const name of allScannerNames) {
      const rate = scannerRates[name];
      if (rate && rate.count > 0) {
        scanners.push({ name, eventsInWindow: rate.count, lastSeenAt: rate.lastSeen, status: 'active' });
      } else {
        scanners.push({
          name,
          eventsInWindow: 0,
          lastSeenAt: allLastSeen[name] ?? null,
          status: allLastSeen[name] ? 'silent' : 'down',
        });
      }
    }
    scanners.sort((a, b) => b.eventsInWindow - a.eventsInWindow);

    // 4. Judge analysis
    const judgeRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE stopped_at = 'llm_judge' OR (outcome = 'delivered' AND confidence IS NOT NULL)) as total_judged,
        COUNT(*) FILTER (WHERE outcome = 'delivered' AND confidence IS NOT NULL) as passed,
        AVG(confidence::float) FILTER (WHERE confidence IS NOT NULL) as avg_confidence
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
    `);
    const judgeData = judgeRows.rows[0] ?? {};
    const totalJudged = Number(judgeData.total_judged ?? 0);
    const judgePassed = Number(judgeData.passed ?? 0);
    const judgePassRate = totalJudged > 0 ? Math.round((judgePassed / totalJudged) * 1000) / 10 : 0;
    const avgConfidence = judgeData.avg_confidence != null ? Math.round(Number(judgeData.avg_confidence) * 1000) / 1000 : null;

    // Top block reasons
    const blockReasonRows = await db.execute(sql`
      SELECT reason_category, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
        AND outcome = 'filtered'
        AND reason_category IS NOT NULL
      GROUP BY reason_category
      ORDER BY count DESC
      LIMIT 5
    `);
    const topBlockReasons = blockReasonRows.rows.map(r => {
      const count = Number(r.count);
      return {
        reason: r.reason_category as string,
        count,
        percentage: totalJudged > 0 ? Math.round((count / totalJudged) * 1000) / 10 : 0,
      };
    });

    // Questionable blocks (high severity + low confidence)
    const questionableRows = await db.execute(sql`
      SELECT event_id, title, source, ticker, severity, confidence, reason, created_at
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
        AND outcome = 'filtered'
        AND stopped_at = 'llm_judge'
        AND severity IN ('HIGH', 'CRITICAL')
        AND confidence IS NOT NULL
        AND confidence < 0.7
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const questionableBlocks: QuestionableBlock[] = questionableRows.rows.map(r => ({
      eventId: r.event_id as string,
      title: r.title as string,
      source: r.source as string,
      ticker: r.ticker as string | null,
      severity: r.severity as string | null,
      confidence: Number(r.confidence),
      reason: r.reason as string | null,
      blockedAt: (r.created_at as Date).toISOString(),
    }));

    // 5. Enrichment stats from Prometheus counters (since process start)
    let llmSuccessRate: number | null = null;
    let llmAvgLatencyMs: number | null = null;
    try {
      const metricsText = await metricsRegistry.metrics();
      const metrics = parseMetrics(metricsText);

      const enrichSuccess = sumMetric(metrics, 'llm_enrichment_total', { result: 'success' });
      const enrichError = sumMetric(metrics, 'llm_enrichment_total', { result: 'error' });
      const enrichEmpty = sumMetric(metrics, 'llm_enrichment_total', { result: 'empty' });
      const enrichTotal = enrichSuccess + enrichError + enrichEmpty;

      if (enrichTotal > 0) {
        llmSuccessRate = Math.round((enrichSuccess / enrichTotal) * 1000) / 10;
      }

      // Histogram sum / count for average latency
      const histSum = sumMetric(metrics, 'llm_enrichment_duration_seconds_sum');
      const histCount = sumMetric(metrics, 'llm_enrichment_duration_seconds_count');
      if (histCount > 0) {
        llmAvgLatencyMs = Math.round((histSum / histCount) * 1000);
      }
    } catch {
      // Metrics unavailable
    }

    // Historical match rate from DB
    const histMatchRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE historical_match = true) as matched,
        COUNT(*) as total
      FROM pipeline_audit
      WHERE created_at >= ${windowStart}
        AND outcome = 'delivered'
    `);
    const histData = histMatchRows.rows[0] ?? {};
    const histMatchRate = Number(histData.total ?? 0) > 0
      ? Math.round((Number(histData.matched ?? 0) / Number(histData.total)) * 1000) / 10
      : null;

    // 6. Grace period check
    const gracePeriodActive = gracePeriod > 0 && uptimeSeconds < 600; // 10 min

    // 7. Anomaly detection
    const anomalies: AnomalyRecord[] = [];

    // Scanner silence
    const silentScanners = scanners.filter(s => s.status === 'silent');
    for (const s of silentScanners) {
      if (!s.lastSeenAt) continue;
      const silentMs = now.getTime() - new Date(s.lastSeenAt).getTime();
      const silentHours = silentMs / 3_600_000;
      if (silentHours > 6) {
        anomalies.push({
          type: 'scanner_silent',
          severity: 'critical',
          scanner: s.name,
          detail: `Scanner ${s.name} silent for ${Math.round(silentHours)}h`,
          detectedAt: now.toISOString(),
        });
      } else if (silentHours > 1) {
        anomalies.push({
          type: 'scanner_silent',
          severity: 'warning',
          scanner: s.name,
          detail: `Scanner ${s.name} silent for ${Math.round(silentHours * 10) / 10}h`,
          detectedAt: now.toISOString(),
        });
      }
    }

    // Volume spike detection (vs 24h average)
    if (windowStr !== '24h') {
      const dayAvgRows = await db.execute(sql`
        SELECT source, COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600, 1) as events_per_hour
        FROM pipeline_audit
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY source
      `);
      const dayAvgRates: Record<string, number> = {};
      for (const r of dayAvgRows.rows) {
        dayAvgRates[r.source as string] = Number(r.events_per_hour);
      }

      const windowHours = windowMs / 3_600_000;
      for (const s of scanners) {
        if (s.eventsInWindow === 0) continue;
        const expectedInWindow = (dayAvgRates[s.name] ?? 0) * windowHours;
        if (expectedInWindow > 0 && s.eventsInWindow > expectedInWindow * 3) {
          anomalies.push({
            type: 'volume_spike',
            severity: 'warning',
            scanner: s.name,
            detail: `${s.name}: ${s.eventsInWindow} events in ${windowStr} (expected ~${Math.round(expectedInWindow)})`,
            detectedAt: now.toISOString(),
          });
        }
      }
    }

    // Filter rate change
    const currentFilterRate = ingested > 0 ? filtered / ingested : 0;
    const prevFiltered = prevFunnelRows.rows
      .filter(r => (r.outcome as string) === 'filtered')
      .reduce((sum, r) => sum + Number(r.count), 0);
    const prevFilterRate = prevIngested > 0 ? prevFiltered / prevIngested : 0;
    if (prevIngested > 5 && ingested > 5) {
      const filterRateDiff = Math.abs(currentFilterRate - prevFilterRate);
      if (filterRateDiff > 0.2) {
        anomalies.push({
          type: 'filter_rate_change',
          severity: 'warning',
          detail: `Filter rate changed from ${Math.round(prevFilterRate * 100)}% to ${Math.round(currentFilterRate * 100)}%`,
          detectedAt: now.toISOString(),
        });
      } else if (filterRateDiff > 0.1) {
        anomalies.push({
          type: 'filter_rate_change',
          severity: 'info',
          detail: `Filter rate shifted from ${Math.round(prevFilterRate * 100)}% to ${Math.round(currentFilterRate * 100)}%`,
          detectedAt: now.toISOString(),
        });
      }
    }

    // Build alerts
    const alerts: StructuredAlert[] = [];
    if (gracePeriodActive) {
      alerts.push({
        code: 'grace_period_active',
        severity: 'info',
        message: `Grace period active (uptime: ${uptimeSeconds}s), ${gracePeriod} events suppressed`,
        actual: gracePeriod,
      });
    }
    for (const a of anomalies) {
      alerts.push({
        code: a.type,
        severity: a.severity,
        message: a.detail,
        scanner: a.scanner,
      });
    }

    // Compute health
    const healthResult = computeHealthScore(scanners, anomalies, gracePeriodActive);

    // Determine data completeness
    let dataCompleteness: 'full' | 'partial' | 'insufficient' = 'full';
    if (!metricsWindowReliable) dataCompleteness = 'partial';
    if (ingested === 0 && prevIngested === 0) dataCompleteness = 'insufficient';

    const conversionRate = ingested > 0
      ? Math.round((delivered / ingested) * 1000) / 10
      : 0;

    const response: PulseResponse = {
      timestamp: now.toISOString(),
      window: windowStr,
      windowStart: windowStart.toISOString(),
      meta: {
        dbAvailable: true,
        metricsAvailable: true,
        metricsUptimeSeconds: uptimeSeconds,
        dataCompleteness,
      },
      health: {
        score: healthResult.score,
        status: healthResult.status,
        alerts,
      },
      scanners,
      pipeline: {
        ingested,
        deduped,
        filtered,
        gracePeriod,
        delivered,
        conversionRate,
        trend: computeTrend(ingested, prevIngested > 0 ? prevIngested : null),
        sampleSize: ingested,
      },
      judge: {
        totalJudged,
        passRate: judgePassRate,
        avgConfidence,
        sampleSize: totalJudged,
        topBlockReasons,
        questionableBlocks,
      },
      enrichment: {
        llmSuccessRate,
        llmAvgLatencyMs,
        historicalMatchRate: histMatchRate,
        metricsWindowReliable,
      },
      anomalies,
    };

    return reply.send(response);
  });
}
