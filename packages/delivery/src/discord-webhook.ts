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

const REGIME_LABEL_DISPLAY: Record<string, string> = {
  extreme_overbought: '🔴 Extreme Overbought',
  overbought: '🟠 Overbought',
  neutral: '🟡 Neutral',
  oversold: '🟢 Oversold',
  extreme_oversold: '🟢 Extreme Oversold',
};

const DEFAULT_RETRY_DELAYS = [1_000, 5_000, 30_000];

export class DiscordWebhook implements DeliveryService {
  readonly name = 'discord';
  private readonly webhookUrl: string;
  private readonly retryDelays: number[];

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
    this.retryDelays = config.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  async send(alert: AlertEvent): Promise<void> {
    const enrichment = alert.enrichment;
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];
    const eventPrice = alert.event.metadata?.['event_price'];
    const priceStr = typeof eventPrice === 'number' ? ` @ $${eventPrice.toFixed(2)}` : '';

    // --- Source badge + event time ---
    const sourceBadge = SOURCE_BADGE[alert.event.source] ?? `📡 ${alert.event.source}`;
    const eventUnix = Math.floor(alert.event.timestamp.getTime() / 1000);
    fields.push({
      name: 'Source',
      value: `${sourceBadge}\n🕐 <t:${eventUnix}:f> (<t:${eventUnix}:R>)`,
      inline: true,
    });

    // --- Severity ---
    fields.push({
      name: 'Severity',
      value: `${SEVERITY_EMOJI[alert.severity]} ${alert.severity}`,
      inline: true,
    });

    // --- Tickers ---
    if (enrichment?.tickers?.length) {
      const tickerDisplay = enrichment.tickers
        .map((t: NonNullable<AlertEvent['enrichment']>['tickers'][number]) => `**${t.symbol}** ${t.direction === 'bullish' ? '📈' : t.direction === 'bearish' ? '📉' : '➡️'}`)
        .join('  ');
      fields.push({ name: 'Tickers', value: `${tickerDisplay}${priceStr}`, inline: true });
    } else if (alert.ticker) {
      fields.push({ name: 'Ticker', value: `**${alert.ticker}**${priceStr}`, inline: true });
    }

    if (enrichment?.action) {
      fields.push({ name: 'Signal', value: enrichment.action, inline: true });
    }

    if ((alert.confirmationCount ?? 1) > 1 && alert.confirmedSources?.length) {
      fields.push({
        name: `✓ Confirmed by ${alert.confirmationCount} sources`,
        value: (alert.confirmedSources ?? []).join(', '),
        inline: false,
      });
    }

    // --- Items (e.g., 8-K item types) ---
    const items = this.extractItems(alert);
    if (items) {
      fields.push({ name: 'Filing Items', value: items, inline: true });
    }

    // --- AI Analysis (enrichment summary + impact) ---
    if (enrichment) {
      const aiText = formatAiAnalysis(enrichment);
      fields.push({
        name: '🤖 AI Analysis',
        value: truncate(aiText, 1024),
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

    // --- Historical context ---
    if (
      alert.historicalContext
      && alert.historicalContext.confidence !== 'insufficient'
      && hasRealHistoricalData(alert.historicalContext)
    ) {
      const ctx = alert.historicalContext;
      const sign20 = ctx.avgAlphaT20 >= 0 ? '+' : '';
      const sign5 = ctx.avgAlphaT5 >= 0 ? '+' : '';

      let historyText = `**${ctx.patternSummary}**\n`;
      historyText += `📊 **${ctx.matchCount}** similar events found\n`;
      historyText += '\n```\n';
      historyText += `Avg Alpha T+5  │ ${sign5}${(ctx.avgAlphaT5 * 100).toFixed(1)}%\n`;
      historyText += `Avg Alpha T+20 │ ${sign20}${(ctx.avgAlphaT20 * 100).toFixed(1)}%\n`;
      historyText += `Win Rate T+20  │ ${ctx.winRateT20.toFixed(0)}%\n`;
      historyText += '```\n';

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
          const sourceLabel = m.source ? ` [${m.source}]` : '';
          historyText += `• ${m.ticker}${sourceLabel} — ${m.headline} (${ms}${(m.alphaT20 * 100).toFixed(1)}%)\n`;
        }
      }

      const confidenceEmoji = ctx.confidence === 'high' ? '🟢' : ctx.confidence === 'medium' ? '🟡' : '🟠';
      fields.push({
        name: `📊 Historical Pattern ${confidenceEmoji} ${ctx.confidence.toUpperCase()}`,
        value: truncate(historyText, 1024),
        inline: false,
      });
    }

    // --- Market Regime ---
    if (alert.regimeSnapshot) {
      const rs = alert.regimeSnapshot;
      const label = REGIME_LABEL_DISPLAY[rs.label] ?? rs.label;
      let regimeText = `**${label}** (Score: ${rs.score})\n`;
      regimeText += `VIX: ${rs.factors.vix.value.toFixed(1)} | `;
      regimeText += `SPY RSI: ${rs.factors.spyRsi.value.toFixed(1)} | `;
      regimeText += `Yield Curve: ${Math.round(rs.factors.yieldCurve.spread * 100)}bp`;
      if (rs.factors.yieldCurve.inverted) {
        regimeText += ' ⚠️ INVERTED';
      }
      if (rs.amplification.bullish !== 1 || rs.amplification.bearish !== 1) {
        regimeText += `\nBullish amp: ${rs.amplification.bullish}x | Bearish amp: ${rs.amplification.bearish}x`;
      }
      if (enrichment?.regimeContext) {
        regimeText += `\n\n*${enrichment.regimeContext}*`;
      }
      fields.push({
        name: '📈 Market Regime',
        value: regimeText,
        inline: false,
      });
    }

    // --- Disclaimer ---
    if (enrichment || alert.regimeSnapshot || alert.historicalContext) {
      fields.push({
        name: '⚖️ Disclaimer',
        value: 'AI-generated analysis. Not financial advice.',
        inline: false,
      });
    }

    // --- Build embed ---
    const title = `${SEVERITY_EMOJI[alert.severity]} ${alert.event.title}`;

    const description = truncate(alert.event.body, 2048);

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

    await this.sendWithRetry(JSON.stringify({
      username: 'Event Radar',
      embeds: [embed],
    }));
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function formatAiAnalysis(enrichment: NonNullable<AlertEvent['enrichment']>): string {
  let aiText = enrichment.summary;
  if (enrichment.impact) {
    aiText += `\n\n${enrichment.impact}`;
  }
  return aiText;
}

function hasRealHistoricalData(ctx: HistoricalContext): boolean {
  const hasNonZeroAlpha = ctx.topMatches.some((match) => match.alphaT20 !== 0);
  const hasChanges = ctx.similarEvents?.some((event) =>
    event.change1d != null || event.change1w != null || event.change1m != null
  ) ?? false;

  return hasNonZeroAlpha || hasChanges || ctx.avgAlphaT5 !== 0 || ctx.avgAlphaT20 !== 0;
}
