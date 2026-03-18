# Event Radar — Full-System Review

**Date:** 2026-03-18
**Reviewer:** Claude Opus 4.6
**Scope:** End-to-end architecture, data model, alert quality, web UX, reliability, security, tech debt

---

## A. Executive Summary

Event Radar is a **remarkably ambitious and well-executed** real-time market event detection platform. The architecture — 21+ scanners feeding a multi-stage enrichment pipeline with AI classification, historical pattern matching, and multi-channel delivery — is sophisticated and production-grade in many areas.

**What's working well:**
- Clean monorepo structure with proper workspace boundaries (shared → delivery → backend, web separate)
- Delivery package is excellent: 1.9:1 test-to-code ratio, source-specific templates, retry logic, user preference handling
- Pipeline design (dedup → filter → classify → enrich → gate → deliver) with audit trail is solid
- Comprehensive Prometheus metrics and structured logging
- Kill switch, circuit breaker, and graceful degradation patterns exist
- Web app UX is thoughtful: infinite scroll, WebSocket live feed, desktop split panel, mobile swipe gestures, pull-to-refresh

**What needs attention:**
- **Frontend-backend type contract is fragile** — the web app re-declares all types manually (234 lines) instead of importing from `@event-radar/shared`, creating a silent drift risk
- **No API rate limiting** on public endpoints — a single client could exhaust resources
- **SEC scanner dedup state is in-memory only** — restarts cause duplicate event floods
- **Pipeline audit table grows unbounded** — no retention policy
- **Auth is optional by default** (`AUTH_REQUIRED=false`) — easy to deploy without auth in production
- **E2E tests are disabled** in CI — the most valuable test layer for this system is missing

The system is at a critical inflection point: the core pipeline works, but **operability and production hardening** need focused investment before scaling users or adding more scanners.

---

## B. Top 10 Issues / Opportunities (Ranked by Severity + Impact)

### 1. CRITICAL: Frontend types manually duplicated, not shared (Silent Drift Risk)

**Severity: HIGH | Impact: HIGH | Effort: 1-2 days**

The web app (`packages/web/src/types/index.ts`, 234 lines) re-declares every type (`AlertSummary`, `EventDetailData`, `LlmEnrichment`, `HistoricalContext`, etc.) by hand. Zero imports from `@event-radar/shared`.

The API client (`packages/web/src/lib/api.ts`, 895 lines) has manual mapping functions (`mapAlertSummary()`, `mapLlmEnrichment()`, `mapHistoricalContext()`) that transform raw API JSON into these frontend types.

**Risk:** When a backend engineer adds a field to `LLMEnrichmentSchema` in shared, the frontend type and mapper must be updated separately. There's no compiler error if they drift. This has likely already happened — note `EventDetailData` has both `historical` (HistoricalContext) and `historicalPattern` (separate inline type with different field names like `avgMoveT5` vs `avgAlphaT5`), suggesting a prior drift that was patched rather than resolved.

**Fix:** Export API response types from shared (or a new `@event-radar/api-types` package). Frontend imports and validates against them. Even a partial fix (sharing the enrichment/historical types) would eliminate the highest-risk drift surface.

---

### 2. CRITICAL: No API rate limiting on public endpoints

**Severity: HIGH | Impact: HIGH | Effort: 1 day**

All Fastify routes lack rate limiting. Public endpoints (`/api/v1/feed`, `/api/events`, `/api/tickers/search`, `/health`, `/metrics`) can be hit without authentication or throttling.

**Files:**
- `packages/backend/src/app.ts` — no `@fastify/rate-limit` registration
- `packages/backend/src/routes/auth.ts` — magic link endpoint has no rate limit (enables email bombing)

**Risk:**
- Magic link endpoint abuse → email delivery costs, potential spam complaints
- Feed/events endpoints → database pressure, LLM cost amplification if tied to enrichment
- `/metrics` endpoint → information disclosure (scanner health, error rates, delivery counts)

