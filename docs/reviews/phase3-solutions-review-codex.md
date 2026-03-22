# Phase 3 Solutions Review — Codex

> Reviewer: Codex | Date: 2026-03-22 | Reviewed doc: `docs/PHASE-3-SOLUTIONS.md`

## Executive Summary

The document identifies the right product pain points, but several proposed fixes target the wrong implementation path.

The biggest mismatches are:

1. `TK3` assumes the UI uses `/api/events/search`, but the current search UI actually calls `/api/events?q=...` and `/api/events?ticker=...`. Fixing only the FTS route will not fix the user-visible search failure. Relevant code: `packages/web/src/lib/api.ts`, `packages/web/src/hooks/useSearch.ts`, `packages/backend/src/routes/events.ts`.
2. `TK2` assumes the bad earnings data came from `earnings_history` and can be cleaned via live `events.source='yahoo-finance'`. The historical importer actually uses `yfinance.get_earnings_dates()` and writes to the historical tables, not the live `events` table. Relevant code: `packages/backend/src/scripts/helpers/yfinance-bridge.py`, `packages/backend/src/scripts/bootstrap-earnings.ts`.
3. `TK1` has the right root cause, but the recommended reset-based fix is unsafe under the current shared `default` identity model. A blind reset endpoint in `AUTH_REQUIRED=false` mode would let one anonymous client wipe another session’s watchlist.

## Per-Solution Review

### TK1: Watchlist Ghost Tickers

**Verdict:** Root cause is correct. Recommended solution is only a short-term patch and introduces a data integrity risk.

What the code does now:

- The auth plugin assigns both valid API-key requests and anonymous `AUTH_REQUIRED=false` requests to `userId='default'`: `packages/backend/src/plugins/auth.ts:112`.
- Watchlist routes and onboarding both resolve and write through that same user: `packages/backend/src/routes/watchlist.ts:26`, `packages/backend/src/routes/onboarding.ts:84`.
- Onboarding disables quick-add chips based on the current watchlist and only bulk-adds missing tickers; it never replaces the list: `packages/web/src/pages/Onboarding.tsx:140`, `packages/web/src/pages/Onboarding.tsx:181`, `packages/web/src/pages/Onboarding.tsx:507`.

Risks and edge cases the doc misses:

- A new `DELETE /api/v1/watchlist/reset` endpoint is dangerous in the current auth model. In local/dev mode, every anonymous browser session maps to the same `default` user, so one client can wipe another client’s state.
- Gating the reset with `localStorage.onboardingComplete` is not authoritative. Clearing storage, using a new tab/browser, or re-running onboarding can still produce destructive behavior.
- A client-generated per-session userId is not safe if the server trusts it directly. If that value is only stored in `localStorage` and then sent to the server, it becomes a spoofable identity mechanism.

Better alternative:

- Short-term: add an explicit onboarding-only `replace watchlist with selected tickers` operation, implemented transactionally, instead of a generic reset endpoint.
- Correct fix: issue a real guest identity via signed cookie/session UUID, keep watchlists per guest, then merge guest watchlist into the authenticated user on login.

Effort:

- Reset/replace patch: `0.5-1 day`
- Proper guest identity: `1.5-3 days`

### TK2: Earnings Data Incorrect

**Verdict:** The proposal does not match the current importer and cleanup path.

What the code does now:

- The Python bridge uses `yf.Ticker(...).get_earnings_dates()`, not `earnings_history`: `packages/backend/src/scripts/helpers/yfinance-bridge.py:18`.
- The TypeScript bootstrap imports those results into historical tables and labels them as `sourceName='yfinance'` / `sourceType='earnings_calendar'`: `packages/backend/src/scripts/bootstrap-earnings.ts:630`, `packages/backend/src/scripts/bootstrap-earnings.ts:1214`.
- Fiscal quarter is inferred from the earnings date month, not from provider quarter metadata: `packages/backend/src/scripts/bootstrap-earnings.ts:676`.

Risks and edge cases the doc misses:

- Deleting `events.source='yahoo-finance'` would not remove the bad historical rows, because the importer does not write there.
- Inferring quarter from calendar month is wrong for off-calendar fiscal years.
- Every imported earnings event is forced to `marketSession='after_hours'`, which can distort downstream outcome analysis.
- The importer has no quarantine path for absurd EPS/surprise values; it just imports what it gets.

Better alternative:

- Audit and clean the historical earnings tables by `bootstrapBatch`, `sourceName='yfinance'`, and event type, not the live `events` table.
- Validate imported EPS/surprise against a second structured source before insert or before promoting to production.
- Store provider-native quarter/session metadata instead of deriving quarter from date.
- Quarantine suspicious rows rather than silently importing and later deleting them.

Effort:

- Proper audit + cleanup + reimport + guardrails: `2-4 days`

### TK3: Search Unreliable

**Verdict:** The proposal is aimed at the wrong endpoint.

What the code does now:

