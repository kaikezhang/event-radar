import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFeed } from '../lib/api.js';
import type { AlertSummary } from '../types/index.js';
import { useAlertSound } from './useAlertSound.js';
import { useWebSocket, type WebSocketStatus } from './useWebSocket.js';

interface UseAlertsResult {
  alerts: AlertSummary[];
  connectionStatus: WebSocketStatus;
  error: unknown;
  isEmpty: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  pendingCount: number;
  refetch: () => Promise<unknown>;
  applyPendingAlerts: () => void;
}

function mergeAlerts(incoming: AlertSummary[], existing: AlertSummary[]): AlertSummary[] {
  const merged = [...incoming, ...existing];
  return merged.filter(
    (alert, index) => merged.findIndex((candidate) => candidate.id === alert.id) === index,
  );
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
  const [isAtTop, setIsAtTop] = useState(true);
  const { playForSeverity } = useAlertSound();
  const { status: connectionStatus } = useWebSocket<AlertSummary>({
    onEvent: (alert) => {
      const alreadyVisible = visibleAlerts.some((candidate) => candidate.id === alert.id);
      const alreadyPending = pendingAlerts.some((candidate) => candidate.id === alert.id);

      if (alreadyVisible || alreadyPending) {
        return;
      }

      void playForSeverity(alert.severity);

      if (isAtTop) {
        setVisibleAlerts((current) => mergeAlerts([alert], current));
        return;
      }

      setPendingAlerts((current) => mergeAlerts([alert], current));
    },
  });

  useEffect(() => {
    const syncScrollState = () => {
      setIsAtTop(window.scrollY <= 24);
    };

    syncScrollState();
    window.addEventListener('scroll', syncScrollState, { passive: true });
    return () => window.removeEventListener('scroll', syncScrollState);
  }, []);

  useEffect(() => {
    if (!query.data?.alerts) {
      return;
    }

    if (visibleAlerts.length === 0) {
      setVisibleAlerts((current) => mergeAlerts(query.data.alerts, current));
      return;
    }

    const currentIds = new Set(visibleAlerts.map((alert) => alert.id));
    const incoming = query.data.alerts.filter((alert) => !currentIds.has(alert.id));

    if (incoming.length > 0) {
      if (isAtTop) {
        setVisibleAlerts((current) => mergeAlerts(incoming, current));
      } else {
        setPendingAlerts((current) => mergeAlerts(incoming, current));
      }
    }
  }, [isAtTop, query.data, visibleAlerts]);

  useEffect(() => {
    if (isAtTop && pendingAlerts.length > 0) {
      setVisibleAlerts((current) => mergeAlerts(pendingAlerts, current));
      setPendingAlerts([]);
    }
  }, [isAtTop, pendingAlerts]);

  const applyPendingAlerts = () => {
    if (pendingAlerts.length === 0) {
      return;
    }

    setVisibleAlerts((current) => mergeAlerts(pendingAlerts, current));
    setPendingAlerts([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pendingCount = pendingAlerts.length;
  const isInitialLoading = query.isLoading && visibleAlerts.length === 0;
  const isEmpty = !isInitialLoading && !query.error && visibleAlerts.length === 0;

  return {
    alerts: useMemo(() => visibleAlerts, [visibleAlerts]),
    connectionStatus,
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