**Fix:** Add `@fastify/rate-limit` with sensible defaults (100 req/min global, 5/min for magic link, auth-based higher limits).

---

### 3. HIGH: SEC scanner in-memory dedup loses state on restart

**Severity: HIGH | Impact: MEDIUM | Effort: 0.5 day**

`services/sec-scanner/sec_scanner/scanner.py` uses `_seen_ids: set()` (in-memory) for deduplication. On every restart (deploy, crash, Docker recreate), the entire seen set is lost.

**Consequence:** After restart, the scanner re-polls SEC EDGAR and re-ingests every filing from the current day. The backend deduplicator may catch some via `sourceEventId` matching, but if the event store was also cleared or if the accession number format differs slightly, duplicates will flow through the entire pipeline.

**Fix:** Persist `_seen_ids` to a file (JSON/pickle) or Redis. Alternatively, add a startup query to the backend: "give me all SEC event IDs from the last 24h" to pre-populate the seen set.

---

### 4. HIGH: Pipeline audit table has no retention policy

**Severity: MEDIUM | Impact: HIGH | Effort: 0.5 day**

`pipeline_audit` table (`packages/backend/src/db/schema.ts:24-54`) stores a row for every event that enters the pipeline (including filtered/archived events). With 21+ scanners polling every 15-120 seconds, this table will grow by thousands of rows per day.

**No cleanup mechanism exists** — no TTL, no partition, no cron job to prune old rows.

**Also applies to:** `alertLog`, `weightAdjustments`, `severityChanges` — all append-only audit tables with no retention.

**Fix:** Add a daily cron job to delete `pipeline_audit` rows older than 30 days (or 90 days). Consider partitioning by month for the `events` table if it grows past ~1M rows.

---

### 5. HIGH: E2E tests disabled in CI

**Severity: MEDIUM | Impact: HIGH | Effort: 1-2 days**

`.github/workflows/ci.yml` has a TODO comment about Docker issues preventing E2E tests. The CI only runs unit tests (with a 120-second timeout for backend tests, suggesting PGlite cleanup issues).

**What's missing:**
- No integration test that exercises scanner → pipeline → delivery gate → delivery channel
- No test that verifies the API contract between backend and frontend
- No test for WebSocket live feed behavior
- Playwright E2E tests exist in `packages/web` but are never run in CI

**Risk:** Regressions in the pipeline flow, API contract changes, or WebSocket protocol changes won't be caught until manual testing.

**Fix:** Fix the Docker-in-CI issue (use GitHub Actions services for PostgreSQL, or continue with PGlite). Enable Playwright tests in CI with a headless browser.

---

### 6. HIGH: Ticker cooldown state persisted to /tmp (fragile)

**Severity: MEDIUM | Impact: MEDIUM | Effort: 0.5 day**

`packages/backend/src/pipeline/alert-filter.ts` persists ticker cooldown state to `/tmp/event-radar-seen/ticker-cooldown.json`. This is:
- Lost on container restart (Docker volume mapping exists in compose, but only for `/tmp/event-radar-seen`)
- Race-condition prone if multiple processes write simultaneously
- Not atomic (partial write → corrupt JSON → crash on next read)

**Fix:** Move to a database table (`ticker_cooldowns`) or Redis. If file-based is preferred, use atomic write (write to temp file, then rename).

---

### 7. MEDIUM: Auth defaults to disabled — production deployment risk

**Severity: MEDIUM | Impact: MEDIUM | Effort: 0.5 day**

`AUTH_REQUIRED=false` is the default. Combined with `API_KEY=er-dev-2026` in the `.env` file, it's easy to deploy to production with:
- No JWT verification on protected routes
- A weak, predictable API key
- All "auth-required" routes (watchlist, settings, preferences) accessible without login

**Files:**
- `packages/backend/src/app.ts` — auth plugin registration
- `packages/backend/src/routes/auth-middleware.ts` — API key check
- `.env` — `API_KEY=er-dev-2026`

