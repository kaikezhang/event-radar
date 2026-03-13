import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';

export interface KillSwitchStatus {
  enabled: boolean;
  activatedAt: string | null;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface IDeliveryKillSwitch {
  isActive(): Promise<boolean>;
  activate(reason?: string, updatedBy?: string): Promise<KillSwitchStatus>;
  deactivate(updatedBy?: string): Promise<KillSwitchStatus>;
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

  async activate(reason?: string, updatedBy?: string): Promise<KillSwitchStatus> {
    const now = new Date();
    await this.ensureRow();
    await this.db
      .update(schema.deliveryKillSwitch)
      .set({
        enabled: true,
        activatedAt: now,
        reason: reason ?? 'Manual kill switch activation',
        updatedBy: updatedBy ?? null,
        updatedAt: now,
      })
      .where(eq(schema.deliveryKillSwitch.id, 1));
    return this.getStatus();
  }

  async deactivate(updatedBy?: string): Promise<KillSwitchStatus> {
    const now = new Date();
    await this.ensureRow();
    await this.db
      .update(schema.deliveryKillSwitch)
      .set({
        enabled: false,
        activatedAt: null,
        reason: null,
        updatedBy: updatedBy ?? null,
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
      updatedBy: row!.updatedBy ?? null,
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  private async ensureRow(): Promise<void> {
    await this.db
      .insert(schema.deliveryKillSwitch)
      .values({
        id: 1,
        enabled: false,
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.deliveryKillSwitch.id });
  }
}
