import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { userPreferences } from '../db/schema.js';

export interface NotificationPreferences {
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  dailyPushCap: number;
  pushNonWatchlist: boolean;
  updatedAt: Date | null;
}

export interface NotificationPreferencesPatch {
  quietStart?: string | null;
  quietEnd?: string | null;
  timezone?: string;
  dailyPushCap?: number;
  pushNonWatchlist?: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  quietStart: null,
  quietEnd: null,
  timezone: 'America/New_York',
  dailyPushCap: 20,
  pushNonWatchlist: false,
  updatedAt: null,
};

export function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizePreferenceTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, 5);
}

function toDatabaseTime(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return `${normalizePreferenceTime(value)}:00`;
}

function mapRow(row: typeof userPreferences.$inferSelect | undefined): NotificationPreferences {
  if (!row) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    quietStart: normalizePreferenceTime(row.quietStart),
    quietEnd: normalizePreferenceTime(row.quietEnd),
    timezone: row.timezone,
    dailyPushCap: row.dailyPushCap,
    pushNonWatchlist: row.pushNonWatchlist,
    updatedAt: row.updatedAt,
  };
}

export function createUserPreferencesStore(db: Database) {
  return {
    async get(userId: string): Promise<NotificationPreferences> {
      const [row] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);

      return mapRow(row);
    },

    async upsert(
      userId: string,
      patch: NotificationPreferencesPatch,
    ): Promise<NotificationPreferences> {
      const current = await this.get(userId);
      const nextQuietStart = patch.quietStart ?? current.quietStart;
      const nextQuietEnd = patch.quietEnd ?? current.quietEnd;
      const now = new Date();

      await db
        .insert(userPreferences)
        .values({
          userId,
          quietStart: toDatabaseTime(nextQuietStart),
          quietEnd: toDatabaseTime(nextQuietEnd),
          timezone: patch.timezone ?? current.timezone,
          dailyPushCap: patch.dailyPushCap ?? current.dailyPushCap,
          pushNonWatchlist: patch.pushNonWatchlist ?? current.pushNonWatchlist,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            quietStart: toDatabaseTime(nextQuietStart),
            quietEnd: toDatabaseTime(nextQuietEnd),
            timezone: patch.timezone ?? current.timezone,
            dailyPushCap: patch.dailyPushCap ?? current.dailyPushCap,
            pushNonWatchlist: patch.pushNonWatchlist ?? current.pushNonWatchlist,
            updatedAt: now,
          },
        });

      return this.get(userId);
    },
  };
}
