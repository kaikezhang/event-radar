# ⚠️ DO NOT MERGE. CREATE COMMITS AND PUSH ONLY.

# TASK: Fix PR #188 Review Issues — Feed Events Price Data

## Context
PR #188 (`fix/sprint-6-feed-prices`) was reviewed by Codex. Three issues found. You are on the `fix/sprint-6-feed-prices` branch. Fix all issues, commit, and push.

**⚠️ DO NOT MERGE THE PR. DO NOT MERGE. ONLY COMMIT AND PUSH.**

## Issues to Fix

### 1. Metadata inconsistency — ticker not written back to event.metadata
**File**: `packages/backend/src/event-pipeline.ts`
**Problem**: The late-enrichment branch updates `events.ticker` in the DB but does NOT write the ticker back into `event.metadata.ticker` or the persisted JSON metadata. Downstream readers (events-history.ts, event-similarity.ts, websocket.ts) that resolve tickers from metadata still see no ticker.
**Fix**: After setting `event.ticker`, also update `event.metadata.ticker` (or equivalent field in the stored JSON metadata). Update the DB row's metadata JSON column too.

### 2. Concurrency race — ticker casing mismatch + outcome scheduling
**File**: `packages/backend/src/event-pipeline.ts` + `packages/backend/src/services/outcome-tracker.ts`
**Problems**:
- `extractTicker()` returns LLM symbol verbatim (mixed case) but SQL update uses UPPER() — casing diverges between in-memory event and DB
- `scheduleOutcomeTrackingForEvent()` is called regardless of whether the `UPDATE ... WHERE ticker IS NULL` actually matched. If two enrichments race, one wins the DB update but the other still inserts event_outcomes with its own ticker.
**Fix**: 
- Normalize ticker to uppercase in `extractTicker()` or immediately after extraction
- Only call `scheduleOutcomeTrackingForEvent()` if the UPDATE actually affected a row (check result.rowCount or equivalent)

### 3. Test coverage — need pipeline integration tests
**Problem**: Only `extractTicker()` is tested. No test for: late LLM ticker discovery updating the stored event, scheduling outcome tracking exactly once, metadata consistency.
**Fix**: Add tests for:
- Late LLM ticker updates both `events.ticker` AND metadata
- Outcome tracking is scheduled only when UPDATE succeeds (not on race loser)
- Ticker is normalized (uppercase) consistently

## Requirements
- Run `pnpm --filter @event-radar/backend build` — must pass
- Commit message: `fix: address PR #188 review — metadata sync, race safety, ticker normalization`

## ⚠️ REMINDERS
- **DO NOT MERGE THE PR**
- **DO NOT CREATE A NEW PR**
- Only commit and push to the existing branch
