import type { Severity } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { watchlist, userNotificationSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

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

const MAX_RETRIES = 3;
const DELIVERY_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWithRetry(
  url: string,
  body: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, DELIVERY_TIMEOUT_MS);

      if (response.ok) {
        return { ok: true, status: response.status };
      }

      // Handle Discord 429 rate limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter
          ? Math.min(Number(retryAfter) * 1000, 30_000)
          : 1000 * 2 ** attempt;
        if (attempt < MAX_RETRIES - 1) {
          await sleep(waitMs);
          continue;
        }
        return { ok: false, status: 429, error: 'Rate limited by Discord after retries' };
      }

      // 4xx (non-429) are permanent — don't retry
      if (response.status >= 400 && response.status < 500) {
        const text = await response.text().catch(() => '');
        return { ok: false, status: response.status, error: `Discord ${response.status}: ${text.slice(0, 200)}` };
      }

      // 5xx — retry with backoff
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      return { ok: false, status: response.status, error: `Discord ${response.status} after ${MAX_RETRIES} retries` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return { ok: false, error: `Network error after ${MAX_RETRIES} retries: ${message}` };
    }
  }

  return { ok: false, error: 'Exhausted retries' };
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

        const body = JSON.stringify({
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
        });

        const result = await deliverWithRetry(settings.discordWebhookUrl, body);

        if (result.ok) {
          recordDelivery(userId);
          sent++;
        } else {
          errors++;
        }
      }

      return { sent, errors };
    },
  };
}

// Export for testing
export { deliverWithRetry as _deliverWithRetry, MAX_RETRIES, DELIVERY_TIMEOUT_MS };
