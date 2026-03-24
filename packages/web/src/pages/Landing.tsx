import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Radar,
  ScanSearch,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PricingCard } from '../components/PricingCard.js';
import { getScorecardSummary } from '../lib/api.js';
import type { ScorecardSummary } from '../types/index.js';

const FEATURE_CARDS = [
  {
    title: '13 Real-Time Sources',
    body: 'SEC EDGAR, Truth Social, breaking news, trading halts, economic calendar, and the scanners traders actually care about during market hours.',
    icon: Radar,
  },
  {
    title: 'AI Classification',
    body: 'Every event is labeled by severity, likely market impact, and sector context so the signal arrives ready to act on.',
    icon: Sparkles,
  },
  {
    title: 'Outcome Tracking',
    body: 'We score what happened after the alert so you can separate noisy headlines from setups that actually paid.',
    icon: TrendingUp,
  },
  {
    title: 'Earnings Calendar',
    body: 'Upcoming earnings, historical analogs, and post-event outcome context are already threaded into the workflow.',
    icon: CalendarDays,
  },
] as const;

const PREVIEW_ROWS = [
  {
    severity: 'CRITICAL',
    source: 'SEC EDGAR',
    ticker: 'NVDA',
    title: '8-K flags China export exposure before the open',
    move: '+6.4% median T+20 follow-through',
  },
  {
    severity: 'HIGH',
    source: 'Trading Halt',
    ticker: 'SMCI',
    title: 'Exchange halt hits with news pending and momentum stretched',
    move: '79% setup-worked rate',
  },
  {
    severity: 'MEDIUM',
    source: 'Macro',
    ticker: 'SPY',
    title: 'Fed commentary shifts rate path odds into the close',
    move: 'Cross-asset impact mapped in seconds',
  },
] as const;

const FALLBACK_STATS = {
  eventsTracked: '24,000+ events tracked',
  dataSources: '13 active data sources',
  setupRate: '79% setup-worked rate on trading halts',
} as const;

function formatRoundedThousands(value: number): string {
  return `${Math.round(value / 1000) * 1000}+`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildStats(summary: ScorecardSummary | null) {
  if (!summary) {
    return FALLBACK_STATS;
  }

  const haltBucket = summary.sourceBuckets.find((bucket) => bucket.bucket === 'trading-halt')
    ?? summary.eventTypeBuckets.find((bucket) => bucket.bucket === 'trading_halt');

  return {
    eventsTracked: `${formatRoundedThousands(summary.overview.totalEvents)} events tracked`,
    dataSources: `${summary.overview.sourcesMonitored} active data sources`,
    // Keep the marketing claim live when the API exposes a halt-specific bucket,
    // but fall back to the benchmark copy until that data is wired through.
    setupRate: `${formatPercent(haltBucket?.setupWorkedRate ?? 0.79)} setup-worked rate on trading halts`,
  };
}

function StatsStrip() {
  const { data } = useQuery({
    queryKey: ['landing-scorecard-summary'],
    queryFn: () => getScorecardSummary(90),
    staleTime: 5 * 60_000,
  });

  const stats = buildStats(data ?? null);

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {[
        { eyebrow: 'Coverage', value: stats.eventsTracked },
        { eyebrow: 'Infrastructure', value: stats.dataSources },
        { eyebrow: 'Outcome Edge', value: stats.setupRate },
      ].map((stat) => (
        <article
          key={stat.eyebrow}
          className="rounded-[1.6rem] border border-border-default/70 bg-bg-surface/75 px-5 py-5 shadow-[0_18px_40px_var(--shadow-color)] backdrop-blur"
        >
          <p className="text-xs uppercase tracking-[0.28em] text-text-tertiary">{stat.eyebrow}</p>
          <p className="mt-3 text-lg font-semibold tracking-tight text-text-primary">{stat.value}</p>
        </article>
      ))}
    </section>
  );
}

function FeedPreview() {
  return (
    <section
      aria-label="Event Radar live feed preview"
      className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-4 shadow-[0_28px_70px_rgba(15,23,42,0.35)] backdrop-blur-xl"
    >
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="flex items-center justify-between rounded-[1.4rem] border border-white/10 bg-slate-950/65 px-4 py-3 text-white">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-orange-300">Live Terminal</p>
          <p className="mt-1 text-sm font-semibold">High-conviction event flow</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          13 sources online
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {PREVIEW_ROWS.map((row) => (
          <article
            key={row.title}
            className="rounded-[1.4rem] border border-white/10 bg-slate-950/72 px-4 py-4 text-white shadow-[0_20px_45px_rgba(15,23,42,0.24)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-300">
                <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-orange-200">{row.severity}</span>
                <span>{row.source}</span>
              </div>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                {row.ticker}
              </span>
            </div>

            <p className="mt-3 text-base font-semibold leading-6">{row.title}</p>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <Activity className="h-4 w-4 text-orange-300" />
              <span>{row.move}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-[1.4rem] border border-white/10 bg-slate-950/68 p-4 text-white sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Severity</p>
          <p className="mt-2 text-xl font-semibold">AI-labeled</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Outcome</p>
          <p className="mt-2 text-xl font-semibold">Tracked at T+5 / T+20</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Delivery</p>
          <p className="mt-2 text-xl font-semibold">iOS, Telegram, Discord</p>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <div className="mx-auto max-w-6xl py-8 sm:py-10">
      <section className="relative overflow-hidden rounded-[2.4rem] border border-border-default bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(45,212,191,0.18),transparent_20%),linear-gradient(155deg,#07131f_0%,#0d1727_36%,#111827_100%)] px-6 py-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.28)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_60%)] lg:block" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.28em] text-orange-200">
              <ScanSearch className="h-3.5 w-3.5" />
              Production Market Intelligence
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              Know What Moves Markets
              <span className="block text-orange-200">Before It Moves</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              AI-powered event detection across 13 real-time sources. Track outcomes. Trade with confidence.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Event Radar turns filings, political posts, halts, macro releases, and breaking headlines into a live decision surface with historical follow-through built in.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-400"
              >
                See Live Feed
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Start Free Trial
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-200">
              <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5">SEC + news + macro + halts</span>
              <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5">Historical outcome tracking</span>
              <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5">Trader-grade signal triage</span>
            </div>
          </div>

          <FeedPreview />
        </div>
      </section>

      <div className="mt-8">
        <StatsStrip />
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-4">
        {FEATURE_CARDS.map(({ title, body, icon: Icon }) => (
          <article
            key={title}
            className="rounded-[1.8rem] border border-border-default bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,248,250,0.92))] p-5 shadow-[0_20px_44px_var(--shadow-color)] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(15,23,42,0.88))]"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-default/12 text-accent-default">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-text-primary">{title}</h2>
            <p className="mt-3 text-sm leading-7 text-text-secondary">{body}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-6 rounded-[2rem] border border-border-default bg-bg-surface/80 p-6 shadow-[0_22px_50px_var(--shadow-color)] lg:grid-cols-[0.95fr_1.05fr] lg:p-8">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-primary px-3 py-1 text-xs uppercase tracking-[0.26em] text-text-tertiary">
            <CircleAlert className="h-3.5 w-3.5 text-accent-default" />
            Pricing
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            One plan. All the signal compression.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-text-secondary sm:text-base">
            The current production tier includes the live feed, scorecards, earnings calendar, watchlists, and alert delivery. Stripe wiring comes next, so the trial flow is copy-only for now.
          </p>
          <p className="mt-6 text-base font-semibold text-text-primary">
            14-day free trial. No credit card required.
          </p>
        </div>

        <PricingCard />
      </section>
    </div>
  );
}
