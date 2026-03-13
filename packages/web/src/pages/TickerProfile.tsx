import { Bell, Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { StatCard } from '../components/StatCard.js';
import { formatPercent, formatPrice } from '../lib/format.js';
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
        description="This symbol is not available in the mock profile dataset."
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
              {data.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-xl font-semibold text-text-primary">
                {formatPrice(data.price ?? 0)}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  (data.priceChangePercent ?? 0) >= 0
                    ? 'bg-emerald-400/12 text-emerald-300'
                    : 'bg-severity-critical/12 text-severity-critical'
                }`}
              >
                {formatPercent(data.priceChangePercent ?? 0)}
              </span>
            </div>
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

      <section className="grid grid-cols-3 gap-3">
        {data.stats.map((stat) => (
          <StatCard key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </section>

      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Recent radar for {data.symbol}</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Latest alerts tied to this ticker from filings, news, and social sources.
            </p>
          </div>
          <Bell className="h-5 w-5 text-text-secondary" />
        </div>
        <div className="space-y-3">
          {data.recentEvents.map((event) => (
            <AlertCard key={event.id} alert={event} />
          ))}
        </div>
      </section>
    </div>
  );
}
