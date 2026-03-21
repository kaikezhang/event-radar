import type {
  AlertSummary,
  ChartRange,
  EnrichmentTicker,
  EventMarketData,
  EventOutcome,
  EventScorecard,
  EventDetailData,
  HistoricalContext,
  LlmEnrichment,
  PriceChartData,
  ScorecardSummary,
  SimilarEvent,
  TickerProfileData,
  WatchlistItem,
  WatchlistSection,
} from '../types/index.js';

const API_BASE = '/api';
const PUSH_DELIVERY_CHANNELS = new Set([
  'apns',
  'bark',
  'ios-push',
  'push',
  'push-notification',
  'push_notification',
  'web-push',
  'web_push',
]);

// ── HTML sanitization helpers ────────────────────────────────────────────────

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeHtmlEntities(text: string): string {
  // Named + numeric entities
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Strip HTML tags and decode entities — returns plain text. */
function cleanHtml(raw: string): string {
  // Remove all HTML tags, then decode entities, then collapse whitespace
  return decodeHtmlEntities(raw.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

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

    // Refresh failed → clear stale cookies silently, don't redirect
    // The user can continue browsing as unauthenticated
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
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

function normalizeDeliveryChannelName(channel: string): string {
  return channel.trim().toLowerCase();
}

function mapDeliveryChannels(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const channels = raw.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [normalizeDeliveryChannelName(entry)];
    }

    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const channel = 'channel' in entry && typeof entry.channel === 'string'
      ? entry.channel
      : 'type' in entry && typeof entry.type === 'string'
        ? entry.type
        : null;
    const ok = !('ok' in entry) || entry.ok !== false;

    return channel && ok ? [normalizeDeliveryChannelName(channel)] : [];
  });

  return Array.from(new Set(channels));
}

function mapPushedState(
  event: Record<string, unknown>,
  metadata: Record<string, unknown>,
  deliveryChannels: string[],
): boolean {
  if (typeof event.pushed === 'boolean') {
    return event.pushed;
  }

  if (typeof metadata.pushed === 'boolean') {
    return metadata.pushed;
  }

  return deliveryChannels.some((channel) => PUSH_DELIVERY_CHANNELS.has(channel));
}

function mapLlmEnrichment(meta: Record<string, unknown>): LlmEnrichment | null {
  // Try nested llm_enrichment first, fall back to top-level metadata fields
  const raw = (meta.llm_enrichment as Record<string, unknown> | undefined) ?? meta;

  // Check if there's actually any enrichment data present
  const hasEnrichment = raw.summary || raw.impact || raw.whyNow || raw.why_now
    || raw.risks || raw.action || raw.actionLabel || raw.action_label
    || raw.tickers || raw.regimeContext || raw.regime_context
    || raw.filingItems || raw.filing_items;
  if (!hasEnrichment) return null;

  const rawTickers = (raw.tickers ?? []) as Array<string | Record<string, unknown>>;
  const tickers: EnrichmentTicker[] = rawTickers
    .filter((t) => typeof t === 'object' || typeof t === 'string')
    .map((t) => {
      if (typeof t === 'string') return { symbol: t, direction: 'neutral' };
      return {
        symbol: (t.symbol as string) ?? (t.ticker as string) ?? '',
        direction: (t.direction as string) ?? 'neutral',
        context: (t.context as string) ?? undefined,
      };
    });

  return {
    summary: (raw.summary as string | null) ?? null,
    impact: (raw.impact as string | null) ?? null,
    whyNow: (raw.whyNow as string | null) ?? (raw.why_now as string | null) ?? null,
    currentSetup: (raw.currentSetup as string | null) ?? (raw.current_setup as string | null) ?? null,
    historicalContext:
      (raw.historicalContext as string | null)
      ?? (raw.historical_context as string | null)
      ?? null,
    risks: (raw.risks as string | null) ?? null,
    action: (raw.action as string | null) ?? (raw.actionLabel as string | null) ?? (raw.action_label as string | null) ?? null,
    tickers,
    regimeContext: (raw.regimeContext as string | null) ?? (raw.regime_context as string | null) ?? null,
    filingItems: Array.isArray(raw.filingItems) ? raw.filingItems as string[]
      : Array.isArray(raw.filing_items) ? raw.filing_items as string[]
      : undefined,
  };
}

