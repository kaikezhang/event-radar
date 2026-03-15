# Event Radar — Phase 3 Completion & Productization Plan

> Date: 2026-03-15 | Author: Wanwan | Status: Draft — pending CEO + Eng review
>
> **Context**: Phase 0-2 complete. Phase 3 partially done (web push channel, push policy, scorecard page, trust blocks). This plan covers the remaining Phase 3 work plus critical productization gaps identified in the gap analysis.

## Goal

Transform Event Radar from a functional dev tool into a shippable product that a swing trader can use end-to-end: sign up → set watchlist → receive intelligent push alerts → check scorecard → trust the system.

## Current State (as of PR #106)

### ✅ Done
- Event taxonomy: 23 unified types, legacy aliases, all sources eligible for historical matching
- Outcome tracker: T+1h, T+1d, T+5d, T+20d, T+1w, T+1m
- Market data: provider abstraction + Alpha Vantage + 5-min TTL cache (500 symbols max)
- Pattern matcher: sample size guards (n<10 suppressed, ≥10 shown, ≥30 high confidence)
- LLM enrichment: English output, market context + pattern stats injected
- Alert scorecard: per-event + aggregation (action, confidence, source, event-type buckets)
- User model: `users` table, user-scoped `watchlist` + `push_subscriptions`
- PWA: manifest + service worker (push + notificationclick)
- Web push: VAPID-based delivery channel + subscription store
- Push policy: confidence-gated tiers (high→loud, medium→silent, low→none)
- Frontend: Feed, EventDetail, Scorecard, Watchlist, Search, Settings, TickerProfile, BottomNav

### ❌ Missing
- No auth (API key hardcoded, user resolved from `x-user-id` header or default)
- No watchlist-first UX (Feed is firehose)
- Product language still "ACT NOW" (vision wants "intelligence, not advice")
- Scanner first-poll delay (waits full interval on startup)
- No fetch timeout on scanners
- Cooldown is per-ticker only (suppresses different catalyst types)
- Multi-source confirmation fields not populated
- No Workbox caching
- No landing page
- NYSE holidays hardcoded for 2026
- Event bus has no backpressure / concurrency limit

---

## Implementation Plan

### Work Package 1: Auth System (Magic Link)
**Priority**: 🔴 Critical — blocks all user-scoped features
**Effort**: ~2 days
**Scope**: Minimal viable auth. No OAuth, no password hashing. Magic link only.

#### Schema Changes
```sql
-- New table
CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_magic_link_token ON magic_link_tokens(token);

-- Extend users table
ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
```

#### Backend
- `POST /api/auth/magic-link` — accepts `{ email }`, generates 64-char token, stores in DB, sends email via Resend/Postmark (env: `MAIL_API_KEY`, `MAIL_FROM`)
- `POST /api/auth/verify` — accepts `{ token }`, validates expiry (15 min), marks used, creates user if not exists, returns JWT (24h expiry) + refresh token (30d)
- `POST /api/auth/refresh` — accepts `{ refreshToken }`, returns new JWT
- `GET /api/auth/me` — returns current user profile
- JWT payload: `{ sub: userId, email, iat, exp }`
- JWT secret from env: `JWT_SECRET`
- Auth middleware: check `Authorization: Bearer <jwt>` → set `request.userId`
- Existing `resolveRequestUserId()` updated to read from JWT instead of `x-user-id` header
- Fallback: if `AUTH_REQUIRED=false` (default for self-hosted), use current API key behavior

#### Frontend
- Login page: email input → "Send magic link" → check-your-email screen
- On magic link click: `/auth/verify?token=xxx` → store JWT in localStorage → redirect to Feed
- `useAuth()` hook: manages JWT lifecycle, auto-refresh, logout
- Protected routes: wrap app in auth context, redirect to login if no JWT
- Settings: show email, logout button

#### Self-Hosted Compatibility
- `AUTH_REQUIRED` env var (default `false`): when false, bypass auth entirely, use `default` user
- When true, all non-public routes require valid JWT
- Public routes (feed with delay): no auth needed

#### Email Provider
- MVP: Resend ($0 for 100 emails/day, simple REST API)
- Fallback: raw SMTP via `nodemailer`

---

### Work Package 2: Watchlist-First UX
**Priority**: 🔴 Critical — core product differentiation
**Effort**: ~1.5 days

#### Backend
- `GET /api/v1/feed` — add optional `?watchlist=true` query param
  - When true + authenticated: filter events to only those matching user's watchlist tickers
  - Uses `event.metadata.ticker` or extracted tickers from title/body
  - Falls back to full feed if watchlist is empty (with UI hint)
- Market data cache: on user watchlist change, ensure those tickers are in the refresh set

