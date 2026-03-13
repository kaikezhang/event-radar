import { useEffect, useMemo, useRef, useState } from 'react';
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
  const seen = new Set<string>();

  return merged.filter((alert) => {
    if (seen.has(alert.id)) {
      return false;
    }

    seen.add(alert.id);
    return true;
  });
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
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const { playForSeverity } = useAlertSound();

  const rememberAlerts = (alerts: AlertSummary[]) => {
    for (const alert of alerts) {
      seenAlertIdsRef.current.add(alert.id);
    }
  };

  const { status: connectionStatus } = useWebSocket<AlertSummary>({
    onEvent: (alert) => {
      if (seenAlertIdsRef.current.has(alert.id)) {
        return;
      }

      seenAlertIdsRef.current.add(alert.id);
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
    seenAlertIdsRef.current = new Set(
      [...visibleAlerts, ...pendingAlerts].map((alert) => alert.id),
    );
  }, [pendingAlerts, visibleAlerts]);

  useEffect(() => {
    if (!query.data?.alerts) {
      return;
    }

    if (visibleAlerts.length === 0) {
      rememberAlerts(query.data.alerts);
      setVisibleAlerts((current) => mergeAlerts(query.data.alerts, current));
      return;
    }

    const currentIds = new Set(visibleAlerts.map((alert) => alert.id));
    const incoming = query.data.alerts.filter((alert) => !currentIds.has(alert.id));

    if (incoming.length > 0) {
      rememberAlerts(incoming);
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