function mapHistoricalContext(meta: Record<string, unknown>): HistoricalContext | null {
  const raw = (meta.historical_context ?? meta.historicalContext) as Record<string, unknown> | undefined;
  if (!raw) return null;

  const bestRaw = raw.bestCase as Record<string, unknown> | undefined;
  const worstRaw = raw.worstCase as Record<string, unknown> | undefined;
  const hasDeliveryShape = typeof raw.patternSummary === 'string'
    || Array.isArray(raw.topMatches)
    || typeof bestRaw?.alphaT20 === 'number'
    || typeof worstRaw?.alphaT20 === 'number';
  const rawSimilar = (
    raw.similarEvents
    ?? raw.similar_events
    ?? raw.mostSimilar
    ?? raw.topMatches
    ?? []
  ) as Array<Record<string, unknown>>;
  const similarEvents: SimilarEvent[] = rawSimilar.map((s) => ({
    title: cleanHtml((s.title as string) ?? (s.headline as string) ?? (s.description as string) ?? ''),
    date: (s.date as string) ?? (s.eventDate as string) ?? (s.eventTime as string) ?? '',
    move: (s.move as string)
      ?? normalizeHistoricalMove(
        (s.movePercent as number | undefined)
        ?? (s.alphaT20 as number | undefined)
        ?? (s.change1w as number | undefined)
        ?? (s.change1d as number | undefined),
        hasDeliveryShape,
      ),
  }));

  return {
    patternLabel: (raw.patternLabel as string | null)
      ?? (raw.pattern_label as string | null)
      ?? (raw.patternSummary as string | null)
      ?? (raw.label as string | null)
      ?? null,
    confidence: (raw.confidence as string | null) ?? null,
    matchCount: typeof raw.matchCount === 'number' ? raw.matchCount
      : typeof raw.match_count === 'number' ? raw.match_count
      : typeof raw.caseCount === 'number' ? raw.caseCount
      : similarEvents.length,
    avgAlphaT5: typeof raw.avgAlphaT5 === 'number'
      ? normalizeHistoricalPercent(raw.avgAlphaT5, hasDeliveryShape)
      : typeof raw.avg_alpha_t5 === 'number'
        ? normalizeHistoricalPercent(raw.avg_alpha_t5, hasDeliveryShape)
      : null,
    avgAlphaT20: typeof raw.avgAlphaT20 === 'number'
      ? normalizeHistoricalPercent(raw.avgAlphaT20, hasDeliveryShape)
      : typeof raw.avg_alpha_t20 === 'number'
        ? normalizeHistoricalPercent(raw.avg_alpha_t20, hasDeliveryShape)
      : null,
    winRateT20: typeof raw.winRateT20 === 'number' ? raw.winRateT20
      : typeof raw.win_rate_t20 === 'number' ? raw.win_rate_t20
      : typeof raw.winRate === 'number' ? raw.winRate
      : null,
    bestCase: bestRaw ? {
      ticker: (bestRaw.ticker as string) ?? '',
      move: normalizeHistoricalPercent(
        (bestRaw.move as number | undefined) ?? (bestRaw.alphaT20 as number | undefined) ?? 0,
        hasDeliveryShape && typeof bestRaw.alphaT20 === 'number',
      ),
    } : null,
    worstCase: worstRaw ? {
      ticker: (worstRaw.ticker as string) ?? '',
      move: normalizeHistoricalPercent(
        (worstRaw.move as number | undefined) ?? (worstRaw.alphaT20 as number | undefined) ?? 0,
        hasDeliveryShape && typeof worstRaw.alphaT20 === 'number',
      ),
    } : null,
    similarEvents,
  };
}

function normalizeHistoricalPercent(value: number, treatAsFraction: boolean): number {
  return treatAsFraction ? Number((value * 100).toFixed(1)) : value;
}

