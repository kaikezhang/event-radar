# Codex Review — Phase 3 Plan vs Current Codebase

## Scope

Reviewed `docs/plans/2026-03-15-phase3-productization.md` against the current code under `packages/backend`, `packages/shared`, and `packages/web`.

## Executive Summary

1. WP1 understates the auth migration. Current auth is not just "`x-user-id` + default user"; it is a global API-key gate plus a separate user-resolution layer. The web app also hardcodes the API key in the client bundle and passes it over WebSocket query params.
2. WP2 is not working from a blank slate. Watchlist APIs already exist, and watchlist filtering already exists on `GET /api/events?watchlist=true`, but the actual feed path used by the web app is the separate public `GET /api/v1/feed` plus an unfiltered live WebSocket stream.
3. WP3 needs a narrower runtime scope than the plan implies. Exact `ACT NOW` / `WATCH` / `FYI` strings are concentrated in the shared schema, the LLM enrichment prompt, and delivery push-policy logic. The user-facing web runtime does not hardcode those labels.
4. WP4 is directionally right, but the current failure mode is worse than the plan states: a hung scanner fetch can stall the polling loop indefinitely because `BaseScanner.tick()` waits for `scan()` before scheduling the next run.
5. WP5’s proposed limiter helps, but it does not create true backpressure by itself. The current event bus is a fire-and-forget `EventEmitter`; `publish()` does not await async subscribers, so scanners can keep emitting while the pipeline accumulates in-flight work.
6. WP6 conflicts with the existing pipeline layering. Dedup already happens before `storeEvent()` in `app.ts`, while the plan proposes inserting multi-source merge logic inside `event-store.ts`. `confirmedSources` / `confirmationCount` have partial support; `mergedFrom` is effectively unused.
7. WP7 is accurate that there is no Workbox setup, but the repo already has a minimal, working PWA substrate: manifest, service-worker registration, manual `sw.js`, push subscription routes, and a Settings UI for browser push.
8. WP8 is correct that there is no dedicated landing route, but there is already embedded marketing copy in the README, app shell, feed header, and HTML metadata.

---

## WP1 — Auth

### What `routes/user-context.ts` does today

- `resolveRequestUserId()` reads `x-user-id` from the request headers and falls back to `DEFAULT_USER_ID = 'default'` when the header is missing or blank: `packages/backend/src/routes/user-context.ts:5-15`.
- `ensureUserExists()` only inserts `{ id: userId }` into `users` with `onConflictDoNothing()`: `packages/backend/src/routes/user-context.ts:17-19`.
- The `users` table currently has only `id` and `createdAt`; there is no `email` or `display_name`: `packages/backend/src/db/schema.ts:266-275`.

### What `routes/auth-middleware.ts` does today

- `validateApiKeyValue()` validates a single configured API key against `X-API-Key`: `packages/backend/src/routes/auth-middleware.ts:8-34`.
- `requireApiKey()` returns `401` on missing/invalid API key and sets `request.apiKeyAuthenticated = true` on success: `packages/backend/src/routes/auth-middleware.ts:41-72`.
- There is no JWT parsing, no `Authorization: Bearer`, and no `request.userId` population in this middleware.

### Related auth behavior the plan needs to account for

- Global auth is enforced by `registerAuthPlugin()`, which applies API-key auth on `onRequest` for all non-public routes: `packages/backend/src/plugins/auth.ts:25-75`.
- The web app hardcodes `API_KEY = 'er-dev-2026'` in the client bundle and uses it for non-public HTTP calls: `packages/web/src/lib/api.ts:12-19`.
- The web app also sends that API key in the WebSocket query string because browser upgrades cannot attach custom headers: `packages/web/src/hooks/useWebSocket.ts:11-19`.
- The backend WebSocket route validates the API key from either query param or header: `packages/backend/src/plugins/websocket.ts:173-190`.

### What needs to change

