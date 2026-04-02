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
  /** When true, Discord was skipped because the event didn't match the watchlist. */
  discordWatchlistFiltered?: boolean;
}

export interface AlertRouterConfig {
  discord?: DeliveryService;
  webPush?: DeliveryService;
  /**
   * Optional watchlist filter for Discord notifications.
   * When set, Discord alerts are only sent for events whose ticker
   * appears in the watchlist OR that come from macro/market-wide sources
   * (events without a specific ticker association).
   */
  discordWatchlist?: Set<string>;
}

/**
 * Sources that produce market-wide / macro events (no specific ticker).
 * These always pass the Discord watchlist filter.
 */
const MACRO_SOURCES = new Set([
  'fed',
  'treasury',
  'whitehouse',
  'econ-calendar',
  'truth-social',
  'federal-register',
  'commerce',
  'sec-regulatory',
  'fedwatch',
  'ftc',
  'doj-antitrust',
]);

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
  private readonly discordWatchlist: Set<string> | null;

  constructor(config: AlertRouterConfig) {
    this.channels = new Map();
    if (config.discord) this.channels.set('discord', config.discord);
    if (config.webPush) this.channels.set('webPush', config.webPush);
    this.discordWatchlist = config.discordWatchlist ?? null;
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

    // Discord watchlist filter: only send to Discord if the event's ticker
    // is in the watchlist OR the event is from a macro/market-wide source.
    let discordWatchlistFiltered = false;
    if (this.discordWatchlist && targets.includes('discord')) {
      if (!this.passesDiscordWatchlist(alert)) {
        targets = targets.filter((t) => t !== 'discord');
        discordWatchlistFiltered = true;
      }
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
      discordWatchlistFiltered,
    };
  }

  /**
   * Check if an alert passes the Discord watchlist filter.
   * Returns true (send to Discord) when:
   *  1. The event's primary ticker is in the watchlist, OR
   *  2. Any enrichment ticker is in the watchlist, OR
   *  3. The event source is a macro/market-wide source, OR
   *  4. The event has no ticker at all (macro/broad event)
   */
  private passesDiscordWatchlist(alert: AlertEvent): boolean {
    const watchlist = this.discordWatchlist!;
    const source = alert.event.source.toLowerCase();

    // Macro sources always pass
    if (MACRO_SOURCES.has(source)) {
      return true;
    }

    // Check primary ticker
    if (alert.ticker) {
      if (watchlist.has(alert.ticker.toUpperCase())) {
        return true;
      }
    }

    // Check enrichment tickers
    if (alert.enrichment?.tickers?.length) {
      for (const t of alert.enrichment.tickers) {
        if (watchlist.has(t.symbol.toUpperCase())) {
          return true;
        }
      }
    }

    // Check metadata ticker(s)
    const metaTicker = alert.event.metadata?.['ticker'];
    if (typeof metaTicker === 'string' && watchlist.has(metaTicker.toUpperCase())) {
      return true;
    }
    const metaTickers = alert.event.metadata?.['tickers'];
    if (Array.isArray(metaTickers)) {
      for (const t of metaTickers) {
        if (typeof t === 'string' && watchlist.has(t.toUpperCase())) {
          return true;
        }
      }
    }

    // Events with no ticker association at all → treat as macro/broad
    const hasTicker = alert.ticker
      || (alert.enrichment?.tickers?.length ?? 0) > 0
      || (typeof metaTicker === 'string' && metaTicker.length > 0)
      || (Array.isArray(metaTickers) && metaTickers.length > 0);

    if (!hasTicker) {
      return true;
    }

    // Has ticker(s) but none in watchlist → filter out
    return false;
  }
}
