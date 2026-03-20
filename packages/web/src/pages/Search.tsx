import { Search as SearchIcon, X, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { useSearch } from '../hooks/useSearch.js';

const POPULAR_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'SPY'];

export function Search() {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    results,
    isLoading,
    isSearching,
    recentSearches,
    addToRecent,
    clearRecent,
  } = useSearch();

  // Extract unique tickers from results for pill display
  const matchedTickers = Array.from(
    new Set(results.flatMap((r) => r.tickers)),
  ).slice(0, 8);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      addToRecent(query.trim());
    }
  };

  return (
    <div className="space-y-4">
      {/* Search header */}
      <section className="rounded-[28px] border border-overlay-medium bg-[linear-gradient(135deg,rgba(168,85,247,0.12),rgba(20,20,20,0.96))] p-5 shadow-[0_18px_40px_var(--shadow-color)]">
        <h1 className="mb-3 text-[20px] font-semibold leading-7 text-text-primary">
          Search Events
        </h1>
        <form onSubmit={handleSubmit} className="relative">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events or tickers..."
            className="min-h-11 w-full rounded-full border border-overlay-medium bg-overlay-light py-2.5 pl-11 pr-10 text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
            aria-label="Search events"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-secondary hover:text-text-primary"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </section>

      {/* Matched ticker pills */}
      {matchedTickers.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {matchedTickers.map((ticker) => (
            <button
              key={ticker}
              type="button"
              onClick={() => navigate(`/ticker/${ticker}`)}
              className="inline-flex min-h-9 items-center rounded-full border border-overlay-medium bg-overlay-light px-3 py-1.5 text-xs font-semibold text-accent-default transition hover:bg-overlay-medium"
            >
              ${ticker}
            </button>
          ))}
        </div>
      )}

      {/* Search results */}
      <section className="space-y-3" aria-live="polite">
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!isLoading && isSearching && results.length === 0 && (
          <EmptyState
            icon="🔍"
            title="No results found"
            description={`No events matching "${query}". Try a different search term or ticker symbol.`}
            ctaLabel="Clear search"
            ctaHref="/search"
          />
        )}

        {!isLoading && results.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </section>

      {/* Empty state: recent searches + popular tickers */}
      {!isSearching && (
        <div className="space-y-4">
          {recentSearches.length > 0 && (
            <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-text-primary">Recent searches</h2>
                <button
                  type="button"
                  onClick={clearRecent}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => { setQuery(term); addToRecent(term); }}
                    className="flex w-full min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-overlay-light"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {term}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[28px] border border-border-default bg-bg-surface/95 p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-text-primary">Popular tickers</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TICKERS.map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => navigate(`/ticker/${ticker}`)}
                  className="inline-flex min-h-9 items-center rounded-full border border-overlay-medium bg-overlay-light px-3 py-1.5 text-sm font-medium text-text-primary transition hover:bg-overlay-medium"
                >
                  ${ticker}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
