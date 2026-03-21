import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { userNotificationSettings } from '../db/schema.js';

export interface UserNotificationSettings {
  discordWebhookUrl: string | null;
  emailAddress: string | null;
  minSeverity: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserNotificationSettingsPatch {
  discordWebhookUrl?: string | null;
  emailAddress?: string | null;
  minSeverity?: string;
  enabled?: boolean;
}

const DEFAULT_SETTINGS: UserNotificationSettings = {
  discordWebhookUrl: null,
  emailAddress: null,
  minSeverity: 'HIGH',
  enabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

function mapRow(
  row: typeof userNotificationSettings.$inferSelect | undefined,
): UserNotificationSettings {
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    discordWebhookUrl: row.discordWebhookUrl,
    emailAddress: row.emailAddress,
    minSeverity: row.minSeverity,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createNotificationSettingsStore(db: Database) {
  return {
    async get(userId: string): Promise<UserNotificationSettings> {
      const [row] = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, userId))
        .limit(1);

      return mapRow(row);
    },

    async upsert(
      userId: string,
      patch: UserNotificationSettingsPatch,
    ): Promise<UserNotificationSettings> {
      const current = await this.get(userId);
      const now = new Date();

      const values = {
        userId,
        discordWebhookUrl: patch.discordWebhookUrl !== undefined
          ? patch.discordWebhookUrl
          : current.discordWebhookUrl,
        emailAddress: patch.emailAddress !== undefined
          ? patch.emailAddress
          : current.emailAddress,
        minSeverity: patch.minSeverity ?? current.minSeverity,
        enabled: patch.enabled ?? current.enabled,
        updatedAt: now,
      };

      await db
        .insert(userNotificationSettings)
        .values(values)
        .onConflictDoUpdate({
          target: userNotificationSettings.userId,
          set: {
            discordWebhookUrl: values.discordWebhookUrl,
            emailAddress: values.emailAddress,
            minSeverity: values.minSeverity,
            enabled: values.enabled,
            updatedAt: now,
          },
        });

      return this.get(userId);
    },

    async getByTicker(ticker: string): Promise<Array<{ userId: string; settings: UserNotificationSettings }>> {
      // This will be used by the pipeline to find users watching a ticker
      // who have Discord webhook configured
      const rows = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.enabled, true));

      return rows
        .filter((row) => row.discordWebhookUrl)
        .map((row) => ({
          userId: row.userId,
          settings: mapRow(row),
        }));
    },
  };
}
