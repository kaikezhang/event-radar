import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, CalendarRange, ChevronDown, HelpCircle, Target } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../components/EmptyState.js';
import { TapTooltip } from '../components/TapTooltip.js';
import {
  formatScorecardBucketLabel,
  getScorecardSeverityBreakdown,
  getScorecardSummary,
} from '../lib/api.js';
import { cn } from '../lib/utils.js';
import type {
  ScorecardBucketSummary,
  ScorecardSeverityBreakdownItem,
  ScorecardSummary,
} from '../types/index.js';

const EXCLUDED_SOURCE_NAMES = new Set(['dummy', 'test', 'internal']);

const WINDOWS = [
  { value: 30, label: '30d', description: 'Recent setups only' },
  { value: 90, label: '90d', description: 'Recommended default' },
  { value: 'all', label: 'All', description: 'Full-history scorecard' },
] as const;

type ScorecardWindow = (typeof WINDOWS)[number]['value'];

const BUCKET_COLUMNS = [
  { key: 'totalAlerts', label: 'Alerts' },
  { key: 'directionalHitRate', label: 'Hit rate' },
  { key: 'setupWorkedRate', label: 'Worked rate' },
  { key: 'avgT20Move', label: 'Avg T+20' },
] as const;

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function hitRateColor(rate: number): string {
  if (rate > 60) return '#22c55e';
  if (rate >= 40) return '#eab308';
  return '#ef4444';
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'var(--severity-critical)',
  HIGH: 'var(--severity-high)',
  MEDIUM: 'var(--severity-medium)',
  LOW: 'var(--severity-low)',
};

function usePanelState(panelKey: string, defaultOpen: boolean): [boolean, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramValue = searchParams.get(panelKey);
  const isOpen = paramValue != null ? paramValue === '1' : defaultOpen;

  const toggle = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const newValue = !isOpen;
      if (newValue === defaultOpen) {
        next.delete(panelKey);
      } else {
        next.set(panelKey, newValue ? '1' : '0');
      }
      return next;
    }, { replace: true });
  }, [panelKey, defaultOpen, isOpen, setSearchParams]);

  return [isOpen, toggle];
}

