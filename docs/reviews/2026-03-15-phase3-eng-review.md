# Engineering Review: Phase 3 Completion & Productization Plan

> Reviewer: CC (Paranoid Eng lens) | Date: 2026-03-15 | Plan: `docs/plans/2026-03-15-phase3-productization.md`
> Status: CONDITIONAL APPROVAL — must-fix items identified

---

### Critical (must fix before implementation)

**1. [Auth] JWT in localStorage = XSS → full account takeover**

The plan says: "store JWT in localStorage → redirect to Feed." Any XSS vulnerability (including from injected event content that reaches the frontend) gives an attacker every user's JWT. localStorage is readable by any JS on the page.

The pipeline ingests arbitrary external content (RSS titles, social media posts, press releases) that gets rendered in the feed. If _any_ of that content escapes sanitization, you have a stored XSS → token exfiltration chain.

**Fix**: Use httpOnly cookies for JWT storage. The `useAuth()` hook manages CSRF tokens instead. Or at minimum, use a short-lived access token (5min) in memory + httpOnly refresh cookie.

**Blast radius if auth has a bug**: Total. Every user-scoped feature is compromised — watchlists become visible, push subscriptions can be hijacked, and an attacker can impersonate any user. Since there's no session invalidation mechanism described (no token blacklist, no `jti` claim), a leaked JWT is valid for its full 24h lifetime with no way to revoke it.

---

**2. [Auth] No refresh token rotation → replay attacks**

The plan describes `POST /api/auth/refresh` returning a new JWT, but says nothing about:
- Rotating the refresh token itself on each use
- Storing refresh tokens server-side for revocation
- Binding refresh tokens to a device or session

A stolen 30-day refresh token can mint unlimited JWTs. There's no `refresh_tokens` table in the proposed schema — only `magic_link_tokens`.

**Fix**: Add a `refresh_tokens` table with `token`, `user_id`, `expires_at`, `revoked_at`, `replaced_by`. Rotate on every refresh. Revoke the entire family if a revoked token is reused (token family rotation pattern).

---

**3. [Auth] Magic link token race condition — double-verify**

`POST /api/auth/verify` checks expiry, marks `used_at`, creates user if not exists, returns JWT. This is a classic TOCTOU race:

```
Request A: SELECT token WHERE used_at IS NULL → found
Request B: SELECT token WHERE used_at IS NULL → found (concurrent)
Request A: UPDATE SET used_at = NOW() → success
Request B: UPDATE SET used_at = NOW() → success (overwrites, both get JWTs)
```

Two concurrent requests to `/auth/verify` with the same token can both succeed, creating two valid sessions.

**Fix**: Use `UPDATE magic_link_tokens SET used_at = NOW() WHERE token = $1 AND used_at IS NULL RETURNING *` as a single atomic operation. If zero rows returned, the token was already used. No SELECT-then-UPDATE.

---

**4. [Auth → user-context.ts] Transition gap — existing endpoints break silently**

Current `resolveRequestUserId()` at `user-context.ts:7-14` reads `x-user-id` header. The plan says "updated to read from JWT instead." But it also says `AUTH_REQUIRED=false` (default) keeps current behavior.

The problem: during the transition, there will be a period where some endpoints use the new auth middleware and some still use the old `resolveRequestUserId()`. If `x-user-id` header disappears from frontend requests before all routes are migrated, you get `DEFAULT_USER_ID` ('default') silently applied to authenticated user operations. That means an authenticated user's watchlist changes could write to the 'default' user — data corruption.

**Fix**: The transition must be atomic. `resolveRequestUserId()` should check JWT first, then fall back to `x-user-id`, then to default. Add a log warning when falling back to `x-user-id` so you can track unmigrated paths.

---

**5. [Cooldown] Memory growth is unbounded in the happy path**

`alert-filter.ts:104` uses `Map<string, number>` for cooldown state. The plan changes the key from `ticker` to `ticker:eventType`. With ~23 event types and an unbounded ticker universe, the map grows to `tickers × eventTypes` entries.

Current cleanup at `alert-filter.ts:213-221` only prunes on _load_ (expired entries are skipped). There is no periodic pruning during runtime. Over days of continuous operation, the map only grows.

