import type {
  AlertSummary,
  ChartRange,
  EventScorecard,
  EventDetailData,
  PriceChartData,
  ScorecardSummary,
  TickerProfileData,
  WatchlistItem,
} from '../types/index.js';

const API_BASE = '/api';

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)er_csrf=([^;]*)/);
  return match ? match[1]! : null;
}

async function apiFetch(path: string, options?: { public?: boolean; method?: string; body?: unknown }) {
  const headers: Record<string, string> = {};

  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const method = options?.method ?? 'GET';

  // Add CSRF token for state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Try refresh
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshRes.ok) {
      // Retry original request with new cookies
      const retryHeaders: Record<string, string> = {};
      if (options?.body) retryHeaders['Content-Type'] = 'application/json';
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const csrf = getCsrfToken();
        if (csrf) retryHeaders['X-CSRF-Token'] = csrf;
      }

      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers: retryHeaders,
        credentials: 'include',
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!retryRes.ok) throw new Error(`API error: ${retryRes.status}`);
      return retryRes.json();
    }

    // Refresh failed → redirect to login
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Auth API ────────────────────────────────────────────────────────────────

export async function sendMagicLink(email: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch('/auth/magic-link', { method: 'POST', body: { email } });
}

export async function verifyMagicLink(token: string): Promise<{ ok: boolean; user: { id: string; email: string; displayName: string | null } }> {
  return apiFetch('/auth/verify', { method: 'POST', body: { token } });
}

export async function authRefresh(): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Refresh failed');
  return res.json();
}

export async function authLogout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function authMe(): Promise<{ id: string; email: string; displayName: string | null } | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Feed / Events ───────────────────────────────────────────────────────────

export interface FeedResponse {
  alerts: AlertSummary[];
  cursor: string | null;
  total: number;
}

export async function getFeed(limit = 50, options?: { watchlist?: boolean; before?: string }): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (options?.watchlist) params.set('watchlist', 'true');
  if (options?.before) params.set('before', options.before);
  const res = await apiFetch(`/v1/feed?${params.toString()}`, { public: true });
  const events: Record<string, unknown>[] = res.events ?? [];
  const alerts = events.map(mapAlertSummary);

  return {
    alerts,
    cursor: (res.cursor as string | null) ?? null,
    total: typeof res.total === 'number' ? res.total : alerts.length,
  };
}

export interface WatchlistTickerSummary {
  ticker: string;
  eventCount24h: number;
  latestEvent: {
    title: string;
    severity: string;
    timestamp: string;
  } | null;
  highestSignal: string;
}

export async function getWatchlistSummary(): Promise<WatchlistTickerSummary[]> {
  const res = await apiFetch('/v1/feed/watchlist-summary');
  return (res.tickers ?? []) as WatchlistTickerSummary[];
}

export interface NotificationPreferences {
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  dailyPushCap: number;
  pushNonWatchlist: boolean;
  updatedAt?: string | null;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch('/v1/preferences');
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  return apiFetch('/v1/preferences', {
    method: 'PUT',
    body: preferences,
  });
}

