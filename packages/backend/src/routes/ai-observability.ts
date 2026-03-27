import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import type { ScannerRegistry } from '@event-radar/shared';
import { registry as metricsRegistry } from '../metrics.js';
import { validateApiKeyValue } from './auth-middleware.js';
import {
  getRuntimeScannerStatus,
  getScannerStaleThresholdMs,
} from '../utils/scanner-runtime-status.js';

// ---- Types ----

type ScheduleCategory = 'market-hours' | 'government' | 'always' | 'manual';

interface ScannerStatus {
  name: string;
  eventsInWindow: number;
  lastSeenAt: string | null;
  activityStatus: 'active' | 'silent';
  status: 'active' | 'silent' | 'down';
  runtimeStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  runtimeLastScanAt: string | null;
  runtimeCurrentIntervalMs: number | null;
  runtimeStaleAfterMs: number | null;
  sources: string[];
  schedule: ScheduleCategory;
  withinSchedule: boolean;
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

const OBSERVABILITY_SOURCE_ALIASES: Record<string, string> = {
  'pr-newswire': 'newswire',
  'businesswire': 'newswire',
  'globenewswire': 'newswire',
  'x': 'x-elonmusk',
  'twitter': 'x-elonmusk',
  'company-ir': 'ir-monitor',
  'doj': 'doj-antitrust',
};

export function normalizeObservabilityScannerName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return OBSERVABILITY_SOURCE_ALIASES[normalized] ?? normalized;
}

/**
 * Given a canonical scanner name, return all DB source names that map to it.
 * Includes the canonical name itself plus any aliases.
 */
export function getSourceNamesForScanner(canonicalName: string): string[] {
  const sources = new Set<string>([canonicalName]);
  for (const [alias, target] of Object.entries(OBSERVABILITY_SOURCE_ALIASES)) {
    if (target === canonicalName) {
      sources.add(alias);
    }
  }
  return [...sources];
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pickLatestIso(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

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

// ---- Scanner Schedule ----

const SCANNER_SCHEDULE: Record<string, ScheduleCategory> = {
  'trading-halt': 'market-hours',
  'sec-edgar': 'market-hours',
  'newswire': 'market-hours',
  'ir-monitor': 'market-hours',
  'federal-register': 'government',
  'fed': 'government',
  'fda': 'government',
  'sec-regulatory': 'government',
  'ftc': 'government',
  'econ-calendar': 'government',
  'breaking-news': 'always',
  'truth-social': 'always',
  'manual': 'manual',
  'dummy': 'manual',
  // Legacy / sub-sources that appear in DB but have no standalone scanner runtime.
  // Mark as manual so pulse doesn't raise false-positive critical alerts.
  'yahoo-finance': 'manual',
  'cfpb': 'manual',
};

function getScannerSchedule(scannerName: string): ScheduleCategory {
  return SCANNER_SCHEDULE[scannerName] ?? 'always';
}

/**
 * Get the current hour and day-of-week in America/New_York timezone.
 */
const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  hourCycle: 'h23',
  weekday: 'short',
});

function getETComponents(now: Date): { hour: number; dayOfWeek: number } {
  const fmt = etFormatter;
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour');
  const weekdayPart = parts.find(p => p.type === 'weekday');
  const hour = Number(hourPart?.value ?? 0);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[weekdayPart?.value ?? 'Mon'] ?? 1;
  return { hour, dayOfWeek };
}

export function isWithinSchedule(scannerName: string, now: Date): boolean {
  const schedule = getScannerSchedule(scannerName);
  if (schedule === 'always') return true;
  if (schedule === 'manual') return false;

  const { hour, dayOfWeek } = getETComponents(now);
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  if (schedule === 'market-hours') {
    // Mon-Fri 6am-8pm ET (pre-market through after-hours)
    return isWeekday && hour >= 6 && hour < 20;
  }
  if (schedule === 'government') {
    // Mon-Fri 8am-6pm ET (business hours)
    return isWeekday && hour >= 8 && hour < 18;
  }
  return true;
}

function computeHealthScore(
  scanners: ScannerStatus[],
  anomalies: AnomalyRecord[],
  gracePeriodActive: boolean,
): { score: number; status: 'healthy' | 'degraded' | 'unhealthy' } {
  let score = 100;

  // Scanner coverage penalty — exclude manual scanners entirely,
  // and only penalize silent scanners that are within their expected schedule
  const scorableScanners = scanners.filter(s => s.schedule !== 'manual');
  const silentInSchedule = scorableScanners.filter(
    s => s.status !== 'active' && s.withinSchedule,
  ).length;
  if (scorableScanners.length > 0) {
    score -= Math.round((silentInSchedule / scorableScanners.length) * 30);
  }

  // Grace period penalty
  if (gracePeriodActive) score -= 10;

  // Anomaly penalty — info-level anomalies (e.g. expected off-schedule silence) don't penalize
  for (const a of anomalies) {
    if (a.severity === 'critical') score -= 10;
    else if (a.severity === 'warning') score -= 5;
    // info severity: no penalty (expected behavior like weekend silence)
  }

  score = Math.max(0, Math.min(100, score));

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (score < 50) status = 'unhealthy';
  else if (score < 80) status = 'degraded';

  return { score, status };
}

