import type { Severity } from '@event-radar/shared';
import type { AlertEvent, DeliveryService } from './types.js';

export interface AlertRouterConfig {
  bark?: DeliveryService;
  discord?: DeliveryService;
}

/** Routes based on severity: CRITICAL/HIGH → Bark+Discord, MEDIUM/LOW → Discord only. */
const ROUTING_TABLE: Record<Severity, ('bark' | 'discord')[]> = {
  CRITICAL: ['bark', 'discord'],
  HIGH: ['bark', 'discord'],
  MEDIUM: ['discord'],
  LOW: ['discord'],
};

export class AlertRouter {
  private readonly channels: Map<string, DeliveryService>;

  constructor(config: AlertRouterConfig) {
    this.channels = new Map();
    if (config.bark) this.channels.set('bark', config.bark);
    if (config.discord) this.channels.set('discord', config.discord);
  }

  /** Returns true if at least one delivery channel is configured. */
  get enabled(): boolean {
    return this.channels.size > 0;
  }

  /** Route an alert to the appropriate channels. Returns per-channel results. */
  async route(
    alert: AlertEvent,
  ): Promise<{ channel: string; ok: boolean; error?: Error }[]> {
    const targets = ROUTING_TABLE[alert.severity];
    const results: { channel: string; ok: boolean; error?: Error }[] = [];

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
    return results;
  }
}
