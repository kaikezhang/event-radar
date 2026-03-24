import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService, HistoricalContext } from './types.js';
import { extractHaltMetadata, extractNewsMetadata, extractSecMetadata } from './source-metadata.js';

export interface DiscordConfig {
  /** Discord webhook URL. */
  webhookUrl: string;
  retryDelays?: number[];
}

const SEVERITY_COLOR: Record<Severity, number> = {
  CRITICAL: 0xed4245, // red
  HIGH: 0xf57c00, // orange
  MEDIUM: 0xfee75c, // yellow
  LOW: 0x57f287, // green
};

const TIER_COLOR: Record<string, number> = {
  critical: 0xed4245, // red
  high: 0xf57c00, // orange
  feed: 0xfee75c, // yellow
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
};

/** Map source to a readable badge */
const SOURCE_BADGE: Record<string, string> = {
  'whitehouse': '🏛️ White House',
  'congress': '🏛️ Congress',
  'sec-edgar': '📋 SEC Filing',
  'sec-regulatory': '📋 SEC',
  'fda': '💊 FDA',
  'doj-antitrust': '⚖️ DOJ Antitrust',
  'ftc': '⚖️ FTC',
  'fed': '🏦 Federal Reserve',
  'treasury': '🏦 Treasury',
  'commerce': '🏢 Commerce Dept',
  'federal-register': '📜 Federal Register',
  'unusual-options': '🎯 Unusual Options',
  'short-interest': '📉 Short Interest',
  'breaking-news': '📰 Breaking News',
  'reddit': '💬 Reddit',
  'stocktwits': '💬 StockTwits',
  'truth-social': '📢 Truth Social',
  'x-scanner': '📢 X/Twitter',
  'analyst': '📊 Analyst',
  'earnings': '📈 Earnings',
  'econ-calendar': '📅 Economic Data',
  'fedwatch': '📊 FedWatch',
};

const DEFAULT_RETRY_DELAYS = [1_000, 5_000, 30_000];

type DeliveryTier = 'critical' | 'high' | 'feed';

export class DiscordWebhook implements DeliveryService {
  readonly name = 'discord';
  private readonly webhookUrl: string;
  private readonly retryDelays: number[];

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
    this.retryDelays = config.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  async send(alert: AlertEvent): Promise<void> {
    const tier: DeliveryTier = alert.deliveryTier ?? 'high';

    // --- Compact title ---
    const title = buildCompactTitle(alert);

    // --- Description: source-specific template ---
    const description = buildDescription(alert, tier);

    // --- Color based on tier (or severity fallback) ---
    const color = alert.deliveryTier
      ? TIER_COLOR[alert.deliveryTier]
      : SEVERITY_COLOR[alert.severity];

    // --- Optional fields (minimal) ---
    const fields = buildFields(alert);

    // --- Footer: source badge ---
    const sourceBadge = SOURCE_BADGE[alert.event.source] ?? `📡 ${alert.event.source}`;

    const truncatedTitle = truncate(title, 256);
    let truncatedDesc = description;

    // Aggregate embed size check — Discord limit is 6000, we target 5500 for safety
    const fieldsSize = fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    const footerSize = sourceBadge.length;
    const overhead = truncatedTitle.length + fieldsSize + footerSize;
    const maxDesc = Math.min(2048, 5500 - overhead);
    if (truncatedDesc.length > maxDesc) {
      truncatedDesc = truncate(truncatedDesc, Math.max(200, maxDesc));
    }

    const embed = {
      title: truncatedTitle,
      description: truncatedDesc,
      color,
      fields: fields.length > 0 ? fields : undefined,
      timestamp: alert.event.timestamp.toISOString(),
      footer: {
        text: sourceBadge,
      },
    };

    await this.sendWithRetry(JSON.stringify({
      username: 'Event Radar',
      embeds: [embed],
    }));
  }

