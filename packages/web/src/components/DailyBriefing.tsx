import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDailyBriefing } from '../lib/api.js';
import {
  dismissDailyBriefingForToday,
  isDailyBriefingDismissedToday,
} from '../lib/daily-briefing.js';
import { cn } from '../lib/utils.js';

const SOURCE_LABELS: Record<string, string> = {
  'sec-edgar': 'SEC filings',
  'breaking-news': 'Breaking news',
  'trading-halt': 'Trading halts',
};

function formatCriticalSummary(bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }): string {
  if (bySeverity.CRITICAL > 0) {
    const noun = bySeverity.CRITICAL === 1 ? 'event' : 'events';
    return `Daily Briefing · ${bySeverity.CRITICAL} critical ${noun} today`;
  }
  if (bySeverity.HIGH > 0) {
    const noun = bySeverity.HIGH === 1 ? 'event' : 'events';
    return `Daily Briefing · ${bySeverity.HIGH} high ${noun} today`;
  }
  const total = bySeverity.CRITICAL + bySeverity.HIGH + bySeverity.MEDIUM + bySeverity.LOW;
  const noun = total === 1 ? 'event' : 'events';
  return `Daily Briefing · ${total} ${noun} today`;
}

function formatSeveritySummary(bySeverity: {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}): string {
  const items = [
    `${bySeverity.CRITICAL} critical`,
    `${bySeverity.HIGH} high`,
    `${bySeverity.MEDIUM} medium`,
  ];

  if (bySeverity.LOW > 0) {
    items.push(`${bySeverity.LOW} low`);
  }

  return `${items.join(', ')} in the last 24h`;
}

function formatSourceBreakdown(bySource: Record<string, number>): string {
  return Object.entries(bySource)
    .map(([source, count]) => `${SOURCE_LABELS[source] ?? source}: ${count}`)
    .join(', ');
}

function inferMarketRegime(bySeverity: {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}): string {
  const total = bySeverity.CRITICAL + bySeverity.HIGH + bySeverity.MEDIUM + bySeverity.LOW;

  if (total === 0) {
    return 'Quiet tape';
  }

  if (bySeverity.CRITICAL > 0) {
    return 'Risk elevated';
  }

  if (bySeverity.HIGH >= 3) {
    return 'Headline-driven';
  }

  if (bySeverity.HIGH > 0 || bySeverity.MEDIUM >= 2) {
    return 'Active but orderly';
  }

  return 'Steady flow';
}

export function DailyBriefing() {
  const [dismissed, setDismissed] = useState(isDailyBriefingDismissedToday);
  const [expanded, setExpanded] = useState(false);
  const panelId = 'daily-briefing-panel';
  const { data } = useQuery({
    queryKey: ['daily-briefing'],
    queryFn: getDailyBriefing,
    staleTime: 300_000,
  });

  if (dismissed || !data) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-300/25 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(249,115,22,0.12),rgba(120,53,15,0.06))] shadow-[0_14px_36px_var(--shadow-color)]">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900/70">
            Morning briefing
          </p>
          <h2 className="mt-1 text-sm font-semibold text-text-primary">
            {formatCriticalSummary(data.bySeverity)}
          </h2>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-900/10 bg-white/45 text-amber-950/70">
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-amber-900/10 bg-white/35 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-950/60">
              {data.date}
            </p>
            <Link
              to="/history"
              className="text-sm font-semibold text-amber-950/80 underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="mt-3 space-y-3 text-sm text-amber-950/80">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-950/60">
                Severity breakdown
              </p>
              <p className="mt-2 font-medium text-text-primary">
                {formatSeveritySummary(data.bySeverity)}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-950/60">
                Market regime
              </p>
              <p className="mt-2 font-medium text-text-primary">
                {inferMarketRegime(data.bySeverity)}
              </p>
            </div>

            {data.topEvents.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-950/60">
                  Top 3 events
                </p>
                <ul className="mt-2 space-y-1.5">
                  {data.topEvents.slice(0, 3).map((event) => (
                    <li key={`${event.title}-${event.ticker ?? 'none'}`} className="text-sm">
                      <span className="font-semibold text-text-primary">{event.title}</span>
                      {event.ticker ? ` · ${event.ticker}` : ''}
                      {` · ${event.severity}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Object.keys(data.bySource).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-950/60">
                  Source breakdown
                </p>
                <p className="mt-2">{formatSourceBreakdown(data.bySource)}</p>
              </div>
            )}

            {data.watchlistEvents > 0 && (
              <p>Events affecting your watchlist: {data.watchlistEvents}</p>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                dismissDailyBriefingForToday();
                setDismissed(true);
              }}
              className="inline-flex min-h-10 items-center rounded-full border border-amber-900/15 bg-white/55 px-4 py-2 text-sm font-medium text-amber-950/80 transition hover:bg-white/70"
            >
              Dismiss for today
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