- `resolveRequestUserId()` must stop treating `x-user-id` as the primary identity source and instead read a verified JWT-derived user id. Right now user identity and request authentication are completely separate concerns.
- `ensureUserExists()` and the `users` schema must evolve from `id`-only records to something that can represent auth state (`email`, `display_name`, probably refresh-token/session state if the plan keeps refresh tokens).
- The API key plugin and middleware will need a compatibility mode, not just a new middleware. Today auth is centralized in `registerAuthPlugin()`, not only in per-route `preHandler`s.
- The frontend cannot keep a hardcoded API key once JWT auth is introduced; `packages/web/src/lib/api.ts:13`, `packages/web/src/lib/web-push.ts:95-97`, `packages/web/src/lib/web-push.ts:125-128`, and `packages/web/src/hooks/useWebSocket.ts:14-18` all need to move to token-based auth or explicit self-host fallback logic.

### Plan conflicts / misses

- The plan says WP1 blocks WP2, but the current app already has user-scoped `watchlist` and `push_subscriptions` behavior via `x-user-id` / `default` user, so WP2 is not technically blocked by auth under the current architecture: `packages/backend/src/routes/watchlist.ts:26-117`, `packages/backend/src/routes/push-subscriptions.ts:36-82`.
- The plan’s “public routes (feed with delay)” assumption does not match current behavior. `/api/v1/feed` is already public via `registerAuthPlugin()` and there is no delay logic in that route: `packages/backend/src/app.ts:393-409`, `packages/backend/src/routes/dashboard.ts:505-612`.
- The current public surface is broader than the plan suggests. `/api/v1/delivery/feed`, `/api/v1/audit`, and `/api/v1/audit/stats` are also in the public route allowlist: `packages/backend/src/app.ts:401-407`.

---

## WP2 — Watchlist-First

### What the Feed API actually supports today

- The web app’s feed uses `GET /api/v1/feed?limit=...` via `getFeed(limit)`: `packages/web/src/lib/api.ts:22-38`.
- `GET /api/v1/feed` accepts `limit`, `before`, and `ticker` only. It does not accept `watchlist=true`: `packages/backend/src/routes/dashboard.ts:500-517`.
- The route is backed by `pipeline_audit` joined to `events`, filtered to `pa.outcome = 'delivered'`: `packages/backend/src/routes/dashboard.ts:523-569`.
- The response shape is feed-summary-only: `id`, `title`, `source`, `severity`, `tickers`, `summary`, `url`, `time`, `category`, `llmReason`: `packages/backend/src/routes/dashboard.ts:582-607`.
- There is no auth-aware personalization, no user lookup, no empty-watchlist fallback, and no ticker extraction from title/body inside `/api/v1/feed`.

### Existing watchlist support that does exist

- `GET /api/events?watchlist=true` already exists and filters events to the request user’s watchlist tickers: `packages/backend/src/routes/events.ts:53-60`, `packages/backend/src/routes/events.ts:185-201`.
- That route matches only `metadata->>'ticker'` or `metadata->'tickers'`; it does not extract tickers from title/body as the plan proposes: `packages/backend/src/routes/events.ts:194-196`.
- If the watchlist is empty, it returns an empty result by injecting `sql\`false\``; it does not fall back to the full feed: `packages/backend/src/routes/events.ts:197-200`.
- Watchlist CRUD already exists under `/api/watchlist`: `packages/backend/src/routes/watchlist.ts:22-118`.

### What `packages/web/src/pages/Feed.tsx` actually supports today

