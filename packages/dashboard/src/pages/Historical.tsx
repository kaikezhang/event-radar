import {
  BarChart3,
  Globe,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useDashboard, useAudit } from '../hooks/queries.js';
import { Card } from '../components/Card.js';
import { LoadingSpinner, ErrorDisplay } from '../components/LoadingSpinner.js';
import { formatNumber } from '../lib/utils.js';
import { cn, timeAgo } from '../lib/utils.js';
import type { MarketContext } from '../types/api.js';

export function Historical() {
  const { data: dashboard, isLoading, error } = useDashboard();
  const { data: auditData } = useAudit({ limit: 20, outcome: 'delivered' });

  if (isLoading && !dashboard) return <LoadingSpinner />;
  if (error && !dashboard) return <ErrorDisplay message={error.message} />;
  if (!dashboard) return null;

  const { historical } = dashboard;
  const enrichedEvents = auditData?.events.filter((e) => e.historical_match) ?? [];

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={BarChart3}
          label="Total Historical Events"
          value={formatNumber(historical.db_events)}
        />
        <StatCard
          icon={Zap}
          label="Enrichment Hit Rate"
          value={historical.enrichment.hit_rate}
          accent
        />
        <StatCard
          icon={Globe}
          label="Enrichment Stats"
          value={`${formatNumber(historical.enrichment.hits)} hits / ${formatNumber(historical.enrichment.misses)} misses`}
          sub={`${formatNumber(historical.enrichment.timeouts)} timeouts`}
        />
      </div>

      {/* Market Context */}
      {historical.market_context && (
        <Card title="Market Context">
          <MarketContextPanel ctx={historical.market_context} />
        </Card>
      )}

      {/* Recent Enriched Alerts */}
      <Card title="Recent Enriched Alerts">
        {enrichedEvents.length === 0 ? (
          <div className="py-8 text-center text-sm text-radar-text-muted">
            No enriched alerts yet
          </div>
        ) : (
          <div className="space-y-2">
            {enrichedEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-radar-border bg-radar-bg p-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{event.title}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-radar-text-muted">
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
                        {event.source}
                      </span>
                      {event.ticker && (
                        <span className="font-mono font-medium text-radar-amber">
                          {event.ticker}
                        </span>
                      )}
                      <span>{timeAgo(event.at)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-radar-green">
                      {event.historical_confidence
                        ? `${(parseFloat(event.historical_confidence) * 100).toFixed(0)}%`
                        : '—'}
                    </div>
                    <div className="text-xs text-radar-text-muted">confidence</div>
                  </div>
                </div>
                {event.reason && (
                  <div className="mt-2 rounded bg-white/[0.03] px-2 py-1.5 text-xs text-radar-text-muted">
                    {event.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-radar-border bg-radar-surface p-4">
      <div className="flex items-center gap-2 text-xs text-radar-text-muted">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={cn('mt-2 font-mono text-2xl font-bold', accent && 'text-radar-green')}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-radar-text-muted">{sub}</div>}
    </div>
  );
}

function MarketContextPanel({ ctx }: { ctx: MarketContext }) {
  const regimeColors: Record<MarketContext['regime'], string> = {
    bull: 'text-radar-green',
    bear: 'text-radar-red',
    correction: 'text-radar-amber',
    neutral: 'text-radar-text-muted',
  };

  const RegimeIcon = ctx.regime === 'bull' ? TrendingUp : TrendingDown;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-md border border-radar-border bg-radar-bg p-3">
        <div className="text-xs text-radar-text-muted">VIX</div>
        <div className="mt-1 font-mono text-xl font-bold">{ctx.vix.toFixed(1)}</div>
      </div>
      <div className="rounded-md border border-radar-border bg-radar-bg p-3">
        <div className="text-xs text-radar-text-muted">SPY</div>
        <div className="mt-1 font-mono text-xl font-bold">${ctx.spy.toFixed(2)}</div>
      </div>
      <div className="rounded-md border border-radar-border bg-radar-bg p-3">
        <div className="text-xs text-radar-text-muted">Regime</div>
        <div className={cn('mt-1 flex items-center gap-1.5 font-mono text-xl font-bold', regimeColors[ctx.regime])}>
          <RegimeIcon className="h-5 w-5" />
          {ctx.regime}
        </div>
      </div>
      <div className="rounded-md border border-radar-border bg-radar-bg p-3">
        <div className="text-xs text-radar-text-muted">Updated</div>
        <div className="mt-1 font-mono text-xl font-bold">{ctx.updated}</div>
      </div>
    </div>
  );
}
