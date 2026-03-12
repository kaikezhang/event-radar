import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  Send,
  TrendingUp,
} from 'lucide-react';
import { useDashboard, useHealth } from '../hooks/queries.js';
import { Card } from '../components/Card.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ScannerCard } from '../components/ScannerCard.js';
import { FunnelChart } from '../components/FunnelChart.js';
import { FilterBreakdownChart } from '../components/FilterBreakdownChart.js';
import { LoadingSpinner, ErrorDisplay } from '../components/LoadingSpinner.js';
import { buildScannerAlerts, buildScannerCards } from '../lib/dashboard.js';
import { formatNumber } from '../lib/utils.js';

export function Overview() {
  const { data, isLoading, error } = useDashboard();
  const { data: healthData } = useHealth();

  if (isLoading && !data) return <LoadingSpinner />;
  if (error && !data) return <ErrorDisplay message={error.message} />;
  if (!data) return null;

  const { system, scanners, pipeline, delivery, alerts, db } = data;
  const scannerCards = buildScannerCards(scanners.details, healthData?.scanners);
  const healthyScannerCount = scannerCards.filter((scanner) => scanner.status === 'healthy').length;
  const activeAlerts = healthData
    ? buildScannerAlerts(scannerCards, {
        gracePeriodActive: system.grace_period_active,
        gracePeriodRemainingSeconds: 90 - system.uptime_seconds,
      })
    : alerts;
  const systemStatus = activeAlerts.some((alert) => alert.level === 'error') ? 'degraded' : 'healthy';

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-radar-border bg-radar-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-radar-green" />
          <span className="text-sm font-medium">System</span>
          <StatusBadge status={systemStatus} />
        </div>
        <Separator />
        <Stat icon={Clock} label="Uptime" value={formatUptime(system.uptime_seconds)} />
        <Separator />
        <Stat icon={Cpu} label="Memory" value={`${system.memory_mb} MB`} />
        <Separator />
        <Stat icon={Database} label="DB" value={system.db} />
        <Separator />
        <Stat icon={TrendingUp} label="Last Event" value={db.last_event} />
        {system.grace_period_active && (
          <>
            <Separator />
            <span className="rounded-md bg-radar-amber/10 px-2 py-0.5 text-xs font-medium text-radar-amber">
              Grace Period Active
            </span>
          </>
        )}
        <div className="ml-auto font-mono text-xs text-radar-text-muted">v{system.version}</div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <Card title="Active Alerts">
          <div className="space-y-2">
            {activeAlerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  alert.level === 'error'
                    ? 'border-radar-red/30 bg-radar-red/5 text-radar-red'
                    : alert.level === 'warn'
                      ? 'border-radar-amber/30 bg-radar-amber/5 text-radar-amber'
                      : 'border-radar-blue/30 bg-radar-blue/5 text-radar-blue'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {alert.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Scanner Grid */}
        <Card title={`Scanners (${healthyScannerCount}/${scanners.total} healthy)`}>
          <div className="grid grid-cols-2 gap-2">
            {scannerCards.map((s) => (
              <ScannerCard key={s.name} scanner={s} />
            ))}
          </div>
        </Card>

        {/* Pipeline Funnel */}
        <Card title="Pipeline Funnel">
          <FunnelChart funnel={pipeline.funnel} conversion={pipeline.conversion} />
        </Card>

        {/* Filter Breakdown */}
        <Card title="Filter Breakdown">
          <FilterBreakdownChart breakdown={pipeline.filter_breakdown} />
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Delivery Status */}
        <Card title="Delivery Channels">
          {Object.keys(delivery).length === 0 ? (
            <div className="py-4 text-center text-sm text-radar-text-muted">
              <div>No delivery activity recorded yet</div>
              <div className="mt-1 text-xs">
                Configured channels appear here after the first send
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(delivery).map(([channel, stats]) => (
                <div
                  key={channel}
                  className="flex items-center justify-between rounded-md border border-radar-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Send className="h-3.5 w-3.5 text-radar-text-muted" />
                    <span className="text-sm font-medium capitalize">{channel}</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="text-radar-green">{formatNumber(stats.sent)} sent</span>
                    {stats.errors > 0 && (
                      <span className="text-radar-red">{stats.errors} errors</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick Stats */}
        <Card title="Database & Historical">
          <div className="grid grid-cols-2 gap-4">
            <MiniStat label="Total Events" value={formatNumber(data.historical.db_events)} />
            <MiniStat label="Enrichment Hit Rate" value={data.historical.enrichment.hit_rate} accent />
            <MiniStat label="Enrichment Hits" value={formatNumber(data.historical.enrichment.hits)} />
            <MiniStat label="Timeouts" value={formatNumber(data.historical.enrichment.timeouts)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Separator() {
  return <div className="h-4 w-px bg-radar-border" />;
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-radar-text-muted" />
      <span className="text-radar-text-muted">{label}:</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-radar-border bg-radar-bg p-3">
      <div className="text-xs text-radar-text-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${accent ? 'text-radar-green' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
