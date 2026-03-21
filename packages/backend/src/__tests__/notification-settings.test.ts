import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Database } from '../db/connection.js';
import { users, watchlist, userNotificationSettings } from '../db/schema.js';
import { cleanTestDb, createTestDb, safeClose } from './helpers/test-db.js';
import { createNotificationSettingsStore } from '../services/notification-settings-store.js';
import { createUserWebhookDelivery } from '../services/user-webhook-delivery.js';
import { requireAuth } from '../routes/auth-middleware.js';

// ────────────────────────────────────────────────────────────
// 1. Auth middleware — requireAuth rejects anonymous, allows authenticated
// ────────────────────────────────────────────────────────────
describe('requireAuth middleware', () => {
  function fakeRequest(overrides: Partial<{ userId: string; apiKeyAuthenticated: boolean; headers: Record<string, string> }> = {}) {
    return {
      userId: overrides.userId,
      apiKeyAuthenticated: overrides.apiKeyAuthenticated ?? false,
      headers: overrides.headers ?? {},
    } as unknown as Parameters<typeof requireAuth>[0];
  }

  function fakeReply() {
    let sentStatus: number | undefined;
    let sentBody: unknown;
    let _sent = false;
    return {
      status(code: number) {
        sentStatus = code;
        return this;
      },
      async send(body: unknown) {
        sentBody = body;
        _sent = true;
      },
      get sent() { return _sent; },
      get _status() { return sentStatus; },
      get _body() { return sentBody; },
    } as unknown as Parameters<typeof requireAuth>[1] & { _status: number | undefined; _body: unknown };
  }

  it('rejects request with no userId (anonymous)', async () => {
    const reply = fakeReply();
    await requireAuth(fakeRequest(), reply, 'test-key');
    expect(reply._status).toBe(401);
  });

  it('rejects the "default" anonymous user', async () => {
    // Simulate a request that passes requireApiKey (JWT userId = 'default')
    const reply = fakeReply();
    await requireAuth(fakeRequest({ userId: 'default' }), reply, undefined);
    expect(reply._status).toBe(401);
  });

  it('allows authenticated user with real userId', async () => {
    const reply = fakeReply();
    await requireAuth(fakeRequest({ userId: 'user-abc' }), reply, undefined);
    expect(reply._status).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 2. Webhook URL validation (schema-level via notification-settings store)
// ────────────────────────────────────────────────────────────
describe('notification-settings store', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });
  afterAll(async () => {
    await safeClose(client);
  });
  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('returns default settings for non-existent user', async () => {
    const store = createNotificationSettingsStore(db);
    const settings = await store.get('nonexistent');
    expect(settings.discordWebhookUrl).toBeNull();
    expect(settings.enabled).toBe(true);
    expect(settings.minSeverity).toBe('HIGH');
  });

  it('upserts and retrieves user notification settings', async () => {
    await db.insert(users).values({ id: 'user-1' });
    const store = createNotificationSettingsStore(db);
    const saved = await store.upsert('user-1', {
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
      minSeverity: 'MEDIUM',
    });
    expect(saved.discordWebhookUrl).toBe('https://discord.com/api/webhooks/123/abc');
    expect(saved.minSeverity).toBe('MEDIUM');
  });

  it('enforces FK — rejects notification settings for non-existent user', async () => {
    const store = createNotificationSettingsStore(db);
    await expect(
      store.upsert('ghost-user', { discordWebhookUrl: 'https://discord.com/api/webhooks/1/x' }),
    ).rejects.toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// 3. Delivery retry/failure handling
// ────────────────────────────────────────────────────────────
describe('user webhook delivery — retry logic', () => {
  let db: Database;
  let client: PGlite;

  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });
  afterAll(async () => {
    await safeClose(client);
  });
  beforeEach(async () => {
    await cleanTestDb(db);
  });

  it('delivers successfully to matching users', async () => {
    await db.insert(users).values({ id: 'user-1' });
    await db.insert(watchlist).values({ userId: 'user-1', ticker: 'AAPL' });
    await db.insert(userNotificationSettings).values({
      userId: 'user-1',
      discordWebhookUrl: 'https://discord.com/api/webhooks/test/mock',
      enabled: true,
    });

    // Mock global fetch to return 204
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const service = createUserWebhookDelivery(db);
    const result = await service.deliverToMatchingUsers({
      title: 'AAPL Earnings Beat',
      description: 'Apple beat estimates',
      severity: 'HIGH',
      ticker: 'AAPL',
      source: 'test',
      timestamp: new Date(),
    });

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('retries on 5xx and counts errors after exhaustion', async () => {
    await db.insert(users).values({ id: 'user-2' });
    await db.insert(watchlist).values({ userId: 'user-2', ticker: 'TSLA' });
    await db.insert(userNotificationSettings).values({
      userId: 'user-2',
      discordWebhookUrl: 'https://discord.com/api/webhooks/test/fail',
      enabled: true,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );

    const service = createUserWebhookDelivery(db);
    const result = await service.deliverToMatchingUsers({
      title: 'TSLA News',
      description: 'Tesla event',
      severity: 'HIGH',
      ticker: 'TSLA',
      source: 'test',
      timestamp: new Date(),
    });

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
    // Should retry 3 times total
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    fetchSpy.mockRestore();
  });

  it('does not retry on 4xx (non-429)', async () => {
    await db.insert(users).values({ id: 'user-3' });
    await db.insert(watchlist).values({ userId: 'user-3', ticker: 'GOOG' });
    await db.insert(userNotificationSettings).values({
      userId: 'user-3',
      discordWebhookUrl: 'https://discord.com/api/webhooks/test/bad',
      enabled: true,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    const service = createUserWebhookDelivery(db);
    const result = await service.deliverToMatchingUsers({
      title: 'GOOG Update',
      description: 'Google event',
      severity: 'HIGH',
      ticker: 'GOOG',
      source: 'test',
      timestamp: new Date(),
    });

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(1);
    // 4xx should not retry — only 1 call
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('skips delivery when no ticker provided', async () => {
    const service = createUserWebhookDelivery(db);
    const result = await service.deliverToMatchingUsers({
      title: 'No Ticker',
      description: 'Event without ticker',
      severity: 'HIGH',
      source: 'test',
      timestamp: new Date(),
    });

    expect(result.sent).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('filters by severity threshold', async () => {
    await db.insert(users).values({ id: 'user-4' });
    await db.insert(watchlist).values({ userId: 'user-4', ticker: 'MSFT' });
    await db.insert(userNotificationSettings).values({
      userId: 'user-4',
      discordWebhookUrl: 'https://discord.com/api/webhooks/test/sev',
      minSeverity: 'HIGH',
      enabled: true,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const service = createUserWebhookDelivery(db);
    const result = await service.deliverToMatchingUsers({
      title: 'MSFT Low Priority',
      description: 'Minor event',
      severity: 'MEDIUM',
      ticker: 'MSFT',
      source: 'test',
      timestamp: new Date(),
    });

    // MEDIUM < HIGH threshold — should not deliver
    expect(result.sent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