  private async sendWithRetry(payload: string): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt += 1) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Discord webhook failed (${response.status}): ${text}`);
        }

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.retryDelays.length) {
          await sleep(this.retryDelays[attempt]);
        }
      }
    }

    throw lastError!;
  }
}

// ── Fields (shared across all templates) ──────────────────────

function buildFields(alert: AlertEvent): Array<{ name: string; value: string; inline: boolean }> {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  const enrichment = alert.enrichment;
  const ticker = extractPrimaryTicker(alert);
  const sourceBadge = SOURCE_BADGE[alert.event.source] ?? `📡 ${alert.event.source}`;
  const eventDetailUrl = buildEventDetailUrl(alert);

  if (ticker) {
    fields.push({ name: 'Ticker', value: ticker, inline: true });
  }

  fields.push({ name: 'Severity', value: alert.severity, inline: true });
  fields.push({ name: 'Source', value: sourceBadge, inline: true });

  if (enrichment?.summary) {
    fields.push({
      name: 'Analysis',
      value: truncate(enrichment.summary, 256),
      inline: false,
    });
  }

  if (eventDetailUrl) {
    fields.push({
      name: 'Event Detail',
      value: `[Open in Event Radar](${eventDetailUrl})`,
      inline: false,
    });
  }

  // Multiple tickers (when more than one)
  if (enrichment?.tickers && enrichment.tickers.length > 1) {
    const eventPrice = alert.event.metadata?.['event_price'];
    const priceStr = typeof eventPrice === 'number' ? ` @ $${eventPrice.toFixed(2)}` : '';
    const tickerDisplay = enrichment.tickers
      .map((t) => `**${t.symbol}** ${t.direction === 'bullish' ? '📈' : t.direction === 'bearish' ? '📉' : '➡️'}`)
      .join('  ');
    fields.push({ name: 'Tickers', value: `${tickerDisplay}${priceStr}`, inline: false });
  }

  // Confirmation (multi-source)
  if ((alert.confirmationCount ?? 1) > 1) {
    fields.push({
      name: `✓ Confirmed by ${alert.confirmationCount} sources`,
      value: (alert.confirmedSources ?? []).join(', '),
      inline: false,
    });
  }

  // Source link
  if (alert.event.url) {
    fields.push({
      name: '🔗 Source',
      value: `[View Original](${alert.event.url})`,
      inline: false,
    });
  }

  return fields;
}

function extractPrimaryTicker(alert: AlertEvent): string | null {
  if (alert.ticker) {
    return alert.ticker;
  }

  const metadataTicker = alert.event.metadata?.['ticker'];
  if (typeof metadataTicker === 'string' && metadataTicker.trim().length > 0) {
    return metadataTicker.trim().toUpperCase();
  }

  const metadataTickers = alert.event.metadata?.['tickers'];
  if (Array.isArray(metadataTickers)) {
    const firstTicker = metadataTickers.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof firstTicker === 'string') {
      return firstTicker.trim().toUpperCase();
    }
  }

  const enrichmentTicker = alert.enrichment?.tickers[0]?.symbol;
  return typeof enrichmentTicker === 'string' && enrichmentTicker.trim().length > 0
    ? enrichmentTicker.trim().toUpperCase()
    : null;
}

function buildEventDetailUrl(alert: AlertEvent): string | null {
  const eventId = alert.storedEventId ?? alert.event.id;
  if (!eventId) {
    return null;
  }

  const appUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return `${appUrl}/event/${eventId}`;
}

// ── Title ─────────────────────────────────────────────────────

function buildCompactTitle(alert: AlertEvent): string {
  const enrichment = alert.enrichment;

  if (enrichment?.tickers?.length) {
    const primary = enrichment.tickers[0];
    const dirEmoji = primary.direction === 'bullish' ? '📈'
      : primary.direction === 'bearish' ? '📉'
      : '➡️';
    const label = compactActionLabel(enrichment.action, primary.direction);
    return `${dirEmoji} ${primary.symbol} — ${label}`;
  }

  if (alert.ticker && enrichment?.action) {
    const label = compactActionLabel(enrichment.action);
    return `${SEVERITY_EMOJI[alert.severity]} ${alert.ticker} — ${label}`;
  }

  return `${SEVERITY_EMOJI[alert.severity]} ${alert.event.title}`;
}

function compactActionLabel(action: string | undefined, direction?: string): string {
  if (!action) return 'Alert';
  if (action.startsWith('🔴')) {
    if (direction === 'bearish') return 'Bearish Setup';
    if (direction === 'bullish') return 'Bullish Setup';
    return 'High-Quality Setup';
  }
  if (action.startsWith('🟡')) return 'Monitor';
  if (action.startsWith('🟢')) return 'Background';
  return action;
}

// ── Template router ───────────────────────────────────────────

function buildDescription(alert: AlertEvent, tier: DeliveryTier): string {
  switch (alert.event.source) {
    case 'breaking-news': return buildBreakingNewsDescription(alert, tier);
    case 'sec-edgar': return buildSecFilingDescription(alert, tier);
    case 'trading-halt': return buildTradingHaltDescription(alert, tier);
    case 'econ-calendar': return buildEconDataDescription(alert, tier);
    case 'reddit':
    case 'stocktwits': return buildSocialDescription(alert, tier);
    default: return buildDefaultDescription(alert, tier);
  }
}

// ── Breaking News ─────────────────────────────────────────────

function buildBreakingNewsDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;
  const news = extractNewsMetadata(alert.event);

  // Source header: 📰 Breaking News · CNBC · 2m ago
  const sourceLabel = news.sourceFeed ? ` · ${news.sourceFeed}` : '';
  const timeAgo = relativeTime(alert.event.timestamp);
  parts.push(`📰 Breaking News${sourceLabel} · ${timeAgo}`);
  parts.push('');

  // Headline
  parts.push(alert.event.title);

  // Quoted original text from summary or body
  const quoteText = alert.event.body || enrichment?.summary;
  if (quoteText) {
    parts.push('');
    const trimmed = quoteText.length > 300 ? quoteText.slice(0, 297) + '...' : quoteText;
    parts.push(`> ${trimmed.replace(/\n/g, '\n> ')}`);
  }

  // Direction badge
  parts.push('');
  parts.push(directionBadge(alert));

  // "Why it matters" from enrichment.impact
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**Why it matters:** ${enrichment.impact}`);
  }

  // Risk — critical/high tier
  if ((tier === 'critical' || tier === 'high') && enrichment?.risks) {
    parts.push('');
    parts.push(`**Risk:** ${enrichment.risks}`);
  }

  // Historical stats — critical/high tier
  appendHistoricalStats(parts, alert, tier);

  return truncate(parts.join('\n'), 2048);
}

