// GET /api/v1/dashboard
export interface DashboardResponse {
  system: {
    status: 'healthy' | 'degraded';
    version: string;
    uptime_seconds: number;
    started_at: string;
    grace_period_active: boolean;
    grace_period_suppressed: number;
    db: 'connected' | 'not_configured';
    memory_mb: number;
  };
  scanners: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    details: ScannerDetail[];
  };
  pipeline: {
    funnel: PipelineFunnel;
    filter_breakdown: Record<string, number>;
    conversion: string;
  };
  historical: {
    db_events: number;
    enrichment: {
      hits: number;
      misses: number;
      timeouts: number;
      hit_rate: string;
    };
    market_context: MarketContext | null;
  };
  delivery: Record<string, { sent: number; errors: number }>;
  db: {
    total_events: number;
    last_event: string;
  };
  alerts: Alert[];
}

export interface ScannerDetail {
  name: string;
  status: string;
  last_scan: string;
  error_count: number;
  consecutive_errors?: number;
  in_backoff?: boolean;
  poll_interval_ms?: number;
  message?: string;
}

export interface ScannerEventsResponse {
  scanner: string;
  count: number;
  events: ScannerEvent[];
}

export interface ScannerEvent {
  id: string;
  title: string;
  summary: string;
  severity: string;
  tickers: string[];
  received_at: string;
}

export interface PipelineFunnel {
  ingested: number;
  deduplicated: number;
  unique: number;
  filtered_out: number;
  filter_passed: number;
  delivered: number;
}

export interface MarketContext {
  vix: number;
  spy: number;
  regime: 'bull' | 'bear' | 'correction' | 'recovery';
  updated: string;
}

export interface Alert {
  level: 'error' | 'warn' | 'info';
  message: string;
}

// GET /api/v1/audit
export interface AuditResponse {
  count: number;
  events: AuditEvent[];
}

export interface AuditEvent {
  id: number;
  event_id: string;
  source: string;
  title: string;
  severity: AuditSeverity | null;
  ticker: string | null;
  outcome: string;
  stopped_at: string;
  reason: string | null;
  reason_category: string | null;
  delivery_channels: AuditDeliveryChannel[] | null;
  historical_match: boolean | null;
  historical_confidence: string | null;
  duration_ms: number | null;
  at: string;
}

export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;

export interface AuditDeliveryChannel {
  channel: string;
  ok: boolean;
}

export interface DeliveryFeedResponse {
  total: number;
  cursor: string | null;
  events: DeliveryFeedEvent[];
}

export interface DeliveryFeedEvent {
  id: string;
  title: string;
  source: string;
  severity: string;
  tickers: string[];
  analysis: string;
  impact: string;
  action: string | null;
  regime_context: string | null;
  delivery_channels: AuditDeliveryChannel[];
  delivered_at: string;
}

// GET /api/v1/audit/stats
export interface AuditStatsResponse {
  window: string;
  breakdown: AuditStatsBreakdown[];
}

export interface AuditStatsBreakdown {
  outcome: string;
  stopped_at: string;
  reason_category: string | null;
  count: number;
}

// GET /api/scanners/status
export interface ScannersStatusResponse {
  scanners: ScannerStatusItem[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    alert: boolean;
  };
}

export interface ScannerStatusItem {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessAt: string | null;
  errorCount: number;
  message?: string;
  alert: boolean;
}

// GET /health
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  scanners: ScannerHealth[];
  db: { status: 'connected' | 'disconnected' | 'unknown' };
  lastEventTime: string | null;
  uptime: number;
}

export interface ScannerHealth {
  scanner: string;
  status: 'healthy' | 'degraded' | 'down';
  lastScanAt: string | null;
  errorCount: number;
  message?: string;
  consecutiveErrors?: number;
  currentIntervalMs?: number;
  inBackoff?: boolean;
}

// Query params for audit
export interface AuditQueryParams {
  limit?: number;
  outcome?: string;
  source?: string;
  ticker?: string;
  search?: string;
}
