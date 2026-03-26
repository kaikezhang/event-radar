import type { Severity } from '@event-radar/shared';
import { decideAlertRouting, type AlertRoutingDecision } from './push-policy.js';
import type { AlertEvent, DeliveryService } from './types.js';

export type ChannelName = 'discord' | 'webPush';

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
  discord?: DeliveryService;
  webPush?: DeliveryService;
}

/**
 * Routes based on severity:
 *   all severities → Discord
 *
 * Web Push is gated separately by the confidence-based push policy.
 */
const ROUTING_TABLE: Record<Severity, ChannelName[]> = {
  CRITICAL: ['discord'],
  HIGH: ['discord'],
  MEDIUM: ['discord'],
  LOW: ['discord'],
};

export class AlertRouter {
  private readonly channels: Map<string, DeliveryService>;

  constructor(config: AlertRouterConfig) {
    this.channels = new Map();
    if (config.discord) this.channels.set('discord', config.discord);
    if (config.webPush) this.channels.set('webPush', config.webPush);
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

    // When the delivery gate assigns a tier, use tier-based routing
    // instead of severity-based routing.
    let targets: ChannelName[];
    if (alert.deliveryTier) {
      switch (alert.deliveryTier) {
        case 'critical':
          targets = ['discord'];
          if (decision.shouldPush) targets.push('webPush');
          break;
        case 'high':
          targets = decision.shouldPush ? ['discord', 'webPush'] : ['discord'];
          break;
        case 'feed':
          targets = ['discord'];
          break;
        default:
          targets = ROUTING_TABLE[alert.severity];
      }
    } else {
      // Legacy path: severity-based routing
      targets = decision.shouldPush
        ? [...ROUTING_TABLE[alert.severity], 'webPush']
        : ROUTING_TABLE[alert.severity];
    }

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
