# Event Radar Review of Review

Verified against the codebase in `/home/kaike/.openclaw/workspace/event-radar` on 2026-03-18.

## Top 10 Verification

### 1. Frontend types manually duplicated, not shared
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/web/src/types/index.ts` defines local frontend types such as `AlertSummary`, `EventDetailData`, `LlmEnrichment`, and `HistoricalContext`.
  - `packages/web/src/lib/api.ts` imports those local types from `../types/index.js` and manually maps API payloads via `mapAlertSummary()`, `mapLlmEnrichment()`, `mapHistoricalContext()`, and `mapHistoricalPattern()`.
  - A repo search of `packages/web/src` shows no imports from `@event-radar/shared`.
  - `packages/shared/src/index.ts` exports overlapping primitives such as `Severity` and `LLMEnrichment`, but not full web response contracts like `AlertSummary` or `EventDetailData`.
  - The `historical` vs `historicalPattern` split is real in `packages/web/src/types/index.ts`, but `packages/web/src/lib/api.ts` and its tests show this is currently handled as dual-shape compatibility, not just accidental drift.
- Severity adjustment if needed:
  - Keep the severity high. The review is directionally right, but the suggested fix is understated because shared does not yet expose the full API response models needed by the web app.

### 2. No API rate limiting on public endpoints
- Verdict: Partially accurate
- Evidence from actual code:
  - There is no global Fastify rate-limit plugin: `packages/backend/package.json` has no `@fastify/rate-limit`, and `packages/backend/src/app.ts` does not register one.
  - `POST /api/auth/magic-link` is not unlimited: `packages/backend/src/routes/auth.ts` implements an in-memory per-email limiter of 3 requests per hour via `magicLinkRateLimit`, `RATE_LIMIT_MAX`, and `checkRateLimit()`.
  - The review overstates which endpoints are explicitly public. `/metrics` and `/api/events/ingest` are in `publicRoutes` in `packages/backend/src/app.ts`, but `/api/events` and `/api/tickers/search` are not.
  - Practical exposure is still real because `packages/backend/src/plugins/auth.ts` falls through to `request.userId = 'default'` whenever `AUTH_REQUIRED !== 'true'`.
- Severity adjustment if needed:
  - Keep this high as a broad hardening issue, but downgrade the magic-link subclaim specifically. The real problem is missing general throttling plus permissive auth fallback, not a total absence of protection on auth routes.

### 3. SEC scanner in-memory dedup loses state on restart
- Verdict: Confirmed
- Evidence from actual code:
  - `services/sec-scanner/sec_scanner/scanner.py` keeps seen filings only in memory with `self._seen_ids: set[str] = set()`.
  - `_poll_8k()` and `_poll_form4()` both filter by `accession_number not in self._seen_ids` and then add accession numbers after posting.
  - There is no persistence or startup reload path for `_seen_ids`.
  - The review understates how much the backend can help here: `packages/backend/src/db/event-store.ts` stores `sourceEventId` as the raw event UUID, and the SEC scanner generates a fresh UUID for every emitted raw event in `scanner.py`. `packages/backend/src/pipeline/deduplicator.ts` checks DB duplicates by `events.sourceEventId == event.id`, so restart duplicates from the SEC scanner will usually miss that DB check.
- Severity adjustment if needed:
  - Raise the impact. Keep the overall item high, but the impact is closer to high than medium because restart duplicates are not meaningfully mitigated by the current backend DB dedup path.

### 4. Pipeline audit table has no retention policy
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/backend/src/db/schema.ts` defines append-only tables including `pipeline_audit`, `weight_adjustments`, `alert_log`, and `severity_changes`.
  - `packages/backend/src/pipeline/audit-log.ts` only inserts rows into `pipeline_audit`; it does not prune.
  - Repo search shows no production cleanup job, TTL, partitioning policy, or scheduled delete for these tables.
- Severity adjustment if needed:
  - No change. Medium severity is fair.

### 5. E2E tests disabled in CI
- Verdict: Confirmed
- Evidence from actual code:
  - `.github/workflows/ci.yml` contains `TODO: Re-enable e2e when Docker issues are resolved`.
  - The CI workflow only runs build, lint, and unit-test commands. It does not invoke Playwright.
  - `packages/web/package.json` defines `test:e2e`, `packages/web/playwright.config.ts` exists, and `packages/web/e2e/auth-verify.spec.ts` exists.
  - The workflow comment references `@event-radar/e2e`, but the real Playwright setup is under `packages/web`; `packages/e2e` does not contain an actual runnable package here.
- Severity adjustment if needed:
  - No material change. The issue is real; the review just missed that the CI comment itself is stale.

