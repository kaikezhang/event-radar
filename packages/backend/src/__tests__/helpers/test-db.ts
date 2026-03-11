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
  await db.execute(sql`DELETE FROM alert_rules`);
  await db.execute(sql`DELETE FROM reclassification_queue`);
  await db.execute(sql`DELETE FROM weight_adjustments`);
  await db.execute(sql`DELETE FROM source_weights`);
  await db.execute(sql`DELETE FROM user_feedback`);
  await db.execute(sql`DELETE FROM deliveries`);
  await db.execute(sql`DELETE FROM classification_outcomes`);
  await db.execute(sql`DELETE FROM classification_predictions`);
  await db.execute(sql`DELETE FROM event_outcomes`);
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
    CREATE TABLE IF NOT EXISTS event_outcomes (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      ticker VARCHAR(10) NOT NULL,
      event_time TIMESTAMPTZ NOT NULL,
      event_price DECIMAL(10, 2),
      price_1h DECIMAL(10, 2),
      price_1d DECIMAL(10, 2),
      price_1w DECIMAL(10, 2),
      price_1m DECIMAL(10, 2),
      change_1h DECIMAL(10, 4),
      change_1d DECIMAL(10, 4),
      change_1w DECIMAL(10, 4),
      change_1m DECIMAL(10, 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classification_predictions (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      predicted_severity VARCHAR(20) NOT NULL,
      predicted_direction VARCHAR(20) NOT NULL,
      confidence DECIMAL(5, 4) NOT NULL,
      classified_by VARCHAR(20) NOT NULL,
      classified_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classification_outcomes (
      id SERIAL PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      actual_direction VARCHAR(20) NOT NULL,
      price_change_1h DECIMAL(10, 4) NOT NULL,
      price_change_1d DECIMAL(10, 4) NOT NULL,
      price_change_1w DECIMAL(10, 4) NOT NULL,
      evaluated_at TIMESTAMPTZ NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      verdict VARCHAR(30) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS source_weights (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR(100) NOT NULL UNIQUE,
      weight DECIMAL(5, 4) NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS weight_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      previous_weights JSONB NOT NULL,
      new_weights JSONB NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      dsl TEXT NOT NULL,
      conditions_ast JSONB NOT NULL,
      actions JSONB NOT NULL,
      rule_order INTEGER NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reclassification_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      reason VARCHAR(50) NOT NULL,
      priority INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
