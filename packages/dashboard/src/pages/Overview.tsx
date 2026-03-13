import { useState, useTransition } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  Gauge,
  PauseCircle,
  PlayCircle,
  TrendingUp,
} from 'lucide-react';
import { readDashboardApiKey, toggleDeliveryControl } from '../api/client.js';
import { useDashboard, useHealth } from '../hooks/queries.js';
import { Card } from '../components/Card.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ScannerCard } from '../components/ScannerCard.js';
import { FunnelChart } from '../components/FunnelChart.js';
import { FilterBreakdownChart } from '../components/FilterBreakdownChart.js';
import { JudgeCard } from '../components/JudgeCard.js';
import { LoadingSpinner, ErrorDisplay } from '../components/LoadingSpinner.js';
import { buildScannerAlerts, buildScannerCards } from '../lib/dashboard.js';
import { formatNumber, timeAgo } from '../lib/utils.js';
import type {
  DashboardRegime,
  DeliveryChannelStats,
  DeliveryControlState,
} from '../types/api.js';

const REGIME_STYLES: Record<DashboardRegime['market_regime'], string> = {
  bull: 'border-radar-green/30 bg-radar-green/10 text-radar-green',
  bear: 'border-radar-red/30 bg-radar-red/10 text-radar-red',
  correction: 'border-radar-amber/30 bg-radar-amber/10 text-radar-amber',
  neutral: 'border-white/10 bg-white/5 text-radar-text-muted',
};

const REGIME_LABELS: Record<DashboardRegime['market_regime'], string> = {
  bull: 'BULL',
  bear: 'BEAR',
  correction: 'CORRECTION',
  neutral: 'NEUTRAL',
};

export function Overview() {
  const {
    data,
    isLoading,
    error,
    refetch: refetchDashboard,
  } = useDashboard();
  const { data: healthData, refetch: refetchHealth } = useHealth();
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isTogglingDelivery, setIsTogglingDelivery] = useState(false);
  const [isRefreshing, startTransition] = useTransition();

  if (isLoading && !data) return <LoadingSpinner />;
  if (error && !data) return <ErrorDisplay message={error.message} />;
  if (!data) return null;

  const { system, scanners, pipeline, delivery, alerts, db, regime, delivery_control: deliveryControl } = data;
  const scannerCards = buildScannerCards(scanners.details, healthData?.scanners);
  const healthyScannerCount = scannerCards.filter((scanner) => scanner.status === 'healthy').length;
  const activeAlerts = healthData
    ? buildScannerAlerts(scannerCards, {
        gracePeriodActive: system.grace_period_active,
        gracePeriodRemainingSeconds: 90 - system.uptime_seconds,
      })
    : alerts;
  const systemStatus = activeAlerts.some((alert) => alert.level === 'error') ? 'degraded' : 'healthy';
  const hasDashboardApiKey = readDashboardApiKey() !== null;

  async function handleDeliveryToggle() {
    if (!deliveryControl || isTogglingDelivery) {
      return;
    }

    setIsTogglingDelivery(true);
    try {
      await toggleDeliveryControl(deliveryControl.enabled);
      setDeliveryError(null);
      startTransition(() => {
        void refetchDashboard();
        void refetchHealth?.();
      });
    } catch (toggleError) {
      setDeliveryError(
        toggleError instanceof Error ? toggleError.message : 'Failed to update delivery control',
      );
    } finally {
      setIsTogglingDelivery(false);
    }
  }

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title={`Scanners (${healthyScannerCount}/${scanners.total} healthy)`}>
          <div className="grid grid-cols-2 gap-2">
            {scannerCards.map((scanner) => (
              <ScannerCard key={scanner.name} scanner={scanner} />
            ))}
          </div>
        </Card>

        <Card title="Pipeline Funnel">
          <FunnelChart funnel={pipeline.funnel} conversion={pipeline.conversion} />
        </Card>

        <Card title="Filter Breakdown">
          <FilterBreakdownChart breakdown={pipeline.filter_breakdown} />
        </Card>
      </div>

      <JudgeCard />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MarketRegimeCard
          regime={regime}
          expanded={showAllFactors}
          onToggleExpand={() => setShowAllFactors((expanded) => !expanded)}
        />
        <DeliveryControlCard
          control={deliveryControl ?? null}
          delivery={delivery}
          canToggle={hasDashboardApiKey}
          errorMessage={deliveryError}
          isRefreshing={isRefreshing}
          isToggling={isTogglingDelivery}
          onToggle={handleDeliveryToggle}
        />
      </div>

      <Card title="Database & Historical">
        <div className="grid grid-cols-2 gap-4">
          <MiniStat label="Total Events" value={formatNumber(data.historical.db_events)} />
          <MiniStat label="Enrichment Hit Rate" value={data.historical.enrichment.hit_rate} accent />
          <MiniStat label="Enrichment Hits" value={formatNumber(data.historical.enrichment.hits)} />
          <MiniStat label="Timeouts" value={formatNumber(data.historical.enrichment.timeouts)} />
        </div>
      </Card>
    </div>
  );
}

