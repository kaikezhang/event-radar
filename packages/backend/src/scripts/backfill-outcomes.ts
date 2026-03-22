/**
 * Backfill script: creates event_outcomes rows for all events with a ticker
 * but no existing outcome row. The processOutcomes cron will fill in prices.
 *
 * Usage: pnpm --filter @event-radar/backend exec tsx src/scripts/backfill-outcomes.ts
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Check current state
  const beforeResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM events WHERE ticker IS NOT NULL) AS events_with_ticker,
      (SELECT COUNT(*) FROM event_outcomes) AS existing_outcomes
  `);
  const before = (beforeResult as unknown as { rows: Array<{ events_with_ticker: string; existing_outcomes: string }> }).rows[0];
  console.log(`[backfill-outcomes] Before: ${before?.events_with_ticker ?? 0} events with ticker, ${before?.existing_outcomes ?? 0} existing outcomes`);

  // Insert missing outcome rows
  console.log('[backfill-outcomes] Creating event_outcomes for events without outcome tracking...');

  const result = await db.execute(sql`
    INSERT INTO event_outcomes (event_id, ticker, event_time)
    SELECT e.id, LEFT(e.ticker, 10), e.received_at
    FROM events e
    WHERE e.ticker IS NOT NULL
      AND LENGTH(e.ticker) <= 10
      AND e.id NOT IN (SELECT event_id FROM event_outcomes)
    ON CONFLICT DO NOTHING
  `);

  const count = result.rowCount ?? 0;
  console.log(`[backfill-outcomes] Created ${count} new event_outcomes rows`);

  // Also fix the Iran/Hormuz direction
  console.log('[backfill-outcomes] Fixing Iran/Hormuz event direction...');
  const directionResult = await db.execute(sql`
    UPDATE events SET metadata = jsonb_set(COALESCE(metadata, '{}')::jsonb, '{direction}', '"bearish"')
    WHERE title LIKE '%Iran%Hormuz%' AND source = 'truth-social'
  `);
  console.log(`[backfill-outcomes] Updated ${directionResult.rowCount ?? 0} Iran/Hormuz events to bearish`);

  // Check final state
  const afterResult = await db.execute(sql`
    SELECT COUNT(*) AS total_outcomes FROM event_outcomes
  `);
  const after = (afterResult as unknown as { rows: Array<{ total_outcomes: string }> }).rows[0];
  console.log(`[backfill-outcomes] After: ${after?.total_outcomes ?? 0} total outcomes`);
  console.log('[backfill-outcomes] Done! The processOutcomes cron will fill in prices.');

  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-outcomes] Fatal error:', err);
  process.exit(1);
});
