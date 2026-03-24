/**
 * Backfill SEC events using the CIK map first, then company-name inference.
 *
 * Usage:
 * pnpm --filter @event-radar/backend exec tsx src/scripts/backfill-sec-tickers.ts
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { findTickerByCik } from '../data/cik-ticker-map.js';
import { extractCompanyTickerFromText } from '../pipeline/ticker-inference.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';

interface SecEventRow {
  id: string;
  title: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
}

function resolveBackfillTicker(row: SecEventRow): string | null {
  const metadata = row.metadata ?? {};
  const cik = typeof metadata['cik'] === 'string' ? metadata['cik'] : null;
  const cikTicker = findTickerByCik(cik);
  if (cikTicker) {
    return cikTicker;
  }

  const searchText = [
    typeof metadata['issuer_name'] === 'string' ? metadata['issuer_name'] : null,
    typeof metadata['company_name'] === 'string' ? metadata['company_name'] : null,
    row.title,
    row.summary,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  return extractCompanyTickerFromText(searchText);
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('[backfill-sec-tickers] Loading SEC events with missing tickers...');

  const result = await db.execute(sql<SecEventRow>`
    SELECT id, title, summary, metadata
    FROM events
    WHERE source = 'sec-edgar'
      AND (ticker IS NULL OR BTRIM(ticker) = '')
  `);

  const rows = Array.isArray(result)
    ? (result as unknown as SecEventRow[])
    : ((result as unknown as { rows?: SecEventRow[] }).rows ?? []);

  let updatedEvents = 0;

  for (const row of rows) {
    const ticker = resolveBackfillTicker(row);
    if (!ticker) {
      continue;
    }

    await db.execute(sql`
      UPDATE events
      SET
        ticker = ${ticker},
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ticker}', to_jsonb(${ticker}::text), true),
          '{tickers}',
          to_jsonb(ARRAY[${ticker}]),
          true
        )
      WHERE id = ${row.id}
    `);

    updatedEvents++;
  }

  console.log(`[backfill-sec-tickers] Updated ${updatedEvents} SEC events`);

  const outcomeResult = await db.execute(sql`
    INSERT INTO event_outcomes (event_id, ticker, event_time)
    SELECT id, LEFT(ticker, 10), received_at
    FROM events
    WHERE source = 'sec-edgar'
      AND ticker IS NOT NULL
      AND LENGTH(ticker) <= 10
      AND id NOT IN (SELECT event_id FROM event_outcomes)
    ON CONFLICT DO NOTHING
  `);

  const outcomeCount = Array.isArray(outcomeResult)
    ? outcomeResult.length
    : (outcomeResult as { rowCount?: number }).rowCount ?? 0;

  console.log(`[backfill-sec-tickers] Created ${outcomeCount} missing outcome rows`);

  await pool.end();
}

main().catch((error) => {
  console.error('[backfill-sec-tickers] Fatal error:', error);
  process.exit(1);
});
