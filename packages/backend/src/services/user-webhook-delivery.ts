import type { Severity } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { createNotificationSettingsStore } from './notification-settings-store.js';
import { watchlist, userNotificationSettings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

/** In-memory rate limiter: max 10 webhooks per user per hour */
const rateLimitMap = new Map<string, number[]>();
const MAX_PER_HOUR = 10;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const timestamps = (rateLimitMap.get(userId) ?? []).filter((t) => t > cutoff);
  rateLimitMap.set(userId, timestamps);
  return timestamps.length >= MAX_PER_HOUR;
}

function recordDelivery(userId: string): void {
  const timestamps = rateLimitMap.get(userId) ?? [];
  timestamps.push(Date.now());
  rateLimitMap.set(userId, timestamps);
}

export interface UserWebhookAlert {
  title: string;
  description: string;
  severity: Severity;
  ticker?: string;
  source: string;
  timestamp: Date;
  url?: string;
}

export interface UserWebhookDeliveryService {
  deliverToMatchingUsers(alert: UserWebhookAlert): Promise<{ sent: number; errors: number }>;
}

export function createUserWebhookDelivery(db: Database): UserWebhookDeliveryService {
  return {
    async deliverToMatchingUsers(alert: UserWebhookAlert) {
      let sent = 0;
      let errors = 0;

      if (!alert.ticker) {
        return { sent, errors };
      }

      // Find users watching this ticker who have webhook configured
      const watchlistRows = await db
        .select({ userId: watchlist.userId })
        .from(watchlist)
        .where(eq(watchlist.ticker, alert.ticker.toUpperCase()));

      if (watchlistRows.length === 0) {
        return { sent, errors };
      }

      const userIds = [...new Set(watchlistRows.map((r) => r.userId))];

      // Get notification settings for these users
      const settingsRows = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.enabled, true));

      const settingsByUserId = new Map(
        settingsRows.map((r) => [r.userId, r]),
      );

      for (const userId of userIds) {
        const settings = settingsByUserId.get(userId);
        if (!settings?.discordWebhookUrl) continue;

        // Check severity threshold
        const alertRank = SEVERITY_RANK[alert.severity] ?? 0;
        const minRank = SEVERITY_RANK[settings.minSeverity] ?? 0;
        if (alertRank < minRank) continue;

        // Rate limit check
        if (isRateLimited(userId)) continue;

        try {
          const response = await fetch(settings.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: 'Event Radar',
              embeds: [{
                title: alert.title,
                description: alert.description,
                color: alert.severity === 'CRITICAL' ? 0xed4245
                  : alert.severity === 'HIGH' ? 0xf57c00
                  : alert.severity === 'MEDIUM' ? 0xfee75c
                  : 0x57f287,
                timestamp: alert.timestamp.toISOString(),
                footer: { text: `Event Radar · ${alert.source}` },
              }],
            }),
          });

          if (response.ok) {
            recordDelivery(userId);
            sent++;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }

      return { sent, errors };
    },
  };
}
