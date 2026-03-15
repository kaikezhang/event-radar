import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

export interface BarkConfig {
  /** Device key registered with Bark server. */
  key: string;
  /** Bark server base URL. Defaults to https://api.day.app */
  serverUrl?: string;
}

const SEVERITY_TO_BARK_LEVEL: Record<Severity, string> = {
  CRITICAL: 'critical',
  HIGH: 'timeSensitive',
  MEDIUM: 'active',
  LOW: 'passive',
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
};

/** Short source labels for Bark push (space constrained) */
const SOURCE_SHORT: Record<string, string> = {
  'whitehouse': '🏛️WH',
  'sec-edgar': '📋SEC',
  'sec-regulatory': '📋SEC',
  'fda': '💊FDA',
  'doj-antitrust': '⚖️DOJ',
  'federal-register': '📜FedReg',
  'breaking-news': '📰News',
  'reddit': '💬Reddit',
  'stocktwits': '💬ST',
  'unusual-options': '🎯Options',
  'econ-calendar': '📅Econ',
};

const REGIME_SHORT: Record<string, string> = {
  extreme_overbought: '🔴OB+',
  overbought: '🟠OB',
  neutral: '🟡N',
  oversold: '🟢OS',
  extreme_oversold: '🟢OS+',
};

export class BarkPusher implements DeliveryService {
  readonly name = 'bark';
  private readonly key: string;
  private readonly serverUrl: string;

  constructor(config: BarkConfig) {
    this.key = config.key;
    this.serverUrl = (config.serverUrl ?? 'https://api.day.app').replace(
      /\/$/,
      '',
    );
  }

  async send(alert: AlertEvent): Promise<void> {
    const url = `${this.serverUrl}/${this.key}`;
    const enrichment = alert.enrichment;
    const sourceTag = SOURCE_SHORT[alert.event.source] ?? alert.event.source;

    // Title: [Source] Severity + ticker or action
    let title: string;
    if (enrichment) {
      const ticker = enrichment.tickers[0]?.symbol ?? '';
      title = `[${sourceTag}] ${enrichment.action} ${ticker}`.trim();
    } else {
      const sev = SEVERITY_EMOJI[alert.severity];
      const ticker = alert.ticker ? ` $${alert.ticker}` : '';
      title = `[${sourceTag}] ${sev}${ticker}`;
    }

    if ((alert.confirmationCount ?? 1) > 1) {
      title = `${title} [${alert.confirmationCount} sources]`;
    }

    // Body: AI summary + regime label + historical one-liner
    let bodyText = enrichment
      ? enrichment.summary
      : alert.event.title;

    // Append regime label
    if (alert.regimeSnapshot) {
      const regimeTag = REGIME_SHORT[alert.regimeSnapshot.label] ?? alert.regimeSnapshot.label;
      bodyText += `\n📈 Regime: ${regimeTag} (${alert.regimeSnapshot.score})`;
    }

    if (alert.historicalContext && alert.historicalContext.confidence !== 'insufficient') {
      const ctx = alert.historicalContext;
      const sign = ctx.avgAlphaT20 >= 0 ? '+' : '';
      bodyText += `\n📊 ${ctx.matchCount} similar: ${sign}${(ctx.avgAlphaT20 * 100).toFixed(1)}% avg, ${ctx.winRateT20.toFixed(0)}% win`;
    }

    const body: Record<string, string> = {
      title: title.trim().slice(0, 100),
      body: bodyText.slice(0, 500),
      level: SEVERITY_TO_BARK_LEVEL[alert.severity],
      group: `event-radar-${alert.severity.toLowerCase()}`,
    };

    if (alert.severity === 'CRITICAL') {
      body.sound = 'alarm';
    } else if (alert.severity === 'HIGH') {
      body.sound = 'bell';
    }

    if (alert.event.url) {
      body.url = alert.event.url;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bark push failed (${response.status}): ${text}`);
    }
  }
}