function MarketRegimeCard({
  regime,
  expanded,
  onToggleExpand,
}: {
  regime: DashboardRegime | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (!regime) {
    return (
      <Card title="Market Regime">
        <div className="py-6 text-sm text-radar-text-muted">No regime snapshot available yet</div>
      </Card>
    );
  }

  const gaugeOffset = ((regime.score + 100) / 200) * 100;

  return (
    <Card title="Market Regime">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-medium ${REGIME_STYLES[regime.market_regime]}`}
            >
              {REGIME_LABELS[regime.market_regime]}
            </span>
            <div className="flex items-end gap-2">
              <span className="font-mono text-4xl font-semibold">{regime.score}</span>
              <span className="pb-1 text-xs uppercase tracking-[0.3em] text-radar-text-muted">
                score
              </span>
            </div>
            <div className="text-xs text-radar-text-muted">
              Updated {timeAgo(regime.updatedAt)}
            </div>
          </div>

          <div className="min-w-[220px] flex-1 rounded-lg border border-radar-border bg-radar-bg/60 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-radar-text-muted">
              <Gauge className="h-3.5 w-3.5" />
              Regime Gauge
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div
                className="relative h-2 rounded-full bg-gradient-to-r from-radar-red via-radar-amber to-radar-green"
                style={{ width: '100%' }}
              >
                <span
                  className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-radar-bg bg-white"
                  style={{ left: `calc(${gaugeOffset}% - 8px)` }}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-radar-text-muted">
              <span>-100</span>
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FactorChip label={`VIX ${regime.factors.vix.value.toFixed(1)}`} />
          <FactorChip label={`SPY RSI ${regime.factors.spyRsi.value.toFixed(1)}`} />
          <FactorChip label={`MA Cross ${regime.factors.maSignal.signal}`} />
          <FactorChip label={`Yield Curve ${regime.factors.yieldCurve.spread.toFixed(1)}%`} />
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-md border border-radar-border px-3 py-2 text-sm text-radar-text transition-colors hover:border-radar-blue/40 hover:text-radar-blue"
        >
          {expanded ? 'Hide factors' : 'Show all factors'}
        </button>

        {expanded && (
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-radar-border bg-radar-bg/60 p-4 text-sm md:grid-cols-2">
            <DetailRow label="SPY" value={formatFixed(regime.spy)} />
            <DetailRow label="VIX Z-Score" value={formatFixed(regime.factors.vix.zscore)} />
            <DetailRow label="Pct From High" value={`${formatFixed(regime.factors.spy52wPosition.pctFromHigh)}%`} />
            <DetailRow label="Pct From Low" value={`${formatFixed(regime.factors.spy52wPosition.pctFromLow)}%`} />
            <DetailRow label="SMA20" value={formatFixed(regime.factors.maSignal.sma20)} />
            <DetailRow label="SMA50" value={formatFixed(regime.factors.maSignal.sma50)} />
            <DetailRow label="Bullish Amp" value={`${formatFixed(regime.amplification.bullish)}x`} />
            <DetailRow label="Bearish Amp" value={`${formatFixed(regime.amplification.bearish)}x`} />
          </div>
        )}
      </div>
    </Card>
  );
}

function DeliveryControlCard({
  control,
  delivery,
  canToggle,
  errorMessage,
  isRefreshing,
  isToggling,
  onToggle,
}: {
  control: DeliveryControlState | null;
  delivery: Record<string, DeliveryChannelStats>;
  canToggle: boolean;
  errorMessage: string | null;
  isRefreshing: boolean;
  isToggling: boolean;
  onToggle: () => Promise<void>;
}) {
  const buttonLabel = control?.enabled ? 'Resume delivery' : 'Pause delivery';
  const ButtonIcon = control?.enabled ? PlayCircle : PauseCircle;

  return (
    <Card title="Delivery Control">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-radar-border bg-radar-bg/60 p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  control?.enabled ? 'bg-radar-red' : 'bg-radar-green'
                }`}
              />
              <span className="text-sm font-medium">
                {control?.enabled ? 'Kill switch active' : 'Delivery active'}
              </span>
            </div>
            {control ? (
              <>
                <div className="text-xs text-radar-text-muted">
                  Last operator {control.operator ?? 'unknown'}
                </div>
                <div className="text-xs text-radar-text-muted">
                  Last operation {control.last_operation_at ? timeAgo(control.last_operation_at) : 'never'}
                </div>
              </>
            ) : (
              <div className="text-xs text-radar-text-muted">
                Add a valid API key to view kill switch state
              </div>
            )}
            {!canToggle && (
              <div className="text-xs text-radar-amber">
                Configure `VITE_API_KEY` or `localStorage[event-radar.api-key]` to enable toggle actions
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!control || !canToggle || isToggling || isRefreshing}
            onClick={() => void onToggle()}
            className="inline-flex items-center gap-2 rounded-md border border-radar-border px-3 py-2 text-sm font-medium text-radar-text transition-colors hover:border-radar-blue/40 hover:text-radar-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ButtonIcon className="h-4 w-4" />
            {isToggling ? 'Updating delivery' : buttonLabel}
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-md border border-radar-red/30 bg-radar-red/5 px-3 py-2 text-sm text-radar-red">
            {errorMessage}
          </div>
        )}

        <div className="space-y-2">
          {Object.keys(delivery).length === 0 ? (
            <div className="rounded-md border border-radar-border px-3 py-4 text-sm text-radar-text-muted">
              No delivery activity recorded yet
            </div>
          ) : (
            Object.entries(delivery).map(([channel, stats]) => (
              <div
                key={channel}
                className="grid grid-cols-1 gap-2 rounded-md border border-radar-border px-3 py-3 text-sm md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="font-medium capitalize">{channel}</div>
                  <div className="mt-1 text-xs text-radar-text-muted">
                    Last success {stats.last_success_at ? timeAgo(stats.last_success_at) : 'never'}
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs">
                  <span className="text-radar-green">{formatNumber(stats.sent)} sent</span>
                  <span className={stats.errors > 0 ? 'text-radar-red' : 'text-radar-text-muted'}>
                    {formatNumber(stats.errors)} errors
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function FactorChip({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-radar-border bg-radar-bg/60 px-3 py-2 text-sm font-mono text-radar-text">
      {label}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-radar-surface/60 px-3 py-2">
      <span className="text-radar-text-muted">{label}</span>
      <span className="font-mono text-radar-text">{value}</span>
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

function formatFixed(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '0.0';
}
