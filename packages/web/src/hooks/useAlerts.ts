import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFeed } from '../lib/api.js';
import type { AlertSummary } from '../types/index.js';

interface UseAlertsResult {
  alerts: AlertSummary[];
  error: unknown;
  isEmpty: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  pendingCount: number;
  refetch: () => Promise<unknown>;
  applyPendingAlerts: () => void;
}

export function useAlerts(limit = 50): UseAlertsResult {
  const query = useQuery({
    queryKey: ['feed', limit],
    queryFn: () => getFeed(limit),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const [visibleAlerts, setVisibleAlerts] = useState<AlertSummary[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<AlertSummary[]>([]);

  useEffect(() => {
    if (!query.data?.alerts) {
      return;
    }

    if (visibleAlerts.length === 0) {
      setVisibleAlerts(query.data.alerts);
      return;
    }

    const currentIds = new Set(visibleAlerts.map((alert) => alert.id));
    const incoming = query.data.alerts.filter((alert) => !currentIds.has(alert.id));

    if (incoming.length > 0) {
      setPendingAlerts(incoming);
    }
  }, [query.data, visibleAlerts]);

  const applyPendingAlerts = () => {
    if (pendingAlerts.length === 0) {
      return;
    }

    const merged = [...pendingAlerts, ...visibleAlerts];
    const deduped = merged.filter(
      (alert, index) => merged.findIndex((candidate) => candidate.id === alert.id) === index,
    );

    setVisibleAlerts(deduped);
    setPendingAlerts([]);
  };

  const pendingCount = pendingAlerts.length;
  const isInitialLoading = query.isLoading && visibleAlerts.length === 0;
  const isEmpty = !isInitialLoading && visibleAlerts.length === 0;

  return {
    alerts: useMemo(() => visibleAlerts, [visibleAlerts]),
    error: query.error,
    isInitialLoading,
    isEmpty,
    isRefreshing: query.isRefetching && !query.isLoading,
    isLoading: query.isLoading,
    pendingCount,
    refetch: query.refetch,
    applyPendingAlerts,
  };
}