- The search UI debounces locally and calls `searchEvents()`: `packages/web/src/hooks/useSearch.ts:22`.
- `searchEvents()` hits `/api/events?q=...` and, for ticker-like queries, `/api/events?ticker=...`: `packages/web/src/lib/api.ts:679`.
- `/api/events?q=` only does `ILIKE` over `title` and `summary`: `packages/backend/src/routes/events.ts:229`.
- `/api/events/search` does richer full-text search, but the main UI does not call it: `packages/backend/src/routes/events.ts:273`.

Risks and edge cases the doc misses:

- If the missing “172 earnings events” are historical backfill records, neither current route will find them because live `events` and historical data are split.
- Adding `ILIKE` fallback to `/api/events/search` will not help if the frontend never reaches that route.
- Blanket frontend timing fixes are probably not the main issue. The bigger problem is split semantics between live search and historical search.

Better alternative:

- Consolidate event search behind one backend endpoint that searches both live `events` and historical tables, with explicit ranking and scope.
- If live vs historical separation matters, expose it in the UI instead of hiding it behind frontend heuristics.
- Only after that, tune debounce/loading/no-results behavior.

Effort:

- Wire frontend to FTS route only: `0.5 day`, but incomplete
- Real unified search fix: `1.5-3 days`

### TK4: Evidence Tab Blank

**Verdict:** The problem is real, but it is more of a missing-fallback/data-shape issue than a tab-routing bug.

What the code does now:

- The Evidence tab already renders market data, regime context, evidence content, and event history: `packages/web/src/pages/EventDetail/index.tsx:192`.
- `EventEvidenceContent` only renders sections when enrichment fields exist: `packages/web/src/pages/EventDetail/EventEnrichment.tsx:33`.
- Source details are only supported for a small subset of sources (`breaking-news`, `sec-edgar`, `trading-halt`, `econ-calendar`, `stocktwits`, `reddit`): `packages/web/src/pages/EventDetail/EventSourceCard.tsx:23`.
- `extractSourceMetadataClient()` also only maps a small subset of sources, so sources like `truth-social`, `analyst`, `earnings`, `congress`, etc. often have nothing to show: `packages/web/src/lib/api.ts:969`.

Risks and edge cases the doc misses:

- For many events, every Evidence component legitimately returns `null`, so the tab looks empty even though rendering is technically working.
- Only adding one fallback sentence is not enough if source metadata extraction remains narrow.
- Backfill/historical events may never have LLM enrichment, so the Evidence tab needs a generic source/provenance fallback, not only an “AI not available” note.

Better alternative:

- Keep the current tab structure.
- Add a guaranteed Evidence fallback card that always shows at least source, timestamp, original link, provenance count, and a clear “analysis unavailable” state.
- Expand `extractSourceMetadataClient()` and `EventSourceCard` coverage for the highest-volume sources first.

Effort:

- Fallback-only fix: `0.5 day`
- Fallback + broader source metadata coverage: `1-2 days`

### TK5: WebSocket Disconnects

**Verdict:** Partially reasonable, but the backend-heartbeat diagnosis is already outdated.

What the code does now:

- The backend already sends a heartbeat every 30 seconds via JSON `ping`: `packages/backend/src/plugins/websocket.ts:287`.
- The frontend reconnect loop exists with exponential backoff to 60 seconds: `packages/web/src/hooks/useWebSocket.ts:64`.
- The client does not track missed heartbeats, visibility changes, or `online` events; it only reacts after socket close: `packages/web/src/hooks/useWebSocket.ts:44`.
- Vite proxy is minimal but already enables WS forwarding: `packages/web/vite.config.ts:10`.

Risks and edge cases the doc misses:

- Adding backend `client.ping()` is probably redundant unless the issue is specifically TCP-level idle detection through intermediaries.
- `timeout: 0` in the Vite proxy may hide a dev symptom without addressing production behavior.
- If the connection silently stalls without emitting `close`, the current client never notices because it ignores heartbeat freshness.

Better alternative:

- Diagnose first: separate dev-proxy issues from backend/plugin issues from tunnel/browser issues.
- Add a client-side liveness watchdog that expects the server heartbeat and forces reconnect if no ping/event arrives for a threshold window.
- Add `visibilitychange` and `online`-triggered reconnect as a secondary improvement.

Effort:

- Diagnosis + client watchdog + visibility reconnect: `0.5-1.5 days`

### E1: Notification Settings Load Failure

**Verdict:** Correct diagnosis. Small, high-value fix.

What the code does now:

- Notification settings routes use `requireAuth`: `packages/backend/src/routes/notification-settings.ts:36`.
- `requireAuth` rejects `userId='default'`, including valid API-key callers under the current auth plugin: `packages/backend/src/routes/auth-middleware.ts:84`.

Review:

- The proposed fix is correct in direction.
- This should move higher in priority because it is small and currently blocks a visible settings surface.

Effort:

- `0.5 day`

### E2: Feed Event Deduplication

**Verdict:** The proposed frontend-only rule is too blunt.

What the code does now:

- StockTwits trending already has a persisted 24h cooldown in the scanner: `packages/backend/src/scanners/stocktwits-scanner.ts:95`, `packages/backend/src/scanners/trending-state.ts:15`.
- Search results already dedupe by `title + source`, but the live feed merges by event id only: `packages/web/src/lib/api.ts:700`, `packages/web/src/hooks/useAlerts.ts:24`.