#### Frontend
- Feed page: add toggle pill/tab at top — "All Events" | "My Watchlist"
  - Default for authenticated users: "My Watchlist" (if watchlist non-empty)
  - Default for unauthenticated/empty watchlist: "All Events"
  - Persist preference in localStorage
- Empty watchlist state: "Add tickers to your watchlist to see personalized alerts" + link to Watchlist page
- Watchlist page enhancements:
  - Show latest event + market context for each ticker
  - Mini sparkline or 5d change indicator
  - "X events in last 7 days" count per ticker

---

### Work Package 3: Product Language Migration
**Priority**: 🟠 Major — brand positioning
**Effort**: ~0.5 days

#### Changes
| Current | New | Where |
|---------|-----|-------|
| `🔴 ACT NOW` | `🔴 High-Quality Setup` | `LLMEnrichmentActionSchema`, enricher prompt, delivery templates, web UI |
| `🟡 WATCH` | `🟡 Developing Situation` | Same locations |
| `🟢 FYI` | `🟢 For Reference` | Same locations |
| "action" field | "signal" field | Schema rename (keep `action` as alias for backward compat) |

#### Enrichment Prompt Update
Replace:
```
Choose one action: 🔴 ACT NOW / 🟡 WATCH / 🟢 FYI
```
With:
```
Classify signal quality:
- 🔴 High-Quality Setup: Strong catalyst + favorable current context + historical support
- 🟡 Developing Situation: Notable catalyst, needs monitoring or confirmation  
- 🟢 For Reference: Routine event, low immediate trading relevance

Do not use BUY, SELL, HOLD, or any personal financial advice language.
Frame as intelligence, not recommendations.
```

#### Backward Compatibility
- DB column name stays `action` (no migration needed)
- API returns both `action` and `signal` fields during transition
- Discord/Bark/Telegram delivery templates updated to new labels

---

### Work Package 4: Scanner Reliability Hardening
**Priority**: 🟠 Major — production readiness
**Effort**: ~1 day

#### 4a: Immediate First Poll
```typescript
// base-scanner.ts start()
start(): void {
  if (this._running) return;
  this._running = true;
  void this.tick(); // <-- immediate first poll
}
```
- All 13+ scanners benefit automatically
- Eliminates 5-30 min blind window after restart

#### 4b: Fetch Timeout
- Add `scannerFetch()` utility in `packages/shared/src/scanner-fetch.ts`:
```typescript
export async function scannerFetch(
  url: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 30_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
```
- Replace `fetch()` calls in all scanners with `scannerFetch()`
- Default 30s timeout, configurable per-scanner