- The page is a firehose plus client-side filters. It has no “All Events / My Watchlist” toggle: `packages/web/src/pages/Feed.tsx:17-20`, `packages/web/src/pages/Feed.tsx:67-173`.
- Filters are only severity/source URL-state filters; they are applied client-side after the feed is loaded: `packages/web/src/pages/Feed.tsx:69-108`, `packages/web/src/pages/Feed.tsx:163-173`.
- The page polls `useAlerts(50)`, which calls `getFeed(50)` every 30 seconds: `packages/web/src/hooks/useAlerts.ts:35-41`.
- It also merges live WebSocket events into the same list: `packages/web/src/hooks/useAlerts.ts:54-70`.
- `AlertCard` has an optional watchlist button prop, but the Feed page never uses it: `packages/web/src/components/AlertCard.tsx:25-28`, `packages/web/src/components/AlertCard.tsx:74-89`, `packages/web/src/pages/Feed.tsx:386-393`.
- The empty state is generic and not watchlist-aware: `packages/web/src/pages/Feed.tsx:377-384`.

### Watchlist page support today

- The Watchlist page only supports add/remove and links out to ticker pages: `packages/web/src/pages/Watchlist.tsx:42-103`.
- It does not show latest event, market context, 5d change, sparklines, or “X events in last 7 days.”

### Important plan conflicts / misses

- The plan targets `/api/v1/feed`, but the codebase already has two different feed concepts:
  - public app feed: `/api/v1/feed` from `dashboard.ts`
  - raw event query route with watchlist filter: `/api/events`
  This mismatch needs a design decision before implementation: `packages/backend/src/routes/dashboard.ts:505-612`, `packages/backend/src/routes/events.ts:127-217`.
- Even if `/api/v1/feed` gains `watchlist=true`, the current live stream would still inject unfiltered events unless the WebSocket path is also made watchlist-aware: `packages/web/src/hooks/useAlerts.ts:54-70`, `packages/backend/src/plugins/websocket.ts:164-171`.
- The plan misses that “watchlist” already has two meanings in the codebase:
  - user-scoped DB watchlists for the product: `packages/backend/src/db/schema.ts:394-412`
  - a static L1 filter watchlist loaded from `config/watchlist.json` for social/newswire thresholding: `packages/backend/src/pipeline/alert-filter.ts:14-16`, `packages/backend/src/pipeline/alert-filter.ts:70-75`, `packages/backend/src/pipeline/alert-filter.ts:109-119`
- The plan’s market-data-cache note is not wired today. `MarketDataCache` refreshes only its internal `knownSymbols`; watchlist mutations do not push user watchlist symbols into that set: `packages/backend/src/services/market-data-cache.ts:47-63`, `packages/backend/src/services/market-data-cache.ts:79-93`, `packages/backend/src/services/market-data-cache.ts:152-160`, `packages/backend/src/routes/watchlist.ts:41-118`.

---

## WP3 — Product Language

### Runtime code hits

- Shared schema enum and fallback:
  - `packages/shared/src/schemas/llm-types.ts:50-54`
  - `packages/shared/src/schemas/llm-types.ts:63`
- LLM enrichment prompt:
  - `packages/backend/src/pipeline/llm-enricher.ts:55-74`
- Delivery push-policy logic:
  - `packages/delivery/src/push-policy.ts:17-49`
  - `packages/delivery/src/push-policy.ts:81-83`

### Non-action false positives

- `FYI` appears as an acronym blacklist/stopword entry, not an action label:
  - `packages/backend/src/utils/keyword-extractor.ts:14`
  - `packages/backend/src/scanners/ticker-extractor.ts:17`
- `WATCH` appears inside `FEDWATCH_ENABLED`, not as a product label:
  - `packages/backend/src/app.ts:444`

### Tests / docs hits

- Shared tests:
  - `packages/shared/src/__tests__/schemas.test.ts:253`
  - `packages/shared/src/__tests__/schemas.test.ts:268-270`
  - `packages/shared/src/__tests__/schemas.test.ts:273`
  - `packages/shared/src/__tests__/schemas.test.ts:283`
  - `packages/shared/src/__tests__/schemas.test.ts:296`
