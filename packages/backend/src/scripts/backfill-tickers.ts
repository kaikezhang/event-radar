/**
 * Backfill script: updates events.ticker from LLM enrichment data
 * and creates event_outcomes rows for outcome tracking.
 *
 * Usage: pnpm --filter @event-radar/backend exec tsx src/scripts/backfill-tickers.ts
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Step 1: Backfill events.ticker from llm_enrichment tickers
  console.log('[backfill-tickers] Updating events.ticker from LLM enrichment...');

  const tickerResult = await db.execute(sql`
    UPDATE events
    SET ticker = UPPER(LEFT(metadata->'llm_enrichment'->'tickers'->0->>'symbol', 10))
    WHERE ticker IS NULL
      AND metadata->'llm_enrichment'->'tickers'->0->>'symbol' IS NOT NULL
      AND LENGTH(metadata->'llm_enrichment'->'tickers'->0->>'symbol') <= 10
  `);

  const tickerCount = tickerResult.rowCount ?? 0;
  console.log(`[backfill-tickers] Updated ${tickerCount} events with tickers`);

  // Step 2: Create event_outcomes rows for events missing them
  console.log('[backfill-tickers] Creating event_outcomes for events without outcome tracking...');

  const outcomeResult = await db.execute(sql`
    INSERT INTO event_outcomes (event_id, ticker, event_time)
    SELECT id, LEFT(ticker, 10), received_at FROM events
    WHERE ticker IS NOT NULL
      AND LENGTH(ticker) <= 10
      AND id NOT IN (SELECT event_id FROM event_outcomes)
    ON CONFLICT DO NOTHING
  `);

  const outcomeCount = outcomeResult.rowCount ?? 0;
  console.log(`[backfill-tickers] Created ${outcomeCount} event_outcomes rows`);

  console.log('[backfill-tickers] Done! The processOutcomes cron will fill in prices.');

  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-tickers] Fatal error:', err);
  process.exit(1);
});
