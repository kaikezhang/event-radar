import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';

export interface KillSwitchStatus {
  enabled: boolean;
  activatedAt: string | null;
  reason: string | null;
  updatedAt: string;
}

export interface IDeliveryKillSwitch {
  isActive(): Promise<boolean>;
  activate(reason?: string): Promise<KillSwitchStatus>;
  deactivate(): Promise<KillSwitchStatus>;
  getStatus(): Promise<KillSwitchStatus>;
}

/**
 * Delivery Kill Switch — persisted to DB so state survives restarts.
 * When active, all delivery is skipped but events are still processed and stored.
 */
export class DeliveryKillSwitch implements IDeliveryKillSwitch {
  constructor(private readonly db: Database) {}

  async isActive(): Promise<boolean> {
    const status = await this.getStatus();
    return status.enabled;
  }

  async activate(reason?: string): Promise<KillSwitchStatus> {
    const now = new Date();
    await this.ensureRow();
    await this.db
      .update(schema.deliveryKillSwitch)
      .set({
        enabled: true,
        activatedAt: now,
        reason: reason ?? 'Manual kill switch activation',
        updatedAt: now,
      })
      .where(eq(schema.deliveryKillSwitch.id, 1));
    return this.getStatus();
  }

  async deactivate(): Promise<KillSwitchStatus> {
    const now = new Date();
    await this.ensureRow();
    await this.db
      .update(schema.deliveryKillSwitch)
      .set({
        enabled: false,
        reason: null,
        updatedAt: now,
      })
      .where(eq(schema.deliveryKillSwitch.id, 1));
    return this.getStatus();
  }

  async getStatus(): Promise<KillSwitchStatus> {
    await this.ensureRow();
    const [row] = await this.db
      .select()
      .from(schema.deliveryKillSwitch)
      .where(eq(schema.deliveryKillSwitch.id, 1))
      .limit(1);

    return {
      enabled: row!.enabled,
      activatedAt: row!.activatedAt?.toISOString() ?? null,
      reason: row!.reason,
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  private async ensureRow(): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.deliveryKillSwitch.id })
      .from(schema.deliveryKillSwitch)
      .where(eq(schema.deliveryKillSwitch.id, 1))
      .limit(1);

    if (!existing) {
      await this.db.insert(schema.deliveryKillSwitch).values({
        id: 1,
        enabled: false,
        updatedAt: new Date(),
      });
    }
  }
}