- Backend tests:
  - `packages/backend/src/__tests__/feed-api.test.ts:508`
  - `packages/backend/src/__tests__/feed-api.test.ts:571`
  - `packages/backend/src/__tests__/alert-scorecard.test.ts:49`
  - `packages/backend/src/__tests__/alert-scorecard.test.ts:200`
  - `packages/backend/src/__tests__/judge-api.test.ts:57`
  - `packages/backend/src/__tests__/judge-api.test.ts:407`
  - `packages/backend/src/__tests__/judge-api.test.ts:427`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:51`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:172`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:197`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:222`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:238`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:250`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:344`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:369`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:394`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:450`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:475`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:500`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:583`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:654`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:679`
  - `packages/backend/src/__tests__/scorecard-aggregation.test.ts:794`
  - `packages/backend/src/__tests__/rich-delivery-enricher.test.ts:142`
  - `packages/backend/src/__tests__/rich-delivery-enricher.test.ts:169`
  - `packages/backend/src/__tests__/rich-delivery-enricher.test.ts:208`
  - `packages/backend/src/__tests__/rich-delivery-enricher.test.ts:227`
  - `packages/backend/src/__tests__/llm-enricher.test.ts:144`
  - `packages/backend/src/__tests__/llm-enricher.test.ts:328`
  - `packages/backend/src/__tests__/llm-enricher.test.ts:351`
  - `packages/backend/src/__tests__/llm-enricher.test.ts:468`
- Delivery tests:
  - `packages/delivery/src/__tests__/bark-pusher.test.ts:175`
  - `packages/delivery/src/__tests__/bark-pusher.test.ts:184`
  - `packages/delivery/src/__tests__/alert-router.test.ts:30`
  - `packages/delivery/src/__tests__/alert-router.test.ts:42`
  - `packages/delivery/src/__tests__/alert-router.test.ts:66`
  - `packages/delivery/src/__tests__/alert-router.test.ts:78`
  - `packages/delivery/src/__tests__/alert-router.test.ts:113`
  - `packages/delivery/src/__tests__/alert-router.test.ts:138`
  - `packages/delivery/src/__tests__/alert-router.test.ts:201`
  - `packages/delivery/src/__tests__/alert-router.test.ts:263`
  - `packages/delivery/src/__tests__/alert-router.test.ts:309`
  - `packages/delivery/src/__tests__/alert-router.test.ts:440`
  - `packages/delivery/src/__tests__/rich-delivery.test.ts:63`
  - `packages/delivery/src/__tests__/rich-delivery.test.ts:130`
  - `packages/delivery/src/__tests__/rich-delivery.test.ts:170`
  - `packages/delivery/src/__tests__/rich-delivery.test.ts:226`
  - `packages/delivery/src/__tests__/rich-delivery.test.ts:263`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:260`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:289`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:316`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:332`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:344`
  - `packages/delivery/src/__tests__/discord-webhook.test.ts:478`
- Web tests:
  - `packages/web/src/test/setup.ts:111`
  - `packages/web/src/pages/Scorecard.test.tsx:42`
- Docs:
  - `README.md:39`
  - `TASK.md:84-86`
  - `docs/plans/2026-03-15-phase3-productization.md:29`
  - `docs/plans/2026-03-15-phase3-productization.md:126-128`
  - `docs/plans/2026-03-15-phase3-productization.md:134`
  - `docs/plans/2026-03-14-phase-0.md:159-161`
  - `docs/plans/2026-03-14-phase-0.md:175`
  - `docs/plans/2026-03-14-product-vision.md:48`
  - `docs/plans/2026-03-14-product-vision.md:373`
  - `docs/REVIEW-PM.md:16`

### Plan conflicts / misses

- The user-facing web runtime does not hardcode these exact labels today. The main runtime hits are schema/prompt/push policy, not feed-page copy.
- The dashboard and scorecard mostly render whatever `action` string the API returns, so renaming is more of a data-contract/template problem than a large frontend-text sweep.
- The plan’s `action` -> `signal` rename will also touch scorecard/grouping semantics because scorecards currently group on `action` buckets: `packages/web/src/pages/Scorecard.tsx:138-143`, `packages/web/src/lib/api.ts:247-255`.