Worse, `saveCooldowns()` at `alert-filter.ts:224-241` serializes the _entire_ map to JSON and writes to `/tmp/event-radar-seen/ticker-cooldown.json` on every cooldown update (debounced 2s). With `ticker:eventType` keys, this file grows faster.

**Fix**: Add periodic pruning (e.g., every 10 minutes, evict entries older than `tickerCooldownMs`). This is a one-liner in the constructor: `setInterval(() => this.pruneExpired(), 600_000)`.

---

**6. [Cooldown] Persistence format change is a silent breaking change**

Current cooldown keys are `"NVDA"`. New keys will be `"NVDA:earnings_beat"`. When the new code loads the old cooldown file, it'll read keys like `"NVDA"` into the map. These old-format keys will never match the new `ticker:eventType` lookups, so all existing cooldowns are effectively lost on upgrade.

That means: _on first deploy, every ticker that was in cooldown gets a burst of duplicate alerts._

**Fix**: Either wipe the cooldown file on upgrade (document this), or add a migration check: if a key doesn't contain `:`, treat it as `ticker:*` and apply the cooldown across all event types for that ticker during the transition window.

---

**7. [Event Bus Concurrency] The ConcurrencyLimiter has an unbounded queue that silently drops errors**

The proposed `ConcurrencyLimiter` at WP5 queues promises when `active >= maxConcurrent`. But:

- The queue (`(() => void)[]`) is unbounded. During a market open burst (50+ events/minute from 13 scanners), the queue grows without limit.
- If `fn()` throws, the `finally` block dequeues the next item, but the error propagates up. Since the event bus handler in `app.ts:497` is `async (event) => { ... }` and the event bus uses `EventEmitter.emit()` (synchronous, fire-and-forget at `in-memory-event-bus.ts:17`), **unhandled promise rejections from queued items crash the process in Node 18+**.
- There's no queue depth limit. If the pipeline is slow (LLM enrichment taking 10s), 50 events queue up, each holding references to event objects → memory pressure.

**Fix**: 
1. Add a max queue depth (e.g., 100). Reject/drop with a metric when exceeded.
2. Wrap the handler call in try/catch so queue processing continues on error.
3. Add a drain mechanism for graceful shutdown.
4. The event bus subscriber at `in-memory-event-bus.ts:20-22` should wrap handlers in try/catch to prevent unhandled promise rejections — this is a bug _today_, not just with the new limiter.

---

### Major (should fix)

**8. [Event Bus] Existing unhandled promise rejection bug**

This is pre-existing but the plan makes it worse. At `in-memory-event-bus.ts:15-17`:

```typescript
async publish(event: RawEvent): Promise<void> {
  this._publishedCount++;
  this.emitter.emit(EVENT_KEY, event);  // sync emit, async handler
}
```

`EventEmitter.emit()` is synchronous. If the subscriber is an async function, its returned Promise is ignored by EventEmitter. Any `throw` inside the async handler becomes an unhandled rejection. Today this is survivable because there's only one handler and the pipeline has try/catch in some paths. But with the concurrency limiter adding queued async work, the blast radius increases.

**Fix**: The subscriber should be wrapped: `this.emitter.on(EVENT_KEY, (e) => handler(e).catch(err => log.error(err)))`.

---

**9. [Scanner First-Poll] Immediate `tick()` interacts badly with startup grace period**

The plan proposes `void this.tick()` in `start()` at WP4a. But `app.ts:597-610` has a 90-second delivery grace period that suppresses alerts after startup. The purpose of the grace period is to let scanners populate their seenId buffers before delivering.

If all 13+ scanners do an immediate first poll, they'll all fire within the first few seconds. Their seenId buffers are empty. Every event they find is "new." All of these events hit the pipeline simultaneously, pass dedup (seenIds empty), get stored to DB, but delivery is suppressed by the grace period.

So far so good — but after 90 seconds, the _next_ poll cycle finds the same events again. This time seenIds are populated, so they're deduped at the scanner level. The problem is the _first_ burst: you've stored potentially hundreds of events to the DB that were never delivered. Those events will show up in the feed UI as undelivered historical events.

