import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService, HistoricalContext } from './types.js';

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
    const enrichment = alert.enrichment;

    // --- Compact title ---
    const title = buildCompactTitle(alert);

    // --- Description: headline + structured body ---
    const description = buildCompactDescription(alert, tier);

    // --- Color based on tier (or severity fallback) ---
    const color = alert.deliveryTier
      ? TIER_COLOR[alert.deliveryTier]
      : SEVERITY_COLOR[alert.severity];

    // --- Optional fields (minimal) ---
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

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

    // --- Footer: source badge ---
    const sourceBadge = SOURCE_BADGE[alert.event.source] ?? `📡 ${alert.event.source}`;

    const embed = {
      title: truncate(title, 256),
      description,
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

// ── Compact card helpers ──────────────────────────────────────

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

function buildCompactDescription(alert: AlertEvent, tier: DeliveryTier): string {
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
  if (
    tier !== 'feed'
    && alert.historicalContext
    && alert.historicalContext.confidence !== 'insufficient'
    && hasRealHistoricalData(alert.historicalContext)
  ) {
    const ctx = alert.historicalContext;
    const sign5 = ctx.avgAlphaT5 >= 0 ? '+' : '';
    parts.push('');
    parts.push(`**Similar events:** ${ctx.matchCount} cases | ${sign5}${(ctx.avgAlphaT5 * 100).toFixed(1)}% avg 5d | ${ctx.winRateT20.toFixed(0)}% win rate`);
  }

  // Risk — critical only
  if (tier === 'critical' && enrichment?.risks) {
    parts.push('');
    parts.push(`**Risk:** ${enrichment.risks}`);
  }

  return truncate(parts.join('\n'), 2048);
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
