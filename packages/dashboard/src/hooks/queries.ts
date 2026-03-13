import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchDashboard,
  fetchAudit,
  fetchAuditStats,
  fetchDeliveryFeed,
  fetchScannersStatus,
  fetchScannerEvents,
  fetchHealth,
} from '../api/client.js';
import type { AuditQueryParams } from '../types/api.js';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });
}

export function useAudit(params: AuditQueryParams) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => fetchAudit(params),
  });
}

export function useAuditStats() {
  return useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });
}

export function useScannersStatus() {
  return useQuery({
    queryKey: ['scanners-status'],
    queryFn: fetchScannersStatus,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });
}

export function useScannerEvents(name: string, enabled = true) {
  return useQuery({
    queryKey: ['scanner-events', name],
    queryFn: () => fetchScannerEvents(name),
    enabled: enabled && name.length > 0,
    refetchInterval: 15_000,
  });
}

export function useDeliveryFeed(limit = 20) {
  return useInfiniteQuery({
    queryKey: ['delivery-feed', limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchDeliveryFeed({ limit, before: pageParam }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    refetchInterval: 15_000,
  });
}