export async function getEventDetail(id: string): Promise<EventDetailData | null> {
  try {
    const data = await apiFetch(`/events/${id}`);
    const e = data.data ?? data;
    if (!e) return null;

    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const tickers: string[] = (meta.tickers as string[]) ?? (meta.ticker ? [meta.ticker as string] : []);
    const source = (e.source as string) ?? 'unknown';

    // Try to get similar events
    let similarEvents: EventDetailData['historicalPattern']['similarEvents'] = [];
    try {
      const simData = await apiFetch(`/events/${id}/similar`);
      const simEvents = simData.data ?? simData.events ?? simData ?? [];
      similarEvents = simEvents.slice(0, 5).map((s: Record<string, unknown>) => ({
        title: (s.title as string) ?? '',
        date: (s.receivedAt as string) ?? (s.createdAt as string) ?? '',
        move: '',
      }));
    } catch {
      // No similar events available
    }

    // Map audit trail data if present
    const rawAudit = e.audit as Record<string, unknown> | null | undefined;
    const audit = rawAudit
      ? {
          outcome: (rawAudit.outcome as string) ?? 'unknown',
          stoppedAt: (rawAudit.stoppedAt as string) ?? 'unknown',
          reason: (rawAudit.reason as string | null) ?? null,
          confidence: typeof rawAudit.confidence === 'number' ? rawAudit.confidence : null,
          historicalMatch: typeof rawAudit.historicalMatch === 'boolean' ? rawAudit.historicalMatch : null,
          historicalConfidence: (rawAudit.historicalConfidence as string | null) ?? null,
          deliveryChannels: rawAudit.deliveryChannels ?? null,
          enrichedAt: (rawAudit.enrichedAt as string | null) ?? null,
        }
      : null;

    return {
      id: e.id as string,
      severity: (e.severity as string) ?? 'MEDIUM',
      source: mapSource(source),
      sourceKey: source,
      title: (e.title as string) ?? '',
      tickers,
      time: (e.receivedAt as string) ?? (e.createdAt as string) ?? new Date().toISOString(),
      url: (e.sourceUrls as string[])?.[0] ?? (meta.url as string) ?? null,
      confirmationCount:
        typeof e.confirmationCount === 'number'
          ? e.confirmationCount
          : Array.isArray(e.provenance)
            ? Math.max(1, e.provenance.length)
            : 1,
      confirmedSources: Array.isArray(e.confirmedSources)
        ? (e.confirmedSources as string[])
        : typeof source === 'string'
          ? [mapSource(source)]
          : [],
      provenance: Array.isArray(e.provenance)
        ? (e.provenance as Record<string, unknown>[]).map((item) => ({
            id: (item.id as string) ?? '',
            source: mapSource((item.source as string) ?? 'unknown'),
            title: (item.title as string) ?? '',
            receivedAt:
              (item.receivedAt as string)
              ?? (item.createdAt as string)
              ?? new Date().toISOString(),
            url: (item.url as string) ?? null,
          }))
        : [],
      aiAnalysis: {
        summary: (e.summary as string) ?? '',
        impact: (meta.impact as string) ?? null,
        tickerDirections: tickers.map((t) => ({
          symbol: t,
          direction: (meta.direction as string) ?? 'neutral',
          context: '',
        })),
      },
      historicalPattern: {
        matchCount: similarEvents.length,
        confidence: similarEvents.length > 3 ? 'high' : similarEvents.length > 0 ? 'medium' : 'low',
        avgMoveT5: null,
        avgMoveT20: null,
        winRate: null,
        similarEvents,
      },
      audit,
    };
  } catch {
    return null;
  }
}

export async function getScorecardSummary(days?: number): Promise<ScorecardSummary | null> {
  try {
    const query = days == null ? '' : `?days=${days}`;
    return await apiFetch(`/v1/scorecards/summary${query}`) as ScorecardSummary;
  } catch {
    return null;
  }
}

export async function getEventScorecard(id: string): Promise<EventScorecard | null> {
  try {
    return await apiFetch(`/v1/scorecards/${id}`) as EventScorecard;
  } catch {
    return null;
  }
}

export async function getTickerProfile(symbol: string): Promise<TickerProfileData | null> {
  try {
    const data = await apiFetch(`/events?ticker=${symbol.toUpperCase()}&limit=20`);
    const events = data.data ?? data.events ?? data ?? [];

    if (events.length === 0) return null;

    const alerts = events.map(mapAlertSummary);

    const firstMeta = ((events[0] as Record<string, unknown> | undefined)?.metadata ?? {}) as Record<string, unknown>;
    const companyName =
      (firstMeta.companyName as string | undefined)
      ?? (firstMeta.company_name as string | undefined)
      ?? (firstMeta.issuer_name as string | undefined)
      ?? symbol.toUpperCase();

    return {
      symbol: symbol.toUpperCase(),
      name: companyName,
      eventCount: alerts.length,
      recentAlerts: alerts,
    };
  } catch {
    return null;
  }
}

export async function submitFeedback(_eventId: string, _helpful: boolean) {
  // TODO: integrate with real feedback API
  return { ok: true };
}

