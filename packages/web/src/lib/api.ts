import type { AlertSummary, EventDetailData, TickerProfileData, WatchlistItem } from '../types/index.js';

const API_BASE = '/api';
const API_KEY = 'er-dev-2026';

async function apiFetch(path: string, options?: { public?: boolean }) {
  const headers = options?.public ? undefined : { 'X-Api-Key': API_KEY };
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface FeedResponse {
  alerts: AlertSummary[];
  cursor: string | null;
  total: number;
}

export async function getFeed(limit = 50): Promise<FeedResponse> {
  const res = await apiFetch(`/v1/feed?limit=${limit}`, { public: true });
  const events: Record<string, unknown>[] = res.events ?? [];

  const alerts: AlertSummary[] = events.map((event: Record<string, unknown>) => {
    const source = (event.source as string) ?? 'unknown';
    return {
      id: event.id as string,
      severity: (event.severity as string) ?? 'MEDIUM',
      source: mapSource(source),
      title: (event.title as string) ?? '',
      tickers: (event.tickers as string[]) ?? [],
      summary: (event.summary as string) ?? '',
      time: (event.time as string) ?? new Date().toISOString(),
      saved: false,
    };
  });

  return {
    alerts,
    cursor: (res.cursor as string | null) ?? null,
    total: typeof res.total === 'number' ? res.total : alerts.length,
  };
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

    return {
      id: e.id as string,
      severity: (e.severity as string) ?? 'MEDIUM',
      source: mapSource(source),
      title: (e.title as string) ?? '',
      tickers,
      time: (e.receivedAt as string) ?? (e.createdAt as string) ?? new Date().toISOString(),
      url: (e.sourceUrls as string[])?.[0] ?? (meta.url as string) ?? null,
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
    };
  } catch {
    return null;
  }
}

export async function getTickerProfile(symbol: string): Promise<TickerProfileData | null> {
  try {
    const data = await apiFetch(`/events?ticker=${symbol.toUpperCase()}&limit=20`);
    const events = data.data ?? data.events ?? data ?? [];

    if (events.length === 0) return null;

    const alerts: AlertSummary[] = events.map((e: Record<string, unknown>) => {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const tickers: string[] = (meta.tickers as string[]) ?? (meta.ticker ? [meta.ticker as string] : []);
      return {
        id: e.id as string,
        severity: (e.severity as string) ?? 'MEDIUM',
        source: mapSource((e.source as string) ?? 'unknown'),
        title: (e.title as string) ?? '',
        tickers,
        summary: (e.summary as string) ?? '',
        time: (e.receivedAt as string) ?? (e.createdAt as string) ?? new Date().toISOString(),
        saved: false,
      };
    });

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
  return events.map((e: Record<string, unknown>) => {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const tickers: string[] = (meta.tickers as string[]) ?? (meta.ticker ? [meta.ticker as string] : []);
    return {
      id: e.id as string,
      severity: (e.severity as string) ?? 'MEDIUM',
      source: mapSource((e.source as string) ?? 'unknown'),
      title: (e.title as string) ?? '',
      tickers,
      summary: (e.summary as string) ?? '',
      time: (e.receivedAt as string) ?? (e.createdAt as string) ?? new Date().toISOString(),
      saved: false,
    };
  });
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
  const headers: Record<string, string> = { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' };
  const res = await fetch(`${API_BASE}/watchlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticker: ticker.toUpperCase() }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  const headers: Record<string, string> = { 'X-Api-Key': API_KEY };
  const res = await fetch(`${API_BASE}/watchlist/${ticker.toUpperCase()}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
}

export async function getEventSources(): Promise<string[]> {
  const data = await apiFetch('/events/sources');
  return data.sources ?? [];
}

function mapSource(source: string): string {
  const MAP: Record<string, string> = {
    'sec-edgar': 'SEC Filing',
    'whitehouse': 'White House',
    'federal-register': 'Federal Register',
    'breaking-news': 'Breaking News',
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