export function Scorecard() {
  const [windowValue, setWindowValue] = useState<ScorecardWindow>(90);
  const isDark = useIsDarkMode();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scorecard-summary', windowValue],
    queryFn: () => getScorecardSummary(windowValue === 'all' ? undefined : windowValue),
    staleTime: 60_000,
  });
  const { data: severityBreakdown } = useQuery({
    queryKey: ['scorecard-severity-breakdown', windowValue],
    queryFn: () => getScorecardSeverityBreakdown(windowValue === 'all' ? undefined : windowValue),
    staleTime: 60_000,
  });

  const windowMeta = WINDOWS.find((option) => option.value === windowValue) ?? WINDOWS[1];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-testid="scorecard-skeleton-card"
            className="h-28 animate-pulse rounded-2xl border border-border-default bg-bg-surface/60"
          />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon="📉"
        title="Scorecard data is taking a beat"
        description="We could not load the calibration view right now. Jump back to the live feed and try again after the next refresh."
        ctaLabel="Return to live feed"
        ctaHref="/"
      />
    );
  }

  if (data.totals.totalAlerts === 0) {
    return (
      <EmptyState
        icon="🧭"
        title="No closed alerts yet"
        description="The scorecard unlocks once enough alerts have aged into verdict windows. Check the live feed while the first cohort matures."
        ctaLabel="Open live feed"
        ctaHref="/"
      />
    );
  }

  if (data.totals.alertsWithUsableVerdicts === 0) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border-default bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_var(--shadow-color)]">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-default/20 bg-accent-default/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
            <Target className="h-3.5 w-3.5" />
            Scorecard
          </p>
          <h1 className="mt-3 text-[24px] font-semibold leading-8 text-text-primary">
            Scorecard is building
          </h1>
        </section>
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-6">
          <div className="flex flex-col items-center text-center">
            <span className="text-5xl">📊</span>
            <h2 className="mt-4 text-[17px] font-semibold text-text-primary">
              Tracking outcomes for every alert
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">
              Event Radar is monitoring T+5 and T+20 price moves for each alert it sends.
              Once enough time has passed, accuracy data will appear here automatically.
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {data.totals.totalAlerts} alert{data.totals.totalAlerts !== 1 ? 's' : ''} being tracked — check back in a few days.
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-accent-default px-5 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Open live feed
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border-default bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_var(--shadow-color)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-accent-default/20 bg-accent-default/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
              <Target className="h-3.5 w-3.5" />
              Scorecard
            </p>
            <h1 className="mt-3 text-[24px] font-semibold leading-8 text-text-primary">
              Scorecard
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              Topline calibration
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-primary">
              {windowMeta.description}
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              Directional hit rate and setup worked rate reflect alerts with usable verdicts only.
            </p>
          </div>

          <div className="hidden rounded-2xl border border-overlay-medium bg-overlay-light p-3 text-text-secondary sm:block">
            <CalendarRange className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {WINDOWS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                startTransition(() => {
                  setWindowValue(option.value);
                });
              }}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
                windowValue === option.value
                  ? 'border-accent-default/30 bg-accent-default/14 text-accent-default'
                  : 'border-overlay-medium bg-overlay-light text-text-secondary hover:bg-overlay-medium'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-6 text-center shadow-[0_18px_40px_var(--shadow-color)]">
        <p className="font-mono text-5xl font-bold text-text-primary sm:text-6xl">
          {data.totals.totalAlerts.toLocaleString()}
        </p>
        <p className="mt-2 text-lg font-semibold text-text-primary">Events Detected</p>
        <p className="mt-1 text-sm text-text-secondary">
          from {data.sourceBuckets.filter((b) => !EXCLUDED_SOURCE_NAMES.has(b.bucket.toLowerCase())).length} sources, 24/7 monitoring
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {data.totals.alertsWithUsableVerdicts.toLocaleString()}
          </div>
          <div className="mt-1 text-sm text-text-secondary">Outcomes Tracked</div>
        </div>
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {data.sourceBuckets.filter((b) => !EXCLUDED_SOURCE_NAMES.has(b.bucket.toLowerCase())).length}
          </div>
          <div className="mt-1 text-sm text-text-secondary">Active Sources</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {formatRate(data.totals.directionalHitRate)}
          </div>
          <MetricLabel
            label="Directional hit rate"
            tooltip="How often the predicted direction (up/down) matched actual price movement"
          />
        </div>
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {formatRate(data.totals.setupWorkedRate)}
          </div>
          <MetricLabel
            label="Setup worked rate"
            tooltip="How often the event led to a tradeable move of 5%+"
          />
        </div>
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {formatMove(data.totals.avgT20Move)}
          </div>
          <MetricLabel
            label="Avg T+20 move"
            tooltip="Price change 20 trading days (~1 month) after the event"
          />
        </div>
        <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
          <div className="font-mono text-2xl font-semibold text-text-primary">
            {formatMove(data.totals.medianT20Move)}
          </div>
          <MetricLabel
            label="Median T+20 move"
            tooltip="Price change 20 trading days (~1 month) after the event"
          />
        </div>
      </section>

      <AdvancedAnalytics data={data} />

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <SourceAccuracyChart data={data} isDark={isDark} />
        <SeverityBreakdownChart data={severityBreakdown} isDark={isDark} />
      </div>

      <RollingAccuracyTrend />

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-default/10 text-accent-default">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">How to read this</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              This page is a calibration layer, not a victory lap. Buckets show where the product is reliably right, where setups merely move, and which sources or event classes need tighter thresholds.
            </p>
          </div>
        </div>
      </section>

      <BucketSection
        title="Signal buckets"
        description="Outcome quality grouped by the product signal labels users see first."
        group="action"
        buckets={data.actionBuckets}
        defaultOpen
      />
      <BucketSection
        title="Confidence buckets"
        description="Calibration by model confidence so users can see whether conviction tracks reality."
        group="confidence"
        buckets={data.confidenceBuckets}
        defaultOpen
      />
      <BucketSection
        title="Source buckets"
        description="Signal quality by source family to surface where alerts deserve more trust."
        group="source"
        buckets={data.sourceBuckets.filter((b) => !EXCLUDED_SOURCE_NAMES.has(b.bucket.toLowerCase()))}
        defaultOpen
      />
      <BucketSection
        title="Event type buckets"
        description="Behavior by product event type, useful for tuning templates and routing."
        group="eventType"
        buckets={data.eventTypeBuckets}
        defaultOpen
      />
    </div>
  );
}