// ── SEC Filing ────────────────────────────────────────────────

function buildSecFilingDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;
  const sec = extractSecMetadata(alert.event);

  // Header: 📋 SEC Filing · 8-K · 5m ago
  const formLabel = sec.formType ? ` · ${sec.formType}` : '';
  const timeAgo = relativeTime(alert.event.timestamp);
  parts.push(`📋 SEC Filing${formLabel} · ${timeAgo}`);
  parts.push('');

  // Headline
  parts.push(alert.event.title);

  // Item types
  if (sec.itemDescriptions?.length) {
    parts.push('');
    for (const desc of sec.itemDescriptions) {
      parts.push(`📄 ${desc}`);
    }
  } else if (sec.itemTypes?.length) {
    parts.push('');
    for (const item of sec.itemTypes) {
      parts.push(`📄 Item ${item}`);
    }
  }

  // Company name
  if (sec.companyName) {
    parts.push('');
    const cikStr = sec.cik ? ` (CIK: ${sec.cik})` : '';
    parts.push(`Company: ${sec.companyName}${cikStr}`);
  }

  // Direction badge
  parts.push('');
  parts.push(directionBadge(alert));

  // "What this means" (different framing for filings)
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**What this means:** ${enrichment.impact}`);
  }

  // Historical stats — critical/high tier
  appendHistoricalStats(parts, alert, tier);

  return truncate(parts.join('\n'), 2048);
}

// ── Trading Halt ──────────────────────────────────────────────

function buildTradingHaltDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;
  const halt = extractHaltMetadata(alert.event);

  // Header varies for halt vs resume events
  const isResume = alert.event.type === 'resume';
  const marketLabel = halt.market ? ` · ${halt.market}` : '';
  if (isResume) {
    const resumeLabel = halt.resumeTime ? ` · ${halt.resumeTime}` : '';
    parts.push(`🔓 Trading Resumed${marketLabel}${resumeLabel}`);
  } else {
    parts.push(`🔒 Trading Halt${marketLabel} · NOW`);
  }
  parts.push('');

  // Headline
  parts.push(alert.event.title);

  // Halt/resume details
  parts.push('');
  if (halt.haltReasonDescription || halt.haltReasonCode) {
    const reason = halt.haltReasonDescription ?? halt.haltReasonCode!;
    const codeStr = halt.haltReasonCode && halt.haltReasonDescription ? ` (${halt.haltReasonCode})` : '';
    parts.push(`⏸ Reason: ${reason}${codeStr}`);
  }
  if (halt.haltTime) {
    parts.push(`⏱ Halted at: ${halt.haltTime}`);
  }
  if (isResume && halt.resumeTime) {
    parts.push(`▶️ Resumed at: ${halt.resumeTime}`);
  } else if (!isResume && halt.resumeTime) {
    parts.push(`▶️ Resume: ${halt.resumeTime}`);
  }
  if (halt.isLULD) {
    parts.push(`⚡ LULD Circuit Breaker`);
  }

  const eventPrice = alert.event.metadata?.['event_price'];
  if (typeof eventPrice === 'number') {
    parts.push(`📊 Last price: $${eventPrice.toFixed(2)}`);
  }

  // Direction badge
  parts.push('');
  parts.push(directionBadge(alert));

  // "What typically happens" from enrichment
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**What typically happens:** ${enrichment.impact}`);
  }

  // Historical stats — critical/high tier
  appendHistoricalStats(parts, alert, tier);

  return truncate(parts.join('\n'), 2048);
}