#### 4c: NYSE Holiday Dynamic Calculation
- Replace hardcoded `NYSE_HOLIDAYS_2026` with a function that computes holidays for any year
- Use fixed-rule holidays (New Year's, Independence Day, Christmas, etc.) + observed rules
- Add Juneteenth, Thanksgiving (4th Thursday Nov), etc.
- Unit test: verify 2025, 2026, 2027 holiday lists

#### 4d: Smart Cooldown
- Change cooldown key from `ticker` to `ticker:eventType`
- Same ticker, different event type → no cooldown suppression
- Example: `NVDA:earnings_beat` and `NVDA:fda_approval` have independent 60-min windows
- Backward compatible: still uses in-memory Map, same persistence mechanism

---

### Work Package 5: Event Bus Concurrency Guard
**Priority**: 🟡 Medium — burst protection
**Effort**: ~0.5 days

#### Implementation
- Add `ConcurrencyLimiter` to event bus subscriber:
```typescript
class ConcurrencyLimiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly maxConcurrent: number) {}
  
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.active++;
    try { return await fn(); }
    finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
```
- Wrap the main pipeline handler in `app.ts` with limiter (default: 5 concurrent)
- Configurable via `PIPELINE_MAX_CONCURRENT` env var
- Metrics: `pipeline_queue_depth` gauge, `pipeline_queue_wait_ms` histogram

---

### Work Package 6: Multi-Source Confirmation Wiring
**Priority**: 🟡 Medium — trust model
**Effort**: ~1 day

#### Implementation
- In `event-store.ts`, before inserting a new event:
  1. Check for existing events with similar title/ticker within 30-min window
  2. If match found (cosine similarity > 0.8 on title embeddings, or exact ticker + eventType match within window):
     - Update existing event's `confirmationCount += 1`
     - Append new source to `confirmedSources` array
     - Store new event ID in `mergedFrom` array
     - Skip duplicate insert (or insert as child reference)
  3. If no match: insert normally with `confirmationCount = 1`
- Delivery templates: show "Confirmed by 3 sources" badge when `confirmationCount > 1`
- Feed UI: show source badges on AlertCard
- EventDetail: show full source list with timestamps

#### Lightweight Approach (no embeddings)
- Match on: `ticker` + `eventType` + 30-min window
- This catches: SEC EDGAR filing + newswire press release about the same event
- Simple SQL query, no ML dependency

---

### Work Package 7: Frontend Polish
**Priority**: 🟡 Medium
**Effort**: ~1 day

#### 7a: Workbox Caching
- Install `workbox-precaching` + `workbox-strategies`
- Update `sw.js` to use Workbox:
  - `CacheFirst` for static assets (JS/CSS/fonts/images)
  - `NetworkFirst` for API calls (never serve stale financial data)
  - Precache app shell on install
- Add Vite plugin for Workbox manifest generation

#### 7b: Short Event URLs
- Add `shortId` column to events table (8-char hash of UUID, generated on insert)
- Route: `/e/:shortId` → resolve to full event detail
- Share button on EventDetail copies short URL
- Backward compat: `/event/:id` still works

#### 7c: Provenance Display
- AlertCard: show source icon + freshness indicator ("2m ago from SEC EDGAR")
- EventDetail: "Why this alert" section:
  - Source + fetch timestamp
  - Filter path: "Passed L1 rule filter → L2 LLM judge (confidence 0.82) → Enriched"
  - Historical match rationale: "Matched 14 similar FDA approvals for oversold biotech"
- Data: read from `pipeline_audit` table (already populated)

---

### Work Package 8: Landing Page
**Priority**: 🟡 Medium — needed for soft launch
**Effort**: ~1 day

#### Approach
- Single-page marketing site at `/landing` (or separate deploy)
- Sections:
  1. Hero: "Not more alerts. Better setups." + example alert screenshot
  2. How it works: 4-step visual (Event → Context → History → Intelligence)
  3. Example alert (the MRNA example from vision)
  4. Scorecard preview: "We show our receipts"
  5. Self-host CTA: Docker Compose one-liner
  6. Cloud waitlist: email signup
- Tech: static HTML/Tailwind, no React needed
- Can be a separate `packages/landing` or just `public/landing.html`

---

## Dependency Graph

```
WP1 (Auth) ──────────────┐
                          ├──→ WP2 (Watchlist-First)
WP3 (Language) ───────────┤
                          ├──→ WP7 (Frontend Polish)
WP4 (Scanner Hardening) ──┤
                          ├──→ WP8 (Landing Page)
WP5 (Concurrency) ────────┘
WP6 (Confirmation) ── independent
```

- **WP1 (Auth)** blocks WP2 (watchlist-first needs user identity)
- **WP3-6** are independent, can be parallelized
- **WP7-8** are polish, depend on WP1-3 being merged

## Suggested Execution Order

| Week | Work | Agent Assignment |
|------|------|-----------------|
| 1 | WP1 (Auth) + WP4a/4b (Scanner fixes) | Auth: CC, Scanner: Codex |
| 2 | WP2 (Watchlist-First) + WP3 (Language) + WP4c/4d | WP2: CC, WP3+4: Codex |
| 3 | WP5 (Concurrency) + WP6 (Confirmation) + WP7 (Frontend) | All Codex |
| 4 | WP8 (Landing) + integration testing + deploy | CC for landing, Codex for testing |

**Total: ~4 weeks to complete productization**

## Success Criteria

- [ ] A new user can sign up via magic link, set a watchlist, and receive push notifications
- [ ] Feed defaults to watchlist filter for authenticated users
- [ ] Scorecard shows source-level and event-type accuracy
- [ ] Product language uses "intelligence" framing, not "advice"
- [ ] Scanner restart produces alerts within 60 seconds (no blind window)
- [ ] Multi-source events show confirmation badges
- [ ] Landing page communicates the value prop clearly
- [ ] All existing 150 tests pass + new tests for auth/watchlist/push flows

## Risks

| Risk | Mitigation |
|------|-----------|
| Alpha Vantage free tier rate limits on watchlist growth | Design cache to batch-update, plan Polygon.io migration path |
| Magic link email deliverability | Use Resend (good reputation), add SPF/DKIM |
| Push notification iOS reliability | Already have PoC validation in Phase 3, Capacitor fallback if needed |
| Multi-source matching false positives | Start with strict ticker+eventType+30min match, loosen later |
| LLM enrichment burst during market open | WP5 concurrency guard limits parallel LLM calls |

## What's NOT in This Plan

- Day-trader latency optimization (sub-minute)
- External historical data import (Phase 4)
- Premium data sources (options flow, congress trades)
- Full OAuth / social login
- Mobile native app (Capacitor/React Native)
- Pricing / billing system
- API tier / rate limiting for external consumers
