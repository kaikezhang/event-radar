import {
  AlertRouter,
  DiscordWebhook,
  WebPushChannel,
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { createPushSubscriptionStore } from './services/push-subscription-store.js';
import {
  pushQuietSuppressedTotal,
  pushCapSuppressedTotal,
} from './metrics.js';
import { type Database } from './db/connection.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadDiscordWatchlist(): Set<string> | undefined {
  // Opt out of watchlist filtering entirely with env var
  if (process.env.DISCORD_WATCHLIST_FILTER === 'off') {
    return undefined;
  }

  try {
    const tickers = require('./config/watchlist.json') as string[];
    if (Array.isArray(tickers) && tickers.length > 0) {
      return new Set(tickers.map((t) => t.toUpperCase()));
    }
  } catch {
    // watchlist.json not found or invalid — no filtering
  }
  return undefined;
}

export function buildAlertRouter(db?: Database): AlertRouterType {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const webPushVapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const webPushVapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const webPushVapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const pushSubscriptionStore = db ? createPushSubscriptionStore(db) : undefined;

  return new AlertRouter({
    discord: discordWebhookUrl
      ? new DiscordWebhook({ webhookUrl: discordWebhookUrl })
      : undefined,
    webPush:
      pushSubscriptionStore && webPushVapidSubject && webPushVapidPublicKey && webPushVapidPrivateKey
        ? new WebPushChannel({
            vapidSubject: webPushVapidSubject,
            vapidPublicKey: webPushVapidPublicKey,
            vapidPrivateKey: webPushVapidPrivateKey,
            store: pushSubscriptionStore,
            onQuietSuppressed: () => {
              pushQuietSuppressedTotal.inc();
            },
            onCapSuppressed: () => {
              pushCapSuppressedTotal.inc();
            },
          })
        : undefined,
    discordWatchlist: loadDiscordWatchlist(),
  });
}
