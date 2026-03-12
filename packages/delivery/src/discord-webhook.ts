import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

export interface DiscordConfig {
  /** Discord webhook URL. */
  webhookUrl: string;
}

const SEVERITY_COLOR: Record<Severity, number> = {
  CRITICAL: 0xed4245, // red
  HIGH: 0xf57c00, // orange
  MEDIUM: 0xfee75c, // yellow
  LOW: 0x57f287, // green
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

export class DiscordWebhook implements DeliveryService {
  readonly name = 'discord';
  private readonly webhookUrl: string;

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
  }

  async send(alert: AlertEvent): Promise<void> {
    const enrichment = alert.enrichment;
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    // --- Source badge ---
    const sourceBadge = SOURCE_BADGE[alert.event.source] ?? `📡 ${alert.event.source}`;
    fields.push({ name: 'Source', value: sourceBadge, inline: true });

    // --- Severity ---
    fields.push({
      name: 'Severity',
      value: `${SEVERITY_EMOJI[alert.severity]} ${alert.severity}`,
      inline: true,
    });

    // --- Tickers ---
    if (enrichment?.tickers?.length) {
      const tickerDisplay = enrichment.tickers
        .map((t) => `**${t.symbol}** ${t.direction === 'bullish' ? '📈' : t.direction === 'bearish' ? '📉' : '➡️'}`)
        .join('  ');
      fields.push({ name: 'Tickers', value: tickerDisplay, inline: true });
    } else if (alert.ticker) {
      fields.push({ name: 'Ticker', value: `**${alert.ticker}**`, inline: true });
    }

    // --- Action (LLM enrichment) ---
    if (enrichment) {
      fields.push({ name: 'Action', value: enrichment.action, inline: true });
    }

    // --- Items (e.g., 8-K item types) ---
    const items = this.extractItems(alert);
    if (items) {
      fields.push({ name: 'Filing Items', value: items, inline: true });
    }

    // --- Historical context ---
    if (alert.historicalContext && alert.historicalContext.confidence !== 'insufficient') {
      const ctx = alert.historicalContext;
      const sign20 = ctx.avgAlphaT20 >= 0 ? '+' : '';
      const sign5 = ctx.avgAlphaT5 >= 0 ? '+' : '';

      let historyText = `**${ctx.patternSummary}**\n`;
      historyText += `📊 **${ctx.matchCount}** similar events found\n`;
      historyText += `\n`;
      historyText += `| Metric | Value |\n`;
      historyText += `|--------|-------|\n`;
      historyText += `| Avg Alpha T+5 | ${sign5}${(ctx.avgAlphaT5 * 100).toFixed(1)}% |\n`;
      historyText += `| Avg Alpha T+20 | ${sign20}${(ctx.avgAlphaT20 * 100).toFixed(1)}% |\n`;
      historyText += `| Win Rate T+20 | ${ctx.winRateT20.toFixed(0)}% |\n`;

      if (ctx.bestCase) {
        const bs = ctx.bestCase.alphaT20 >= 0 ? '+' : '';
        historyText += `\n🏆 Best: **${ctx.bestCase.ticker}** ${bs}${(ctx.bestCase.alphaT20 * 100).toFixed(1)}%`;
      }
      if (ctx.worstCase) {
        const ws = ctx.worstCase.alphaT20 >= 0 ? '+' : '';
        historyText += `\n💀 Worst: **${ctx.worstCase.ticker}** ${ws}${(ctx.worstCase.alphaT20 * 100).toFixed(1)}%`;
      }

      if (ctx.topMatches.length > 0) {
        historyText += `\n\n**Most Similar:**\n`;
        for (const m of ctx.topMatches.slice(0, 3)) {
          const ms = m.alphaT20 >= 0 ? '+' : '';
          historyText += `• ${m.ticker} — ${m.headline} (${ms}${(m.alphaT20 * 100).toFixed(1)}%)\n`;
        }
      }

      const confidenceEmoji = ctx.confidence === 'high' ? '🟢' : ctx.confidence === 'medium' ? '🟡' : '🟠';
      fields.push({
        name: `📊 Historical Pattern ${confidenceEmoji} ${ctx.confidence.toUpperCase()}`,
        value: truncate(historyText, 1024),
        inline: false,
      });
    }

    // --- Source link ---
    if (alert.event.url) {
      fields.push({
        name: '🔗 Source',
        value: `[View Original](${alert.event.url})`,
        inline: false,
      });
    }

    // --- Build embed ---
    const title = enrichment
      ? `${enrichment.action} ${enrichment.summary}`
      : `${SEVERITY_EMOJI[alert.severity]} ${alert.event.title}`;

    const description = enrichment
      ? truncate(enrichment.impact, 2048)
      : truncate(alert.event.body, 2048);

    const embed = {
      title: truncate(title, 256),
      description,
      color: SEVERITY_COLOR[alert.severity],
      fields,
      timestamp: alert.event.timestamp.toISOString(),
      footer: {
        text: enrichment
          ? `Event Radar • AI Enhanced`
          : `Event Radar`,
      },
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Event Radar',
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook failed (${response.status}): ${text}`);
    }
  }

  private extractItems(alert: AlertEvent): string | undefined {
    const meta = alert.event.metadata;
    if (!meta) return undefined;

    const items = meta['item_types'];
    if (Array.isArray(items)) {
      return items.map(i => `\`${i}\``).join(', ');
    }
    return undefined;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}
