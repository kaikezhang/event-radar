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
  await db.execute(sql`DELETE FROM delivery_kill_switch`);
  await db.execute(sql`DELETE FROM pipeline_audit`);
  await db.execute(sql`DELETE FROM push_subscriptions`);
  await db.execute(sql`DELETE FROM user_notification_settings`);
  await db.execute(sql`DELETE FROM user_preferences`);
  await db.execute(sql`DELETE FROM refresh_tokens`);
  await db.execute(sql`DELETE FROM magic_link_tokens`);
  await db.execute(sql`DELETE FROM watchlist`);
  await db.execute(sql`DELETE FROM watchlist_sections`);
  await db.execute(sql`DELETE FROM ticker_reference`);
  await db.execute(sql`DELETE FROM users`);
  await db.execute(sql`DELETE FROM severity_changes`);
  await db.execute(sql`DELETE FROM severity_overrides`);
  await db.execute(sql`DELETE FROM budget_config`);
  await db.execute(sql`DELETE FROM alert_log`);
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
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(100) PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS magic_link_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      family_id UUID NOT NULL,
      replaced_by UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      quiet_start TIME,
      quiet_end TIME,
      timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
      daily_push_cap INTEGER NOT NULL DEFAULT 20,
      push_non_watchlist BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source VARCHAR(100) NOT NULL,
      source_event_id VARCHAR(255),
      ticker VARCHAR(10),
      event_type VARCHAR(50),
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
    CREATE INDEX IF NOT EXISTS idx_events_ticker_type_time
    ON events (ticker, event_type, created_at DESC)
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
      price_t5 DECIMAL(12, 2),
      price_t20 DECIMAL(12, 2),
      price_1w DECIMAL(10, 2),
      price_1m DECIMAL(10, 2),
      change_1h DECIMAL(10, 4),
      change_1d DECIMAL(10, 4),
      change_t5 DECIMAL(8, 4),
      change_t20 DECIMAL(8, 4),
      change_1w DECIMAL(10, 4),
      change_1m DECIMAL(10, 4),
      evaluated_t5_at TIMESTAMPTZ,
      evaluated_t20_at TIMESTAMPTZ,
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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alert_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      priority VARCHAR(20) NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      suppressed BOOLEAN NOT NULL DEFAULT FALSE,
      suppression_reason TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS budget_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      max_alerts_per_hour INTEGER NOT NULL DEFAULT 50,
      priority_shares JSONB NOT NULL,
      window_minutes INTEGER NOT NULL DEFAULT 60,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS severity_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
      severity VARCHAR(20) NOT NULL,
      locked BOOLEAN NOT NULL DEFAULT FALSE,
      locked_by VARCHAR(20),
      source_count INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS severity_changes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      previous_severity VARCHAR(20) NOT NULL,
      new_severity VARCHAR(20) NOT NULL,
      reason TEXT NOT NULL,
      changed_by VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ticker_reference (
      ticker VARCHAR(10) PRIMARY KEY NOT NULL,
      name VARCHAR(200) NOT NULL,
      sector VARCHAR(100),
      industry VARCHAR(100),
      exchange VARCHAR(20),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS watchlist_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      color VARCHAR(20) DEFAULT 'gray',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_user_name ON watchlist_sections (user_id, name)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS watchlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ticker VARCHAR(10) NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT,
      section_id UUID REFERENCES watchlist_sections(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT watchlist_user_ticker_unique UNIQUE (user_id, ticker)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      last_seen_at TIMESTAMPTZ,
      disabled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pipeline_audit (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(100) NOT NULL,
      source VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      severity VARCHAR(20),
      ticker VARCHAR(20),
      outcome VARCHAR(30) NOT NULL,
      stopped_at VARCHAR(30) NOT NULL,
      reason TEXT,
      reason_category VARCHAR(30),
      delivery_channels JSONB,
      historical_match BOOLEAN,
      historical_confidence VARCHAR(20),
      duration_ms INTEGER,
      confidence DECIMAL(5, 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS delivery_kill_switch (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      activated_at TIMESTAMPTZ,
      reason TEXT,
      updated_by VARCHAR(50),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_notification_settings (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      discord_webhook_url TEXT,
      email_address TEXT,
      min_severity VARCHAR(20) NOT NULL DEFAULT 'HIGH',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_notification_settings_user_id_unique UNIQUE (user_id)
    )
  `);

  return { db, client };
}
