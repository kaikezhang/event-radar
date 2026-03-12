# Backend Quality Fix Plan

All issues from deep review. Fix in order. Each one = separate branch + PR.

## Fix 1: Unified Event Pipeline (P0 — most critical)
**Branch:** `fix/unified-pipeline`
**Problem:** `app.ts` has 3-4 separate `eventBus.subscribe()` callbacks that each call `ruleEngine.classify()` independently. Dedup only happens in the alertRouter subscriber, but DB storage subscriber stores duplicates anyway.
**Fix:**
1. In `app.ts`, replace all separate `eventBus.subscribe()` blocks with ONE unified handler
2. The single handler does: `classify → dedup → store (if not dup) → filter → deliver`
3. Order: classify once → check dedup → if not duplicate: store to DB + run alert filter + deliver
4. If duplicate: increment dedup metrics, skip store and delivery
5. Keep LLM classifier call inside the unified handler (after classify, before store)
6. Keep accuracy/adaptive service calls inside unified handler (after store)
**Files:** `packages/backend/src/app.ts`
**Tests:** Existing tests must still pass. Add integration test if feasible.

## Fix 2: Disable Dummy Scanner in Production (P0)
**Branch:** `fix/disable-dummy-prod`
**Problem:** `DummyScanner` always registered, generates fake events every 10 seconds, pollutes DB.
**Fix:**
1. In `app.ts`, only register DummyScanner when `process.env.DUMMY_SCANNER_ENABLED === 'true'` (default off)
2. Keep it available for tests via constructor injection
**Files:** `packages/backend/src/app.ts`

## Fix 3: Scanner Auto-Backoff on Consecutive Errors (P0)
**Branch:** `fix/scanner-backoff`
**Problem:** Reddit (403), Reuters (404), AP News (403), FedWatch (404) poll every 60s and fail every time. Wastes bandwidth and log spam.
**Fix:**
1. In `packages/shared/src/base-scanner.ts`, add consecutive error tracking
2. After 5 consecutive errors, double the poll interval (exponential backoff, max 30 minutes)
3. After 1 success, reset to normal interval
4. Log when entering/exiting backoff mode
5. Expose backoff state in scanner health (`healthAll()`)
**Files:** `packages/shared/src/base-scanner.ts`
**Tests:** Add unit tests for backoff behavior

## Fix 4: Register Missing Scanners (Analyst + Earnings) (P0)
**Branch:** `fix/register-missing-scanners`
**Problem:** `.env` has `ANALYST_ENABLED=true` and `EARNINGS_ENABLED=true` but `app.ts` never registers `AnalystScanner` or `EarningsScanner`.
**Fix:**
1. In `app.ts`, add registration blocks for AnalystScanner and EarningsScanner (like other scanners)
2. Import already exists for some — verify and add if missing
**Files:** `packages/backend/src/app.ts`

## Fix 5: Persist Ticker Cooldown Map (P0)
**Branch:** `fix/persist-cooldown`
**Problem:** `AlertFilter.cooldownMap` is in-memory Map. Restarts clear it → same ticker gets re-alerted within the 60-min cooldown window.
**Fix:**
1. In `packages/backend/src/pipeline/alert-filter.ts`, persist cooldownMap to disk (same pattern as SeenIdBuffer)
2. Save to `/tmp/event-radar-seen/ticker-cooldown.json` (or better: project `data/` dir)
3. Load on construction, save on update
**Files:** `packages/backend/src/pipeline/alert-filter.ts`

## Fix 6: SeenIdBuffer Use Set Instead of Array (P1)
**Branch:** `fix/seenidbuffer-set`
**Problem:** `SeenIdBuffer.has()` uses `this.ids.includes(id)` which is O(n). Should use Set for O(1) lookup.
**Fix:**
1. In `scrape-utils.ts`, change `ids: string[]` to use a `Set<string>` for lookups + `string[]` for ordering
2. `has()` checks Set, `add()` adds to both, maintains capacity via array
**Files:** `packages/backend/src/scanners/scraping/scrape-utils.ts`

## Fix 7: Graceful Shutdown (P1)
**Branch:** `fix/graceful-shutdown`
**Problem:** No SIGTERM/SIGINT handler. Process kill doesn't clean up DB connections or stop scanners.
**Fix:**
1. In `packages/backend/src/index.ts`, add SIGTERM + SIGINT handlers
2. On signal: stop all scanners (`registry.stopAll()`), close fastify server (`server.close()`), close DB connection
3. Log shutdown progress
**Files:** `packages/backend/src/index.ts`, possibly `packages/shared/src/scanner-registry.ts` (add `stopAll`)

## Fix 8: Remove Dead Code (P1)
**Branch:** `fix/remove-dead-code`
**Problem:** Lots of unused code after frontend removal and refactoring.
**Fix:** Delete these files/dirs:
- `packages/e2e/` — frontend E2E tests, frontend is gone
- `packages/delivery/src/severity-classifier.ts` — not imported anywhere
- `packages/backend/src/plugins/websocket.ts` — disabled, broken
- `packages/backend/src/plugins/auth.ts` — auth is no-op, keep but simplify
- `packages/backend/src/routes/auth-middleware.ts` — if unused
- Check `packages/backend/src/services/` for files that duplicate `pipeline/` functionality:
  - `services/event-dedup.ts` vs `pipeline/deduplicator.ts`
  - `services/llm-classifier.ts` vs `pipeline/llm-classifier.ts`
  - `services/llm-provider.ts` vs `pipeline/llm-provider.ts`
  - `services/rule-engine-v2.ts` vs `pipeline/rule-engine.ts`
  - Remove whichever is not imported
- Remove frontend references from `docker-compose.yml` frontend service block (but keep the file)
**Files:** Multiple deletions
**Tests:** Run full test suite after deletion to catch broken imports

## Fix 9: Dedup Check DB for sourceEventId (P2)
**Branch:** `fix/dedup-check-db`
**Problem:** In-memory dedup window is 30 minutes. If same article appears in different feeds >30min apart, it's treated as new.
**Fix:**
1. In `pipeline/deduplicator.ts`, add optional DB dependency
2. Before in-memory check, query DB for matching `source_event_id` in last 24 hours
3. If found in DB, mark as duplicate
4. Keep in-memory window for fast path (most duplicates caught here)
**Files:** `packages/backend/src/pipeline/deduplicator.ts`, `packages/backend/src/app.ts` (pass DB to deduplicator)

## Fix 10: Move Persistence from /tmp to data/ (P2)
**Branch:** `fix/persistence-dir`
**Problem:** `/tmp/event-radar-seen/` is cleared on system reboot.
**Fix:**
1. Create `packages/backend/data/` directory (gitignored)
2. Change SeenIdBuffer persist path from `/tmp/event-radar-seen/` to `<project-root>/data/seen/`
3. Change ticker cooldown persist path similarly
4. Add `data/` to `.gitignore`
**Files:** `packages/backend/src/scanners/scraping/scrape-utils.ts`, `packages/backend/src/pipeline/alert-filter.ts`, `.gitignore`