---

## WP4 — Scanner Reliability

### `base-scanner.ts` start behavior

- `start()` only sets `_running = true` and schedules the first tick after `currentIntervalMs`; it does not poll immediately: `packages/shared/src/base-scanner.ts:52-55`, `packages/shared/src/base-scanner.ts:105-109`.
- `tick()` waits for `scan()` to finish before scheduling the next run: `packages/shared/src/base-scanner.ts:57-60`.
- `stop()` clears the pending timer but does not abort in-flight network work: `packages/shared/src/base-scanner.ts:111-118`.

### Scanners lacking fetch timeout

No direct-fetch scanner in `packages/backend/src/scanners` currently uses `AbortController`, `AbortSignal`, `signal`, or an equivalent timeout wrapper. Direct unbounded `fetchFn(...)` call sites include:

- `packages/backend/src/scanners/warn-scanner.ts:88`
- `packages/backend/src/scanners/congress-scanner.ts:94`
- `packages/backend/src/scanners/fedwatch-scanner.ts:124`
- `packages/backend/src/scanners/federal-register-scanner.ts:90`
- `packages/backend/src/scanners/short-interest-scanner.ts:93`
- `packages/backend/src/scanners/analyst-scanner.ts:125`
- `packages/backend/src/scanners/earnings-scanner.ts:123`
- `packages/backend/src/scanners/reddit-scanner.ts:118`
- `packages/backend/src/scanners/newswire-scanner.ts:110`
- `packages/backend/src/scanners/breaking-news-scanner.ts:199`
- `packages/backend/src/scanners/options-scanner.ts:108`
- `packages/backend/src/scanners/fda-scanner.ts:151`
- `packages/backend/src/scanners/doj-scanner.ts:95`
- `packages/backend/src/scanners/whitehouse-scanner.ts:135`
- `packages/backend/src/scanners/sec-edgar-scanner.ts:471`
- `packages/backend/src/scanners/dilution-scanner.ts:222`
- `packages/backend/src/scanners/halt-scanner.ts:409`
- `packages/backend/src/scanners/halt-scanner.ts:430`
- `packages/backend/src/scanners/stocktwits-scanner.ts:136`
- `packages/backend/src/scanners/stocktwits-scanner.ts:181`
- `packages/backend/src/scanners/ir-monitor-scanner.ts:356`
- `packages/backend/src/scanners/ir-monitor-scanner.ts:388`

### Scanners with some timeout protection already

- `TruthSocialScanner` and `XScanner` use the browser scraping pool, which has Crawlee request-handler timeouts plus explicit DOM wait timeouts:
  - `packages/backend/src/scanners/truth-social-scanner.ts:154-159`
  - `packages/backend/src/scanners/x-scanner.ts:216-221`
  - `packages/backend/src/scanners/scraping/browser-pool.ts:38`

### Other WP4 items already visible in code

- NYSE holidays are hardcoded for 2026 in the LLM gatekeeper: `packages/backend/src/pipeline/llm-gatekeeper.ts:12-34`.
- Cooldown is per ticker only via `cooldownMap: Map<string, number>` and `applyTickerCooldown(ticker, ...)`: `packages/backend/src/pipeline/alert-filter.ts:91`, `packages/backend/src/pipeline/alert-filter.ts:103-107`, `packages/backend/src/pipeline/alert-filter.ts:361-377`.

### Plan misses / conflicts

- The plan correctly calls out first-poll delay and missing timeouts, but it misses the “hung fetch stalls the loop forever” consequence created by `tick()` waiting for `scan()` before `scheduleNext()`.
- If timeout handling is added, `stop()` should probably abort in-flight work as well; otherwise restart/shutdown semantics remain sloppy.

---

## WP5 — Concurrency / Event Bus

### How the event bus works today