// ── Economic Data ─────────────────────────────────────────────

function buildEconDataDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;

  // Header: 📊 Economic Data · 15m ago
  const timeAgo = relativeTime(alert.event.timestamp);
  parts.push(`📊 Economic Data · ${timeAgo}`);
  parts.push('');

  // Headline
  parts.push(alert.event.title);

  // Indicator details from real scanner metadata
  const m = alert.event.metadata ?? {};
  const indicatorName = m.indicator_name as string | undefined;
  const scheduledTime = m.scheduled_time as string | undefined;
  const frequency = m.frequency as string | undefined;
  const tags = m.tags as string[] | undefined;

  if (indicatorName || scheduledTime || frequency) {
    parts.push('');
    if (indicatorName) parts.push(`📋 Indicator: ${indicatorName}`);
    if (scheduledTime) {
      const formatted = formatScheduledTime(scheduledTime);
      parts.push(`⏱ Scheduled: ${formatted}`);
    }
    if (frequency) parts.push(`🔄 Frequency: ${frequency}`);
    if (tags?.length) parts.push(`🏷️ Tags: ${tags.join(', ')}`);
  }

  // Direction badge
  parts.push('');
  parts.push(directionBadge(alert));

  // "Market impact" from enrichment (different framing for econ)
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**Market impact:** ${enrichment.impact}`);
  }

  // Historical stats — critical/high tier
  appendHistoricalStats(parts, alert, tier);

  return truncate(parts.join('\n'), 2048);
}

// ── Social (Reddit / StockTwits) ──────────────────────────────

function buildSocialDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;

  // Header: 💬 Social Buzz · StockTwits · 30m ago
  const platformLabel = alert.event.source === 'stocktwits' ? 'StockTwits' : 'Reddit';
  const timeAgo = relativeTime(alert.event.timestamp);
  parts.push(`💬 Social Buzz · ${platformLabel} · ${timeAgo}`);
  parts.push('');

  // Headline
  parts.push(alert.event.title);

  // Platform-specific stats from real scanner metadata
  const m = alert.event.metadata ?? {};
  const source = alert.event.source;

  if (source === 'stocktwits') {
    // StockTwits scanner emits: current_volume, previous_volume, ratio
    const currentVol = m.current_volume as number | undefined;
    const previousVol = m.previous_volume as number | undefined;
    const ratio = m.ratio as number | undefined;

    if (currentVol != null || ratio != null) {
      parts.push('');
      if (currentVol != null && previousVol != null) {
        parts.push(`🔥 Volume: ${currentVol} messages (prev: ${previousVol})`);
      } else if (currentVol != null) {
        parts.push(`🔥 Volume: ${currentVol} messages`);
      }
      if (ratio != null) {
        parts.push(`📈 Sentiment ratio: ${ratio.toFixed(2)}`);
      }
    }
  } else {
    // Reddit scanner emits: upvotes, comments, high_engagement
    const upvotes = m.upvotes as number | undefined;
    const comments = m.comments as number | undefined;
    const highEngagement = m.high_engagement as boolean | undefined;

    if (upvotes != null || comments != null) {
      parts.push('');
      if (upvotes != null) parts.push(`⬆️ Upvotes: ${upvotes}`);
      if (comments != null) parts.push(`💬 Comments: ${comments}`);
      if (highEngagement) parts.push(`🔥 High engagement`);
    }
  }

  // Direction badge — always "Speculative" confidence for social
  parts.push('');
  parts.push(directionBadge(alert, 'Speculative'));

  // "Context" from enrichment (different framing for social)
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**Context:** ${enrichment.impact}`);
  }

  // Historical stats — critical/high tier
  appendHistoricalStats(parts, alert, tier);

  return truncate(parts.join('\n'), 2048);
}