### 6. Ticker cooldown state persisted to `/tmp`
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/backend/src/pipeline/alert-filter.ts` persists cooldowns to `/tmp/event-radar-seen/ticker-cooldown.json`.
  - It loads with `readFileSync` + `JSON.parse` and writes with `writeFileSync`.
  - There is no temp-file rename, atomic write, lock, or cross-process coordination.
  - `docker-compose.yml` mounts `/tmp/event-radar-seen`, which helps within that compose setup, but the mechanism is still file-based and fragile.
- Severity adjustment if needed:
  - No change. Medium is fair.

### 7. Auth defaults to disabled
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/backend/src/plugins/auth.ts` explicitly documents and implements `AUTH_REQUIRED=false` as the default path, assigning unauthenticated requests `request.userId = 'default'`.
  - `packages/backend/src/routes/auth.ts` returns a synthetic default user from `/api/auth/me` when `AUTH_REQUIRED !== 'true'` and no access token is present.
  - `.env` currently contains `API_KEY=er-dev-2026`, and `docker-compose.yml` also defaults `API_KEY` to `er-dev-2026`.
  - This permissive behavior reaches beyond the review's wording: many routes that use `requireApiKey()` are still reachable anonymously in the default configuration because `requireApiKey()` returns early when `request.userId` is already set.
- Severity adjustment if needed:
  - Raise this to high. The problem is broader than "easy to deploy without auth"; the current default behavior effectively turns many protected user routes into anonymous default-user routes.

### 8. Bark push channel has no retry logic
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/delivery/src/bark-pusher.ts` performs a single `fetch()` and throws on non-OK.
  - `packages/delivery/src/discord-webhook.ts` has a real `sendWithRetry()` loop with retry delays.
  - There is no equivalent retry/backoff in Bark.
- Severity adjustment if needed:
  - No change. Low-to-medium operational severity is appropriate.

### 9. `/metrics` endpoint exposes operational data publicly
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/backend/src/app.ts` includes `/metrics` in `publicRoutes`.
  - The `/metrics` handler serves the Prometheus registry directly with no extra auth check.
- Severity adjustment if needed:
  - Keep medium.

### 10. LLM enrichment has no circuit breaker
- Verdict: Confirmed
- Evidence from actual code:
  - `packages/backend/src/pipeline/llm-enricher.ts` has timeout handling via `Promise.race(..., timeout(this.timeoutMs))`, but no failure counter, open-state, or cooldown window.
  - `packages/backend/src/pipeline/llm-gatekeeper.ts` does have a real circuit breaker, which makes the contrast explicit.
  - In `packages/backend/src/app.ts`, enrichment failures are caught and converted into `null` enrichment, so the system fails soft, but repeated slow calls can still add latency and reduce throughput.
- Severity adjustment if needed:
  - Slight downgrade in urgency compared with the review's framing. This is a real resilience gap, but it is less immediately dangerous than the SEC dedup and auth-default issues because the pipeline already handles null enrichment gracefully.

## Issues CC Missed

### A. "Protected" routes are broadly reachable when auth is disabled by default
- `packages/backend/src/plugins/auth.ts` assigns anonymous requests `request.userId = 'default'` when `AUTH_REQUIRED !== 'true'`.
- `packages/backend/src/routes/auth-middleware.ts` returns early if `request.userId` already exists.
- Result: many routes that look protected by `requireApiKey()` are still reachable without credentials in the default configuration.
- This is broader than the review's focus on a few public routes.

### B. `x-user-id` allows user impersonation in default-user / API-key contexts
- `packages/backend/src/routes/user-context.ts` lets callers override the resolved user via `x-user-id` when the request is API-key authenticated, already mapped to the default user, or has no user.
- Combined with the auth fallback, this enables arbitrary user-id selection for watchlist/preferences/onboarding-style routes.
- This is a more serious multi-user integrity problem than the review identified.

### C. `/health` is also publicly overexposed
- `packages/backend/src/app.ts` includes `/health` in `publicRoutes`.
- The response exposes scanner health, DB connectivity, last event time, websocket client count, uptime, and kill-switch state.
- The review called out `/metrics`, but `/health` leaks a substantial operational snapshot too.

### D. CI and repo metadata are stale about the frontend/E2E shape
- `.github/workflows/ci.yml` points to `@event-radar/e2e`, while the actual runnable Playwright suite is in `packages/web`.
- `tasks.md` and other project metadata still describe a Next.js-based frontend, but the current web app package is Vite/React (`packages/web/package.json`).
- This is not the highest-severity bug in the system, but it is a real maintenance hazard and partly explains why the original review referenced the wrong app structure in places.

### E. SEC scanner auth wiring is inconsistent with docker-compose
- `docker-compose.yml` passes `API_KEY` into the `sec-scanner` service.
- `services/sec-scanner/sec_scanner/scanner.py` posts events to `/api/events/ingest` without sending any `x-api-key` header.
- Today this does not break because `/api/events/ingest` is public, but it means hardening that endpoint later will silently break the scanner unless the service is updated.

## Bottom Line
- Claude Opus got the broad direction mostly right on frontend contract fragility, persistence gaps, retention gaps, disabled E2E in CI, Bark retry, public metrics, and missing LLM-enricher circuit breaking.
- The two places where the review is materially weaker than the actual code are security scope and SEC duplicate risk.
- The two places where the review is materially wrong are the claim that magic-link has no rate limit, and the specific route/package assumptions around which endpoints are explicitly public and where E2E actually lives.
