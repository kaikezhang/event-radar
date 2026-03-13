import { Bell } from 'lucide-react';
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
      {/* Header */}
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7 text-text-primary">
              ⚡ Event Radar
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              AI-powered market intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/6 p-2.5 text-text-secondary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => { void refetch(); }}
              className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {/* New alerts pill */}
      {pendingCount > 0 ? <PillBanner count={pendingCount} onApply={applyPendingAlerts} /> : null}

      {/* Alert list */}
      <section className="space-y-3" aria-live="polite">
        {isInitialLoading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonCard key={index} />)
        ) : null}

        {!isInitialLoading && error ? (
          <EmptyState
            icon="⚠️"
            title="Can't reach the server"
            description="Check your connection and try again."
            ctaLabel="Retry"
          />
        ) : null}

        {!isInitialLoading && isEmpty ? (
          <EmptyState
            icon="📡"
            title="No market-moving events right now"
            description="Event Radar monitors SEC filings, executive orders, breaking news, and more. High-impact events will appear here in real-time."
            ctaLabel="Refresh"
          />
        ) : null}

        {!isInitialLoading && !error
          ? alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
          : null}
      </section>
    </div>
  );
}