Risks and edge cases the doc misses:

- `same source + same ticker within 24h => show only latest` will hide distinct events from the same source/ticker, such as a trending entry, sentiment flip, and volume spike in one day.
- Frontend-only suppression masks backend quality problems and can make audit/debugging harder.

Better alternative:

- Deduplicate on a stronger key such as `source + subtype + normalized title` or upstream event identity.
- Prefer backend/query-layer suppression for feeds, keeping raw events available for audit/debug.

Effort:

- Feed-layer dedupe tune-up: `0.5-1 day`

### E3: Direction Label Calibration

**Verdict:** Reasonable to investigate, but “truth-social geopolitical events should be bearish” is too simplistic.

What the code does now:

- Truth Social events include source and political keywords in metadata: `packages/backend/src/scanners/truth-social-scanner.ts:132`.
- The classifier prompt already includes source, metadata, and body: `packages/backend/src/pipeline/classification-prompt.ts:24`.

Risks and edge cases the doc misses:

- Geopolitical events are not uniformly bearish. They can be bearish for indices, bullish for oil, bullish for defense, and mixed overall.
- For macro/geopolitical events without a clear ticker, forcing a single-direction label can be less truthful than returning mixed/neutral plus better impacted-asset metadata.

Better alternative:

- Audit misclassified examples first.
- Tighten prompt/rule guidance around “broad market impact” vs “single-stock impact”.
- Improve impacted-ticker extraction and context before forcing bearish defaults.

Effort:

- `0.5-1.5 days`

## Answers To The 4 Review Questions

### 1. Is the solution design reasonable? Are there better alternatives?

Partially.

- `TK1`, `TK4`, and `E1` identify the right user-facing failures.
- `TK2` and `TK3` are aimed at the wrong implementation layer.
- `TK5` is directionally useful on the client side, but the backend-heartbeat premise is already stale.

Better alternatives:

- `TK1`: onboarding “replace watchlist” transaction as a short-term patch; signed guest identity as the real fix.
- `TK2`: historical-table audit and reimport with validation/quarantine, not live-event deletion.
- `TK3`: single unified search endpoint over live + historical data.
- `TK4`: guaranteed evidence fallback plus broader source metadata extraction.
- `TK5`: client heartbeat watchdog before proxy-timeout tweaks.
- `E2`: backend/feed dedupe by subtype or normalized title, not blanket same-source/same-ticker suppression.
- `E3`: calibrate impact semantics, not a blanket “truth-social geopolitical = bearish” rule.

### 2. Are there edge cases or risks not considered?

Yes.

- `TK1`: reset endpoint can wipe shared anonymous state across browsers in `AUTH_REQUIRED=false`.
- `TK1`: client-generated session IDs are insecure if the server trusts them directly.
- `TK2`: quarter/session inference is wrong for off-calendar reporters and pre-market releases.
- `TK3`: current search failure may be caused by live/historical data separation, not tokenization.
- `TK4`: many sources have no source metadata mapping, so the tab can stay blank even if rendering is correct.
- `TK5`: silent socket stalls are not handled because the client ignores heartbeat freshness.
- `E2`: same-source/same-ticker suppression can hide materially different events.
- `E3`: geopolitical direction depends on the traded asset, not just the news topic.

### 3. Is the implementation priority order correct?

Mostly, but I would adjust it.

Recommended order:

1. `TK1` Watchlist identity/state isolation
2. `TK2` Earnings data audit + cleanup
3. `TK3` Search endpoint alignment and live/historical unification
4. `E1` Notification settings auth fix
5. `TK4` Evidence fallback and metadata coverage
6. `TK5` WebSocket liveness/watchdog
7. `E2` Feed dedupe tuning
8. `E3` Direction calibration

Why:

- `E1` is a very small fix with immediate user-visible payoff and should not wait until the very end.
- `TK5` should stay behind data trust/search issues unless diagnosis reveals a production-severity outage.
- `E2` and `E3` are quality improvements, but less foundational than identity, correctness, and search.

### 4. Is the estimated effort reasonable?

The document underestimates the work on `TK2` and `TK3`, and slightly overstates the backend work needed for `TK5`.

My estimate:

- `TK1`: `0.5-1 day` for patch, `1.5-3 days` for proper guest identity
- `TK2`: `2-4 days`
- `TK3`: `1.5-3 days`
- `TK4`: `1-2 days`
- `TK5`: `0.5-1.5 days`
- `E1`: `0.5 day`
- `E2`: `0.5-1 day`
- `E3`: `0.5-1.5 days`

Total realistic range:

- Short-term patch set: `~5-7 working days`
- More correct structural fixes: `~7-10 working days`

## Final Recommendation

Use the current document as a product-level issue list, but revise the technical plan before implementation.

The key changes I would make before coding are:

- Replace `TK1` reset semantics with either onboarding replace semantics or real guest identity.
- Rewrite `TK2` around the historical earnings import path, not live events.
- Rewrite `TK3` around the actual search call path and the live/historical split.
- Re-scope `TK5` toward client liveness detection instead of adding a backend heartbeat that already exists.