**Fix**: Document this behavior explicitly. Consider extending the grace period or adding a `firstPollOnly` flag that marks events as `historical_backfill: true` so the feed can distinguish them.

---

**10. [Fetch Timeout] AbortController + BaseScanner backoff interaction**

The proposed `scannerFetch()` at WP4b aborts after 30s via `AbortController`. When this happens, the `fetch()` throws an `AbortError`. This error propagates up through `poll()` as a failure, incrementing `_consecutiveErrors` in `base-scanner.ts:87-90`.

After 5 consecutive timeouts (`BACKOFF_THRESHOLD`), the scanner enters exponential backoff — doubling from its base interval up to 30 minutes. This is _correct_ behavior for a down API, but _wrong_ for a consistently slow API.

Consider: if an API takes 35 seconds consistently, it'll timeout at 30s on every call. Five calls later, the scanner backs off to 2x-4x its interval. For a 2-minute scanner, that's 4-8 minutes between polls — and it'll _never_ recover because the API is consistently slow, not down.

**Fix**: Distinguish `AbortError` (timeout) from network errors in `BaseScanner.scan()`. Timeout errors should increment a separate counter and not trigger backoff as aggressively. Or: make the timeout configurable per-scanner so slow APIs (Congress at 30-min interval) get a generous timeout (60s) while fast APIs (Truth Social at 15s interval) get a tight one (10s).

---

**11. [NYSE Holidays] Multiple bugs in the dynamic computation proposal**

The plan says "replace hardcoded `NYSE_HOLIDAYS_2026` with a function that computes holidays for any year." This sounds simple but NYSE holidays are _not_ all fixed-rule:

- **Good Friday**: Not a US federal holiday. NYSE closes for it based on ecclesiastical calendar (Easter algorithm). This requires implementing the Computus algorithm or a lookup table. Easter can fall anywhere from March 22 to April 25.
- **Early closings**: NYSE closes at 1:00 PM ET on the day before Independence Day, day after Thanksgiving, and Christmas Eve (if weekday). The current `getMarketSession()` doesn't handle early closings at all. The plan doesn't mention them.
- **Observed holiday rules**: If a holiday falls on Saturday, NYSE is closed the preceding Friday. If on Sunday, closed the following Monday. The current code (checking against `isNYSEHoliday`) would need to apply these rules.
- **Juneteenth**: Added as NYSE holiday starting 2022. The plan mentions it but this needs the "observed" shifting logic too.

Also, the current `isNYSEHoliday()` at `llm-gatekeeper.ts:29-34` hardcodes `NYSE_HOLIDAYS_2026` but checks `y-m-d` against it — so it'll silently return `false` for all dates in 2027+. This is a ticking time bomb that will manifest on January 1, 2027 when the system treats it as a trading day.

**Fix**: Either use a well-tested library (e.g., `market-holidays` npm package) or implement with thorough test coverage including Easter dates for 2025-2030. Don't underestimate this — it's a surprising amount of edge-case logic.

---

**12. [Multi-Source Confirmation] Race condition on concurrent inserts**

WP6 proposes: "before inserting a new event, check for existing events with similar ticker + eventType within 30-min window. If match found, update existing event's `confirmationCount += 1`."

Two scanners emitting similar events simultaneously:
```
Scanner A finds SEC filing for NVDA   → check DB: no match → INSERT (confirmationCount=1)
Scanner B finds newswire about NVDA   → check DB: no match → INSERT (confirmationCount=1)
                                        (concurrent with A, A's insert not yet committed)
```

Result: two separate events, both with `confirmationCount=1`. The confirmation was missed.

**Fix**: Use an advisory lock on `(ticker, eventType)` during the check-then-insert, or use `INSERT ... ON CONFLICT` with a partial unique index on `(ticker, eventType, created_at within 30min window)`. The "lightweight approach" is only lightweight until concurrency enters the picture.

---

**13. [Multi-Source Confirmation] Performance concern on the "simple SQL query"**

The plan's "lightweight" approach queries for matching events by `ticker + eventType + 30-min window` before every insert. With the current schema, this requires:

```sql
SELECT * FROM events 
WHERE metadata->>'ticker' = $1 
  AND metadata->>'eventType' = $2 
  AND created_at > NOW() - INTERVAL '30 minutes'
```

