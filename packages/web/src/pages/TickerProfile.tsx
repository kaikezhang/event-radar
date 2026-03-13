import { Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useTickerProfile } from '../hooks/useTickerProfile.js';

export function TickerProfile() {
  const { symbol } = useParams();
  const { data, isLoading } = useTickerProfile(symbol);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="🔍"
        title="Ticker not found"
        description={`No events found for ${symbol?.toUpperCase() ?? 'this ticker'}.`}
        ctaLabel="Back to feed"
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-default">
              Ticker Profile
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-8 text-text-primary">
              ${data.symbol}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {data.eventCount} events tracked
            </p>
          </div>

          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <Plus className="h-4 w-4" />
            Watchlist
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="mb-4 text-[17px] font-semibold leading-[1.4] text-text-primary">
          Recent events for ${data.symbol}
        </h2>
        <div className="space-y-3">
          {data.recentAlerts.map((event) => (
            <AlertCard key={event.id} alert={event} />
          ))}
        </div>
      </section>
    </div>
  );
}