**Fix:**
- Require `AUTH_REQUIRED=true` in production (fail fast if JWT_SECRET is missing)
- Generate a random API key on first boot if none is set (currently done, but `.env` overrides)
- Add a startup warning if `API_KEY` matches common dev values

---

### 8. MEDIUM: Bark push channel has no retry logic

**Severity: LOW | Impact: MEDIUM | Effort: 0.5 day**

All delivery channels (Discord, Telegram, Webhook) have retry with exponential backoff (1s → 5s → 30s). Bark (`packages/delivery/src/bark-pusher.ts`) does a single `fetch()` with no retry.

Since Bark is used for iOS push notifications (time-sensitive alerts for traders), a transient network error means a missed critical alert with no recovery.

**Fix:** Add the same retry pattern used by other channels. It's a 15-line change.

---

### 9. MEDIUM: `/metrics` endpoint exposes operational data publicly

**Severity: MEDIUM | Impact: LOW | Effort: 0.5 day**

The Prometheus `/metrics` endpoint is listed as a public route (no auth required). It exposes:
- Scanner health and error counts (reveals which scanners are failing)
- LLM classification success/failure rates
- Delivery channel error counts
- Pipeline throughput numbers
- Event counts by source and severity

**Risk:** An attacker or competitor can monitor system health, identify when scanners are down, or gauge alert volume.

**Fix:** Either require API key for `/metrics` or move it to a separate internal port (common pattern: metrics on port 9090, API on 3001).

---

### 10. MEDIUM: LLM enrichment has no circuit breaker

**Severity: LOW | Impact: MEDIUM | Effort: 1 day**

`packages/backend/src/pipeline/llm-enricher.ts` has a 10-second timeout per call but no circuit breaker. If OpenAI is degraded (responding slowly but not timing out), every event will wait 10 seconds, creating a massive backlog.

The `llm-gatekeeper.ts` has circuit breaker logic, but the main enricher does not. The delivery kill switch exists but is manual (requires admin action).

**Risk:** During LLM provider outages, the pipeline backs up. Events arrive but aren't enriched, so the delivery gate archives most of them (enrichment unavailable → ARCHIVE for non-critical). Users see a sudden drop in alerts with no explanation.

**Fix:** Add a circuit breaker to the enricher: after N consecutive failures or timeouts, skip enrichment for M minutes and pass events through with `enrichment: null`. Log prominently. The delivery gate already handles `enrichment: null` gracefully.

---

## C. Concrete Code References

### Data Model Issues

| Issue | File | Lines | Detail |
|-------|------|-------|--------|
| Duplicate `historicalPattern` vs `historical` | `packages/web/src/types/index.ts` | 100-108 | EventDetailData has both fields with different shapes |
| `severity: string` instead of union type | `packages/web/src/types/index.ts` | 6 | AlertSummary.severity is `string`, not `Severity` |
| `direction: string` instead of union type | `packages/web/src/types/index.ts` | 13 | Same — no type safety on direction values |
| Action label enum drift | `packages/shared/src/schemas/llm-types.ts` | 55-71 | Legacy normalization function suggests prior format changes |
| No validation on API responses | `packages/web/src/lib/api.ts` | 51-113 | `apiFetch()` returns `response.json()` without Zod validation |

### Pipeline Issues

| Issue | File | Lines | Detail |
|-------|------|-------|--------|
| Cooldown file not atomic | `packages/backend/src/pipeline/alert-filter.ts` | ~190 | JSON.stringify → writeFileSync, no temp-file-then-rename |
| No max age on in-memory dedup window | `packages/backend/src/pipeline/deduplicator.ts` | ~30 | 30-min window but no hard cap on map size |
| Historical enricher timeout too short | `packages/backend/src/pipeline/historical-enricher.ts` | ~45 | 2-second timeout may miss complex pattern queries |
| No fallback if both LLM providers fail | `packages/backend/src/pipeline/llm-enricher.ts` | ~138 | Promise.race with timeout but no provider fallback |

