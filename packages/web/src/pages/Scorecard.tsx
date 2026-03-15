import { startTransition, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, Target } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.js';
import { StatCard } from '../components/StatCard.js';
import { formatScorecardBucketLabel, getScorecardSummary } from '../lib/api.js';
import type { ScorecardBucketSummary } from '../types/index.js';

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

export function Scorecard() {
  const [windowValue, setWindowValue] = useState<ScorecardWindow>(90);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scorecard-summary', windowValue],
    queryFn: () => getScorecardSummary(windowValue === 'all' ? undefined : windowValue),
    staleTime: 60_000,
  });

  const windowMeta = WINDOWS.find((option) => option.value === windowValue) ?? WINDOWS[1];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <section className="rounded-[28px] border border-white/8 bg-bg-surface/95 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <div className="h-5 w-28 animate-pulse rounded-full bg-white/8" />
          <div className="mt-3 h-8 w-48 animate-pulse rounded-full bg-white/8" />
          <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-white/6" />
        </section>
        <section className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-[24px] border border-white/8 bg-bg-surface/95"
            />
          ))}
        </section>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon="📉"
        title="Scorecard unavailable"
        description="The summary API did not return scorecard data. Try again in a moment."
        ctaLabel="Back to feed"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(145deg,rgba(34,197,94,0.10),rgba(15,23,42,0.94))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-400/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
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

          <div className="hidden rounded-3xl border border-white/10 bg-white/6 p-3 text-text-secondary sm:block">
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
                  ? 'border-emerald-400/30 bg-emerald-400/14 text-emerald-200'
                  : 'border-white/10 bg-white/6 text-text-secondary hover:bg-white/8'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatCard value={String(data.totals.totalAlerts)} label="Total alerts" />
        <StatCard value={formatRate(data.totals.directionalHitRate)} label="Directional hit rate" />
        <StatCard value={formatRate(data.totals.setupWorkedRate)} label="Setup worked rate" />
        <StatCard value={formatMove(data.totals.avgT20Move)} label="Avg T+20 move" />
      </section>

      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
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
        title="Action buckets"
        description="Outcome quality grouped by the product action labels users see first."
        group="action"
        buckets={data.actionBuckets}
      />
      <BucketSection
        title="Confidence buckets"
        description="Calibration by model confidence so users can see whether conviction tracks reality."
        group="confidence"
        buckets={data.confidenceBuckets}
      />
      <BucketSection
        title="Source buckets"
        description="Signal quality by source family to surface where alerts deserve more trust."
        group="source"
        buckets={data.sourceBuckets}
      />
      <BucketSection
        title="Event type buckets"
        description="Behavior by product event type, useful for tuning templates and routing."
        group="eventType"
        buckets={data.eventTypeBuckets}
      />
    </div>
  );
}

function BucketSection({
  title,
  description,
  group,
  buckets,
}: {
  title: string;
  description: string;
  group: 'action' | 'confidence' | 'source' | 'eventType';
  buckets: ScorecardBucketSummary[];
}) {
  return (
    <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold leading-6 text-text-primary">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      </div>

      <div className="space-y-3">
        {buckets.map((bucket) => (
          <article
            key={`${group}-${bucket.bucket}`}
            className="rounded-[24px] border border-white/8 bg-black/16 p-4"
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
              <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium text-text-secondary">
                {bucket.totalAlerts} alerts
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BUCKET_COLUMNS.map((column) => (
                <div
                  key={column.key}
                  className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3"
                >
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-text-secondary">
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
