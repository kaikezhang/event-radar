# Event Radar — Phase 3 Productization Plan v2

> Date: 2026-03-15 | Author: Wanwan | Status: Final draft
> Previous: `2026-03-15-phase3-productization.md` (v1)
> Reviews incorporated: CEO review, Eng review, Codex code-level review
> All reviews: `docs/reviews/2026-03-15-phase3-*.md`

## Goal

Transform Event Radar from a functional dev tool into a shippable product that a swing trader can use end-to-end: sign up → onboard → set watchlist → receive intelligent push alerts → check scorecard → trust the system.

## Design Principles (from CEO review)

1. **Watchlist IS the product** — not a feature, not a tab. The default experience.
2. **Intelligence, not advice** — "what happened + what followed historically", never "you should buy"
3. **Earn the right to interrupt** — confidence-gated push, quiet hours, watchlist-only by default
4. **Show receipts** — scorecard is the trust engine and the brand
5. **Provenance is trust** — every alert shows where it came from and why it passed filters

---

## Work Packages (revised)

### WP1: Product Language Migration
**Priority**: 🔴 Critical | **Effort**: 0.5 day | **Dependencies**: None
**Rationale** (CEO): "Do it Day 1. Every event after this ships with the right voice."

#### Label Changes
| Current | New | Emoji |
|---------|-----|-------|
| `🔴 ACT NOW` | `🔴 High-Quality Setup` | 🔴 |
| `🟡 WATCH` | `🟡 Monitor` | 🟡 |
| `🟢 FYI` | `🟢 Background` | 🟢 |

#### Files to Update (from Codex review)
1. `packages/shared/src/schemas/llm-types.ts` — `LLMEnrichmentActionSchema` enum values
2. `packages/backend/src/pipeline/llm-enricher.ts` — system prompt + user prompt
3. `packages/delivery/src/push-policy.ts` — **match on emoji prefix** (`🔴`/`🟡`/`🟢`), not full string (Eng review critical fix)
4. `packages/delivery/src/discord-webhook.ts` — embed field labels
5. `packages/delivery/src/bark-pusher.ts` — title formatting
6. `packages/delivery/src/telegram.ts` — message formatting
7. `packages/backend/src/services/scorecard-aggregation.ts` — bucket labels
8. `packages/backend/src/services/alert-scorecard.ts` — `actionLabel` references
9. `packages/web/src/pages/Scorecard.tsx` — UI labels
10. `packages/web/src/pages/EventDetail.tsx` — trust block labels
11. `README.md` — marketing copy

#### Enrichment Prompt
```
Classify signal quality:
- 🔴 High-Quality Setup: Strong catalyst + favorable current context + historical support
- 🟡 Monitor: Notable catalyst, needs monitoring or confirmation
- 🟢 Background: Routine event, low immediate trading relevance

Do not use BUY, SELL, HOLD, or any personal financial advice language.
Never state what a trader should do. State what the data shows and what historically followed.
Frame as intelligence, not recommendations.
```

#### Field Rename
- Keep DB column as `action` (no migration needed)
- API returns both `action` and `signal` during transition
- Frontend reads `signal`, falls back to `action`

#### Backward Compatibility (Eng review)
- Push-policy matches emoji prefix: `alert.enrichment?.action?.startsWith('🔴')` — robust to any future label tweaks
- Scorecard aggregation: bucket by emoji prefix, display new label
- Existing delivered alerts in DB keep old labels — UI renders whatever string is stored

---

### WP2: Auth System (Magic Link + httpOnly Cookies)
**Priority**: 🔴 Critical | **Effort**: 3-4 days | **Dependencies**: None
**Rationale**: Blocks all user-scoped features.

#### Architecture (addressing all Eng review criticals)

**Token Storage**: httpOnly cookies (NOT localStorage)
- Access token: httpOnly, Secure, SameSite=Strict cookie, **7-day** expiry (CEO: "24h is too short for mobile PWA")
- Refresh token: httpOnly, Secure, SameSite=Strict cookie, 30-day expiry
- CSRF protection: double-submit cookie pattern (non-httpOnly `csrf` cookie + `X-CSRF-Token` header)
- No JWT in localStorage at all — eliminates XSS → token theft vector

