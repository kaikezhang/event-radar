import { useQuery } from '@tanstack/react-query';
import {
  fetchDashboard,
  fetchAudit,
  fetchAuditStats,
  fetchScannersStatus,
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
