/**
 * Delete dummy/test events from the database.
 *
 * Usage: npx tsx src/scripts/delete-dummy-events.ts
 */
import { eq } from 'drizzle-orm';
import { createDb } from '../db/connection.js';
import { events, pipelineAudit } from '../db/schema.js';

async function main() {
  const { db, pool } = createDb(
    process.env.DATABASE_URL ?? 'postgresql://radar:radar@localhost:5432/event_radar',
  );

  const deletedEvents = await db.delete(events).where(eq(events.source, 'dummy')).returning({ id: events.id });
  console.log(`Deleted ${deletedEvents.length} dummy events`);

  const deletedAudit = await db.delete(pipelineAudit).where(eq(pipelineAudit.source, 'dummy')).returning({ id: pipelineAudit.id });
  console.log(`Deleted ${deletedAudit.length} dummy pipeline_audit rows`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to delete dummy events:', err);
  process.exit(1);
});
