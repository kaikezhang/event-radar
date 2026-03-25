import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHistoricalEvents } from '../lib/api.js';
import type { AlertSummary } from '../types/index.js';

const PAGE_SIZE = 50;

export interface HistoryState {
  alerts: AlertSummary[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useHistory(): HistoryState {
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<AlertSummary[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['history', offset],
    queryFn: () => getHistoricalEvents({
      limit: PAGE_SIZE,
      offset,
    }),
    placeholderData: (previous) => previous,
  });

  const alerts = useMemo(() => {
    if (!data) {
      return accumulated;
    }

    if (offset === 0) {
      return data.alerts;
    }

    const seen = new Set(accumulated.map((alert) => alert.id));
    return [...accumulated, ...data.alerts.filter((alert) => !seen.has(alert.id))];
  }, [accumulated, data, offset]);

  const total = data?.total ?? 0;
  const hasMore = alerts.length < total;

  const loadMore = useCallback(() => {
    setAccumulated(alerts);
    setOffset((current) => current + PAGE_SIZE);
  }, [alerts]);

  return {
    alerts,
    total,
    isLoading,
    isFetching,
    hasMore,
    loadMore,
  };
}