**Refresh Token Rotation** (Eng review critical #2):
```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of token
  family_id UUID NOT NULL,                  -- group tokens for family revocation
  replaced_by UUID REFERENCES refresh_tokens(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
```
- On refresh: rotate token, store new one, mark old as `replaced_by` → new
- If a revoked token is reused: **revoke entire family** (replay attack detection)

**Magic Link** (Eng review critical #3):
```sql
CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256, never store plaintext
  expires_at TIMESTAMPTZ NOT NULL,         -- 15 min
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Verify uses atomic operation: `UPDATE ... WHERE token_hash = $1 AND used_at IS NULL RETURNING *` — eliminates TOCTOU race
- Rate limit: **3 magic links per email per hour** (prevents Resend quota exhaustion)

**Users Table Extension**:
```sql
ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
```
- **User ID strategy**: keep varchar, use email as canonical ID for new users
- Migration: existing `user_id = 'default'` data stays linked — `resolveRequestUserId()` returns `'default'` for non-authenticated requests when `AUTH_REQUIRED=false`

#### Auth Middleware Transition (Codex review)

The auth system is scattered across 5+ locations. Migration plan:

1. **`plugins/auth.ts`** — add JWT cookie verification alongside API key check. Order: JWT cookie → API key → reject (or allow if `AUTH_REQUIRED=false`)
2. **`routes/user-context.ts`** — `resolveRequestUserId()` checks: JWT claim `sub` → `x-user-id` header → `'default'`. Log warning on `x-user-id` fallback to track unmigrated paths.
3. **Route prehandlers** (`watchlist.ts`, `push-subscriptions.ts`, etc.) — keep `requireApiKey` as fallback, add `requireAuth` that checks JWT or API key
4. **`packages/web/src/lib/api.ts`** — remove hardcoded `API_KEY`, use `credentials: 'include'` for cookie auth. Add CSRF header.
5. **`useWebSocket.ts`** — WebSocket auth via cookie (already sent by browser) or query param token for non-browser clients

#### Self-Hosted Compatibility
- `AUTH_REQUIRED=false` (default): all routes open with API key auth, single-user mode
- `AUTH_REQUIRED=true`: JWT required for protected routes, magic link signup enabled
- Public routes stay public (feed with delay, health, metrics)

#### Blast Radius Mitigation (Eng review)
- If auth has a bug → `AUTH_REQUIRED=false` is the escape hatch
- Access token in httpOnly cookie → not extractable by XSS
- Refresh token family rotation → stolen token detected and revoked
- CSRF double-submit → protects state-changing requests

#### Email Provider
- MVP: Resend (free 100/day). Rate-limited at application level.
- Fallback: `nodemailer` SMTP

#### Beta Access (CEO review)
- Start with invite-only: `SIGNUP_ALLOWLIST` env var (comma-separated emails)
- When empty/unset: open signup (with rate limiting)

---

### WP3: Watchlist-First UX
**Priority**: 🔴 Critical | **Effort**: 2-3 days | **Dependencies**: WP2 (auth for user identity)
**CEO directive**: "My Watchlist IS the feed."

#### Backend
- `GET /api/v1/feed` — add `?watchlist=true` param
  - When true + authenticated: filter delivered alerts by user's watchlist tickers
  - Uses `event.metadata.ticker` OR extracted tickers from `enrichment.tickers[].symbol`
  - Already exists on `/api/events?watchlist=true` (Codex found this) but on raw events — need it on delivered feed
- `GET /api/v1/feed/watchlist-summary` — new endpoint
  - Returns: per-ticker event count (24h), latest event, highest signal level
  - For the "dashboard" view of watchlist

#### Frontend
- Feed default for authenticated users with non-empty watchlist: **"My Watchlist"** tab active
- "All Events" is secondary tab for exploration
- **Empty watchlist → onboarding** (not firehose fallback!)
- Reuse existing: `AlertCard` has dormant watchlist-button props, `TickerProfile` has toggle (Codex found these)

#### Push Personalization (Codex/Eng review — CRITICAL MISS in v1)
Current: `WebPushChannel` broadcasts to ALL subscriptions.
Fix: `WebPushChannel.send()` must:
1. Extract event ticker(s)
2. For each subscription, check if user's watchlist contains the ticker
3. Only send to matching users (or users with "all events" opt-in)

Implementation:
- Add `getWatchlistTickers(userId: string)` to push subscription store
- `WebPushChannel.send()` loads all active subscriptions + their user watchlists, filters before sending
- **"Breaking market events" toggle** in Settings: opt-in for non-watchlist high-confidence alerts

#### Target Watchlist Size
- Design for 10-30 tickers per user (swing trader norm)
- Alpha Vantage cache: 500 symbols max → supports ~15-25 users at 20 tickers each with overlap
- Plan Polygon.io migration path for production scale ($29/mo)

---

### WP4: Onboarding Flow
**Priority**: 🔴 Critical | **Effort**: 1-1.5 days | **Dependencies**: WP2, WP3
**CEO review**: "This is the difference between 5% and 50% activation."

#### Flow
1. **Post-signup**: "Welcome! Add at least 3 tickers to get started" screen
2. **Suggestions**: show 5-8 popular tickers from recent high-signal events (query: top tickers by event count in last 7 days)
3. **Quick-add**: one-tap to add suggested tickers
4. **Sector packs**: "Tech Leaders" (AAPL, MSFT, NVDA, GOOGL, META), "Biotech" (MRNA, PFE, ABBV, GILD), "Energy" (XOM, CVX, OXY)
5. **Completion**: "Great! You're watching N tickers. You'll be alerted when something moves." → redirect to Watchlist dashboard

#### Backend
- `GET /api/v1/onboarding/suggested-tickers` — returns top tickers by recent event activity
- `POST /api/v1/onboarding/bulk-add` — batch-add tickers to watchlist

---

### WP5: Scanner Reliability Hardening
**Priority**: 🟠 Major | **Effort**: 1.5 days | **Dependencies**: None

#### 5a: Immediate First Poll (with grace period awareness)
```typescript
// base-scanner.ts start()
start(): void {
  if (this._running) return;
  this._running = true;
  void this.tick(); // immediate first poll
}
```
**Eng review concern**: first-poll events stored to DB during 90s grace period appear as undelivered in feed.
**Fix**: In `app.ts`, when grace period suppresses delivery, set `metadata.grace_period_backfill = true` on the event. Feed UI can filter or badge these. Alternatively: mark audit record with `outcome: 'grace_period'` (already done!) and exclude from public feed query.

#### 5b: Fetch Timeout with Per-Scanner Config
```typescript
// packages/shared/src/scanner-fetch.ts
export async function scannerFetch(
  url: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const existingSignal = options?.signal;
  const signal = existingSignal
    ? AbortSignal.any([existingSignal, controller.signal])
    : controller.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timeout);
  }
}
```
- **Per-scanner timeout** (Eng review): slow scanners (Congress 30min poll) get 60s timeout, fast scanners (Truth Social 15s poll) get 10s
- **Timeout vs backoff** (Eng review): in `BaseScanner.scan()`, catch `AbortError` separately — increment `_timeoutErrors` counter, don't trigger full exponential backoff. Only trigger backoff after 3 consecutive timeouts (more lenient than network errors).
- Browser-based scanners already have bounded timeouts via Crawlee (no change needed)

#### 5c: NYSE Holiday Dynamic Computation
- Use `@date-fns/utc` + custom holiday rules OR `market-holidays` npm package
- Must handle: Good Friday (Easter/Computus algorithm), observed rules (Sat→Fri, Sun→Mon), Juneteenth, early closings (1pm ET on day before July 4th, day after Thanksgiving, Christmas Eve)
- Unit test: verify 2025, 2026, 2027, 2028 holiday lists including Easter dates
- Early closings: add `isEarlyClose(date): boolean` and `getMarketCloseTime(date): Date` (currently assumes 4pm always)

#### 5d: Smart Cooldown
- Key: `${ticker}:${eventType}` instead of just `${ticker}`
- **Format migration** (Eng review critical #6): on load, if key doesn't contain `:`, expand to `${key}:*` with same timestamp — applies cooldown across all event types for legacy entries during transition
- **Runtime pruning** (Eng review critical #5): `setInterval(() => this.pruneExpired(), 600_000)` — evict entries older than `tickerCooldownMs`
- Max map size: 10,000 entries. If exceeded, evict oldest entries first.

#### 5e: Event Bus Hardening (folded from old WP5)
- Wrap event bus subscriber in try/catch: `this.emitter.on(EVENT_KEY, (e) => handler(e).catch(err => log.error(err)))` — prevents unhandled promise rejections (Eng review critical #7)
- Add concurrency limiter **inside** the handler (not on the bus), using adapted `LlmQueue` pattern (already exists in repo at `pipeline/llm-queue.ts`)
- Max concurrent pipeline executions: 5 (configurable via `PIPELINE_MAX_CONCURRENT`)
- Max queue depth: 100 events. Beyond that: drop lowest-severity events with metric `pipeline_queue_dropped_total`
- Graceful shutdown: drain queue before exit (max 30s)

---

### WP6: Multi-Source Confirmation
**Priority**: 🟠 Major | **Effort**: 1.5 days | **Dependencies**: None

#### Approach (revised per Codex review — NO skip insert)
The v1 plan proposed "skip duplicate insert." Codex found this breaks `pipeline_audit → events` feed joins. Revised approach:

1. **Always INSERT the new event** (preserves all join paths)
2. **After insert**: check for existing events with same `ticker + eventType` within 30-min window
3. If match found: **UPDATE the OLDER event** — increment `confirmationCount`, append to `confirmedSources`, add new event ID to `mergedFrom`
4. The newer event is a normal event that also gets delivered (if it passes filters)
5. Feed UI: show confirmation badge on the older event ("Also reported by SEC EDGAR, PR Newswire")

#### Concurrency (Eng review critical #12)
- Use `SELECT ... FOR UPDATE SKIP LOCKED` on the candidate match — if another transaction already locked it, skip (don't block)
- Or: use `pg_advisory_xact_lock(ticker_hash)` for the check-and-update
- Accept that rare concurrent inserts may miss a confirmation — it's a cosmetic feature, not a correctness requirement

#### Performance (Eng review major #13)
- Current `events.metadata` is JSONB — querying `metadata->>'ticker'` without index is slow
- **Schema change**: add indexed columns to `events` table:
  ```sql
  ALTER TABLE events ADD COLUMN ticker VARCHAR(10);
  ALTER TABLE events ADD COLUMN event_type VARCHAR(50);
  CREATE INDEX idx_events_ticker_type_time ON events(ticker, event_type, created_at DESC);
  ```
- Backfill script: `UPDATE events SET ticker = metadata->>'ticker', event_type = metadata->>'eventType'`
- Pipeline: populate `ticker` and `event_type` columns on insert going forward

#### UI
- AlertCard: show "✓ Confirmed by N sources" badge when `confirmationCount > 1`
- EventDetail: show full source list with timestamps in provenance section
- Discord/Bark/Telegram delivery: add "Confirmed by N sources" line

---

### WP7: Provenance Display
**Priority**: 🟠 Major | **Effort**: 1 day | **Dependencies**: WP6
**CEO review**: "Pull provenance out of the 'polish' bucket — it's critical product differentiation."

#### EventDetail Page — "Why This Alert" Section
Read from `pipeline_audit` table (already populated):
- **Source**: icon + name + fetch timestamp ("SEC EDGAR · 2m ago")
- **Filter path**: "Passed L1 rule filter → L2 LLM judge (confidence 0.82) → Enriched with market context"
- **Historical match rationale**: "Matched 14 similar FDA approvals for oversold biotech stocks"
- **Confirmation**: "Also reported by: PR Newswire (1m later), Reuters (3m later)"

#### AlertCard — Source Badge
- Show source icon + relative time
- Source hit-rate badge (already exists via scorecard integration — `getTrustCue()` in Feed.tsx)

#### Delivery Templates
- Discord embed: add "Source" field with freshness
- Bark push: add source tag in title
- Web push: include source in notification body

---

### WP8: Notification Budget & Quiet Hours
**Priority**: 🟡 Medium | **Effort**: 1 day | **Dependencies**: WP2, WP3
**CEO review**: "If you're serious about 'when Event Radar pings you at 2am, you KNOW it matters', you need this."

#### User Preferences Schema
```sql
CREATE TABLE user_preferences (
  user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start TIME,              -- e.g., '23:00'
  quiet_end TIME,                -- e.g., '08:00'
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  daily_push_cap INTEGER DEFAULT 20,
  push_non_watchlist BOOLEAN DEFAULT FALSE,  -- opt-in for non-watchlist alerts
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Push Delivery Logic
Before sending a push:
1. Check quiet hours (convert to user's timezone) — during quiet: only `🔴 High-Quality Setup` alerts pass
2. Check daily cap — if reached, suppress with metric
3. Check `push_non_watchlist` — if false and ticker not in watchlist, suppress

#### Settings Page
- Quiet hours: start/end time pickers + timezone dropdown
- Daily push limit: slider (5/10/20/50/unlimited)
- "Alert me for tickers outside my watchlist": toggle (default off)

---

### WP9: Landing Page
**Priority**: 🟡 Medium | **Effort**: 1 day | **Dependencies**: WP1 (language must be right first)

#### Structure (from CEO review)
1. **Hero**: "Not more alerts. Better setups." + real screenshot of rendered alert
2. **Problem**: "You get 200 alerts a day. You act on 3. We show you the 3."
3. **How it works**: "What happened → Why it matters now → What followed historically → Whether we were right"
4. **Scorecard**: biggest section — real 90-day accuracy numbers. "We show our receipts."
5. **Self-host CTA**: `docker compose up -d` — prominent, builds OSS trust
6. **Cloud waitlist**: email signup, "Cloud beta — limited spots"

#### What NOT to include (CEO review)
- ❌ No pricing
- ❌ No "AI-powered" language
- ❌ No Bloomberg comparison
- ❌ No React — static HTML/Tailwind, ship as `packages/landing/index.html`

---

### WP10: API Surface Cleanup
**Priority**: 🟡 Medium | **Effort**: 0.5 day | **Dependencies**: WP2

#### Public Routes Audit (Codex review)
Currently public (no auth required):
- `/api/v1/dashboard` — should be protected (exposes all pipeline data)
- `/api/v1/feed` — OK to stay public (delayed public feed is a feature)
- `/api/v1/delivery/feed` — should be protected (internal)
- `/api/v1/audit` + `/api/v1/audit/stats` — should be protected (internal observability)
- `/api/v1/scanners/:name/events` — should be protected (internal)

Fix: move internal routes out of `publicRoutes` list. Keep only `/health`, `/api/health/ping`, `/metrics`, `/api/v1/feed`, `/ws/events` as public.

#### ARCHITECTURE.md Reconciliation
- Update `docs/ARCHITECTURE.md` auth section to reflect magic link + httpOnly cookie architecture
- Document `AUTH_REQUIRED=false` as the self-hosted default

---

## Dependency Graph

```
WP1 (Language) ──────────────────────────────────────────────┐
                                                              │
WP2 (Auth) ──────→ WP3 (Watchlist-First) ──→ WP4 (Onboard) │
    │                    │                                    ├──→ Done
    │                    └──→ WP8 (Notification Budget)      │
    └──→ WP10 (API Cleanup)                                  │
                                                              │
WP5 (Scanner Hardening) ─────────────────────────────────────┤
                                                              │
WP6 (Confirmation) ──→ WP7 (Provenance) ────────────────────┤
                                                              │
WP9 (Landing Page) ──────────────────────────────────────────┘
```

## Execution Schedule

| Week | Work | Parallel Track A | Parallel Track B |
|------|------|------------------|------------------|
| 1 | Foundation | **WP1** (Language, 0.5d) + **WP2** (Auth, 3-4d) | **WP5a-5c** (Scanner fixes, 1d) |
| 2 | Core UX | **WP3** (Watchlist-First, 2-3d) | **WP5d-5e** (Cooldown + bus, 0.5d) + **WP6** (Confirmation, 1.5d) |
| 3 | Activation | **WP4** (Onboarding, 1.5d) + **WP8** (Notification budget, 1d) | **WP7** (Provenance, 1d) + **WP10** (API cleanup, 0.5d) |
| 4 | Launch Prep | **WP9** (Landing, 1d) + integration testing | Bug fixes + deploy |
| 5 | Buffer | Overflow + edge cases + iOS push validation | Polish + README rewrite |

**Total: 5 weeks** (with 1 week buffer)

## Migration Checklist

- [ ] Cooldown file: on first boot with new code, migrate keys or wipe `/tmp/event-radar-seen/ticker-cooldown.json`
- [ ] Users table: `ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE, ADD COLUMN display_name VARCHAR(100)`
- [ ] Events table: `ALTER TABLE events ADD COLUMN ticker VARCHAR(10), ADD COLUMN event_type VARCHAR(50)` + backfill
- [ ] Create tables: `magic_link_tokens`, `refresh_tokens`, `user_preferences`
- [ ] Create indexes: `idx_events_ticker_type_time`, `idx_refresh_tokens_user`, `idx_refresh_tokens_family`
- [ ] API key auth: remains functional alongside JWT (dual-stack during transition)
- [ ] Push-policy: deploy emoji-prefix matching BEFORE or SIMULTANEOUSLY with label rename

## Success Criteria

- [ ] New user can sign up via magic link → onboard → set watchlist → receive push within 5 minutes
- [ ] Push notifications fire ONLY for watchlist tickers by default
- [ ] Feed defaults to "My Watchlist" for authenticated users
- [ ] Scorecard shows source-level and event-type accuracy breakdowns
- [ ] Product language uses intelligence framing (no advice language)
- [ ] Scanner restart: first poll within seconds (no blind window)
- [ ] Multi-source events show confirmation badges
- [ ] EventDetail shows "Why This Alert" provenance section
- [ ] Landing page communicates value prop + scorecard
- [ ] All 150+ existing tests pass + new tests for auth/watchlist/push/onboarding
- [ ] Auth token not accessible via JavaScript (httpOnly cookies)

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Auth slips to Week 2 | Blocks WP3/WP4/WP8 | Start WP3 with "fake auth" (hardcoded user, real watchlist filter) |
| Alpha Vantage rate limits | Watchlist market data gaps | Design cache for shared symbols; plan Polygon.io ($29/mo) |
| Magic link email deliverability | Users can't log in | Use Resend (good reputation) + SPF/DKIM + SMTP fallback |
| Push notification iOS reliability | Silent failure on iOS | Already validated in Phase 3 PoC; Capacitor fallback planned |
| Multi-source matching false positives | Wrong events grouped | Strict match: ticker + eventType + 30min window (no fuzzy) |
| LLM burst during market open | Pipeline queue overflow | WP5e: concurrency limiter + queue depth cap + drop metric |
| Cooldown format migration | Alert burst on deploy | WP5d: explicit migration logic for old-format keys |

## What's NOT in This Plan

- Day-trader latency optimization (sub-minute)
- External historical data import (Phase 4)
- Premium data sources (options flow, congress trades)
- Full OAuth / social login
- Mobile native app (Capacitor/React Native)
- Pricing / billing system
- API tier / rate limiting for external consumers
- Workbox offline caching (not needed — "offline financial data is an oxymoron")
- Short URLs (nice-to-have, post-launch)
