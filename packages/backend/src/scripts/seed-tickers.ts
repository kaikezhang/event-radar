/**
 * Seed script: populates the ticker_reference table with US-listed equities
 * from SEC EDGAR company tickers JSON.
 *
 * Usage: pnpm --filter @event-radar/backend seed:tickers
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';
const SEC_EDGAR_URL = 'https://www.sec.gov/files/company_tickers.json';

interface SecEdgarEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

// Major US exchanges — skip OTC and foreign listings
// Major US exchanges — skip OTC and foreign listings (reserved for future filtering)
// const US_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'BATS', 'CBOE']);

async function main() {
  console.log('[seed-tickers] Fetching ticker data from SEC EDGAR...');
  const res = await fetch(SEC_EDGAR_URL, {
    headers: { 'User-Agent': 'EventRadar/1.0 (contact@eventradar.dev)' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch SEC EDGAR data: ${res.status} ${res.statusText}`);
  }

  const data: Record<string, SecEdgarEntry> = await res.json();
  const entries = Object.values(data);
  console.log(`[seed-tickers] Fetched ${entries.length} entries from SEC EDGAR`);

  // Filter and transform entries
  const tickers = entries
    .filter((e) => {
      // Basic ticker format: 1-10 uppercase letters/dots (e.g. BRK.B)
      return /^[A-Z.]{1,10}$/.test(e.ticker);
    })
    .map((e) => ({
      ticker: e.ticker,
      name: e.title.slice(0, 200),
      // SEC EDGAR doesn't provide sector/exchange, leave null
      sector: null as string | null,
      industry: null as string | null,
      exchange: null as string | null,
    }));

  console.log(`[seed-tickers] Filtered to ${tickers.length} valid tickers`);

  // Connect to DB
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Batch upsert (500 at a time)
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    // Build values for upsert
    const values = batch
      .map(
        (t) =>
          sql`(${t.ticker}, ${t.name}, ${t.sector}, ${t.industry}, ${t.exchange}, NOW())`,
      );

    await db.execute(sql`
      INSERT INTO ticker_reference (ticker, name, sector, industry, exchange, updated_at)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (ticker) DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
    `);

    inserted += batch.length;
    console.log(`[seed-tickers] Upserted ${inserted}/${tickers.length} tickers`);
  }

  console.log(`[seed-tickers] Done! ${inserted} tickers seeded.`);

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-tickers] Fatal error:', err);
  process.exit(1);
});