There's no index on `metadata->>'ticker'` or `metadata->>'eventType'` (these are JSONB fields). The `events` table will grow continuously. This query will get slower over time and adds latency to every event insert.

**Fix**: Add a GIN index on `metadata` or, better, extract `ticker` and `event_type` to dedicated indexed columns on the `events` table. This is a schema change that should be planned now.

---

**14. [Schema Migration] Adding columns to `users` table — locking risk**

The plan adds `email VARCHAR(255) UNIQUE` and `display_name VARCHAR(100)` to the `users` table via `ALTER TABLE ADD COLUMN`. In PostgreSQL:
- `ADD COLUMN` with no default is instant (metadata-only).
- `ADD COLUMN` with a `UNIQUE` constraint requires a full table scan to build the unique index.
- The `UNIQUE` constraint also takes an `ACCESS EXCLUSIVE` lock briefly.

For the current table size (likely small), this is fine. But it should be documented that this migration should run during low traffic.

More importantly: the `users.id` column is `varchar(100)` and the plan uses UUID for `magic_link_tokens.id`. The `users.id` is currently set from the `x-user-id` header value (any string). When auth creates new users, will it use UUID or email as the user ID? The plan doesn't specify. If it uses UUID, all existing data linked to `user_id = 'default'` (watchlists, push subscriptions) will be orphaned.

**Fix**: Specify the user ID strategy explicitly. If switching from string IDs to UUIDs, write a migration that creates a new UUID user for each existing user and updates all FK references.

---

**15. [API Contract] Product language migration breaks push-policy.ts**

`push-policy.ts:25-28` checks `action === '🔴 ACT NOW'` and `push-policy.ts:46` checks `action === '🟡 WATCH'`. The plan renames these to `'🔴 High-Quality Setup'` and `'🟡 Developing Situation'`.

If WP3 (language migration) deploys before push-policy is updated, **all push routing breaks**. Every event falls through to the default case — `tier: 'low'`, `shouldPush: false`. Users stop getting push notifications silently.

**Fix**: Deploy push-policy update _atomically_ with the language migration. Or, better: make push-policy match on the emoji prefix (`🔴`, `🟡`, `🟢`) rather than the full string, making it robust to label changes.

---

### Minor (nice to have)

**16.** The `ConcurrencyLimiter` uses `this.queue.shift()` to dequeue. `Array.shift()` is O(n). Under sustained load with a large queue, this becomes measurable. Use a proper queue implementation or linked list.

**17.** The plan says the `shortId` column (WP7b) is an "8-char hash of UUID, generated on insert." Hash collisions are possible. 8 chars of hex = 32 bits = collision expected around ~65K events (birthday paradox). With base62 it's better (~218K). Either way, you need a UNIQUE constraint and retry logic on collision.

**18.** Workbox `CacheFirst` for static assets (WP7a) is correct, but the plan doesn't mention cache busting. If Vite's content-hashed filenames are used (they are by default), this is fine. Worth confirming.

**19.** The `scannerFetch()` utility doesn't handle the case where the caller already provides a `signal` in `options`. The spread `{ ...options, signal: controller.signal }` overwrites the caller's signal. Use `AbortSignal.any()` (Node 20+) to compose signals.

**20.** WP1 says "MVP: Resend ($0 for 100 emails/day)." If this is used for the hosted service, 100 emails/day is _very_ low. A single user who repeatedly requests magic links (typo in email, slow email delivery, impatient clicks) could exhaust the quota. Rate-limit magic link requests to 3 per email per hour.

---

### Summary Verdict

| Category | Count |
|----------|-------|
| Critical | 7 |
| Major | 8 |
| Minor | 5 |

**Top 3 things that will break in production:**
1. JWT in localStorage + external content rendering = XSS → account takeover
2. Push-policy string matching breaks silently when product language changes
3. Cooldown format change causes alert burst on deploy

**Recommended action**: Address all Critical items before starting implementation. The auth system design needs the most rework — it's currently specified at "tutorial blog post" level, not "production system handling financial data" level. The rest of the plan is solid engineering with known tradeoffs.
