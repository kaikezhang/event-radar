import type { Severity } from '@event-radar/shared';
import { decideAlertRouting, type AlertRoutingDecision } from './push-policy.js';
import type { AlertEvent, DeliveryService } from './types.js';

export type ChannelName = 'bark' | 'discord' | 'telegram' | 'webhook';

export interface ChannelDeliveryResult {
  channel: string;
  ok: boolean;
  error?: Error;
}

export interface AlertRouteResult {
  decision: AlertRoutingDecision;
  deliveries: ChannelDeliveryResult[];
}

export interface AlertRouterConfig {
  bark?: DeliveryService;
  discord?: DeliveryService;
  telegram?: DeliveryService;
  webhook?: DeliveryService;
}

/**
 * Routes based on severity per DELIVERY.md:
 *   CRITICAL → Bark + Telegram + Discord + Webhook
 *   HIGH     → Bark + Telegram + Discord + Webhook
 *   MEDIUM   → Telegram + Discord + Webhook
 *   LOW      → Discord + Webhook
 */
const ROUTING_TABLE: Record<Severity, ChannelName[]> = {
  CRITICAL: ['bark', 'discord', 'telegram', 'webhook'],
  HIGH: ['bark', 'discord', 'telegram', 'webhook'],
  MEDIUM: ['discord', 'telegram', 'webhook'],
  LOW: ['discord', 'webhook'],
};

export class AlertRouter {
  private readonly channels: Map<string, DeliveryService>;

  constructor(config: AlertRouterConfig) {
    this.channels = new Map();
    if (config.bark) this.channels.set('bark', config.bark);
    if (config.discord) this.channels.set('discord', config.discord);
    if (config.telegram) this.channels.set('telegram', config.telegram);
    if (config.webhook) this.channels.set('webhook', config.webhook);
  }

  /** Returns true if at least one delivery channel is configured. */
  get enabled(): boolean {
    return this.channels.size > 0;
  }

  /** Route an alert to the appropriate channels. Returns per-channel results. */
  async route(
    alert: AlertEvent,
  ): Promise<AlertRouteResult> {
    const decision = decideAlertRouting(alert);
    const targets = ROUTING_TABLE[alert.severity];
    const results: ChannelDeliveryResult[] = [];

    const promises = targets.map(async (channelName) => {
      const service = this.channels.get(channelName);
      if (!service) return;

      try {
        await service.send(alert);
        results.push({ channel: channelName, ok: true });
      } catch (e) {
        results.push({
          channel: channelName,
          ok: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    });

    await Promise.all(promises);
    return {
      decision,
      deliveries: results,
    };
  }
}
