import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Check, Loader2, Plus, Search, TrendingUp, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTickerSearch } from '../hooks/useTickerSearch.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { useAuth } from '../contexts/AuthContext.js';
import { searchEvents } from '../lib/api.js';
import type { AlertSummary } from '../types/index.js';
import { cn } from '../lib/utils.js';

type SearchTab = 'tickers' | 'events';

interface TickerSearchProps {
  /** Whether the overlay is open */
  open: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
  /** Optional callback after a ticker is added to watchlist */
  onTickerAdded?: (ticker: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-severity-critical/15 text-severity-critical',
  HIGH: 'bg-severity-high/15 text-severity-high',
  MEDIUM: 'bg-severity-medium/15 text-severity-medium',
  LOW: 'bg-severity-low/15 text-severity-low',
};

function inferSearchTab(query: string): SearchTab {
  const trimmed = query.trim();
  if (!trimmed) return 'tickers';
  // If all caps, no spaces, 1-5 chars — likely a ticker
  if (/^[A-Z]{1,5}$/.test(trimmed)) return 'tickers';
  // If contains spaces — likely natural language (events)
  if (trimmed.includes(' ')) return 'events';
  return 'tickers';
}

export function TickerSearch({ open, onClose, onTickerAdded }: TickerSearchProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { query, setQuery, results, isSearching, recentSearches, trending, addToRecent, clearRecent } =
    useTickerSearch({ enabled: open });
  const { add, isOnWatchlist } = useWatchlist({ enabled: open && isAuthenticated });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchTab, setSearchTab] = useState<SearchTab>('tickers');
  const [eventQuery, setEventQuery] = useState('');
  const [debouncedEventQuery, setDebouncedEventQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasQuery = searchTab === 'tickers' ? query.trim().length > 0 : eventQuery.trim().length > 0;

  // Debounce event query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEventQuery(eventQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [eventQuery]);

  const { data: eventResults = [], isLoading: isEventSearching, isError: isEventError, refetch: refetchEvents } = useQuery<AlertSummary[]>({
    queryKey: ['event-search', debouncedEventQuery],
    queryFn: () => searchEvents(debouncedEventQuery, 10),
    enabled: open && searchTab === 'events' && debouncedEventQuery.trim().length > 0,
    staleTime: 30_000,
  });

  // Focus input when overlay opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setEventQuery('');
      setActiveIndex(-1);
      setSearchTab('tickers');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open, setQuery]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results, eventResults]);

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

  const handleInputChange = (value: string) => {
    if (searchTab === 'tickers') {
      setQuery(value.toUpperCase());
    } else {
      setEventQuery(value);
    }
    // Auto-switch tab based on query shape
    const inferred = inferSearchTab(value);
    if (inferred !== searchTab && value.trim().length > 0) {
      setSearchTab(inferred);
      if (inferred === 'tickers') {
        setQuery(value.toUpperCase());
      } else {
        setEventQuery(value);
      }
    }
  };

  const handleEventClick = (event: AlertSummary) => {
    onClose();
    navigate(`/events/${event.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchTab === 'tickers') {
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
    } else {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, eventResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && eventResults.length > 0) {
        e.preventDefault();
        const index = activeIndex >= 0 ? activeIndex : 0;
        handleEventClick(eventResults[index]!);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-ticker-result], [data-event-result]');
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!open) return null;

  const currentQuery = searchTab === 'tickers' ? query : eventQuery;
  const isCurrentSearching = searchTab === 'tickers' ? isSearching : isEventSearching;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" role="dialog" aria-modal="true" aria-label="Search">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative mt-[10vh] w-full max-w-lg mx-4 sm:mx-0 rounded-2xl border border-border-default bg-[#0a1628] shadow-[0_25px_60px_var(--shadow-color)] overflow-hidden max-h-[70vh] flex flex-col sm:mt-[15vh]">
        {/* Tab bar */}
        <div className="flex border-b border-overlay-medium">
          <button
            type="button"
            onClick={() => setSearchTab('tickers')}
            className={cn(
              'flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition',
              searchTab === 'tickers'
                ? 'border-b-2 border-accent-default text-accent-default'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Tickers
          </button>
          <button
            type="button"
            onClick={() => setSearchTab('events')}
            className={cn(
              'flex-1 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition',
              searchTab === 'events'
                ? 'border-b-2 border-accent-default text-accent-default'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            Events
          </button>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-overlay-medium px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={hasQuery && (searchTab === 'tickers' ? results.length > 0 : eventResults.length > 0)}
            aria-controls="search-listbox"
            aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
            value={currentQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchTab === 'tickers' ? 'Search tickers...' : 'Search events (e.g. "Iran sanctions", "Fed rate")...'}
            className="flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-secondary/60 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {isCurrentSearching && <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-overlay-medium bg-overlay-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
            ESC
          </kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {searchTab === 'tickers' ? (
            /* ── Tickers tab ── */
            hasQuery ? (
              results.length > 0 ? (
                <div className="py-2" role="listbox" id="search-listbox" aria-label="Search results">
                  {results.map((result, index) => {
                    const onWatchlist = isOnWatchlist(result.ticker);
                    const isActive = index === activeIndex;

                    return (
                      <div
                        key={result.ticker}
                        id={`search-option-${index}`}
                        role="option"
                        aria-selected={isActive}
                        data-ticker-result
                        className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                          isActive ? 'bg-overlay-medium' : 'hover:bg-overlay-medium'
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
                              : 'border border-overlay-medium bg-overlay-subtle text-text-secondary hover:bg-accent-default/20 hover:text-accent-default'
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
                  No tickers found for &ldquo;{query}&rdquo;
                </div>
              ) : null
            ) : (
              /* Empty state: recent + trending */
              <div className="py-3">
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
                          className="inline-flex items-center rounded-full border border-overlay-medium bg-overlay-subtle px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-overlay-medium"
                        >
                          {ticker}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                          className="inline-flex items-center gap-1.5 rounded-full border border-overlay-medium bg-overlay-subtle px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-overlay-medium"
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
            )
          ) : (
            /* ── Events tab ── */
            isEventError ? (
              <div className="px-4 py-8 text-center">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-severity-high" />
                <p className="text-sm text-text-secondary">Search failed — please try again</p>
                <button
                  type="button"
                  onClick={() => void refetchEvents()}
                  className="mt-3 rounded-lg border border-overlay-medium bg-overlay-subtle px-4 py-1.5 text-xs font-medium text-text-primary transition hover:bg-overlay-medium"
                >
                  Retry
                </button>
              </div>
            ) : hasQuery ? (
              eventResults.length > 0 ? (
                <div className="py-2" role="listbox" id="search-listbox" aria-label="Event search results">
                  {eventResults.map((event, index) => {
                    const isActive = index === activeIndex;
                    const severityClass = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.MEDIUM;
                    const ticker = event.tickers?.[0];
                    const dateStr = event.time
                      ? new Date(event.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : '';

                    return (
                      <button
                        key={event.id}
                        id={`search-option-${index}`}
                        role="option"
                        aria-selected={isActive}
                        data-event-result
                        type="button"
                        onClick={() => handleEventClick(event)}
                        className={cn(
                          'w-full px-4 py-2.5 text-left transition-colors',
                          isActive ? 'bg-overlay-medium' : 'hover:bg-overlay-medium',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', severityClass)}>
                            {event.severity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text-primary">{event.title}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                              {ticker && <span className="font-semibold">{ticker}</span>}
                              <span>{event.source}</span>
                              {dateStr && <span>{dateStr}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : !isEventSearching ? (
                <div className="px-4 py-8 text-center text-sm text-text-secondary">
                  No events found for &ldquo;{eventQuery}&rdquo;
                </div>
              ) : null
            ) : (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                Search for events by title, content, or topic
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
