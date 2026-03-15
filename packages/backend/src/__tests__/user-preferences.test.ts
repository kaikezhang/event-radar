import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import { userPreferences, users } from '../db/schema.js';
import {
  cleanTestDb,
  createTestDb,
  safeClose,
} from './helpers/test-db.js';

describe('user preferences schema', () => {
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

  it('stores default notification preferences for a user', async () => {
    await db.insert(users).values({ id: 'user-1' });

    const [preference] = await db
      .insert(userPreferences)
      .values({ userId: 'user-1' })
      .returning();

    expect(preference.userId).toBe('user-1');
    expect(preference.quietStart).toBeNull();
    expect(preference.quietEnd).toBeNull();
    expect(preference.timezone).toBe('America/New_York');
    expect(preference.dailyPushCap).toBe(20);
    expect(preference.pushNonWatchlist).toBe(false);
    expect(preference.updatedAt).toBeInstanceOf(Date);
  });

  it('supports quiet-hours overrides', async () => {
    await db.insert(users).values({ id: 'user-1' });

    const [preference] = await db
      .insert(userPreferences)
      .values({
        userId: 'user-1',
        quietStart: '23:00',
        quietEnd: '08:00',
        timezone: 'America/Chicago',
        dailyPushCap: 10,
        pushNonWatchlist: true,
      })
      .returning();

    expect(preference.quietStart).toBe('23:00:00');
    expect(preference.quietEnd).toBe('08:00:00');
    expect(preference.timezone).toBe('America/Chicago');
    expect(preference.dailyPushCap).toBe(10);
    expect(preference.pushNonWatchlist).toBe(true);
  });

  it('deletes preferences when the owning user is removed', async () => {
    await db.insert(users).values({ id: 'user-1' });
    await db.insert(userPreferences).values({ userId: 'user-1' });

    await db.delete(users).where(eq(users.id, 'user-1'));

    const rows = await db.select().from(userPreferences);
    expect(rows).toHaveLength(0);
  });
});
