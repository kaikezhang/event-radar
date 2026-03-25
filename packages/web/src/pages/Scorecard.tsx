import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Gauge, MoveUpRight, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.js';
import { formatScorecardBucketLabel, getScorecardSummary } from '../lib/api.js';
import type { ScorecardBucketSummary, ScorecardSummary } from '../types/index.js';

const EXCLUDED_SOURCE_NAMES = new Set(['dummy', 'test', 'internal']);

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

function formatMovePair(t5: number | null, t20: number | null): string {
  return `${formatMove(t5)} / ${formatMove(t20)}`;
}

function getTopSource(sourceBuckets: ScorecardBucketSummary[]): ScorecardBucketSummary | null {
  const filtered = sourceBuckets
    .filter((bucket) => !EXCLUDED_SOURCE_NAMES.has(bucket.bucket.toLowerCase()))
    .filter((bucket) => bucket.alertsWithUsableVerdicts > 0 && bucket.setupWorkedRate != null);

  if (filtered.length === 0) {
    return null;
  }

  return filtered.sort((left, right) => {
    const rateDiff = (right.setupWorkedRate ?? 0) - (left.setupWorkedRate ?? 0);
    if (rateDiff !== 0) {
      return rateDiff;
    }

    return right.alertsWithUsableVerdicts - left.alertsWithUsableVerdicts;
  })[0] ?? null;
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-border-default bg-bg-surface/96 p-5 shadow-[0_18px_40px_var(--shadow-color)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">{label}</p>
          <p className="mt-3 font-mono text-3xl font-bold text-text-primary sm:text-4xl">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-default/12 text-accent-default">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{detail}</p>
    </article>
  );
}

function ScorecardSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          data-testid="scorecard-skeleton-card"
          className="h-48 animate-pulse rounded-3xl border border-border-default bg-bg-surface/60"
        />
      ))}
    </div>
  );
}

function ScorecardIntro({ data }: { data: ScorecardSummary }) {
  return (
    <section className="rounded-3xl border border-border-default bg-[linear-gradient(145deg,rgba(249,115,22,0.12),rgba(17,18,23,0.98))] p-6 shadow-[0_18px_40px_var(--shadow-color)]">
      <p className="inline-flex items-center gap-2 rounded-full border border-accent-default/20 bg-accent-default/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent-default">
        <Target className="h-3.5 w-3.5" />
        Scorecard
      </p>
      <h1 className="mt-3 text-[24px] font-semibold leading-8 text-text-primary">Scorecard</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
        Five numbers that show whether the alert stream is producing workable setups, not a faux terminal dashboard.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-text-primary">
        Coverage currently tracks {data.overview.eventsWithPriceOutcomes.toLocaleString()} events with price outcomes across {data.overview.eventsWithTickers.toLocaleString()} ticker-linked alerts.
      </p>
    </section>
  );
}

export function Scorecard() {
  const summaryQuery = useQuery({
    queryKey: ['scorecard-summary', 90],
    queryFn: () => getScorecardSummary(90),
    staleTime: 60_000,
  });
  const weekQuery = useQuery({
    queryKey: ['scorecard-summary', 7],
    queryFn: () => getScorecardSummary(7),
    staleTime: 60_000,
  });

  const data = summaryQuery.data;
  const topSource = useMemo(
    () => (data ? getTopSource(data.sourceBuckets) : null),
    [data],
  );

  if (summaryQuery.isLoading || weekQuery.isLoading) {
    return <ScorecardSkeleton />;
  }

  if (summaryQuery.isError || !data) {
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
        <ScorecardIntro data={data} />
        <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-6">
          <div className="flex flex-col items-center text-center">
            <span className="text-5xl">📊</span>
            <h2 className="mt-4 text-[17px] font-semibold text-text-primary">Scorecard is building</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-text-secondary">
              Event Radar is monitoring T+5 and T+20 price moves for each alert it sends. Once enough time has passed, the simplified scorecard will fill in automatically.
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

  const eventsThisWeek = weekQuery.data?.overview.totalEvents ?? 0;
  const topSourceLabel = topSource ? formatScorecardBucketLabel('source', topSource.bucket) : 'N/A';
  const topSourceDetail = topSource
    ? `${formatRate(topSource.setupWorkedRate)} worked rate across ${topSource.alertsWithUsableVerdicts.toLocaleString()} verdict-ready alerts.`
    : 'Not enough source-level verdicts yet.';

  return (
    <div className="space-y-4">
      <ScorecardIntro data={data} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total Events Tracked"
          value={data.overview.totalEvents.toLocaleString()}
          detail="Everything Event Radar has monitored so far."
          icon={<Target className="h-5 w-5" />}
        />
        <MetricCard
          label="Setup-Worked Rate"
          value={formatRate(data.totals.setupWorkedRate)}
          detail={`${data.totals.setupWorkedCount.toLocaleString()} of ${data.totals.alertsWithUsableVerdicts.toLocaleString()} verdict-ready alerts produced a tradeable move.`}
          icon={<Gauge className="h-5 w-5" />}
        />
        <MetricCard
          label="Average T+5 / T+20"
          value={formatMovePair(data.totals.avgT5Move, data.totals.avgT20Move)}
          detail="Average short-term and one-month move after each alert."
          icon={<MoveUpRight className="h-5 w-5" />}
        />
        <MetricCard
          label="Top Performing Source"
          value={topSourceLabel}
          detail={topSourceDetail}
          icon={<Trophy className="h-5 w-5" />}
        />
        <MetricCard
          label="Events This Week"
          value={eventsThisWeek.toLocaleString()}
          detail="Activity indicator for the last 7 days."
          icon={<CalendarRange className="h-5 w-5" />}
        />
      </section>
    </div>
  );
}
