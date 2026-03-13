import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useWatchlist } from '../hooks/useWatchlist.js';

export function Watchlist() {
  const { items, isLoading, add, remove, isAdding } = useWatchlist();
  const [tickerInput, setTickerInput] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    if (ticker && /^[A-Z]{1,10}$/.test(ticker)) {
      add(ticker);
      setTickerInput('');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">
          Watchlist
        </h1>
        <p className="text-sm text-text-secondary">
          {items.length} ticker{items.length !== 1 ? 's' : ''} tracked
        </p>
      </section>

      {/* Add ticker form */}
      <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="Add ticker (e.g. AAPL)"
            maxLength={10}
            className="min-h-11 flex-1 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
            aria-label="Add ticker to watchlist"
          />
          <button
            type="submit"
            disabled={isAdding || !tickerInput.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-default px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </form>
      </section>

      {/* Watchlist items */}
      {items.length === 0 ? (
        <EmptyState
          icon="👁"
          title="Watchlist is empty"
          description="Add tickers above to track events for your favorite stocks."
          ctaLabel="Search tickers"
          ctaHref="/search"
        />
      ) : (
        <section className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-[28px] border border-border-default bg-bg-surface/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
            >
              <Link
                to={`/ticker/${item.ticker}`}
                className="flex-1 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-default"
              >
                <span className="text-[17px] font-semibold text-text-primary">
                  ${item.ticker}
                </span>
                {item.notes && (
                  <span className="ml-2 text-sm text-text-secondary">{item.notes}</span>
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
          ))}
        </section>
      )}
    </div>
  );
}