export async function searchEvents(q: string, limit = 20): Promise<AlertSummary[]> {
  const data = await apiFetch(`/events/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  const events = data.data ?? [];
  return events.map(mapAlertSummary);
}

export async function getTickerPrice(symbol: string, range: ChartRange): Promise<PriceChartData> {
  const data = await apiFetch(`/price/${symbol.toUpperCase()}?range=${range}`);
  return {
    ticker: (data.ticker as string) ?? symbol.toUpperCase(),
    range,
    candles: ((data.candles as Record<string, unknown>[] | undefined) ?? []).map((candle) => ({
      time: (candle.time as string) ?? '',
      open: Number(candle.open ?? 0),
      high: Number(candle.high ?? 0),
      low: Number(candle.low ?? 0),
      close: Number(candle.close ?? 0),
      volume: Number(candle.volume ?? 0),
    })),
  };
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const data = await apiFetch('/watchlist');
  return (data.data ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    ticker: w.ticker as string,
    addedAt: (w.addedAt as string) ?? (w.added_at as string) ?? new Date().toISOString(),
    notes: (w.notes as string | null) ?? null,
  }));
}

export async function addToWatchlist(ticker: string): Promise<WatchlistItem> {
  return apiFetch('/watchlist', { method: 'POST', body: { ticker: ticker.toUpperCase() } });
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  await apiFetch(`/watchlist/${ticker.toUpperCase()}`, { method: 'DELETE' });
}

// ── Onboarding API ──────────────────────────────────────────────────────────

export interface SuggestedTicker {
  symbol: string;
  eventCount7d: number;
  latestSignal: string;
}

export interface SectorPack {
  name: string;
  tickers: string[];
}

export interface SuggestedTickersResponse {
  tickers: SuggestedTicker[];
  packs: SectorPack[];
}

export async function getSuggestedTickers(): Promise<SuggestedTickersResponse> {
  return apiFetch('/v1/onboarding/suggested-tickers');
}

export async function bulkAddToWatchlist(tickers: string[]): Promise<{ added: number; total: number }> {
  return apiFetch('/v1/onboarding/bulk-add', { method: 'POST', body: { tickers } });
}

export async function getEventSources(): Promise<string[]> {
  const data = await apiFetch('/events/sources');
  const raw: string[] = data.sources ?? [];
  return [...new Set(raw.map(mapSource))].sort();
}

function mapAlertSummary(event: Record<string, unknown>): AlertSummary {
  const source = (event.source as string) ?? 'unknown';
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  const tickers = (event.tickers as string[] | undefined)
    ?? (metadata.tickers as string[] | undefined)
    ?? (metadata.ticker ? [metadata.ticker as string] : []);

  return {
    id: event.id as string,
    severity: (event.severity as string) ?? 'MEDIUM',
    source: mapSource(source),
    sourceKey: source,
    title: (event.title as string) ?? '',
    tickers,
    summary: (event.summary as string) ?? '',
    time: (event.time as string) ?? (event.receivedAt as string) ?? (event.createdAt as string) ?? new Date().toISOString(),
    saved: false,
    direction: (metadata.direction as string | undefined) ?? undefined,
    confirmationCount:
      typeof event.confirmationCount === 'number'
        ? event.confirmationCount
        : typeof metadata.confirmationCount === 'number'
          ? metadata.confirmationCount
          : 1,
    confirmedSources: Array.isArray(event.confirmedSources)
      ? (event.confirmedSources as string[]).map(mapSource)
      : Array.isArray(metadata.confirmedSources)
        ? (metadata.confirmedSources as string[]).map(mapSource)
        : undefined,
  };
}

function mapSource(source: string): string {
  const MAP: Record<string, string> = {
    'sec-edgar': 'SEC Filing',
    'whitehouse': 'White House',
    'federal-register': 'Federal Register',
    'breaking-news': 'Breaking News',
    'newswire': 'Newswire',
    'pr-newswire': 'PR Newswire',
    'businesswire': 'BusinessWire',
    'globenewswire': 'GlobeNewswire',
    'reuters': 'Reuters',
    'reddit': 'Reddit',
    'stocktwits': 'StockTwits',
    'econ-calendar': 'Economic Calendar',
    'doj-antitrust': 'DOJ',
    'fda': 'FDA',
    'congress': 'Congress',
    'unusual-options': 'Options Flow',
    'short-interest': 'Short Interest',
    'analyst': 'Analyst',
    'earnings': 'Earnings',
    'truth-social': 'Truth Social',
    'x-scanner': 'X/Twitter',
    'warn': 'WARN Act',
  };
  return MAP[source] ?? source;
}

export function formatScorecardBucketLabel(group: 'action' | 'confidence' | 'source' | 'eventType', bucket: string): string {
  if (group === 'source') {
    return mapSource(bucket);
  }

  if (group === 'action') {
    return bucket.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  }

  if (group === 'eventType') {
    return bucket.replaceAll('_', ' ');
  }

  return bucket;
}
