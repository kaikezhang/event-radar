import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchTickers, getTrendingTickers } from '../lib/api.js';
import type { TickerSearchResult, TrendingTicker } from '../lib/api.js';

const RECENT_TICKER_SEARCHES_KEY = 'event-radar-recent-ticker-searches';
const MAX_RECENT = 10;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TICKER_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches: string[]) {
  localStorage.setItem(RECENT_TICKER_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT)));
}

export function useTickerSearch(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);

  // Debounce query by 150ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading: isSearching } = useQuery<TickerSearchResult[]>({
    queryKey: ['ticker-search', debouncedQuery],
    queryFn: () => searchTickers(debouncedQuery),
    enabled: enabled && debouncedQuery.trim().length > 0,
    staleTime: 30_000,
  });

  const { data: trending = [] } = useQuery<TrendingTicker[]>({
    queryKey: ['trending-tickers'],
    queryFn: () => getTrendingTickers(),
    staleTime: 60_000,
    enabled,
  });

  const addToRecent = useCallback((ticker: string) => {
    if (!ticker.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== ticker);
      const updated = [ticker, ...filtered].slice(0, MAX_RECENT);
      saveRecentSearches(updated);
      return updated;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_TICKER_SEARCHES_KEY);
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    recentSearches,
    trending,
    addToRecent,
    clearRecent,
  };
}