- `EventBus.subscribe()` accepts async handlers in the type signature: `packages/shared/src/schemas/event-bus.ts:3-10`.
- `InMemoryEventBus` is a thin `EventEmitter` wrapper: `packages/shared/src/in-memory-event-bus.ts:11-18`.
- `publish()` calls `this.emitter.emit(EVENT_KEY, event)` and resolves immediately; it does not await async subscribers: `packages/shared/src/in-memory-event-bus.ts:15-18`.

### Where the main pipeline handler is

- The main pipeline subscription is in `packages/backend/src/app.ts:496-894`.
- The handler does classification, dedup, DB storage, audit/live-feed publishing, alert filtering, LLM judge, enrichment, historical enrichment, kill-switch checks, and delivery.

### Why this matters for the plan

- A limiter around the async subscriber body will cap concurrent pipeline executions, but it will not create true publisher backpressure because `eventBus.publish()` already returns before subscriber work finishes.
- `BaseScanner.scan()` does `await this.eventBus.publish(event)` for each event, but that `await` only waits for `emit()` to dispatch listeners, not for the pipeline to finish: `packages/shared/src/base-scanner.ts:75-77`, `packages/shared/src/in-memory-event-bus.ts:15-18`.
- So the current architecture already allows effectively unbounded in-flight pipeline work under bursts.

### Plan misses / conflicts

- The plan’s limiter is necessary but not sufficient if the goal is “backpressure.” To get actual backpressure, the bus contract or the publisher/consumer queueing model has to change.
- The metrics proposed in the plan (`pipeline_queue_depth`, `pipeline_queue_wait_ms`) do not exist today, and there is no explicit queue object to measure against.

---

## WP6 — Confirmation

### Are `mergedFrom` / `confirmedSources` / `confirmationCount` populated anywhere?

- Schema exists:
  - `packages/backend/src/db/schema.ts:70-76`
- `storeEvent()` does not populate any of them; it inserts only source, sourceEventId, title, summary, raw payload, metadata, severity, and receivedAt: `packages/backend/src/db/event-store.ts:10-30`

### What is populated today

- `confirmationCount` defaults to `1` at the DB schema level: `packages/backend/src/db/schema.ts:76`
- `GET /api/events?confirmed=true` filters on `confirmation_count >= 2`, so the field is queryable: `packages/backend/src/routes/events.ts:180-183`
- `GET /api/events/:id` returns fallback values even when DB fields are null:
  - `confirmationCount: event.confirmationCount ?? 1`
  - `confirmedSources: event.confirmedSources ?? [event.source]`
  Source: `packages/backend/src/routes/events.ts:323-327`

### Partial support that exists but is not wired into ingestion

- `ProgressiveSeverityService.recordConfirmation()` updates `confirmedSources` and `confirmationCount`: `packages/backend/src/services/progressive-severity.ts:68-112`
- The same service uses those fields to auto-escalate severity: `packages/backend/src/services/progressive-severity.ts:258-346`
- But `recordConfirmation()` is not called anywhere in production code; repo search finds only tests: `packages/backend/src/services/progressive-severity.ts:68`, `packages/backend/src/__tests__/alert-budget-progressive-severity.test.ts:249-329`

### What appears to be unused

- `mergedFrom` is in the schema and selected in some event queries: `packages/backend/src/db/schema.ts:71`, `packages/backend/src/routes/events.ts:273`
- I did not find any production write path that sets `mergedFrom`.

### Plan conflicts / misses

- The plan proposes adding merge logic inside `event-store.ts`, but the pipeline already deduplicates before storage and returns early on duplicates: `packages/backend/src/app.ts:511-523`.
- That means WP6 should be designed together with `EventDeduplicator` / story grouping, not bolted into `storeEvent()` independently, or the codebase will end up with two overlapping duplicate/merge systems.

---

## WP7 — Frontend / PWA

### Workbox status

- There is no Workbox dependency or plugin setup in the web app package:
  - `packages/web/package.json:13-38`
  - `packages/web/vite.config.ts:1-28`

