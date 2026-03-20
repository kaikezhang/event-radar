import { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Loader2, Plus, Search, TrendingUp, Clock } from 'lucide-react';
import { useTickerSearch } from '../hooks/useTickerSearch.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { useAuth } from '../contexts/AuthContext.js';

interface TickerSearchProps {
  /** Whether the overlay is open */
  open: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Optional callback after a ticker is added to watchlist */
  onTickerAdded?: (ticker: string) => void;
}

export function TickerSearch({ open, onClose, onTickerAdded }: TickerSearchProps) {
  const { isAuthenticated } = useAuth();
  const { query, setQuery, results, isSearching, recentSearches, trending, addToRecent, clearRecent } =
    useTickerSearch({ enabled: open });
  const { add, isOnWatchlist } = useWatchlist({ enabled: open && isAuthenticated });
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasQuery = query.trim().length > 0;

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(-1);
      // Small delay to allow the overlay to render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, setQuery]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleAddTicker = useCallback(
    (ticker: string) => {
      if (isOnWatchlist(ticker)) return;
      add(ticker);
      addToRecent(ticker);
      onTickerAdded?.(ticker);
    },
    [add, addToRecent, isOnWatchlist, onTickerAdded],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const index = activeIndex >= 0 ? activeIndex : 0;
      const result = results[index]!;
      handleAddTicker(result.ticker);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-ticker-result]');
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" role="dialog" aria-modal="true" aria-label="Ticker search">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mt-[10vh] w-full max-w-lg mx-4 sm:mx-0 rounded-2xl border border-border-default bg-[#0a1628] shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden max-h-[70vh] flex flex-col sm:mt-[15vh]">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={hasQuery && results.length > 0}
            aria-controls="ticker-search-listbox"
            aria-activedescendant={activeIndex >= 0 ? `ticker-option-${activeIndex}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Search tickers..."
            className="flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
            ESC
          </kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {hasQuery ? (
            /* Search results */
            results.length > 0 ? (
              <div className="py-2" role="listbox" id="ticker-search-listbox" aria-label="Search results">
                {results.map((result, index) => {
                  const onWatchlist = isOnWatchlist(result.ticker);
                  const isActive = index === activeIndex;

                  return (
                    <div
                      key={result.ticker}
                      id={`ticker-option-${index}`}
                      role="option"
                      aria-selected={isActive}
                      data-ticker-result
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                        isActive ? 'bg-white/8' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">
                            {result.ticker}
                          </span>
                          <span className="truncate text-sm text-text-secondary">
                            {result.name}
                          </span>
                        </div>
                        {(result.sector || result.exchange) && (
                          <p className="mt-0.5 text-xs text-text-secondary/70">
                            {[result.sector, result.exchange].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTicker(result.ticker)}
                        disabled={onWatchlist}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                          onWatchlist
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'border border-white/10 bg-white/5 text-text-secondary hover:bg-accent-default/20 hover:text-accent-default'
                        }`}
                        aria-label={onWatchlist ? `${result.ticker} is on watchlist` : `Add ${result.ticker} to watchlist`}
                      >
                        {onWatchlist ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : !isSearching ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No tickers found for "{query}"
              </div>
            ) : null
          ) : (
            /* Empty state: recent + trending */
            <div className="py-3">
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-text-secondary" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                        Recent
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="text-xs text-text-secondary/70 hover:text-text-secondary transition"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((ticker) => (
                      <button
                        key={ticker}
                        type="button"
                        onClick={() => {
                          setQuery(ticker);
                        }}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-white/8"
                      >
                        {ticker}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              {trending.length > 0 && (
                <div className="px-4 pt-2">
                  <div className="mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 text-accent-default" />
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                      Trending on Event Radar
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {trending.map((t) => (
                      <button
                        key={t.ticker}
                        type="button"
                        onClick={() => {
                          setQuery(t.ticker);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-white/8"
                      >
                        {t.ticker}
                        {t.eventCount > 0 && (
                          <span className="text-accent-default">{t.eventCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentSearches.length === 0 && trending.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-secondary">
                  Start typing to search tickers
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
