import { useState } from 'react';
import { ArrowUpRight, Bell, CheckCircle2, LogIn, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { TickerSearch } from '../components/TickerSearch.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useWatchlist, useWatchlistSummary } from '../hooks/useWatchlist.js';

const PUSH_SETTINGS_PATH = '/settings?from=watchlist#push-alerts';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function Watchlist() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { items, isLoading, remove } = useWatchlist();
  const { summary } = useWatchlistSummary();
  const [searchOpen, setSearchOpen] = useState(false);
  const [firstTickerAdded, setFirstTickerAdded] = useState<string | null>(null);

  const isEmpty = items.length === 0;
  const hasFirstTickerSuccess =
    firstTickerAdded !== null && items.some((item) => item.ticker === firstTickerAdded);

  const summaryMap = new Map(summary.map((s) => [s.ticker, s]));

  const handleTickerAdded = (ticker: string) => {
    if (items.length === 0) {
      setFirstTickerAdded(ticker);
    }
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border-default bg-[linear-gradient(135deg,rgba(249,115,22,0.10),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">
            Watchlist
          </p>
          <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">
            Sign in to create your watchlist
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Build a focused watchlist so Event Radar can push the highest
            confidence alerts for the names you care about.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-default px-5 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  if (isLoading || authLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border-default bg-[linear-gradient(135deg,rgba(249,115,22,0.10),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">
          Watchlist
        </p>
        <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">
          {isEmpty ? 'Start with a watchlist' : 'Your radar list'}
        </h1>
        {isEmpty ? (
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Event Radar works best when you follow a small set of names. Add your
            first ticker so high-confidence alerts stay focused and useful.
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            {items.length} ticker{items.length !== 1 ? 's' : ''} tracked
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">
              {isEmpty ? 'Add your first ticker' : 'Add another ticker'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {isEmpty
                ? 'Start with the names you care about most. You can add more anytime.'
                : 'Keep your watchlist tight so the feed stays signal-heavy.'}
            </p>
          </div>
          <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-accent-default/12 text-accent-default">
            <Plus className="h-5 w-5" />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex min-h-11 w-full items-center gap-3 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[15px] text-text-secondary/60 transition hover:bg-white/8 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <Search className="h-4 w-4" />
          <span>{isEmpty ? 'Search tickers to add (e.g. AAPL)' : 'Search tickers...'}</span>
          <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
            /
          </kbd>
        </button>
      </section>

      <TickerSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onTickerAdded={handleTickerAdded}
      />

      {isEmpty ? (
        <section className="rounded-2xl border border-border-default bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-default/12 text-accent-default">
              <Bell className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h2 className="text-[17px] font-semibold text-text-primary">
                Watchlist-first onboarding
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Build a focused list first, then let Event Radar push the highest
                confidence alerts to this device when something matters.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-default">
                Step 1
              </p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                Add your first ticker above.
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Start with the one stock you would want to hear about immediately.
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-default">
                Step 2
              </p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                Turn on push for high-confidence alerts.
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                You do not need push to use the app, but it is the fastest way to
                catch the alerts worth acting on.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              to={PUSH_SETTINGS_PATH}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent-default px-4 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Enable push alerts
            </Link>
            <Link
              to="/search"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[15px] font-semibold text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Browse tickers
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          {hasFirstTickerSuccess ? (
            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-50 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-300" />
                <div className="flex-1">
                  <h2 className="text-[17px] font-semibold">
                    {firstTickerAdded} is now on your watchlist
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/85">
                    Event Radar will now keep this name in view. Enable push on this
                    device if you want high-confidence alerts to reach you away from
                    the feed.
                  </p>
                  <Link
                    to={PUSH_SETTINGS_PATH}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    Enable push alerts on this device
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {items.map((item) => {
            const tickerSummary = summaryMap.get(item.ticker);
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-border-default bg-bg-surface/96 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
              >
                <div className="flex items-center justify-between">
                  <Link
                    to={`/ticker/${item.ticker}`}
                    className="flex-1 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-default"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[17px] font-semibold text-text-primary">
                        ${item.ticker}
                      </span>
                      {item.name && (
                        <span className="truncate text-sm text-text-secondary">
                          {item.name}
                        </span>
                      )}
                      {tickerSummary && tickerSummary.eventCount24h > 0 && (
                        <span className="text-lg" aria-label={`Signal: ${tickerSummary.highestSignal}`}>
                          {tickerSummary.highestSignal}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <span className="text-sm text-text-secondary">{item.notes}</span>
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(item.ticker)}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 p-2 text-text-secondary transition hover:bg-red-500/20 hover:text-red-400"
                    aria-label={`Remove ${item.ticker} from watchlist`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {tickerSummary && tickerSummary.eventCount24h > 0 && (
                  <div className="mt-3 rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text-secondary">
                        {tickerSummary.eventCount24h} event{tickerSummary.eventCount24h !== 1 ? 's' : ''} (24h)
                      </span>
                      {tickerSummary.latestEvent && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            SEVERITY_COLORS[tickerSummary.latestEvent.severity] ?? SEVERITY_COLORS.MEDIUM
                          }`}
                        >
                          {tickerSummary.latestEvent.severity}
                        </span>
                      )}
                    </div>
                    {tickerSummary.latestEvent && (
                      <p className="mt-1.5 text-sm leading-5 text-text-primary line-clamp-2">
                        {tickerSummary.latestEvent.title}
                      </p>
                    )}
                    {tickerSummary.latestEvent && (
                      <p className="mt-1 text-xs text-text-secondary">
                        {timeAgo(tickerSummary.latestEvent.timestamp)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