### What `sw.js` actually does

- Manual service worker, not generated:
  - skip waiting on install: `packages/web/public/sw.js:1-3`
  - claim clients on activate: `packages/web/public/sw.js:5-7`
  - show notifications on `push`: `packages/web/public/sw.js:9-26`
  - focus/navigate or open a window on `notificationclick`: `packages/web/public/sw.js:28-54`
  - parse JSON/text payloads: `packages/web/public/sw.js:56-68`
- It has no `fetch` handler, no precache manifest, no offline page, and no runtime caching strategy.

### Existing PWA substrate the plan should acknowledge

- The app registers a service worker on startup in production: `packages/web/src/main.tsx:5-18`, `packages/web/src/lib/pwa.ts:31-60`
- `index.html` includes the manifest and theme color metadata: `packages/web/index.html:9-15`
- `manifest.webmanifest` exists, albeit minimal: `packages/web/public/manifest.webmanifest:1-10`
- Browser push subscribe/unsubscribe helpers exist: `packages/web/src/lib/web-push.ts:51-137`
- Settings UI exposes browser push enable/disable: `packages/web/src/pages/Settings.tsx:17-23`, `packages/web/src/pages/Settings.tsx:134-180`

### Plan misses / conflicts

- WP7 is correct that there is no Workbox caching, but “PWA” is not missing; it is already partially shipped.
- The manifest is very minimal and currently has no icons/screenshots/shortcuts, which the plan does not mention.

---

## WP8 — Landing / Marketing

### Existing marketing content

- README headline and positioning:
  - `README.md:1-7`
  - `README.md:32-61`
- Web app shell copy:
  - `packages/web/src/App.tsx:24-29`
- Feed header copy:
  - `packages/web/src/pages/Feed.tsx:181-190`
- HTML meta description:
  - `packages/web/index.html:9-12`

### What does not exist

- No dedicated landing route in the router; only product routes are registered: `packages/web/src/App.tsx:51-64`
- No `Landing`, `Marketing`, `Pricing`, `About`, or similar page file under `packages/web/src/pages`
- No standalone landing package, static landing HTML, or marketing-only route surfaced by the app

### Plan misses / conflicts

- The plan is right that there is no real landing page, but it misses that some value-prop copy already exists and can likely be reused instead of rewritten from zero.

---

## Additional Misses Not Explicitly Called Out By The Plan

1. The “delayed public feed” product promise is not implemented in backend feed logic. The UI says “Delayed public feed,” but `/api/v1/feed` has no delay clause and returns recent delivered events directly: `packages/web/src/App.tsx:24-29`, `packages/backend/src/routes/dashboard.ts:523-607`.
2. The current feed architecture is split across HTTP and WebSocket. Any personalized feed change has to address both `GET /api/v1/feed` and `/ws/events`: `packages/web/src/hooks/useAlerts.ts:35-41`, `packages/web/src/hooks/useAlerts.ts:54-70`, `packages/backend/src/plugins/websocket.ts:164-171`.
3. The feed UI does not currently expose watchlist actions, even though `AlertCard` has the capability. That is a smaller UI gap than the plan suggests, but it is still an unconnected feature: `packages/web/src/components/AlertCard.tsx:25-28`, `packages/web/src/components/AlertCard.tsx:74-89`, `packages/web/src/pages/Feed.tsx:386-393`.
4. There are two separate feed endpoints with overlapping names and different payloads: `/api/v1/feed` and `/api/v1/delivery/feed`: `packages/backend/src/routes/dashboard.ts:505-612`, `packages/backend/src/routes/delivery-feed.ts:252-306`. The plan does not say which one should be the long-term product contract.
5. The route locations are a bit surprising. The main feed API lives inside `routes/dashboard.ts`, not a dedicated feed route module, which matters for implementation discoverability: `packages/backend/src/routes/dashboard.ts:505-612`.