function normalizeHistoricalMove(value: number | undefined, treatAsFraction: boolean): string {
  if (typeof value !== 'number') return '';
  const normalized = normalizeHistoricalPercent(value, treatAsFraction);
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1)}%`;
}

function mapHistoricalPattern(raw: Record<string, unknown> | undefined): EventDetailData['historicalPattern'] | null {
  if (!raw) return null;

  const similarEvents = ((raw.similarEvents ?? []) as Array<Record<string, unknown>>).map((item) => ({
    title: cleanHtml((item.title as string) ?? ''),
    date: (item.date as string) ?? '',
    move: (item.move as string) ?? '',
  }));

  const bestRaw = raw.bestCase as Record<string, unknown> | undefined;
  const worstRaw = raw.worstCase as Record<string, unknown> | undefined;

  return {
    matchCount: typeof raw.matchCount === 'number' ? raw.matchCount : 0,
    confidence: (raw.confidence as string | null) ?? 'low',
    avgMoveT5: typeof raw.avgMoveT5 === 'number' ? raw.avgMoveT5 : null,
    avgMoveT20: typeof raw.avgMoveT20 === 'number' ? raw.avgMoveT20 : null,
    winRate: typeof raw.winRate === 'number' ? raw.winRate : null,
    similarEvents,
    patternSummary: typeof raw.patternSummary === 'string' ? raw.patternSummary : undefined,
    bestCase: bestRaw ? { ticker: String(bestRaw.ticker ?? ''), move: Number(bestRaw.move ?? 0) } : null,
    worstCase: worstRaw ? { ticker: String(worstRaw.ticker ?? ''), move: Number(worstRaw.move ?? 0) } : null,
  };
}

function mapMarketData(raw: Record<string, unknown> | undefined): EventMarketData | null {
  if (!raw) return null;

  const price = Number(raw.price);
  const change1d = Number(raw.change1d);
  const change5d = Number(raw.change5d);
  const rsi14 = Number(raw.rsi14);
  const volumeRatio = Number(raw.volumeRatio);

  if ([price, change1d, change5d, rsi14, volumeRatio].some((value) => Number.isNaN(value))) {
    return null;
  }

  const high52w = raw.high52w != null ? Number(raw.high52w) : undefined;
  const low52w = raw.low52w != null ? Number(raw.low52w) : undefined;

  return {
    price,
    change1d,
    change5d,
    rsi14,
    volumeRatio,
    ...(high52w != null && !Number.isNaN(high52w) ? { high52w } : {}),
    ...(low52w != null && !Number.isNaN(low52w) ? { low52w } : {}),
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

    // Extract enrichment data from metadata
    const enrichment = mapLlmEnrichment(meta);
    const historical = mapHistoricalContext(meta);
    const responseHistoricalPattern = mapHistoricalPattern(e.historicalPattern as Record<string, unknown> | undefined);
    const marketData = mapMarketData(e.marketData as Record<string, unknown> | undefined);

    // Try to get similar events from API as fallback
    let apiSimilarEvents: SimilarEvent[] = [];
    try {
      const simData = await apiFetch(`/events/${id}/similar`);
      const simEvents = simData.data ?? simData.events ?? simData ?? [];
      apiSimilarEvents = simEvents.slice(0, 5).map((s: Record<string, unknown>) => ({
        title: cleanHtml((s.title as string) ?? ''),
        date: (s.receivedAt as string) ?? (s.createdAt as string) ?? '',
        move: '',
      }));
    } catch {
      // No similar events available
    }

    // Merge similar events: prefer historical context, fall back to API
    const similarEvents = historical?.similarEvents.length
      ? historical.similarEvents
      : responseHistoricalPattern?.similarEvents.length
        ? responseHistoricalPattern.similarEvents
        : apiSimilarEvents;

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

    // Use enrichment tickers for directions if available
    const tickerDirections = enrichment?.tickers.length
      ? enrichment.tickers.map((t) => ({
          symbol: t.symbol,
          direction: t.direction,
          context: t.context ?? '',
        }))
      : tickers.map((t) => ({
          symbol: t,
          direction: (meta.direction as string) ?? 'neutral',
          context: '',
        }));

    // Similar events can exist without enough evidence for a real historical pattern.
    const matchCount = historical?.matchCount ?? responseHistoricalPattern?.matchCount ?? 0;
    const historicalConfidence = historical?.confidence
      ?? responseHistoricalPattern?.confidence
      ?? 'insufficient';

    return {
      id: e.id as string,
      severity: (e.severity as string) ?? 'MEDIUM',
      source: mapSource(source),
      sourceKey: source,
      title: cleanHtml((e.title as string) ?? ''),
      tickers,
      time: (e.receivedAt as string) ?? (e.createdAt as string) ?? new Date().toISOString(),
      url: (e.sourceUrls as string[])?.[0] ?? (meta.url as string) ?? null,
      sourceMetadata: extractSourceMetadataClient(source, meta, (e.eventType as string) ?? null),
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
            title: cleanHtml((item.title as string) ?? ''),
            receivedAt:
              (item.receivedAt as string)
              ?? (item.createdAt as string)
              ?? new Date().toISOString(),
            url: (item.url as string) ?? null,
          }))
        : [],
      aiAnalysis: {
        summary: cleanHtml(enrichment?.summary ?? (e.summary as string) ?? ''),
        impact: enrichment?.impact ?? (meta.impact as string) ?? null,
        tickerDirections,
      },
      marketData,
      enrichment,
      historicalPattern: {
        matchCount,
        confidence: historicalConfidence,
        avgMoveT5: historical?.avgAlphaT5 ?? responseHistoricalPattern?.avgMoveT5 ?? null,
        avgMoveT20: historical?.avgAlphaT20 ?? responseHistoricalPattern?.avgMoveT20 ?? null,
        winRate: historical?.winRateT20 ?? responseHistoricalPattern?.winRate ?? null,
        similarEvents,
        patternSummary: historical?.patternLabel ?? undefined,
        bestCase: historical?.bestCase ?? null,
        worstCase: historical?.worstCase ?? null,
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

export async function getEventOutcome(eventId: string): Promise<EventOutcome | null> {
  try {
    const data = await apiFetch(`/v1/outcomes/${eventId}`);
    if (!data) return null;
    return {
      eventId: (data.eventId as string) ?? (data.event_id as string) ?? eventId,
      ticker: (data.ticker as string) ?? '',
      eventTime: (data.eventTime as string) ?? (data.event_time as string) ?? '',
      eventPrice: data.eventPrice != null ? Number(data.eventPrice ?? data.event_price) : null,
      price1d: data.price1d != null ? Number(data.price1d ?? data.price_1d) : null,
      priceT5: data.priceT5 != null ? Number(data.priceT5 ?? data.price_t5) : null,
      priceT20: data.priceT20 != null ? Number(data.priceT20 ?? data.price_t20) : null,
      change1d: data.change1d != null ? Number(data.change1d ?? data.change_1d) : null,
      changeT5: data.changeT5 != null ? Number(data.changeT5 ?? data.change_t5) : null,
      changeT20: data.changeT20 != null ? Number(data.changeT20 ?? data.change_t20) : null,
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

export async function searchEvents(q: string, limit = 50): Promise<AlertSummary[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const searchLimit = Math.min(limit, 50);
  const isTickerLike = /^[A-Z]{1,5}$/.test(trimmed);
  const requests: Array<Promise<Record<string, unknown>[]>> = [];

  if (isTickerLike) {
    requests.push(
      apiFetch(`/events?ticker=${encodeURIComponent(trimmed)}&limit=${searchLimit}`).then((data) => data.data ?? []),
    );
  }

  requests.push(
    apiFetch(`/events?q=${encodeURIComponent(trimmed)}&limit=${searchLimit}`).then((data) => data.data ?? []),
  );

  const events = (await Promise.all(requests)).flat();
  const mapped = events.map(mapAlertSummary);

  // Deduplicate by title+source to avoid floods of identical entries (e.g. StockTwits trending)
  const seen = new Set<string>();
  return mapped.filter((alert: AlertSummary) => {
    const key = `${alert.title}::${alert.sourceKey ?? alert.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    name: (w.name as string | null) ?? null,
    sectionId: (w.sectionId as string | null) ?? (w.section_id as string | null) ?? null,
    sortOrder: typeof w.sortOrder === 'number' ? w.sortOrder : (typeof w.sort_order === 'number' ? w.sort_order : 0),
  }));
}

