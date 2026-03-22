import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHistoricalEvents, getEventSources } from '../lib/api.js';
import type { HistoryParams } from '../lib/api.js';
import type { AlertSummary } from '../types/index.js';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const PAGE_SIZE = 50;

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface HistoryFilters {
  from: string;
  to: string;
  severity: string;
  source: string;
  ticker: string;
}

export interface HistoryState {
  filters: HistoryFilters;
  setFilter: <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => void;
  resetFilters: () => void;
  clearFilters: () => void;
  isDefaultSeverity: boolean;
  alerts: AlertSummary[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  loadMore: () => void;
  sources: string[];
  severities: readonly string[];
  stats: {
    total: number;
    bySeverity: Record<string, number>;
    topTickers: Array<{ ticker: string; count: number }>;
  };
}

const INITIAL_FILTERS: HistoryFilters = {
  from: defaultFrom(),
  to: defaultTo(),
  severity: 'HIGH,CRITICAL',
  source: '',
  ticker: '',
};

const CLEARED_FILTERS: HistoryFilters = {
  from: defaultFrom(),
  to: defaultTo(),
  severity: '',
  source: '',
  ticker: '',
};

export function useHistory(): HistoryState {
  const [filters, setFilters] = useState<HistoryFilters>(INITIAL_FILTERS);
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<AlertSummary[]>([]);

  const params: HistoryParams = useMemo(() => ({
    from: filters.from,
    to: filters.to,
    severity: filters.severity || undefined,
    source: filters.source || undefined,
    ticker: filters.ticker.toUpperCase() || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [filters, offset]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['history', params],
    queryFn: () => getHistoricalEvents(params),
    placeholderData: (prev) => prev,
  });

  const { data: sourcesData } = useQuery({
    queryKey: ['event-sources'],
    queryFn: getEventSources,
    staleTime: 5 * 60 * 1000,
  });

  const alerts = useMemo(() => {
    if (!data) return accumulated;
    if (offset === 0) return data.alerts;
    // Merge accumulated with new page, dedup by id
    const seen = new Set(accumulated.map((a) => a.id));
    return [...accumulated, ...data.alerts.filter((a) => !seen.has(a.id))];
  }, [data, offset, accumulated]);

  const total = data?.total ?? 0;
  const hasMore = alerts.length < total;

  const setFilter = useCallback(<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
    setAccumulated([]);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setOffset(0);
    setAccumulated([]);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(CLEARED_FILTERS);
    setOffset(0);
    setAccumulated([]);
  }, []);

  const isDefaultSeverity = filters.severity === INITIAL_FILTERS.severity;

  const loadMore = useCallback(() => {
    setAccumulated(alerts);
    setOffset((prev) => prev + PAGE_SIZE);
  }, [alerts]);

  const stats = useMemo(() => {
    const bySeverity: Record<string, number> = {};
    const tickerCounts: Record<string, number> = {};

    for (const alert of alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
      for (const t of alert.tickers) {
        tickerCounts[t] = (tickerCounts[t] ?? 0) + 1;
      }
    }

    const topTickers = Object.entries(tickerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ticker, count]) => ({ ticker, count }));

    return { total: alerts.length, bySeverity, topTickers };
  }, [alerts]);

  return {
    filters,
    setFilter,
    resetFilters,
    clearFilters,
    isDefaultSeverity,
    alerts,
    total,
    isLoading,
    isFetching,
    hasMore,
    loadMore,
    sources: sourcesData ?? [],
    severities: SEVERITIES,
    stats,
  };
}
