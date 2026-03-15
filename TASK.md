# TASK.md — WP6: Multi-Source Confirmation

> Reference: `docs/plans/2026-03-15-phase3-productization-v2.md` (WP6)

## Goal
When multiple sources report the same event (e.g., SEC filing + newswire press release), show confirmation badges and track multi-source provenance.

## IMPORTANT: Always INSERT, never skip
The v1 plan proposed skipping duplicate inserts. This was rejected because it breaks `pipeline_audit → events` feed joins. **Always INSERT the new event**, then UPDATE the older matching event's confirmation fields.

## Schema Changes

### Add indexed columns to `events` table
```sql
ALTER TABLE events ADD COLUMN ticker VARCHAR(10);
ALTER TABLE events ADD COLUMN event_type VARCHAR(50);
CREATE INDEX idx_events_ticker_type_time ON events(ticker, event_type, created_at DESC);
```
- Backfill: `UPDATE events SET ticker = metadata->>'ticker', event_type = metadata->>'eventType'`
- Pipeline: populate `ticker` and `event_type` on insert going forward

### Existing columns (already in schema, just need to be populated)
- `mergedFrom` — text array of event IDs
- `confirmedSources` — jsonb array of source strings
- `confirmationCount` — integer, default 1

## Implementation

### In `packages/backend/src/db/event-store.ts`
After inserting a new event:
1. If the new event has a `ticker` and `event_type`:
   - Query for existing events with same `ticker + event_type` within 30-min window
   - Exclude the just-inserted event itself
   - Use the new indexed columns (not JSONB query)
2. If match found:
   - Use `SELECT ... FOR UPDATE SKIP LOCKED` on the oldest matching event (avoid blocking)
   - UPDATE the older event: `confirmationCount += 1`, append source to `confirmedSources`, append new event ID to `mergedFrom`
3. If no match: do nothing (event stands alone with `confirmationCount = 1`)

### In event pipeline (`packages/backend/src/app.ts`)
- After `storeEvent()`, populate `ticker` and `event_type` columns from `event.metadata.ticker` and the classified `eventType`
- Call the confirmation check as part of the store step

### Concurrency safety
- Use `SELECT ... FOR UPDATE SKIP LOCKED` — if another transaction already locked the candidate, skip it
- Accept that rare concurrent inserts may miss a confirmation — it's cosmetic, not correctness-critical
- Do NOT use advisory locks (overkill for this use case)

## Delivery Templates

### Discord (`packages/delivery/src/discord-webhook.ts`)
- If `confirmationCount > 1`: add field "✓ Confirmed by N sources" with source list

### Bark (`packages/delivery/src/bark-pusher.ts`)
- If `confirmationCount > 1`: append "[N sources]" to title

### Telegram (`packages/delivery/src/telegram.ts`)
- If `confirmationCount > 1`: add line "✓ Confirmed by: source1, source2"

## Frontend

### AlertCard (`packages/web/src/components/AlertCard.tsx`)
- Show "✓ Confirmed by N sources" badge when `confirmationCount > 1`
- Small, subtle — use a green check icon

### EventDetail (`packages/web/src/pages/EventDetail.tsx`)
- In provenance section: show full source list with timestamps
- "Also reported by: PR Newswire (1m later), Reuters (3m later)"

## Testing
- Test: confirmation match within 30-min window
- Test: no match outside 30-min window
- Test: no match for different ticker or event_type
- Test: confirmationCount increments correctly
- Test: SKIP LOCKED doesn't block
- Test: delivery templates show confirmation badge
- Test: backfill script works

## PR
- Branch: `feat/wp6-confirmation` (already created)
- Title: "feat: multi-source event confirmation with indexed ticker/event_type (WP6)"
- Run ALL tests before creating PR
- Create PR and STOP. Do not merge.