export async function addToWatchlist(ticker: string): Promise<WatchlistItem> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;

  const res = await fetch(`${API_BASE}/watchlist`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ ticker: ticker.toUpperCase() }),
  });

  // 409 = duplicate — ticker already on watchlist, treat as success
  if (res.status === 409) {
    return { id: '', ticker: ticker.toUpperCase(), addedAt: new Date().toISOString(), notes: null };
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  await apiFetch(`/watchlist/${ticker.toUpperCase()}`, { method: 'DELETE' });
}

export async function updateWatchlistItem(
  ticker: string,
  data: { notes?: string; sectionId?: string | null },
): Promise<WatchlistItem> {
  return apiFetch(`/watchlist/${ticker.toUpperCase()}`, { method: 'PATCH', body: data });
}

export async function bulkAddWatchlist(
  tickers: Array<{ ticker: string; sectionId?: string; notes?: string }>,
): Promise<{ added: number; skipped: number }> {
  return apiFetch('/watchlist/bulk', { method: 'POST', body: { tickers } });
}

// ── Watchlist Sections API ───────────────────────────────────────────────────

export async function getWatchlistSections(): Promise<WatchlistSection[]> {
  const data = await apiFetch('/watchlist/sections');
  return (data.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    name: s.name as string,
    color: (s.color as string) ?? 'gray',
    sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : (typeof s.sort_order === 'number' ? s.sort_order : 0),
  }));
}

