# Codex Code-Level Review: Phase 3 Completion & Productization Plan

> Reviewer: Codex (GPT-5.4) | Date: 2026-03-15 | Plan: `docs/plans/2026-03-15-phase3-productization.md`

## Top Findings

1. **WP5 is fake backpressure** — wrapping the existing pipeline subscriber with a limiter will not create real backpressure, because `publish()` just calls `EventEmitter.emit()` and returns without waiting for subscriber completion. The live pipeline starts in `in-memory-event-bus.ts:15` and `app.ts:497`.

2. **WP6 "skip duplicate insert" conflicts with feed joins** — Both feed endpoints join `pipeline_audit.event_id` to `events.source_event_id`; if a later confirmed event no longer gets its own `events` row, that audit row will stop resolving in the feed. See `event-store.ts:16`, `dashboard.ts:543`, and `delivery-feed.ts:200`.

3. **WP1 is materially larger than "middleware + login page"** — Auth is duplicated across the global auth plugin, route-level `requireApiKey` prehandlers, the web API client, and WebSocket auth. See `plugins/auth.ts:25`, `watchlist.ts:17`, `push-subscriptions.ts:31`, `api.ts:13`, and `useWebSocket.ts:11`.

4. **Plan misses: push is broadcast, not per-user** — `listActiveSubscriptions()` returns all active subscriptions, and `WebPushChannel` broadcasts every pushed alert to all of them. See `push-subscription-store.ts:23` and `web-push-channel.ts:82`.

5. **WP4 restart-latency vs 90s grace period** — Even if `BaseScanner.start()` polls immediately, delivery is still suppressed right after boot. See `base-scanner.ts:105` and `app.ts:597`.

## Per-WP Code Review

### WP1 Auth
- `resolveRequestUserId()` only reads `x-user-id` header, falls back to `'default'` — `user-context.ts:7`
- `ensureUserExists()` inserts minimal user row (only `id`) — `user-context.ts:17`
- `auth-middleware.ts:41` only validates `X-Api-Key` header
- Current `users` table is minimal (id + created_at) — `schema.ts:266`
- **Needed changes broader than plan states**: add email/profile to users, JWT request context, update route prehandlers, update hardcoded web client (`API_KEY = 'er-dev-2026'`), WebSocket auth

### WP2 Watchlist-First
- Public feed API `/api/v1/feed` only supports `limit`, `before`, `ticker` — `dashboard.ts:499,582`
- Feed.tsx uses `useAlerts()` with client-side severity/source filtering, no watchlist toggle — `Feed.tsx:55,163`
- **Important nuance**: there's already `?watchlist=true` on `/api/events` route, but it serves raw events, not the delivered feed — `events.ts:53,185`
- Existing `AlertCard` has dormant watchlist-button props — `AlertCard.tsx:19`
- `TickerProfile` already toggles watchlist membership — `TickerProfile.tsx:23`

### WP3 Language
Labels appear in these locations (all need updating):
- Shared schema: `llm-types.ts:50` (`LLMEnrichmentActionSchema`)
- LLM enricher prompt: `llm-enricher.ts:63`
- Push policy: `push-policy.ts:17` (string matching!)
- Discord delivery: `discord-webhook.ts:102`
- Bark delivery: `bark-pusher.ts:66`
- Scorecard aggregation: `scorecard-aggregation.ts:117`
- Web Scorecard: `Scorecard.tsx:138`
- Web EventDetail: `EventDetail.tsx:151`
- **Plan underestimates blast radius of renaming `action` to `signal`**

### WP4 Scanner
- `BaseScanner.start()` calls `scheduleNext()` which sets `setTimeout` — `base-scanner.ts:105`
- No explicit fetch timeouts in HTTP scanners: `congress-scanner.ts:94`, `newswire-scanner.ts:110`, `fda-scanner.ts:151`, `sec-edgar-scanner.ts:471`
- Browser-based scanners already have bounded timeouts via Crawlee: `browser-pool.ts:34`, `x-scanner.ts:216`, `truth-social-scanner.ts:154`
- 2026-only NYSE holidays: `llm-gatekeeper.ts:16`
- Per-ticker cooldown (no eventType): `alert-filter.ts:361`

### WP5 Concurrency
- Event bus is plain `EventEmitter`: `in-memory-event-bus.ts:15,20`
- Pipeline handler is `eventBus.subscribe(async ...)` in `app.ts:497`
- **Already exists but unused**: `llm-queue.ts:15` — LLM-specific queue helper that could be adapted

### WP6 Confirmation
- Schema has fields but `storeEvent()` doesn't populate them: `schema.ts:70`, `event-store.ts:16`
- Read API defaults `confirmationCount` to 1 and `confirmedSources` to `[event.source]`: `events.ts:323`
- `ProgressiveSeverityService.recordConfirmation()` exists but only wired from admin routes: `progressive-severity.ts:68`, `alert-budget.ts:70`

### WP7 Frontend
- PWA substrate exists: manifest, sw.js, push subscription UI, backend routes, web-push channel
- `sw.js` only handles install/activate/push/click — no fetch caching
- Short URLs would need updates in: `App.tsx:58`, `AlertCard.tsx:95`, `web-push-channel.ts:134`
- No Workbox dependency in `packages/web/package.json`

### WP8 Landing
- No landing page route in `App.tsx:51`
- README has marketing copy that could be adapted: `README.md:1,11,30`

## Things The Plan Missed

1. **Push delivery is broadcast-to-all** — not user-scoped. This undercuts the entire watchlist-first story.
2. **Auth migration must replace both global auth hook AND explicit route prehandlers** — `plugins/auth.ts:39`, `watchlist.ts:26`, `push-subscriptions.ts:36`
3. **Public/internal API surface cleanup missing** — dashboard, feed, delivery-feed, audit routes are currently public: `app.ts:395`
4. **Product language migration should include README/marketing copy** — `README.md:26,39`
5. **Existing watchlist UX hooks can be reused** — `AlertCard.tsx:19`, `TickerProfile.tsx:23`

## Conflicts

- WP5 as written improves concurrency inside the handler, but not upstream backpressure
- WP6 "skip insert" conflicts with current feed/audit joins — breaks event detail links
- WP4 immediate first poll doesn't satisfy restart goal unless 90s grace period is also revisited
- WP1 JWT-only auth would break current web app immediately unless `X-Api-Key` remains supported during migration
- Plan's `AUTH_REQUIRED=false` default conflicts with security stance in `ARCHITECTURE.md:232`

## Timeline Assessment

- 4 weeks is aggressive. WP2, WP3, most of WP7/WP8 are modest given existing infrastructure.
- WP1, WP5, and WP6 are underestimated:
  - WP1: cross-cutting auth migration across 5+ files and two packages
  - WP5: needs real queueing/backpressure design, not just a semaphore
  - WP6: touches event identity, feed joins, and possibly severity logic
- **My read: 4 weeks plausible only with parallel execution and narrower WP5/WP6 scope. Single engineer: 6-8 weeks.**