// Parse Prometheus text format (shared helper)
export function parsePrometheusMetrics(
  text: string,
): Map<string, Array<{ labels: Record<string, string>; value: number }>> {
  const result = new Map<string, Array<{ labels: Record<string, string>; value: number }>>();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const match = line.match(/^([a-z_][a-z0-9_]*)(\{[^}]*\})?\s+(\S+)/);
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    const labels: Record<string, string> = {};
    if (labelsStr) {
      const labelMatches = labelsStr.matchAll(/([a-z][a-z0-9_]*)="([^"]*)"/g);
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

    // Parallel batch 1: activity comes from stored row creation time, not business timestamps.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const [
      funnelRows,
      prevFunnelRows,
      auditScannerRateRows,
      auditLastSeenRows,
      eventScannerRateRows,
      eventLastSeenRows,
    ] = await Promise.all([
      // 1. Pipeline funnel for current window
      db.execute(sql`
        SELECT outcome, COUNT(*) as count
        FROM pipeline_audit WHERE created_at >= ${windowStart} GROUP BY outcome
      `),
      // 2. Previous window (trend)
      db.execute(sql`
        SELECT outcome, COUNT(*) as count
        FROM pipeline_audit WHERE created_at >= ${prevWindowStart} AND created_at < ${windowStart} GROUP BY outcome
      `),
      // 3. Scanner event rates
      db.execute(sql`
        SELECT source, COUNT(*) as count, MAX(created_at) as last_seen
        FROM pipeline_audit WHERE created_at >= ${windowStart} GROUP BY source
      `),
      // 4. Last seen (bounded to 30 days — avoids full table scan)
      db.execute(sql`
        SELECT source, MAX(created_at) as last_seen
        FROM pipeline_audit WHERE created_at >= ${thirtyDaysAgo} GROUP BY source
      `),
      // 5. Successfully stored events in the current window
      db.execute(sql`
        SELECT source, COUNT(*) as count, MAX(created_at) as last_seen
        FROM events WHERE created_at >= ${windowStart} GROUP BY source
      `),
      // 6. Stored event last seen (bounded to 30 days)
      db.execute(sql`
        SELECT source, MAX(created_at) as last_seen
        FROM events WHERE created_at >= ${thirtyDaysAgo} GROUP BY source
      `),
    ]);

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

    let prevIngested = 0;
    for (const r of prevFunnelRows.rows) {
      prevIngested += Number(r.count);
    }

    const scannerActivity: Record<string, {
      countBySource: Map<string, number>;
      lastSeen: string | null;
      sources: Set<string>;
    }> = {};
    for (const r of auditScannerRateRows.rows) {
      const source = String(r.source);
      const name = normalizeObservabilityScannerName(source);
      const lastSeen = toIsoString(r.last_seen);
      if (!scannerActivity[name]) {
        scannerActivity[name] = {
          countBySource: new Map<string, number>(),
          lastSeen: null,
          sources: new Set<string>(),
        };
      }
      scannerActivity[name].countBySource.set(
        source,
        Math.max(scannerActivity[name].countBySource.get(source) ?? 0, Number(r.count)),
      );
      scannerActivity[name].lastSeen = pickLatestIso(scannerActivity[name].lastSeen, lastSeen);
      scannerActivity[name].sources.add(source);
    }
    for (const r of eventScannerRateRows.rows) {
      const source = String(r.source);
      const name = normalizeObservabilityScannerName(source);
      const lastSeen = toIsoString(r.last_seen);
      if (!scannerActivity[name]) {
        scannerActivity[name] = {
          countBySource: new Map<string, number>(),
          lastSeen: null,
          sources: new Set<string>(),
        };
      }
      scannerActivity[name].countBySource.set(
        source,
        Math.max(scannerActivity[name].countBySource.get(source) ?? 0, Number(r.count)),
      );
      scannerActivity[name].lastSeen = pickLatestIso(scannerActivity[name].lastSeen, lastSeen);
      scannerActivity[name].sources.add(source);
    }

    const allLastSeen: Record<string, { lastSeen: string | null; sources: Set<string> }> = {};
    for (const r of auditLastSeenRows.rows) {
      const source = String(r.source);
      const name = normalizeObservabilityScannerName(source);
      const lastSeen = toIsoString(r.last_seen);
      if (!allLastSeen[name]) {
        allLastSeen[name] = {
          lastSeen: null,
          sources: new Set<string>(),
        };
      }
      allLastSeen[name].lastSeen = pickLatestIso(allLastSeen[name].lastSeen, lastSeen);
      allLastSeen[name].sources.add(source);
    }
    for (const r of eventLastSeenRows.rows) {
      const source = String(r.source);
      const name = normalizeObservabilityScannerName(source);
      const lastSeen = toIsoString(r.last_seen);
      if (!allLastSeen[name]) {
        allLastSeen[name] = {
          lastSeen: null,
          sources: new Set<string>(),
        };
      }
      allLastSeen[name].lastSeen = pickLatestIso(allLastSeen[name].lastSeen, lastSeen);
      allLastSeen[name].sources.add(source);
    }

    // Build scanner status array
    const runtimeHealth = scannerRegistry.healthAll().map((health) => {
      const name = normalizeObservabilityScannerName(health.scanner);
      const withinSchedule = isWithinSchedule(name, now);
      return {
        name,
        status: getRuntimeScannerStatus(health, now.getTime(), { withinSchedule }),
        lastScanAt: toIsoString(health.lastScanAt),
        currentIntervalMs: health.currentIntervalMs ?? null,
        staleAfterMs: getScannerStaleThresholdMs(health),
      };
    });
    const runtimeHealthByName = Object.fromEntries(
      runtimeHealth.map((health) => [health.name, health]),
    );
    const registeredScanners = runtimeHealth.map(s => s.name);
    const allScannerNames = new Set([
      ...registeredScanners,
      ...Object.keys(allLastSeen),
      ...Object.keys(scannerActivity),
    ]);
    const scanners: ScannerStatus[] = [];
    for (const name of allScannerNames) {
      const rate = scannerActivity[name];
      const eventsInWindow = rate
        ? [...rate.countBySource.values()].reduce((sum, count) => sum + count, 0)
        : 0;
      const runtime = runtimeHealthByName[name];
      const activityStatus: ScannerStatus['activityStatus'] =
        eventsInWindow > 0 ? 'active' : 'silent';
      const lastSeenAt = rate?.lastSeen ?? allLastSeen[name]?.lastSeen ?? null;
      const sources = new Set<string>([
        ...(rate?.sources ?? []),
        ...(allLastSeen[name]?.sources ?? []),
      ]);
      const runtimeStatus = runtime?.status ?? 'unknown';

      const schedule = getScannerSchedule(name);
      const withinSchedule = isWithinSchedule(name, now);

      scanners.push({
        name,
        eventsInWindow,
        lastSeenAt,
        activityStatus,
        status: runtimeStatus === 'down' ? 'down' : activityStatus,
        runtimeStatus,
        runtimeLastScanAt: runtime?.lastScanAt ?? null,
        runtimeCurrentIntervalMs: runtime?.currentIntervalMs ?? null,
        runtimeStaleAfterMs: runtime?.staleAfterMs ?? null,
        sources: [...sources].sort(),
        schedule,
        withinSchedule,
      });
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
    const questionableBlocks: QuestionableBlock[] = questionableRows.rows.map(r => {
      const ca = r.created_at;
      return {
        eventId: r.event_id as string,
        title: r.title as string,
        source: r.source as string,
        ticker: r.ticker as string | null,
        severity: r.severity as string | null,
        confidence: Number(r.confidence),
        reason: r.reason as string | null,
        blockedAt: ca instanceof Date ? ca.toISOString() : String(ca),
      };
    });

    // 5. Enrichment stats from Prometheus counters (since process start)
    let llmSuccessRate: number | null = null;
    let llmAvgLatencyMs: number | null = null;
    try {
      const metricsText = await metricsRegistry.metrics();
      const metrics = parsePrometheusMetrics(metricsText);

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
    } catch (metricsErr) {
      server.log.warn({ error: metricsErr instanceof Error ? metricsErr.message : String(metricsErr) }, 'Metrics parsing failed');
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

    // Scanner silence — schedule-aware
    const silentScanners = scanners.filter(
      s => s.activityStatus === 'silent' && s.runtimeStatus !== 'down' && s.schedule !== 'manual',
    );
    for (const s of silentScanners) {
      if (!s.lastSeenAt) continue;
      const silentMs = now.getTime() - new Date(s.lastSeenAt).getTime();
      const silentHours = silentMs / 3_600_000;

      // DB-only sources (not in runtime registry) → always info severity
      // These appear because historical events exist in DB but the scanner
      // is disabled or was removed. Don't raise critical/warning for them.
      if (s.runtimeStatus === 'unknown') {
        if (silentHours > 6) {
          anomalies.push({
            type: 'scanner_silent',
            severity: 'info',
            scanner: s.name,
            detail: `Scanner ${s.name} silent for ${Math.round(silentHours)}h (not in runtime — DB-only source)`,
            detectedAt: now.toISOString(),
          });
        }
        continue;
      }

      // Outside schedule → downgrade to info
      if (!s.withinSchedule) {
        if (silentHours > 6) {
          anomalies.push({
            type: 'scanner_silent',
            severity: 'info',
            scanner: s.name,
            detail: `Scanner ${s.name} silent for ${Math.round(silentHours)}h (expected — outside schedule)`,
            detectedAt: now.toISOString(),
          });
        }
        continue;
      }

      // Within schedule — normal severity
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

    for (const s of scanners) {
      if (s.runtimeStatus === 'down') {
        anomalies.push({
          type: 'scanner_runtime_down',
          severity: 'critical',
          scanner: s.name,
          detail: `Scanner ${s.name} runtime health is down`,
          detectedAt: now.toISOString(),
        });
      } else if (s.runtimeStatus === 'degraded') {
        anomalies.push({
          type: 'scanner_runtime_degraded',
          severity: 'warning',
          scanner: s.name,
          detail: `Scanner ${s.name} runtime health is degraded`,
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
        const name = normalizeObservabilityScannerName(String(r.source));
        dayAvgRates[name] = (dayAvgRates[name] ?? 0) + Number(r.events_per_hour);
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

  // ========================================================================
  // Phase 2: Daily Intelligence Report
  // GET /api/v1/ai/daily-report?date=YYYY-MM-DD
  // ========================================================================

  server.get<{
    Querystring: { date?: string };
  }>('/api/v1/ai/daily-report', async (request, reply) => {
    const providedKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key'] : undefined;
    const authResult = validateApiKeyValue(providedKey, apiKey);
    if (!authResult.ok) {
      return reply.status(401).send({ error: 'Unauthorized', message: authResult.message });
    }
    if (!db) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const dateStr = (request.query.date ?? new Date().toISOString().slice(0, 10)) as string;
    const dateMatch = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!dateMatch) {
      return reply.status(400).send({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const dayStart = new Date(`${dateStr}T00:00:00Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const prevDayStart = new Date(dayStart.getTime() - 86_400_000);
    const prevDayEnd = new Date(dayEnd.getTime() - 86_400_000);
    const weekStart = new Date(dayStart.getTime() - 7 * 86_400_000);

    // 1. Summary — current day
    const summaryRows = await db.execute(sql`
      SELECT outcome, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${dayStart} AND created_at <= ${dayEnd}
      GROUP BY outcome
    `);
    const dayCounts: Record<string, number> = {};
    for (const r of summaryRows.rows) dayCounts[r.outcome as string] = Number(r.count);
    const dayTotal = Object.values(dayCounts).reduce((s, v) => s + v, 0);
    const dayDelivered = dayCounts['delivered'] ?? 0;
    const dayFiltered = dayCounts['filtered'] ?? 0;
    const dayConversion = dayTotal > 0 ? Math.round((dayDelivered / dayTotal) * 1000) / 10 : 0;

    // Previous day
    const prevRows = await db.execute(sql`
      SELECT outcome, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${prevDayStart} AND created_at <= ${prevDayEnd}
      GROUP BY outcome
    `);
    const prevCounts: Record<string, number> = {};
    for (const r of prevRows.rows) prevCounts[r.outcome as string] = Number(r.count);
    const prevTotal = Object.values(prevCounts).reduce((s, v) => s + v, 0);
    const prevDelivered = prevCounts['delivered'] ?? 0;

    // Week average (use actual distinct days to avoid underestimating with fewer days of data)
    const weekRows = await db.execute(sql`
      SELECT COUNT(*)::float / GREATEST(COUNT(DISTINCT DATE(created_at)), 1) as avg_total,
             COUNT(*) FILTER (WHERE outcome = 'delivered')::float / GREATEST(COUNT(DISTINCT DATE(created_at)), 1) as avg_delivered
      FROM pipeline_audit
      WHERE created_at >= ${weekStart} AND created_at <= ${dayEnd}
    `);
    const weekAvg = weekRows.rows[0] ?? {};
    const weekAvgTotal = Number(weekAvg.avg_total ?? 0);
    const weekAvgDelivered = Number(weekAvg.avg_delivered ?? 0);

    // 2. Scanner breakdown
    const scannerRows = await db.execute(sql`
      SELECT source,
             COUNT(*) as events,
             COUNT(*) FILTER (WHERE outcome = 'delivered') as delivered,
             ROUND(AVG(CASE
               WHEN severity = 'CRITICAL' THEN 4
               WHEN severity = 'HIGH' THEN 3
               WHEN severity = 'MEDIUM' THEN 2
               WHEN severity = 'LOW' THEN 1
               ELSE 0
             END), 1) as avg_severity_score,
             MAX(created_at) as last_event
      FROM pipeline_audit
      WHERE created_at >= ${dayStart} AND created_at <= ${dayEnd}
      GROUP BY source
      ORDER BY events DESC
    `);
    const scannerBreakdown = scannerRows.rows.map(r => {
      const events = Number(r.events);
      const dlv = Number(r.delivered);
      return {
        name: r.source as string,
        events,
        delivered: dlv,
        deliveryRate: events > 0 ? Math.round((dlv / events) * 1000) / 10 : 0,
        avgSeverityScore: Number(r.avg_severity_score ?? 0),
        lastEvent: String(r.last_event),
      };
    });

    // 3. Judge analysis
    const judgeRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE stopped_at = 'llm_judge' OR (outcome = 'delivered' AND confidence IS NOT NULL)) as total_judged,
        COUNT(*) FILTER (WHERE outcome = 'delivered' AND confidence IS NOT NULL) as passed,
        AVG(confidence::float) FILTER (WHERE confidence IS NOT NULL) as avg_confidence,
        COUNT(*) FILTER (WHERE confidence IS NOT NULL AND confidence > 0.8) as high_conf,
        COUNT(*) FILTER (WHERE confidence IS NOT NULL AND confidence >= 0.5 AND confidence <= 0.8) as med_conf,
        COUNT(*) FILTER (WHERE confidence IS NOT NULL AND confidence < 0.5) as low_conf
      FROM pipeline_audit
      WHERE created_at >= ${dayStart} AND created_at <= ${dayEnd}
    `);
    const jd = judgeRows.rows[0] ?? {};
    const dayJudged = Number(jd.total_judged ?? 0);
    const dayPassed = Number(jd.passed ?? 0);

    // Top block reasons
    const blockRows = await db.execute(sql`
      SELECT reason_category, COUNT(*) as count
      FROM pipeline_audit
      WHERE created_at >= ${dayStart} AND created_at <= ${dayEnd}
        AND outcome = 'filtered' AND reason_category IS NOT NULL
      GROUP BY reason_category
      ORDER BY count DESC
      LIMIT 10
    `);

    // 4. False negative candidates
    // Events blocked by judge where actual price moved >3%
    const falseNegRows = await db.execute(sql`
      SELECT pa.event_id, pa.title, pa.ticker, pa.source, pa.severity,
             pa.reason as blocked_reason, pa.confidence,
             eo.event_price, eo.change_1d, eo.change_1w
      FROM pipeline_audit pa
      JOIN events e ON e.source_event_id = pa.event_id AND e.source = pa.source
      JOIN event_outcomes eo ON eo.event_id = e.id
      WHERE pa.outcome = 'filtered'
        AND pa.created_at >= ${dayStart} AND pa.created_at <= ${dayEnd}
        AND eo.change_1d IS NOT NULL
        AND ABS(eo.change_1d::float) > 3
      ORDER BY ABS(eo.change_1d::float) DESC
      LIMIT 10
    `);
    const falseNegativeCandidates = falseNegRows.rows.map(r => ({
      eventId: r.event_id as string,
      title: r.title as string,
      ticker: r.ticker as string | null,
      source: r.source as string,
      severity: r.severity as string | null,
      blockedReason: r.blocked_reason as string | null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      priceAtEvent: r.event_price != null ? Number(r.event_price) : null,
      priceChange1d: r.change_1d != null ? Number(r.change_1d) : null,
      priceChange1w: r.change_1w != null ? Number(r.change_1w) : null,
      verdict: Math.abs(Number(r.change_1d ?? 0)) > 5
        ? 'likely_false_negative' as const
        : 'review_needed' as const,
    }));

    // 5. Signal validation
    // Compare delivered vs filtered events' actual price impact
    const signalRows = await db.execute(sql`
      SELECT
        pa.outcome,
        COUNT(*) as count,
        AVG(ABS(eo.change_1d::float)) as avg_abs_change_1d,
        AVG(ABS(eo.change_1w::float)) as avg_abs_change_1w,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(eo.change_1d::float)) as median_abs_change_1d
      FROM pipeline_audit pa
      JOIN events e ON e.source_event_id = pa.event_id AND e.source = pa.source
      JOIN event_outcomes eo ON eo.event_id = e.id
      WHERE pa.created_at >= ${dayStart} AND pa.created_at <= ${dayEnd}
        AND eo.change_1d IS NOT NULL
        AND pa.outcome IN ('delivered', 'filtered')
      GROUP BY pa.outcome
    `);

    const signalMap: Record<string, {
      count: number;
      avgAbsChange1d: number | null;
      avgAbsChange1w: number | null;
      medianAbsChange1d: number | null;
    }> = {};
    for (const r of signalRows.rows) {
      signalMap[r.outcome as string] = {
        count: Number(r.count),
        avgAbsChange1d: r.avg_abs_change_1d != null ? Math.round(Number(r.avg_abs_change_1d) * 100) / 100 : null,
        avgAbsChange1w: r.avg_abs_change_1w != null ? Math.round(Number(r.avg_abs_change_1w) * 100) / 100 : null,
        medianAbsChange1d: r.median_abs_change_1d != null ? Math.round(Number(r.median_abs_change_1d) * 100) / 100 : null,
      };
    }
    const deliveredSignal = signalMap['delivered'] ?? { count: 0, avgAbsChange1d: null, avgAbsChange1w: null, medianAbsChange1d: null };
    const filteredSignal = signalMap['filtered'] ?? { count: 0, avgAbsChange1d: null, avgAbsChange1w: null, medianAbsChange1d: null };

    let signalStrength: 'strong' | 'moderate' | 'weak' | 'negative' | 'insufficient_data' = 'insufficient_data';
    let signalInterpretation = 'Insufficient outcome data for signal validation';

    if (deliveredSignal.avgAbsChange1d != null && filteredSignal.avgAbsChange1d != null && filteredSignal.avgAbsChange1d > 0) {
      const ratio = deliveredSignal.avgAbsChange1d / filteredSignal.avgAbsChange1d;
      if (ratio >= 2.0) {
        signalStrength = 'strong';
        signalInterpretation = `Delivered events had ${ratio.toFixed(1)}x the price impact of filtered events. System is adding significant alpha.`;
      } else if (ratio >= 1.5) {
        signalStrength = 'moderate';
        signalInterpretation = `Delivered events had ${ratio.toFixed(1)}x the price impact. Decent signal quality.`;
      } else if (ratio >= 1.0) {
        signalStrength = 'weak';
        signalInterpretation = `Delivered events had only ${ratio.toFixed(1)}x impact vs filtered. Consider reviewing classification rules.`;
      } else {
        signalStrength = 'negative';
        signalInterpretation = `ALERT: Filtered events had MORE price impact than delivered events (${(1/ratio).toFixed(1)}x). System is blocking the wrong events!`;
      }
    } else if (deliveredSignal.count < 3 || filteredSignal.count < 3) {
      signalInterpretation = `Insufficient sample: ${deliveredSignal.count} delivered, ${filteredSignal.count} filtered with price data.`;
    }

    // 6. Outcome tracker health
    const outcomeHealthRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE change_1d IS NOT NULL AND change_1w IS NOT NULL) as full_data,
        COUNT(*) FILTER (WHERE change_1d IS NULL AND event_time < NOW() - INTERVAL '24 hours') as pending_1d,
        COUNT(*) FILTER (WHERE change_1w IS NULL AND event_time < NOW() - INTERVAL '7 days') as pending_1w,
        COUNT(*) FILTER (WHERE change_1m IS NULL AND event_time < NOW() - INTERVAL '30 days') as pending_1m,
        MAX(updated_at) as last_update
      FROM event_outcomes
    `);
    const oh = outcomeHealthRows.rows[0] ?? {};
    const lastUpdate = oh.last_update ? new Date(String(oh.last_update)) : null;
    const backfillStaleHours = lastUpdate ? (Date.now() - lastUpdate.getTime()) / 3_600_000 : Infinity;

    let backfillHealth: 'healthy' | 'stale' | 'not_running' = 'not_running';
    if (backfillStaleHours < 1) backfillHealth = 'healthy';
    else if (backfillStaleHours < 24) backfillHealth = 'stale';

    // 7. Recommendations
    const recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      action: string;
      reason: string;
      data: Record<string, unknown>;
    }> = [];

    if (falseNegativeCandidates.filter(f => Math.abs(f.priceChange1d ?? 0) > 5).length >= 3) {
      recommendations.push({
        priority: 'high',
        action: 'lower_judge_threshold',
        reason: `${falseNegativeCandidates.filter(f => Math.abs(f.priceChange1d ?? 0) > 5).length} blocked events had >5% price moves. Judge may be too aggressive.`,
        data: { count: falseNegativeCandidates.filter(f => Math.abs(f.priceChange1d ?? 0) > 5).length },
      });
    }

    if (signalStrength === 'negative') {
      recommendations.push({
        priority: 'high',
        action: 'review_classification',
        reason: signalInterpretation,
        data: { deliveredAvg: deliveredSignal.avgAbsChange1d, filteredAvg: filteredSignal.avgAbsChange1d },
      });
    }

    const filterRate = dayTotal > 0 ? dayFiltered / dayTotal : 0;
    if (filterRate > 0.75) {
      recommendations.push({
        priority: 'medium',
        action: 'review_filter_rules',
        reason: `Filter rate is ${Math.round(filterRate * 100)}% — high proportion of events being discarded.`,
        data: { filterRate: Math.round(filterRate * 100), total: dayTotal, filtered: dayFiltered },
      });
    }

    if (backfillHealth === 'not_running') {
      recommendations.push({
        priority: 'high',
        action: 'fix_outcome_tracker',
        reason: 'Outcome tracker appears not running — no recent price backfill updates.',
        data: { lastUpdate: lastUpdate?.toISOString() ?? null },
      });
    }

    if (signalStrength === 'weak') {
      recommendations.push({
        priority: 'medium',
        action: 'review_classification',
        reason: signalInterpretation,
        data: { deliveredAvg: deliveredSignal.avgAbsChange1d, filteredAvg: filteredSignal.avgAbsChange1d },
      });
    }

    return reply.send({
      date: dateStr,
      generatedAt: new Date().toISOString(),
      summary: {
        eventsTotal: dayTotal,
        delivered: dayDelivered,
        filtered: dayFiltered,
        conversionRate: dayConversion,
        vsYesterday: computeTrend(dayTotal, prevTotal),
        vsYesterdayDelivered: computeTrend(dayDelivered, prevDelivered),
        vsPrevWeekAvg: computeTrend(dayTotal, weekAvgTotal > 0 ? Math.round(weekAvgTotal) : null),
        vsPrevWeekAvgDelivered: computeTrend(dayDelivered, weekAvgDelivered > 0 ? Math.round(weekAvgDelivered) : null),
      },
      scannerBreakdown,
      judgeAnalysis: {
        totalJudged: dayJudged,
        passRate: dayJudged > 0 ? Math.round((dayPassed / dayJudged) * 1000) / 10 : 0,
        avgConfidence: jd.avg_confidence != null ? Math.round(Number(jd.avg_confidence) * 1000) / 1000 : null,
        sampleSize: dayJudged,
        confidenceDistribution: {
          high: Number(jd.high_conf ?? 0),
          medium: Number(jd.med_conf ?? 0),
          low: Number(jd.low_conf ?? 0),
        },
        topBlockReasons: blockRows.rows.map(r => ({
          reason: r.reason_category as string,
          count: Number(r.count),
        })),
        falseNegativeCandidates,
      },
      signalValidation: {
        deliveredEvents: deliveredSignal,
        filteredEvents: filteredSignal,
        signalStrength,
        interpretation: signalInterpretation,
      },
      outcomeTracker: {
        eventsWithFullPriceData: Number(oh.full_data ?? 0),
        eventsPending1d: Number(oh.pending_1d ?? 0),
        eventsPending1w: Number(oh.pending_1w ?? 0),
        eventsPending1m: Number(oh.pending_1m ?? 0),
        lastUpdate: lastUpdate?.toISOString() ?? null,
        backfillHealth,
      },
      recommendations,
    });
  });

  // ========================================================================
  // Phase 3a: Event Trace
  // GET /api/v1/ai/trace/:eventId
  // ========================================================================

  server.get<{
    Params: { eventId: string };
  }>('/api/v1/ai/trace/:eventId', async (request, reply) => {
    const providedKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key'] : undefined;
    const authResult = validateApiKeyValue(providedKey, apiKey);
    if (!authResult.ok) {
      return reply.status(401).send({ error: 'Unauthorized', message: authResult.message });
    }
    if (!db) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { eventId } = request.params;

    // Find the event in pipeline_audit
    const auditRows = await db.execute(sql`
      SELECT pa.*, e.id as db_id, e.metadata as event_metadata, e.created_at as stored_at
      FROM pipeline_audit pa
      LEFT JOIN events e ON e.source_event_id = pa.event_id AND e.source = pa.source
      WHERE pa.event_id = ${eventId}
      ORDER BY pa.created_at DESC
      LIMIT 1
    `);

    if (auditRows.rows.length === 0) {
      return reply.status(404).send({ error: `Event ${eventId} not found in audit log` });
    }

    const audit = auditRows.rows[0];
    const dbId = audit.db_id as string | null;
    const metadata = typeof audit.event_metadata === 'object' ? audit.event_metadata as Record<string, unknown> : {};

    // Build timeline from available data
    const timeline: Array<{ stage: string; at: string; details: Record<string, unknown> }> = [];

    // Stored
    if (audit.stored_at) {
      timeline.push({
        stage: 'stored',
        at: String(audit.stored_at),
        details: { source: audit.source, title: audit.title },
      });
    }

    // Classification (from classification_predictions if available)
    if (dbId) {
      const predRows = await db.execute(sql`
        SELECT predicted_severity, predicted_direction, confidence, classified_by, classified_at
        FROM classification_predictions
        WHERE event_id = ${dbId}
        LIMIT 1
      `);
      if (predRows.rows.length > 0) {
        const pred = predRows.rows[0];
        timeline.push({
          stage: 'classified',
          at: String(pred.classified_at ?? audit.created_at),
          details: {
            severity: pred.predicted_severity,
            direction: pred.predicted_direction,
            confidence: Number(pred.confidence ?? 0),
            method: pred.classified_by,
          },
        });
      }
    }

    // Judge decision (from event metadata)
    const judgeData = metadata?.['llm_judge'] as Record<string, unknown> | undefined;
    if (judgeData) {
      timeline.push({
        stage: 'judge',
        at: String(audit.created_at),
        details: {
          decision: judgeData['decision'],
          confidence: judgeData['confidence'],
          reason: judgeData['reason'],
        },
      });
    }

    // Enrichment (from event metadata)
    const enrichData = metadata?.['llm_enrichment'] as Record<string, unknown> | undefined;
    if (enrichData) {
      timeline.push({
        stage: 'enriched',
        at: String(audit.created_at),
        details: {
          summary: enrichData['summary'],
          impact: enrichData['impact'],
          action: enrichData['action'],
        },
      });
    }

    // Historical match
    if (audit.historical_match) {
      const histData = metadata?.['historical_context'] as Record<string, unknown> | undefined;
      timeline.push({
        stage: 'historical_match',
        at: String(audit.created_at),
        details: {
          confidence: audit.historical_confidence,
          ...(histData ?? {}),
        },
      });
    }

    // Final outcome
    timeline.push({
      stage: audit.outcome as string,
      at: String(audit.created_at),
      details: {
        reason: audit.reason,
        reasonCategory: audit.reason_category,
        durationMs: audit.duration_ms,
      },
    });

    // Outcome data
    let outcome = null;
    if (dbId) {
      const outcomeRows = await db.execute(sql`
        SELECT event_price, price_1h, price_1d, price_1w, change_1h, change_1d, change_1w
        FROM event_outcomes
        WHERE event_id = ${dbId}
        LIMIT 1
      `);
      if (outcomeRows.rows.length > 0) {
        const o = outcomeRows.rows[0];
        outcome = {
          priceAtEvent: o.event_price != null ? Number(o.event_price) : null,
          price1h: o.price_1h != null ? Number(o.price_1h) : null,
          price1d: o.price_1d != null ? Number(o.price_1d) : null,
          price1w: o.price_1w != null ? Number(o.price_1w) : null,
          change1h: o.change_1h != null ? Number(o.change_1h) : null,
          change1d: o.change_1d != null ? Number(o.change_1d) : null,
          change1w: o.change_1w != null ? Number(o.change_1w) : null,
        };
      }
    }

    // Delivery channels
    let deliveryChannels = null;
    if (audit.delivery_channels) {
      try {
        const raw = typeof audit.delivery_channels === 'string'
          ? JSON.parse(audit.delivery_channels)
          : audit.delivery_channels;
        deliveryChannels = Array.isArray(raw) ? raw : null;
      } catch { /* ignore */ }
    }

    return reply.send({
      eventId,
      dbId,
      title: audit.title,
      source: audit.source,
      severity: audit.severity,
      ticker: audit.ticker,
      outcome: audit.outcome,
      confidence: audit.confidence != null ? Number(audit.confidence) : null,
      timestamp: String(audit.created_at),
      timeline,
      deliveryChannels,
      priceOutcome: outcome,
    });
  });

  // ========================================================================
  // Phase 3b: Scanner Deep Dive
  // GET /api/v1/ai/scanner/:name?days=7
  // ========================================================================

  server.get<{
    Params: { name: string };
    Querystring: { days?: string };
  }>('/api/v1/ai/scanner/:name', async (request, reply) => {
    const providedKey = typeof request.headers['x-api-key'] === 'string'
      ? request.headers['x-api-key'] : undefined;
    const authResult = validateApiKeyValue(providedKey, apiKey);
    if (!authResult.ok) {
      return reply.status(401).send({ error: 'Unauthorized', message: authResult.message });
    }
    if (!db) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const rawName = request.params.name;
    const canonicalName = normalizeObservabilityScannerName(rawName);
    const sourceNames = getSourceNamesForScanner(canonicalName);
    const sourceFilter = sql`source IN (${sql.join(sourceNames.map(s => sql`${s}`), sql`, `)})`;
    const days = Math.min(Math.max(Number(request.query.days) || 7, 1), 30);
    const periodStart = new Date(Date.now() - days * 86_400_000);
    const prevPeriodStart = new Date(periodStart.getTime() - days * 86_400_000);

    // Stats
    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE outcome = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE outcome = 'deduped') as deduped,
        COUNT(*) FILTER (WHERE outcome = 'filtered') as filtered,
        ROUND(AVG(CASE
          WHEN severity = 'CRITICAL' THEN 4 WHEN severity = 'HIGH' THEN 3
          WHEN severity = 'MEDIUM' THEN 2 WHEN severity = 'LOW' THEN 1 ELSE 0
        END), 2) as avg_severity_score
      FROM pipeline_audit
      WHERE ${sourceFilter} AND created_at >= ${periodStart}
    `);
    const stats = statsRows.rows[0] ?? {};
    const total = Number(stats.total ?? 0);
    const dlv = Number(stats.delivered ?? 0);
    const dup = Number(stats.deduped ?? 0);
    const flt = Number(stats.filtered ?? 0);

    // Previous period for comparison
    const prevStatsRows = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM pipeline_audit
      WHERE ${sourceFilter}
        AND created_at >= ${prevPeriodStart}
        AND created_at < ${periodStart}
    `);
    const prevTotal = Number(prevStatsRows.rows[0]?.total ?? 0);

    // Timeline (daily buckets)
    const timelineRows = await db.execute(sql`
      SELECT DATE(created_at) as day,
             COUNT(*) as events,
             COUNT(*) FILTER (WHERE outcome = 'delivered') as delivered
      FROM pipeline_audit
      WHERE ${sourceFilter} AND created_at >= ${periodStart}
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    // Top tickers
    const tickerRows = await db.execute(sql`
      SELECT ticker, COUNT(*) as count,
             COUNT(*) FILTER (WHERE outcome = 'delivered') as delivered_count
      FROM pipeline_audit
      WHERE ${sourceFilter} AND created_at >= ${periodStart}
        AND ticker IS NOT NULL
      GROUP BY ticker
      ORDER BY count DESC
      LIMIT 10
    `);

    return reply.send({
      scanner: canonicalName,
      period: { start: periodStart.toISOString(), end: new Date().toISOString(), days },
      stats: {
        totalEvents: total,
        deliveredEvents: dlv,
        deliveryRate: total > 0 ? Math.round((dlv / total) * 1000) / 10 : 0,
        dedupRate: total > 0 ? Math.round((dup / total) * 1000) / 10 : 0,
        filterRate: total > 0 ? Math.round((flt / total) * 1000) / 10 : 0,
        avgSeverityScore: Number(stats.avg_severity_score ?? 0),
      },
      timeline: timelineRows.rows.map(r => ({
        day: String(r.day),
        events: Number(r.events),
        delivered: Number(r.delivered),
      })),
      topTickers: tickerRows.rows.map(r => ({
        ticker: r.ticker as string,
        count: Number(r.count),
        deliveredCount: Number(r.delivered_count),
      })),
      comparison: computeTrend(total, prevTotal > 0 ? prevTotal : null),
    });
  });
}
