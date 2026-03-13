import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { InMemoryEventBus } from '@event-radar/shared';
import { createTestDb, safeClose } from './helpers/test-db.js';
import { HealthMonitorService, isTradingHours } from '../services/health-monitor.js';
import { DeliveryKillSwitch } from '../services/delivery-kill-switch.js';
import type { IDeliveryKillSwitch } from '../services/delivery-kill-switch.js';
import type { Database } from '../db/connection.js';
import type { PGlite } from '@electric-sql/pglite';

describe('isTradingHours', () => {
  it('returns true during trading hours on a weekday', () => {
    // Wednesday 2026-03-11 at 10:00 AM ET = 14:00 UTC (EDT)
    const date = new Date('2026-03-11T14:00:00.000Z');
    expect(isTradingHours(date)).toBe(true);
  });

  it('returns false on weekends', () => {
    // Saturday 2026-03-14 at 10:00 AM ET
    const date = new Date('2026-03-14T14:00:00.000Z');
    expect(isTradingHours(date)).toBe(false);
  });

  it('returns false before market open', () => {
    // Wednesday 2026-03-11 at 9:00 AM ET = 13:00 UTC
    const date = new Date('2026-03-11T13:00:00.000Z');
    expect(isTradingHours(date)).toBe(false);
  });

  it('returns false after market close', () => {
    // Wednesday 2026-03-11 at 4:30 PM ET = 20:30 UTC
    const date = new Date('2026-03-11T20:30:00.000Z');
    expect(isTradingHours(date)).toBe(false);
  });
});

