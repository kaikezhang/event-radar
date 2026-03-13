import type {
  DashboardResponse,
  AuditResponse,
  AuditStatsResponse,
  AuditQueryParams,
  DeliveryFeedResponse,
  ScannersStatusResponse,
  ScannerEventsResponse,
  HealthResponse,
} from '../types/api.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function fetchJSON<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, BASE_URL || window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return fetchJSON<DashboardResponse>('/api/v1/dashboard');
}

export function fetchAudit(params?: AuditQueryParams): Promise<AuditResponse> {
  return fetchJSON<AuditResponse>('/api/v1/audit', params as Record<string, string | number | undefined>);
}

export function fetchAuditStats(): Promise<AuditStatsResponse> {
  return fetchJSON<AuditStatsResponse>('/api/v1/audit/stats');
}

export function fetchScannersStatus(): Promise<ScannersStatusResponse> {
  return fetchJSON<ScannersStatusResponse>('/api/scanners/status');
}

export function fetchHealth(): Promise<HealthResponse> {
  return fetchJSON<HealthResponse>('/health');
}

export function fetchScannerEvents(name: string, limit = 10): Promise<ScannerEventsResponse> {
  return fetchJSON<ScannerEventsResponse>(`/api/v1/scanners/${encodeURIComponent(name)}/events`, { limit });
}

export function fetchDeliveryFeed(params?: {
  limit?: number;
  before?: string;
}): Promise<DeliveryFeedResponse> {
  return fetchJSON<DeliveryFeedResponse>('/api/v1/delivery/feed', params);
}
