import { EmptyState } from '../components/EmptyState.js';
import { AlertCard } from '../components/AlertCard.js';
import { PillBanner } from '../components/PillBanner.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useAlerts } from '../hooks/useAlerts.js';

export function Feed() {
  const {
    alerts,
    error,
    isEmpty,
    isInitialLoading,
    isRefreshing,
    pendingCount,
    applyPendingAlerts,
    refetch,
  } = useAlerts(50);

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-default">
              Public Feed
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-8 text-text-primary">
              Market-moving alerts with context
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="text-[15px] leading-6 text-text-secondary">
          Browse the delayed public stream now. Sign up for real-time alerts, richer AI context, and historical pattern depth.
        </p>
      </section>

      {pendingCount > 0 ? <PillBanner count={pendingCount} onApply={applyPendingAlerts} /> : null}

      <section className="space-y-3" aria-live="polite">
        {isInitialLoading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)
        ) : null}

        {!isInitialLoading && error ? (
          <EmptyState
            icon="⚠️"
            title="Can’t reach the feed"
            description="The mock API did not respond as expected. Try refreshing the page."
            ctaLabel="Retry"
          />
        ) : null}

        {!isInitialLoading && isEmpty ? (
          <EmptyState
            icon="📡"
            title="Scanning for events"
            description="We monitor filings, breaking news, and social chatter. Add tickers to your watchlist once auth lands."
            ctaLabel="View search"
            ctaHref="/search"
          />
        ) : null}

        {!isInitialLoading && !error
          ? alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
          : null}
      </section>
    </div>
  );
}