export async function createWatchlistSection(name: string, color?: string): Promise<WatchlistSection> {
  const body: Record<string, string> = { name };
  if (color) body.color = color;
  return apiFetch('/watchlist/sections', { method: 'POST', body });
}

export async function updateWatchlistSection(
  id: string,
  data: Partial<{ name: string; color: string; sortOrder: number }>,
): Promise<WatchlistSection> {
  return apiFetch(`/watchlist/sections/${id}`, { method: 'PATCH', body: data });
}

export async function deleteWatchlistSection(id: string): Promise<void> {
  await apiFetch(`/watchlist/sections/${id}`, { method: 'DELETE' });
}

export async function reorderWatchlist(
  items: Array<{ ticker: string; sortOrder: number; sectionId?: string | null }>,
): Promise<void> {
  await apiFetch('/watchlist/reorder', { method: 'PATCH', body: { items } });
}

// ── Ticker Search API ────────────────────────────────────────────────────────

export interface TickerSearchResult {
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string | null;
}

export interface TrendingTicker {
  ticker: string;
  eventCount: number;
  name: string | null;
  sector: string | null;
}

export async function searchTickers(query: string, limit = 8): Promise<TickerSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await apiFetch(`/tickers/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`, { public: true });
  return data.data ?? [];
}

export async function getTrendingTickers(limit = 8): Promise<TrendingTicker[]> {
  const data = await apiFetch(`/tickers/trending?limit=${limit}`, { public: true });
  return data.data ?? [];
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

// ── History / Browse API ─────────────────────────────────────────────────────

export interface HistoryParams {
  from?: string;
  to?: string;
  type?: string;
  severity?: string;
  source?: string;
  ticker?: string;
  limit?: number;
  offset?: number;
}

export interface HistoryResponse {
  alerts: AlertSummary[];
  total: number;
}

export async function getHistoricalEvents(params: HistoryParams): Promise<HistoryResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.type) qs.set('type', params.type);
  if (params.severity) qs.set('severity', params.severity);
  if (params.source) qs.set('source', params.source);
  if (params.ticker) qs.set('ticker', params.ticker);
  qs.set('limit', String(params.limit ?? 50));
  qs.set('offset', String(params.offset ?? 0));

  const data = await apiFetch(`/events?${qs.toString()}`, { public: true });
  const events: Record<string, unknown>[] = data.data ?? data.events ?? [];
  const alerts = events.map(mapAlertSummary);

  return {
    alerts,
    total: typeof data.total === 'number' ? data.total : alerts.length,
  };
}

const HIDDEN_SOURCES = new Set(['dummy', 'test', 'internal']);

export async function getEventSources(): Promise<string[]> {
  const data = await apiFetch('/events/sources');
  const raw: string[] = data.sources ?? [];
  return [...new Set(raw.filter((s) => !HIDDEN_SOURCES.has(s)).map(mapSource))].sort();
}

function mapAlertSummary(event: Record<string, unknown>): AlertSummary {
  const source = (event.source as string) ?? 'unknown';
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  const audit = (event.audit ?? {}) as Record<string, unknown>;
  const tickers = (event.tickers as string[] | undefined)
    ?? (metadata.tickers as string[] | undefined)
    ?? (metadata.ticker ? [metadata.ticker as string] : []);
  const deliveryChannels = mapDeliveryChannels(
    event.deliveryChannels
    ?? metadata.deliveryChannels
    ?? metadata.delivery_channels
    ?? audit.deliveryChannels,
  );

  const rawTitle = cleanHtml((event.title as string) ?? '');
  const rawSummary = cleanHtml((event.summary as string) ?? '');
  // Don't duplicate: if summary equals title, leave it empty
  const summary = rawSummary === rawTitle ? '' : rawSummary;

  return {
    id: event.id as string,
    severity: (event.severity as string) ?? 'MEDIUM',
    source: mapSource(source),
    sourceKey: source,
    title: rawTitle,
    tickers,
    summary,
    time: (event.time as string) ?? (event.receivedAt as string) ?? (event.createdAt as string) ?? new Date().toISOString(),
    saved: false,
    direction: (event.direction as string | undefined) ?? (metadata.direction as string | undefined) ?? undefined,
    confidence: typeof event.confidence === 'number' ? event.confidence : null,
    confidenceBucket: (event.confidenceBucket as string | undefined) ?? null,
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
    sourceMetadata: (event.sourceMetadata as Record<string, unknown>) ?? undefined,
    pushed: mapPushedState(event, metadata, deliveryChannels),
    deliveryChannels,
    eventPrice: typeof event.eventPrice === 'number' ? event.eventPrice : null,
    change1d: typeof event.change1d === 'number' ? event.change1d : null,
    change5d: typeof event.change5d === 'number' ? event.change5d : null,
    change20d: typeof event.change20d === 'number' ? event.change20d : null,
    price1d: typeof event.price1d === 'number' ? event.price1d : null,
    price5d: typeof event.price5d === 'number' ? event.price5d : null,
    price20d: typeof event.price20d === 'number' ? event.price20d : null,
  };
}

