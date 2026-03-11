import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import type { Database } from '../../db/connection.js';

/** Close PGlite with a timeout to prevent hanging in CI */
export async function safeClose(client: PGlite, timeoutMs = 3000): Promise<void> {
  await Promise.race([
    client.close(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Close a Fastify server with a timeout to prevent hanging in CI */
export async function safeCloseServer(
  server: { close(): Promise<void> },
  timeoutMs = 3000,
): Promise<void> {
  await Promise.race([
    server.close(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Truncate all tables to clean data between tests (keeps the schema) */
export async function cleanTestDb(db: Database): Promise<void> {
  await db.execute(sql`DELETE FROM deliveries`);
  await db.execute(sql`DELETE FROM events`);
}

export async function createTestDb(): Promise<{
  db: Database;
  client: PGlite;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;

  // Create tables using raw SQL (matching the drizzle schema)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR(100) NOT NULL,
      source_event_id VARCHAR(255),
      title TEXT NOT NULL,
      summary TEXT,
      raw_payload JSONB,
      metadata JSONB,
      severity VARCHAR(20),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      merged_from TEXT[],
      source_urls JSONB,
      is_duplicate BOOLEAN DEFAULT FALSE,
      confirmed_sources JSONB DEFAULT '[]',
      confirmation_count INTEGER DEFAULT 1
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id),
      channel VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      error TEXT,
      sent_at TIMESTAMPTZ
    )
  `);

  return { db, client };
}
