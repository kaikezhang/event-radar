/**
 * Backfill script: populates top-level classification fields from legacy metadata.llm_judge.
 *
 * Usage: pnpm --filter @event-radar/backend exec tsx src/scripts/backfill-classification.ts
 */

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('[backfill-classification] Backfilling event classification fields from metadata.llm_judge...');

  const result = await db.execute(sql`
    UPDATE events
    SET
      classification = CASE
        WHEN UPPER(TRIM(metadata->'llm_judge'->>'direction')) = 'MIXED' THEN 'NEUTRAL'
        ELSE UPPER(TRIM(metadata->'llm_judge'->>'direction'))
      END,
      classification_confidence = CASE
        WHEN TRIM(COALESCE(metadata->'llm_judge'->>'confidence', '')) ~ '^[0-9]*\\.?[0-9]+$'
          THEN (metadata->'llm_judge'->>'confidence')::DECIMAL(5, 4)
        ELSE classification_confidence
      END
    WHERE
      (classification IS NULL OR BTRIM(classification) = '')
      AND metadata->'llm_judge'->>'direction' IS NOT NULL
      AND UPPER(TRIM(metadata->'llm_judge'->>'direction')) IN ('BULLISH', 'BEARISH', 'NEUTRAL', 'MIXED')
  `);

  console.log(`[backfill-classification] Updated ${result.rowCount ?? 0} events`);
  await pool.end();
}

main().catch((error) => {
  console.error('[backfill-classification] Fatal error:', error);
  process.exit(1);
});
