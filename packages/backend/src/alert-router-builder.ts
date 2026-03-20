import {
  AlertRouter,
  BarkPusher,
  DiscordWebhook,
  TelegramDelivery,
  WebPushChannel,
  WebhookDelivery,
  type AlertRouter as AlertRouterType,
} from '@event-radar/delivery';
import { createPushSubscriptionStore } from './services/push-subscription-store.js';
import {
  pushQuietSuppressedTotal,
  pushCapSuppressedTotal,
} from './metrics.js';
import { type Database } from './db/connection.js';

export function buildAlertRouter(db?: Database): AlertRouterType {
  const barkKey = process.env.BARK_KEY;
  const barkServerUrl = process.env.BARK_SERVER_URL;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const webPushVapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const webPushVapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const webPushVapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const pushSubscriptionStore = db ? createPushSubscriptionStore(db) : undefined;

  return new AlertRouter({
    bark: barkKey
      ? new BarkPusher({ key: barkKey, serverUrl: barkServerUrl })
      : undefined,
    discord: discordWebhookUrl
      ? new DiscordWebhook({ webhookUrl: discordWebhookUrl })
      : undefined,
    telegram:
      telegramBotToken && telegramChatId
        ? new TelegramDelivery({
            botToken: telegramBotToken,
            chatId: telegramChatId,
            minSeverity: 'LOW',
            enabled: true,
          })
        : undefined,
    webhook:
      webhookUrl && webhookSecret
        ? new WebhookDelivery({
            url: webhookUrl,
            secret: webhookSecret,
            minSeverity: 'LOW',
            enabled: true,
          })
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
