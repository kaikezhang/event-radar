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

  const metadataBackfillResult = await db.execute(sql`
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

  const truthSocialResult = await db.execute(sql`
    UPDATE events
    SET
      classification = CASE
        WHEN (
          title ILIKE '%military%'
          OR summary ILIKE '%military%'
          OR title ILIKE '%war%'
          OR summary ILIKE '%war%'
          OR title ILIKE '%threat%'
          OR summary ILIKE '%threat%'
          OR title ILIKE '%strike%'
          OR summary ILIKE '%strike%'
          OR title ILIKE '%attack%'
          OR summary ILIKE '%attack%'
        ) THEN 'BEARISH'
        WHEN (
          title ILIKE '%deal%'
          OR summary ILIKE '%deal%'
          OR title ILIKE '%peace%'
          OR summary ILIKE '%peace%'
          OR title ILIKE '%economy%'
          OR summary ILIKE '%economy%'
          OR title ILIKE '%jobs%'
          OR summary ILIKE '%jobs%'
          OR title ILIKE '%growth%'
          OR summary ILIKE '%growth%'
        ) THEN 'BULLISH'
        ELSE 'NEUTRAL'
      END,
      classification_confidence = COALESCE(classification_confidence, '0.6500'::DECIMAL(5, 4))
    WHERE
      source = 'truth-social'
      AND (classification IS NULL OR BTRIM(classification) = '')
  `);

  const updatedCount =
    (metadataBackfillResult.rowCount ?? 0) + (truthSocialResult.rowCount ?? 0);

  console.log(`[backfill-classification] Updated ${updatedCount} events`);
  await pool.end();
}

main().catch((error) => {
  console.error('[backfill-classification] Fatal error:', error);
  process.exit(1);
});