function extractSourceMetadataClient(
  source: string,
  meta: Record<string, unknown>,
  eventType: string | null,
): Record<string, unknown> | undefined {
  switch (source) {
    case 'breaking-news': {
      const r: Record<string, unknown> = {};
      if (meta.url != null) r.url = meta.url;
      if (meta.headline != null) r.headline = meta.headline;
      if (meta.source_feed != null) r.sourceFeed = meta.source_feed;
      return Object.keys(r).length ? r : undefined;
    }
    case 'sec-edgar': {
      const r: Record<string, unknown> = {};
      if (meta.form_type != null) r.formType = meta.form_type;
      const companyName = meta.company_name ?? meta.issuer_name;
      if (companyName != null) r.companyName = companyName;
      if (meta.filing_link != null) r.filingLink = meta.filing_link;
      if (meta.item_descriptions != null) r.itemDescriptions = meta.item_descriptions;
      return Object.keys(r).length ? r : undefined;
    }
    case 'trading-halt': {
      const r: Record<string, unknown> = {};
      if (meta.haltReasonCode != null) r.haltReasonCode = meta.haltReasonCode;
      if (meta.haltReasonDescription != null) r.haltReasonDescription = meta.haltReasonDescription;
      if (meta.haltTime != null) r.haltTime = meta.haltTime;
      if (meta.resumeTime != null) r.resumeTime = meta.resumeTime;
      if (meta.market != null) r.market = meta.market;
      if (Object.keys(r).length === 0) return undefined;
      r.isResume = eventType === 'resume';
      return r;
    }
    case 'econ-calendar': {
      const r: Record<string, unknown> = {};
      if (meta.indicator_name != null) r.indicatorName = meta.indicator_name;
      if (meta.scheduled_time != null) r.scheduledTime = meta.scheduled_time;
      if (meta.frequency != null) r.frequency = meta.frequency;
      if (meta.tags != null) r.tags = meta.tags;
      return Object.keys(r).length ? r : undefined;
    }
    case 'stocktwits': {
      const r: Record<string, unknown> = {};
      if (meta.current_volume != null) r.currentVolume = meta.current_volume;
      if (meta.previous_volume != null) r.previousVolume = meta.previous_volume;
      if (meta.ratio != null) r.ratio = meta.ratio;
      return Object.keys(r).length ? r : undefined;
    }
    case 'reddit': {
      const r: Record<string, unknown> = {};
      if (meta.upvotes != null) r.upvotes = meta.upvotes;
      if (meta.comments != null) r.comments = meta.comments;
      if (meta.high_engagement != null) r.highEngagement = meta.high_engagement;
      return Object.keys(r).length ? r : undefined;
    }
    default:
      return undefined;
  }
}

export function mapSource(source: string): string {
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
    'x': 'X/Twitter',
    'x-scanner': 'X/Twitter',
    'warn': 'WARN Act',
    'warn-act': 'WARN Act',
    'cfpb': 'CFPB',
    'fed': 'Federal Reserve',
    'fedwatch': 'CME FedWatch',
    'trading-halt': 'Trading Halt',
    'ftc': 'FTC',
    'sec-regulatory': 'SEC Regulatory',
    'manual': 'Manual',
    'doj': 'DOJ',
    'company-ir': 'Company IR',
    'dilution-monitor': 'Dilution Monitor',
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
