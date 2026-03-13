import type { Severity, TelegramConfig } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: '\u{1F534}', // 🔴
  HIGH: '\u{1F7E0}', // 🟠
  MEDIUM: '\u{1F7E1}', // 🟡
  LOW: '\u{1F535}', // 🔵
};

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const DEFAULT_RETRY_DELAYS = [1_000, 5_000, 30_000];

const REGIME_LABEL_DISPLAY: Record<string, string> = {
  extreme_overbought: 'Extreme Overbought',
  overbought: 'Overbought',
  neutral: 'Neutral',
  oversold: 'Oversold',
  extreme_oversold: 'Extreme Oversold',
};

export class TelegramDelivery implements DeliveryService {
  readonly name = 'telegram';
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly minSeverity: Severity;
  private readonly _enabled: boolean;
  private readonly retryDelays: number[];

  constructor(config: TelegramConfig & { retryDelays?: number[] }) {
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.minSeverity = config.minSeverity;
    this._enabled = config.enabled;
    this.retryDelays = config.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  async send(alert: AlertEvent): Promise<void> {
    if (!this._enabled) return;
    if (SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[this.minSeverity]) {
      return;
    }

    const text = this.formatMessage(alert);
    const replyMarkup = this.buildInlineKeyboard(alert);

    const body: Record<string, unknown> = {
      chat_id: this.chatId,
      text,
      parse_mode: 'MarkdownV2',
    };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    await this.sendWithRetry(body);
  }

  private formatMessage(alert: AlertEvent): string {
    const emoji = SEVERITY_EMOJI[alert.severity];
    const title = `${emoji} *${alert.severity}*: ${escapeMarkdown(alert.event.title)}`;
    const bodySummary = truncate(alert.event.body, 200);

    const lines = [title, '', escapeMarkdown(bodySummary)];

    if (alert.ticker) {
      lines.push('', `*Ticker:* \`${alert.ticker}\``);
    }

    lines.push(
      '',
      `*Source:* ${escapeMarkdown(alert.event.source)}`,
      `*Time:* ${alert.event.timestamp.toISOString()}`,
    );

    // AI Analysis section
    if (alert.enrichment) {
      lines.push(
        '',
        escapeMarkdown('🤖 AI Analysis:'),
        escapeMarkdown(alert.enrichment.summary),
      );
      if (alert.enrichment.impact) {
        lines.push(escapeMarkdown(alert.enrichment.impact));
      }
      if (alert.enrichment.regimeContext) {
        lines.push(escapeMarkdown(alert.enrichment.regimeContext));
      }
    }

    // Historical context
    if (alert.historicalContext && alert.historicalContext.confidence !== 'insufficient') {
      const ctx = alert.historicalContext;
      const sign = ctx.avgAlphaT20 >= 0 ? '+' : '';
      lines.push(
        '',
        escapeMarkdown(
          `📊 ${ctx.matchCount} similar cases (${ctx.confidence}): avg alpha ${sign}${(ctx.avgAlphaT20 * 100).toFixed(1)}%, win rate ${ctx.winRateT20.toFixed(0)}%`,
        ),
        escapeMarkdown(ctx.patternSummary),
      );
    }

    // Market Regime section
    if (alert.regimeSnapshot) {
      const rs = alert.regimeSnapshot;
      const label = REGIME_LABEL_DISPLAY[rs.label] ?? rs.label;
      lines.push(
        '',
        escapeMarkdown(`📈 Market Regime: ${label} (Score: ${rs.score})`),
        escapeMarkdown(`VIX: ${rs.factors.vix.value.toFixed(1)} | RSI: ${rs.factors.spyRsi.value.toFixed(1)} | Bull: ${rs.amplification.bullish}x | Bear: ${rs.amplification.bearish}x`),
      );
    }

    // Disclaimer
    if (alert.enrichment || alert.regimeSnapshot || alert.historicalContext) {
      lines.push('', escapeMarkdown('⚖️ AI-generated analysis. Not financial advice.'));
    }

    return lines.join('\n');
  }

  private buildInlineKeyboard(
    alert: AlertEvent,
  ): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | undefined {
    if (!alert.event.url) return undefined;

    return {
      inline_keyboard: [
        [{ text: 'View Filing', url: alert.event.url }],
      ],
    };
  }

  private async sendWithRetry(body: Record<string, unknown>): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Telegram API failed (${response.status}): ${text}`,
          );
        }
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < this.retryDelays.length) {
          await sleep(this.retryDelays[attempt]);
        }
      }
    }

    throw lastError!;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