describe('HealthMonitorService', () => {
  let db: Database;
  let client: PGlite;
  let eventBus: InMemoryEventBus;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM pipeline_audit`);
  });

  afterAll(async () => {
    await safeClose(client);
  });

  it('emits system:health:alert when 0 deliveries during trading hours', async () => {
    eventBus = new InMemoryEventBus();

    const alerts: unknown[] = [];
    eventBus.subscribeTopic('system:health:alert', (payload) => {
      alerts.push(payload);
    });

    // Wednesday 10:00 AM ET during trading hours
    const monitor = new HealthMonitorService(db, eventBus, {
      now: () => new Date('2026-03-11T14:00:00.000Z'),
    });

    const result = await monitor.check();
    expect(result.count).toBe(0);
    expect(result.alerted).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'zero_deliveries',
      count: 0,
    });
  });

  it('does NOT alert when deliveries exist during trading hours', async () => {
    eventBus = new InMemoryEventBus();
    const now = new Date('2026-03-11T14:00:00.000Z');

    // Insert a delivered audit record within 24h
    await db.execute(sql`
      INSERT INTO pipeline_audit (event_id, source, title, outcome, stopped_at, created_at)
      VALUES ('evt-1', 'test-source', 'Test Event', 'delivered', 'delivery', ${now.toISOString()})
    `);

    const alerts: unknown[] = [];
    eventBus.subscribeTopic('system:health:alert', (payload) => {
      alerts.push(payload);
    });

    const monitor = new HealthMonitorService(db, eventBus, {
      now: () => now,
    });

    const result = await monitor.check();
    expect(result.count).toBe(1);
    expect(result.alerted).toBe(false);
    expect(alerts).toHaveLength(0);
  });

  it('does NOT alert outside trading hours even with 0 deliveries', async () => {
    eventBus = new InMemoryEventBus();

    const alerts: unknown[] = [];
    eventBus.subscribeTopic('system:health:alert', (payload) => {
      alerts.push(payload);
    });

    // Saturday — not trading hours
    const monitor = new HealthMonitorService(db, eventBus, {
      now: () => new Date('2026-03-14T14:00:00.000Z'),
    });

    const result = await monitor.check();
    expect(result.count).toBe(0);
    expect(result.alerted).toBe(false);
    expect(alerts).toHaveLength(0);
  });

  it('does NOT alert when kill switch is active during trading hours', async () => {
    eventBus = new InMemoryEventBus();

    const alerts: unknown[] = [];
    eventBus.subscribeTopic('system:health:alert', (payload) => {
      alerts.push(payload);
    });

    // Create a mock kill switch that reports active
    const mockKillSwitch: IDeliveryKillSwitch = {
      isActive: async () => true,
      activate: async () => ({ enabled: true, activatedAt: null, reason: null, updatedAt: '' }),
      deactivate: async () => ({ enabled: false, activatedAt: null, reason: null, updatedAt: '' }),
      getStatus: async () => ({ enabled: true, activatedAt: null, reason: null, updatedAt: '' }),
    };

    // Wednesday 10:00 AM ET during trading hours, 0 deliveries, but kill switch active
    const monitor = new HealthMonitorService(db, eventBus, {
      now: () => new Date('2026-03-11T14:00:00.000Z'),
      killSwitch: mockKillSwitch,
    });

    const result = await monitor.check();
    expect(result.count).toBe(0);
    expect(result.alerted).toBe(false);
    expect(alerts).toHaveLength(0);
  });

  it('getDeliveryStats returns 24h and 7d counts grouped by source', async () => {
    eventBus = new InMemoryEventBus();
    const now = new Date('2026-03-11T14:00:00.000Z');

    // Insert records at different times
    const recentTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const olderTime = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago

    await db.execute(sql`
      INSERT INTO pipeline_audit (event_id, source, title, outcome, stopped_at, created_at) VALUES
      ('evt-1', 'sec-edgar', 'SEC Filing', 'delivered', 'delivery', ${recentTime}),
      ('evt-2', 'sec-edgar', 'SEC Filing 2', 'delivered', 'delivery', ${recentTime}),
      ('evt-3', 'congress', 'Congress Trade', 'delivered', 'delivery', ${recentTime}),
      ('evt-4', 'sec-edgar', 'Old SEC Filing', 'delivered', 'delivery', ${olderTime}),
      ('evt-5', 'congress', 'Old Congress', 'filtered', 'alert_filter', ${recentTime})
    `);

    const monitor = new HealthMonitorService(db, eventBus, { now: () => now });
    const stats = await monitor.getDeliveryStats();

    // 24h: 3 delivered (2 sec-edgar + 1 congress), filtered ones excluded
    expect(stats.last24h.total).toBe(3);
    expect(stats.last24h.bySource['sec-edgar']).toBe(2);
    expect(stats.last24h.bySource['congress']).toBe(1);

    // 7d: 4 delivered (includes older sec-edgar)
    expect(stats.last7d.total).toBe(4);
    expect(stats.last7d.bySource['sec-edgar']).toBe(3);
    expect(stats.last7d.bySource['congress']).toBe(1);
  });
});

describe('DeliveryKillSwitch', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM delivery_kill_switch`);
  });

  afterAll(async () => {
    await safeClose(client);
  });

  it('defaults to inactive', async () => {
    const ks = new DeliveryKillSwitch(db);
    const active = await ks.isActive();
    expect(active).toBe(false);
  });

  it('activate sets enabled to true with reason', async () => {
    const ks = new DeliveryKillSwitch(db);
    const status = await ks.activate('Emergency stop');
    expect(status.enabled).toBe(true);
    expect(status.reason).toBe('Emergency stop');
    expect(status.activatedAt).toBeTruthy();
  });

  it('deactivate resets to inactive and nulls activatedAt', async () => {
    const ks = new DeliveryKillSwitch(db);
    await ks.activate('test');
    const status = await ks.deactivate();
    expect(status.enabled).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.activatedAt).toBeNull();
  });

  it('getStatus returns current state', async () => {
    const ks = new DeliveryKillSwitch(db);
    const status = await ks.getStatus();
    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('activatedAt');
    expect(status).toHaveProperty('reason');
    expect(status).toHaveProperty('updatedAt');
  });

  it('state persists across instances (survives restart)', async () => {
    const ks1 = new DeliveryKillSwitch(db);
    await ks1.activate('persist test');

    // Simulate "restart" with new instance
    const ks2 = new DeliveryKillSwitch(db);
    const active = await ks2.isActive();
    expect(active).toBe(true);

    const status = await ks2.getStatus();
    expect(status.reason).toBe('persist test');
  });

  it('throws a descriptive error when the singleton row disappears before status read', async () => {
    const fakeDb = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: async () => undefined,
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as unknown as Database;

    const ks = new DeliveryKillSwitch(fakeDb);

    await expect(ks.getStatus()).rejects.toThrow('Kill switch row missing after ensureRow');
  });
});