// ── Default (fallback — same as original buildCompactDescription) ─

function buildDefaultDescription(alert: AlertEvent, tier: DeliveryTier): string {
  const parts: string[] = [];
  const enrichment = alert.enrichment;

  // Headline — always the event title
  parts.push(alert.event.title);

  // Single ticker + price inline
  if (enrichment?.tickers?.length === 1) {
    const eventPrice = alert.event.metadata?.['event_price'];
    if (typeof eventPrice === 'number') {
      const t = enrichment.tickers[0];
      const dirEmoji = t.direction === 'bullish' ? '📈' : t.direction === 'bearish' ? '📉' : '➡️';
      parts.push(`**${t.symbol}** ${dirEmoji} @ $${eventPrice.toFixed(2)}`);
    }
  }

  // "Why it matters" — from enrichment.impact
  if (enrichment?.impact) {
    parts.push('');
    parts.push(`**Why it matters:** ${enrichment.impact}`);
  }

  // Historical stats — critical & high only
  appendHistoricalStats(parts, alert, tier);

  // Risk — critical only
  if (tier === 'critical' && enrichment?.risks) {
    parts.push('');
    parts.push(`**Risk:** ${enrichment.risks}`);
  }

  return truncate(parts.join('\n'), 2048);
}

// ── Shared helpers ────────────────────────────────────────────

function directionBadge(alert: AlertEvent, confidenceOverride?: string): string {
  const enrichment = alert.enrichment;
  if (!enrichment?.tickers?.length) return '';

  const primary = enrichment.tickers[0];
  const dirEmoji = primary.direction === 'bullish' ? '▲'
    : primary.direction === 'bearish' ? '▼'
    : '▸';
  const dirLabel = primary.direction.toUpperCase();
  const confidence = confidenceOverride ?? confidenceLabel(alert);

  return `${dirEmoji} ${dirLabel} · ${confidence}`;
}

function confidenceLabel(alert: AlertEvent): string {
  if (alert.confidenceBucket) {
    return capitalize(alert.confidenceBucket);
  }
  if (alert.classificationConfidence != null) {
    if (alert.classificationConfidence >= 0.7) return 'High confidence';
    if (alert.classificationConfidence >= 0.5) return 'Moderate confidence';
    if (alert.classificationConfidence >= 0.3) return 'Low confidence';
    return 'Unconfirmed';
  }
  return 'Moderate confidence';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1) + ' confidence';
}

function appendHistoricalStats(parts: string[], alert: AlertEvent, tier: DeliveryTier): void {
  if (
    tier !== 'feed'
    && alert.historicalContext
    && alert.historicalContext.confidence !== 'insufficient'
    && hasRealHistoricalData(alert.historicalContext)
  ) {
    const ctx = alert.historicalContext;
    const sign5 = ctx.avgAlphaT5 >= 0 ? '+' : '';
    parts.push('');
    parts.push(`📊 Similar events: ${ctx.matchCount} cases | ${sign5}${(ctx.avgAlphaT5 * 100).toFixed(1)}% avg 5d | ${ctx.winRateT20.toFixed(0)}% win rate`);
  }
}

function formatScheduledTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return isoString;
  }
}

function relativeTime(timestamp: Date): string {
  const diffMs = Date.now() - timestamp.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'NOW';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function hasRealHistoricalData(ctx: HistoricalContext): boolean {
  const hasNonZeroAlpha = ctx.topMatches.some((match) => match.alphaT20 !== 0);
  const hasChanges = ctx.similarEvents?.some((event) =>
    event.change1d != null || event.change1w != null || event.change1m != null
  ) ?? false;

  return hasNonZeroAlpha || hasChanges || ctx.avgAlphaT5 !== 0 || ctx.avgAlphaT20 !== 0;
}