### Security Issues

| Issue | File | Lines | Detail |
|-------|------|-------|--------|
| `/metrics` public | `packages/backend/src/app.ts` | ~445 | Listed in public routes array |
| `/api/events/ingest` public | `packages/backend/src/app.ts` | ~445 | Test ingest endpoint accessible without auth |
| No rate limit on magic link | `packages/backend/src/routes/auth.ts` | — | POST `/auth/magic-link` unlimited |
| Webhook secret in .env | `.env` | — | File is gitignored, but no `.env.example` for documentation |

### Delivery Issues

| Issue | File | Lines | Detail |
|-------|------|-------|--------|
| Bark no retry | `packages/delivery/src/bark-pusher.ts` | 115 | Single fetch(), no retry loop |
| Discord embed size guard | `packages/delivery/src/discord-webhook.ts` | 94-101 | 5500 char limit but minimum 200 chars may still exceed with many fields |
| Web push TTL too short | `packages/delivery/src/web-push-channel.ts` | 6 | DEFAULT_TTL_SECONDS = 60; missed if device offline >1 min |

---

## D. Quick Wins (1-2 Day Fixes)

### 1. Add API rate limiting (0.5 day)
```
pnpm --filter @event-radar/backend add @fastify/rate-limit
```
Register globally with 100 req/min, override for magic link (5/min) and ingest (10/min).

### 2. Add Bark retry logic (0.5 day)
Copy the `sendWithRetry()` pattern from `discord-webhook.ts` into `bark-pusher.ts`. Add test.

