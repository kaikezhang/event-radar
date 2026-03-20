import { Plus, Check } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { EventChart } from '../components/EventChart.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { StatCard } from '../components/StatCard.js';
import { useTickerProfile } from '../hooks/useTickerProfile.js';
import { useWatchlist } from '../hooks/useWatchlist.js';

const SEVERITY_SCORE: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const SCORE_TO_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export function TickerProfile() {
  const { symbol } = useParams();
  const { data, isLoading } = useTickerProfile(symbol);
  const { isOnWatchlist, add, remove } = useWatchlist();

  const upperSymbol = symbol?.toUpperCase() ?? '';
  const onWatchlist = isOnWatchlist(upperSymbol);

  const handleToggleWatchlist = () => {
    if (onWatchlist) {
      remove(upperSymbol);
    } else {
      add(upperSymbol);
    }
  };

  const totalEvents = data?.eventCount ?? 0;
  const averageSeverity = data
    ? Math.round(
      data.recentAlerts.reduce((sum, alert) => {
        return sum + (SEVERITY_SCORE[alert.severity.toUpperCase()] ?? SEVERITY_SCORE['MEDIUM']);
      }, 0) / Math.max(data.recentAlerts.length, 1),
    )
    : 0;
  const averageSeverityLabel = SCORE_TO_SEVERITY[Math.max(averageSeverity - 1, 0)] ?? 'MEDIUM';
  const topSource = data
    ? Object.entries(
      data.recentAlerts.reduce<Record<string, number>>((counts, alert) => {
        counts[alert.source] = (counts[alert.source] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Unknown'
    : 'Unknown';

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
      <section className="rounded-[28px] border border-overlay-medium bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_var(--shadow-color)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-default">
              Ticker Profile
            </p>
            <h1 className="mt-2 text-[24px] font-semibold leading-8 text-text-primary">
              {data.name}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              ${data.symbol} • {data.eventCount} events tracked
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleWatchlist}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-accent-default ${
              onWatchlist
                ? 'border-green-500/30 bg-green-500/12 text-green-400'
                : 'border-overlay-medium bg-overlay-light text-text-primary hover:bg-overlay-medium'
            }`}
            aria-label={onWatchlist ? `Remove ${data.symbol} from watchlist` : `Add ${data.symbol} to watchlist`}
          >
            {onWatchlist ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {onWatchlist ? 'Watching' : 'Watchlist'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatCard value={String(totalEvents)} label="Total events" />
        <StatCard value={averageSeverityLabel} label="Avg severity" />
        <StatCard value={topSource} label="Top source" />
      </section>

      <EventChart symbol={data.symbol} events={data.recentAlerts} />

      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <h2 className="mb-4 text-[17px] font-semibold leading-[1.4] text-text-primary">
          Recent radar for {data.symbol}
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
