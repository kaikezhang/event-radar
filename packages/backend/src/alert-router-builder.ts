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
  });
}
