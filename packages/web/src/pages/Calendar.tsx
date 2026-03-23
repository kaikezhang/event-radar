import { startTransition, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.js';
import { getUpcomingCalendar } from '../lib/api.js';
import { cn } from '../lib/utils.js';

type CalendarWindowKey = 'this-week' | 'next-week' | 'this-month';

const RANGE_OPTIONS: Array<{ key: CalendarWindowKey; label: string }> = [
  { key: 'this-week', label: 'This Week' },
  { key: 'next-week', label: 'Next Week' },
  { key: 'this-month', label: 'This Month' },
];

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-200',
  HIGH: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  MEDIUM: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  LOW: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
};

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatHistoricalMove(value: number | null): string | null {
  if (value == null) {
    return null;
  }

  return `Past events like this moved ±${value.toFixed(1)}%`;
}

function toIsoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function getWindow(windowKey: CalendarWindowKey, now = new Date()): { from: string; to: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const weekday = now.getUTCDay();
  const normalizedWeekday = weekday === 0 ? 7 : weekday;
  const mondayOffset = normalizedWeekday - 1;

  if (windowKey === 'this-week') {
    const start = new Date(Date.UTC(year, month, day));
    const end = new Date(Date.UTC(year, month, day));
    end.setUTCDate(end.getUTCDate() + (7 - normalizedWeekday));

    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }

  if (windowKey === 'next-week') {
    const start = new Date(Date.UTC(year, month, day));
    start.setUTCDate(start.getUTCDate() + (7 - mondayOffset));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }

  return {
    from: toIsoDate(year, month, day),
    to: toIsoDate(year, month + 1, 0),
  };
}

export function Calendar() {
  const [windowKey, setWindowKey] = useState<CalendarWindowKey>('this-week');
  const window = getWindow(windowKey, new Date(Date.now()));
  const { data, isLoading, isError } = useQuery({
    queryKey: ['calendar', window.from, window.to],
    queryFn: () => getUpcomingCalendar(window),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4 pb-6">
      <section className="overflow-hidden rounded-[28px] border border-border-default bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.2),transparent_38%),linear-gradient(145deg,rgba(15,23,42,0.96),rgba(17,24,39,0.98))] p-5 shadow-[0_20px_50px_var(--shadow-color)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">
              <CalendarDays className="h-3.5 w-3.5" />
              Event Calendar
            </p>
            <h1 className="mt-3 text-[26px] font-semibold leading-8 text-white">
              Event Calendar
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Upcoming earnings, macro releases, and active trading halts in one schedule-first view.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setWindowKey(option.key);
                  });
                }}
                className={cn(
                  'rounded-full border px-3 py-2 text-sm font-medium transition',
                  option.key === windowKey
                    ? 'border-white/20 bg-white text-slate-950'
                    : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {data?.earningsDataLimited && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Earnings data is currently limited to SEC filings.
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-border-default bg-bg-surface/70"
            />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <EmptyState
          icon="🗓️"
          title="Calendar data is unavailable"
          description="The schedule view could not load right now. Try the feed while the API catches up."
          ctaLabel="Open Feed"
          ctaHref="/"
        />
      )}

      {!isLoading && !isError && data && data.dates.length === 0 && (
        <EmptyState
          icon="🗓️"
          title="No scheduled events found for this period"
          description="Expand the range or check back after the next scanner pass."
          ctaLabel="Open Feed"
          ctaHref="/"
        />
      )}

      {!isLoading && !isError && data && data.dates.length > 0 && (
        <div className="space-y-4">
          {data.dates.map((group) => (
            <section key={group.date} className="rounded-3xl border border-border-default bg-bg-surface/95 p-4 shadow-[0_16px_40px_var(--shadow-color)]">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <CalendarDays className="h-4 w-4 text-accent-default" />
                <h2>{formatDateLabel(group.date)}</h2>
              </div>

              <div className="space-y-3">
                {group.events.map((event) => {
                  const historicalMove = formatHistoricalMove(event.historicalAvgMove);

                  return (
                    <Link
                      key={event.eventId}
                      to={`/event/${event.eventId}`}
                      aria-label={`Open event ${event.title}`}
                      className="group block rounded-2xl border border-border-default bg-bg-primary/70 p-4 transition hover:border-accent-default/40 hover:bg-bg-elevated"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                              SEVERITY_STYLES[event.severity ?? ''] ?? 'border-border-default bg-bg-surface text-text-primary',
                            )}>
                              {event.severity ?? 'UNKNOWN'}
                            </span>
                            {event.ticker && (
                              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-xs font-semibold text-sky-100">
                                {event.ticker}
                              </span>
                            )}
                            <span className="text-xs uppercase tracking-[0.16em] text-text-tertiary">
                              {event.source}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-[17px] font-semibold leading-6 text-text-primary group-hover:text-white">
                              {event.title}
                            </h3>
                            {historicalMove && (
                              <p className="mt-1 text-sm leading-5 text-text-secondary">
                                {historicalMove}
                              </p>
                            )}
                          </div>
                        </div>

                        {(event.timeLabel || event.outcomeT5 != null) && (
                          <div className="flex shrink-0 flex-col gap-2 text-sm text-text-secondary lg:items-end">
                            {event.timeLabel && (
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="h-3.5 w-3.5" />
                                {event.timeLabel}
                              </span>
                            )}
                            {event.outcomeT5 != null && (
                              <span className="text-xs font-medium text-text-tertiary">
                                Last T+5: {event.outcomeT5 > 0 ? '+' : ''}{event.outcomeT5.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