/* ── Source Accuracy Horizontal Bar Chart ── */

function SourceAccuracyChart({ data, isDark }: { data: ScorecardSummary; isDark: boolean }) {
  const chartData = useMemo(
    () =>
      data.sourceBuckets
        .filter((b) => !EXCLUDED_SOURCE_NAMES.has(b.bucket.toLowerCase()))
        .filter((b) => b.directionalHitRate != null)
        .map((b) => ({
          name: formatScorecardBucketLabel('source', b.bucket),
          hitRate: Math.round((b.directionalHitRate ?? 0) * 100),
          count: b.totalAlerts,
        }))
        .sort((a, b) => b.hitRate - a.hitRate),
    [data.sourceBuckets],
  );

  const axisColor = isDark ? '#a1a1aa' : '#4b5563';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const renderCustomLabel = useCallback(
    (props: { x: number; y: number; width: number; height: number; value: number; index: number }) => {
      const item = chartData[props.index];
      return (
        <text
          x={props.x + props.width + 6}
          y={props.y + props.height / 2}
          fill={axisColor}
          fontSize={11}
          dominantBaseline="central"
        >
          {item?.count ?? ''}
        </text>
      );
    },
    [chartData, axisColor],
  );

  if (chartData.length === 0) return null;

  const barHeight = 36;
  const chartHeight = Math.max(200, chartData.length * barHeight + 40);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <h2 className="mb-4 text-[17px] font-semibold leading-6 text-text-primary">
        Source accuracy
      </h2>
      <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="name" width={70} tick={{ fill: axisColor, fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: isDark ? '#171923' : '#ffffff',
              border: `1px solid ${isDark ? '#252834' : '#dfe2e8'}`,
              borderRadius: 12,
              color: isDark ? '#fafaf9' : '#111827',
              fontSize: 13,
            }}
            formatter={(value: number) => [`${value}%`, 'Hit rate']}
          />
          <Bar dataKey="hitRate" radius={[0, 6, 6, 0]} label={renderCustomLabel}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={hitRateColor(entry.hitRate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

/* ── Severity Breakdown Donut Chart ── */

function SeverityBreakdownChart({
  data,
  isDark,
}: {
  data: ScorecardSeverityBreakdownItem[] | null | undefined;
  isDark: boolean;
}) {
  const severityData = useMemo(
    () => (data ?? [])
      .filter((entry) => entry.count > 0)
      .map((entry) => ({
        name: entry.severity,
        label: formatSeverityLabel(entry.severity),
        value: entry.count,
      })),
    [data],
  );

  const total = severityData.reduce((acc, d) => acc + d.value, 0);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <h2 className="mb-4 text-[17px] font-semibold leading-6 text-text-primary">
        Severity breakdown
      </h2>
      {severityData.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-overlay-medium bg-bg-elevated/50 px-4 py-8 text-center text-sm text-text-secondary">
          No severity data available yet
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <ResponsiveContainer width="100%" height={220} minWidth={0}>
            <PieChart>
              <Pie
                data={severityData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {severityData.map((entry) => (
                  <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#171923' : '#ffffff',
                  border: `1px solid ${isDark ? '#252834' : '#dfe2e8'}`,
                  borderRadius: 12,
                  color: isDark ? '#fafaf9' : '#111827',
                  fontSize: 13,
                }}
                formatter={(value: number) => [value, 'Alerts']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 sm:flex-col sm:gap-2">
            {severityData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLORS[entry.name] ?? '#94a3b8' }}
                />
                <span className="text-sm text-text-primary">{entry.label}</span>
                <span className="text-xs text-text-secondary">
                  {entry.value} ({total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Rolling Accuracy Placeholder ── */

function RollingAccuracyTrend() {
  return (
    <section className="rounded-2xl border border-dashed border-overlay-medium bg-bg-surface/96 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-overlay-medium bg-bg-elevated/70 text-text-secondary">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[17px] font-semibold leading-6 text-text-primary">
            Rolling accuracy trend
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Coming soon. We&apos;re collecting enough data to show meaningful trends. Check back
            in a few weeks.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Advanced Analytics (collapsible) ── */

function AdvancedAnalytics({ data }: { data: ScorecardSummary }) {
  const [isOpen, toggle] = usePanelState('analytics', false);

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-4 shadow-[0_18px_36px_var(--shadow-color)]">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="advanced-analytics-panel"
        onClick={toggle}
        className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <div className="flex-1">
          <span className="block text-[17px] font-semibold leading-6 text-text-primary">
            🔬 Advanced Analytics
          </span>
          <span className="mt-1 block text-sm leading-6 text-text-secondary">
            Directional accuracy, setup worked rate, and average moves
          </span>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-overlay-medium bg-bg-elevated/70 text-text-secondary">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen && (
        <div id="advanced-analytics-panel" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4">
              <div className="font-mono text-2xl font-semibold text-text-primary">
                {formatRate(data.totals.directionalHitRate)}
              </div>
              <div className="mt-1 text-sm text-text-secondary">Directional hit rate</div>
            </div>
            <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4">
              <div className="font-mono text-2xl font-semibold text-text-primary">
                {formatRate(data.totals.setupWorkedRate)}
              </div>
              <div className="mt-1 text-sm text-text-secondary">Setup worked rate</div>
            </div>
            <div className="rounded-2xl border border-border-default bg-bg-surface/92 p-4">
              <div className="font-mono text-2xl font-semibold text-text-primary">
                {formatMove(data.totals.avgT20Move)}
              </div>
              <div className="mt-1 text-sm text-text-secondary">Avg T+20 move</div>
            </div>
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            Directional analysis is supplementary context for your own research. Event Radar's core value is comprehensive event detection and speed, not directional trading signals.
          </p>
        </div>
      )}
    </section>
  );
}

/* ── Helpers ── */

function MetricLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
      <span>{label}</span>
      <TapTooltip
        ariaLabel={`${label} explanation`}
        className="inline-flex h-4 w-4 items-center justify-center text-text-tertiary"
        panelClassName="w-64"
        tooltip={tooltip}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </TapTooltip>
    </div>
  );
}

function formatSeverityLabel(severity: string): string {
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

function BucketSection({
  title,
  description,
  group,
  buckets,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  group: 'action' | 'confidence' | 'source' | 'eventType';
  buckets: ScorecardBucketSummary[];
  defaultOpen?: boolean;
}) {
  const [isOpen, toggle] = usePanelState(group, defaultOpen);

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={toggle}
        className="flex w-full items-start gap-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-default"
      >
        <div className="flex-1">
          <h2 className="text-[17px] font-semibold leading-6 text-text-primary">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {description}
          </p>
        </div>
        <span className="rounded-full border border-overlay-medium bg-bg-primary/60 px-3 py-1 text-xs font-medium text-text-secondary">
          {buckets.length} tiers
        </span>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-overlay-medium bg-bg-elevated/70 text-text-secondary">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : '')}
            aria-hidden="true"
          />
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3">
          {buckets.map((bucket) => (
            <article
              key={`${group}-${bucket.bucket}`}
              className="rounded-2xl border border-overlay-medium bg-bg-elevated/52 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-primary">
                    {formatScorecardBucketLabel(group, bucket.bucket)}
                  </h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    {bucket.alertsWithUsableVerdicts} usable verdicts
                  </p>
                </div>
                <span className="rounded-full border border-overlay-medium bg-bg-primary/60 px-3 py-1 text-xs font-medium text-text-secondary">
                  {bucket.totalAlerts} alerts
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {BUCKET_COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className="rounded-2xl border border-overlay-medium bg-white/[0.03] px-3 py-3"
                  >
                    <dt className="text-xs uppercase tracking-[0.16em] text-text-secondary">
                      {column.label}
                    </dt>
                    <dd className="mt-2 text-sm font-semibold text-text-primary">
                      {formatBucketValue(bucket, column.key)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBucketValue(
  bucket: ScorecardBucketSummary,
  key: (typeof BUCKET_COLUMNS)[number]['key'],
): string {
  if (key === 'totalAlerts') {
    return String(bucket.totalAlerts);
  }
  if (key === 'directionalHitRate') {
    return formatRate(bucket.directionalHitRate);
  }
  if (key === 'setupWorkedRate') {
    return formatRate(bucket.setupWorkedRate);
  }

  return formatMove(bucket.avgT20Move);
}

function formatRate(value: number | null): string {
  if (value == null) {
    return 'N/A';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatMove(value: number | null): string {
  if (value == null) {
    return 'N/A';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}