### 3. Protect `/metrics` and `/api/events/ingest` (0.5 day)
- Move `/metrics` behind API key auth or to internal port
- Move `/api/events/ingest` behind API key auth (it's used by the SEC scanner, which already sends API_KEY)

### 4. Add `.env.example` file (0.25 day)
Create `.env.example` with all required variables documented, placeholder values, and comments explaining each setting. This is table stakes for any project with >5 env vars.

### 5. Fix web push TTL (0.25 day)
Change `DEFAULT_TTL_SECONDS` from 60 to 3600 (1 hour) or even 14400 (4 hours). Critical trading alerts should survive brief device offline periods.

### 6. Atomic cooldown file writes (0.25 day)
In `alert-filter.ts`, write to a temp file then `fs.renameSync()` for atomicity. Prevents corrupt JSON on crash during write.

### 7. Add startup auth warning (0.25 day)
In `app.ts`, log a WARN-level message if `AUTH_REQUIRED=false` or `API_KEY` matches known dev values when `NODE_ENV !== 'development'`.

### 8. Consolidate `historical` vs `historicalPattern` in frontend types (0.5 day)
`EventDetailData` has both `historical: HistoricalContext | null` and `historicalPattern: { ... }`. Pick one, update the API response mapper, remove the other.

---

## E. Medium-Term Refactors

### 1. Share API types between backend and frontend (3-5 days)
**Priority: HIGH**

Create `@event-radar/api-types` package (or extend `@event-radar/shared`) with:
- API response schemas (Zod) for every endpoint
- Inferred TypeScript types from those schemas
- Frontend imports types directly
- API client validates responses with `.safeParse()` in development mode

This eliminates the 234-line manual type file, the manual mappers in `api.ts`, and the drift risk.

### 2. Persistent dedup state for SEC scanner (1-2 days)
**Priority: HIGH**

Options:
a. **File-based**: Write `_seen_ids` to JSON on every successful poll, load on startup
b. **Query-based**: On startup, query backend for SEC events from last 24h, pre-populate seen set
c. **Redis**: If Redis is ever added, use a Redis set with 48h TTL

Option (b) is simplest and requires no new infrastructure.

### 3. Pipeline audit retention (1 day)
**Priority: HIGH**

Add a scheduled job (cron or setTimeout loop like outcome tracker):
- Delete `pipeline_audit` rows older than 30 days
- Delete `alertLog` rows older than 90 days
- Delete `weightAdjustments` older than 90 days
- Log row counts before/after for monitoring

### 4. LLM enricher circuit breaker (2 days)
**Priority: MEDIUM**

Implement a simple circuit breaker:
- **Closed** (normal): Forward requests to LLM
- **Open** (tripped after 5 consecutive failures): Skip LLM for 2 minutes, pass `enrichment: null`
- **Half-open**: After cooldown, try one request. If success → close. If fail → re-open.

Log state transitions prominently. Add a Prometheus gauge for circuit state.

### 5. E2E test infrastructure (3-5 days)
**Priority: MEDIUM**

- Fix Docker-in-CI (use GitHub Actions `services:` block for PostgreSQL)
- Add a pipeline integration test: mock scanner → assert event reaches delivery channel with correct shape
- Enable Playwright tests with `pnpm --filter @event-radar/web test:e2e`
- Add API contract tests: backend response shape matches frontend type expectations

### 6. Database connection pooling review (1 day)
**Priority: LOW**

Current setup uses `pg.Pool` via Drizzle, but no explicit pool size configuration is visible. Under load (many concurrent scanner polls + API requests + outcome tracking), the default pool size (10) may be insufficient.

Review and configure: `min`, `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`.

---

## F. Recommended Roadmap — Next 1-2 Weeks

### Week 1: Harden (Security + Reliability)

| Day | Task | Effort | Impact |
|-----|------|--------|--------|
| Mon | Add rate limiting (`@fastify/rate-limit`), protect `/metrics` and `/ingest` | 1 day | Prevents abuse |
| Tue | Fix Bark retry, web push TTL, atomic cooldown writes | 0.5 day | Delivery reliability |
| Tue | Add `.env.example`, startup auth warnings | 0.5 day | Ops safety |
| Wed | SEC scanner persistent dedup (query-based startup) | 0.5 day | Eliminates restart floods |
| Wed | Pipeline audit retention cron job | 0.5 day | DB health |
| Thu | LLM enricher circuit breaker | 1 day | Pipeline resilience |
| Fri | Fix E2E test infrastructure in CI | 1 day | Regression safety |

### Week 2: Type Safety + UX Polish

| Day | Task | Effort | Impact |
|-----|------|--------|--------|
| Mon-Tue | Create shared API types package, migrate frontend | 2 days | Eliminates drift risk |
| Wed | Consolidate `historical` vs `historicalPattern` types | 0.5 day | Code clarity |
| Wed | Add API response validation in dev mode | 0.5 day | Catch issues early |
| Thu | Review + test all scanner error paths (what happens when APIs are down) | 1 day | Robustness |
| Fri | Database connection pooling review + load test | 1 day | Scalability |

---

## Appendix: What Looks Good

These areas are well-designed and should be preserved:

1. **Delivery package architecture** — Clean channel abstraction, excellent test coverage (1.9:1 ratio), source-specific templates are well-crafted
2. **Pipeline audit trail** — Every event is tracked through every stage with timing, reason, and outcome
3. **Delivery kill switch** — Persisted to DB, survives restarts, proper singleton pattern
4. **Base scanner with exponential backoff** — Separate timeout vs error tracking, configurable thresholds
5. **Market regime integration** — VIX/RSI/yield curve context enhances alert quality
6. **Dedup strategy pattern** — Multi-strategy approach (exact ID, ticker-window, content similarity) with confidence scores
7. **Web app mobile UX** — Safe area insets, pull-to-refresh, swipe gestures, bottom nav, split panel desktop — all thoughtfully implemented
8. **Source-specific card rendering** — Recent addition (PR #152) that adds real value to the feed UX
9. **Historical pattern matching** — Outcome tracking at multiple time horizons (T+5, T+20, 1m) with win rate analysis
10. **Watchlist with sections** — Drag-drop reordering, color-coded sections, onboarding flow — full feature
