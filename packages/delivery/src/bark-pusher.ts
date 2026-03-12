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

const SEVERITY_TO_GROUP: Record<Severity, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
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

    const title = enrichment
      ? `${enrichment.action} ${enrichment.tickers[0]?.symbol ?? ''}`
      : alert.event.title;

    let bodyText = enrichment ? enrichment.summary : alert.event.body;

    if (alert.historicalContext && alert.historicalContext.confidence !== 'insufficient') {
      const ctx = alert.historicalContext;
      const sign = ctx.avgAlphaT20 >= 0 ? '+' : '';
      bodyText += `\n📊 ${ctx.matchCount} similar cases: ${sign}${(ctx.avgAlphaT20 * 100).toFixed(1)}% avg alpha, ${ctx.winRateT20.toFixed(0)}% win rate`;
    }

    const body: Record<string, string> = {
      title: title.trim(),
      body: bodyText,
      level: SEVERITY_TO_BARK_LEVEL[alert.severity],
      group: SEVERITY_TO_GROUP[alert.severity],
    };

    if (alert.severity === 'CRITICAL') {
      body.sound = 'alarm';
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
