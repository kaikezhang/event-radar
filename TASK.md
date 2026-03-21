# ⚠️ DO NOT MERGE THIS PR. CREATE COMMITS AND PUSH ONLY.

# TASK: Fix PR #188 Review Issues — Feed Price Ticker Consistency

## Context
PR #188 (`fix/sprint-6-feed-prices`) was reviewed by Codex with **CHANGES REQUESTED**. You are on the `fix/sprint-6-feed-prices` branch. Fix all three issues below, commit, and push. **DO NOT MERGE.**

## Issues to Fix

### 1. 🚨 Metadata inconsistency after late-enrichment
**File**: `packages/backend/src/event-pipeline.ts`
**Problem**: The late-enrichment branch only updates `events.ticker` in the DB. It does NOT write the ticker back into `event.metadata.ticker` or the persisted JSON metadata. Downstream readers (`events-history.ts`, `event-similarity.ts`, `websocket.ts`) resolve tickers from metadata and still see no ticker.
**Fix**: After updating `events.ticker`, also update the stored event's `metadata` JSON to include the ticker. Use an `UPDATE events SET metadata = jsonb_set(metadata, '{ticker}', ...)` or equivalent Drizzle ORM pattern.

### 2. ⚠️ Concurrency safety + casing normalization
**File**: `packages/backend/src/event-pipeline.ts` + `packages/backend/src/services/outcome-tracker.ts`
**Problems**:
- `extractTicker()` returns the LLM symbol verbatim, but the SQL update uppercases it → casing can diverge between in-memory and DB
- `scheduleOutcomeTrackingForEvent()` is called regardless of whether the `UPDATE ... WHERE ticker IS NULL` actually won the race → can cause mismatched tickers in `event_outcomes`
**Fix**:
- Normalize ticker to uppercase immediately in `extractTicker()` (or right after calling it)
- Only call `scheduleOutcomeTrackingForEvent()` if the UPDATE actually affected a row (check row count / returning clause)

### 3. ⚠️ Inadequate test coverage
**Problem**: Tests only cover `extractTicker()` helper. No tests for the actual pipeline behavior.
**Fix**: Add at least one integration-style test that verifies:
- Late LLM ticker discovery updates both `events.ticker` AND `events.metadata`
- Outcome tracking is only scheduled when the update wins (row affected)
- Ticker casing is consistent across all stores

## Requirements
- Run `pnpm --filter @event-radar/backend build` — must pass
- Commit message: `fix: address PR #188 review — metadata sync, concurrency, tests`
- Push to `fix/sprint-6-feed-prices` branch

## ⚠️ DO NOT MERGE. Push only.
