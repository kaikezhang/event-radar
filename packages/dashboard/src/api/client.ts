import type {
  DashboardResponse,
  AuditResponse,
  AuditStatsResponse,
  AuditQueryParams,
  DeliveryFeedResponse,
  JudgeRecentResponse,
  JudgeStatsQueryParams,
  JudgeStatsResponse,
  ScannersStatusResponse,
  ScannerEventsResponse,
  HealthResponse,
} from '../types/api.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const API_KEY = import.meta.env.VITE_API_KEY;

async function fetchJSON<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, BASE_URL || window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  const headers = new Headers(init?.headers);
  if (API_KEY && !headers.has('x-api-key')) {
    headers.set('x-api-key', API_KEY);
  }

  const res = await fetch(url.toString(), {
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function readDashboardApiKey(): string | null {
  const envKey = import.meta.env.VITE_API_KEY;
  if (typeof envKey === 'string' && envKey.length > 0) {
    return envKey;
  }

  const storedKey = window.localStorage.getItem('event-radar.api-key');
  return storedKey && storedKey.length > 0 ? storedKey : null;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  const apiKey = readDashboardApiKey();

  return fetchJSON<DashboardResponse>(
    '/api/v1/dashboard',
    undefined,
    apiKey
      ? {
          headers: {
            'x-api-key': apiKey,
          },
        }
      : undefined,
  );
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

export function fetchJudgeRecent(limit = 50): Promise<JudgeRecentResponse> {
  return fetchJSON<JudgeRecentResponse>('/api/v1/judge/recent', { limit });
}

export function fetchJudgeStats(params?: JudgeStatsQueryParams): Promise<JudgeStatsResponse> {
  return fetchJSON<JudgeStatsResponse>(
    '/api/v1/judge/stats',
    params as unknown as Record<string, string | number | undefined>,
  );
}

export async function toggleDeliveryControl(killSwitchEnabled: boolean): Promise<void> {
  const apiKey = readDashboardApiKey();
  if (!apiKey) {
    throw new Error('Missing dashboard API key');
  }

  const path = killSwitchEnabled ? '/api/admin/delivery/resume' : '/api/admin/delivery/kill';
  const response = await fetch(new URL(path, BASE_URL || window.location.origin).toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: killSwitchEnabled ? undefined : JSON.stringify({ reason: 'Dashboard control panel pause' }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
}
