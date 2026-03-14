import { createHmac } from 'node:crypto';
import type { Severity, WebhookConfig } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const DEFAULT_RETRY_DELAYS = [1_000, 5_000, 30_000];
const TIMEOUT_MS = 10_000;

export class WebhookDelivery implements DeliveryService {
  readonly name = 'webhook';
  private readonly url: string;
  private readonly secret: string;
  private readonly minSeverity: Severity;
  private readonly _enabled: boolean;
  private readonly customHeaders: Record<string, string>;
  private readonly retryDelays: number[];

  constructor(config: WebhookConfig & { retryDelays?: number[] }) {
    this.url = config.url;
    this.secret = config.secret;
    this.minSeverity = config.minSeverity;
    this._enabled = config.enabled;
    this.customHeaders = config.headers ?? {};
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

    const payload = JSON.stringify({
      event: {
        id: alert.event.id,
        source: alert.event.source,
        type: alert.event.type,
        title: alert.event.title,
        body: alert.event.body,
        url: alert.event.url,
        timestamp: alert.event.timestamp.toISOString(),
        metadata: alert.event.metadata,
      },
      severity: alert.severity,
      ticker: alert.ticker,
      enrichment: alert.enrichment
        ? {
            summary: alert.enrichment.summary,
            impact: alert.enrichment.impact,
            action: alert.enrichment.action,
            tickers: alert.enrichment.tickers,
            regimeContext: alert.enrichment.regimeContext,
          }
        : undefined,
      historicalContext: alert.historicalContext
        ? {
            matchCount: alert.historicalContext.matchCount,
            confidence: alert.historicalContext.confidence,
            avgAlphaT5: alert.historicalContext.avgAlphaT5,
            avgAlphaT20: alert.historicalContext.avgAlphaT20,
            avgChange1d: alert.historicalContext.avgChange1d,
            avgChange1w: alert.historicalContext.avgChange1w,
            winRateT20: alert.historicalContext.winRateT20,
            medianAlphaT20: alert.historicalContext.medianAlphaT20,
            bestCase: alert.historicalContext.bestCase,
            worstCase: alert.historicalContext.worstCase,
            similarEvents: alert.historicalContext.similarEvents,
            patternSummary: alert.historicalContext.patternSummary,
          }
        : undefined,
      regimeSnapshot: alert.regimeSnapshot
        ? {
            score: alert.regimeSnapshot.score,
            label: alert.regimeSnapshot.label,
            amplification: alert.regimeSnapshot.amplification,
            updatedAt: alert.regimeSnapshot.updatedAt,
          }
        : undefined,
      deliveredAt: new Date().toISOString(),
    });

    const signature = createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    await this.sendWithRetry(payload, signature);
  }

  private async sendWithRetry(
    payload: string,
    signature: string,
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.customHeaders,
            'X-EventRadar-Signature': signature,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: payload,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Webhook failed (${response.status}): ${text}`,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
