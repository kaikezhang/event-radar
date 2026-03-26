# Subtraction Round 5 — Review
**Date:** 2026-03-25
**Reviewer:** Claude (codebase analysis + API inspection + build verification)
**App URL:** https://blind-but-relaxation-knew.trycloudflare.com
**API URL:** http://localhost:3001

---

## Current State After Rounds 1-4

**~13,000 lines removed across 4 rounds.**

**Bottom nav:** 5 items (Feed, Watchlist, Calendar, Search, Settings)
**Orphaned pages:** About, ApiDocs, Scorecard, History (routes exist, zero inbound links)
**Backend route files:** 21 registered, ~5 with zero frontend consumers
**Settings panels:** 2 (Push Alerts, Notification Channels)
**Build:** Clean — 127 test files, 1619 tests passing, web build succeeds

---

## R1-R4 Breakage Check

| Issue | Severity | Details |
|-------|----------|---------|
| All backend tests pass | **None** | 127 files, 1619 tests, zero failures |
| Web build clean | **None** | All chunks compile, no warnings |
| `/api/events` returns data | **None** | Feed API working correctly, 4993 total events |
| Auth-gated endpoints return 401 | **None** | Expected — API key required for event detail |
| `FilterBar.test.tsx` still exists | **Low** | Orphaned test file from R1-R3; references removed FilterBar component |
| `SourceBadge.tsx` dead component | **Low** | 46 lines, zero imports anywhere in codebase |
| `SimilarEventRow.tsx` dead component | **Low** | 16 lines, zero imports anywhere in codebase |

**Verdict: No breakage from R1-R4.** App is stable.

---

## Scoring Method

**VALUE** (1-5): How much does this feature help a paying trader?
**USAGE** (1-5): How often/easily can users access this feature?
**REMOVE SCORE** = inverse: lower VALUE × lower USAGE = higher removal priority.
**LINES** = estimated code removed (frontend + backend + tests).

---

## TOP 5 REMOVAL RECOMMENDATIONS

### 1. Delete Dead Backend Routes: dashboard.ts, delivery-feed.ts, events-history.ts, scanners.ts, event-impact.ts

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| VALUE | 1 | Zero frontend consumers. dashboard.ts is 1,081 lines serving an admin dashboard that doesn't exist in the web app. delivery-feed.ts (351 lines) tracks internal delivery state. events-history.ts (370 lines) is a parallel history API the frontend never calls (uses `/api/events` instead). scanners.ts (113 lines) and event-impact.ts (133 lines) serve endpoints with zero callers. |
| USAGE | 0 | Literally unreachable from any UI. No frontend code calls these endpoints. |
| REMOVE SCORE | **10/10** |

**Lines removed:** ~2,048 backend + associated test files
**Risk:** None — zero consumers confirmed by searching all of `packages/web/src/lib/api.ts`
**Action:** Delete 5 route files, remove registrations from `route-registration.ts`, delete test files that only test these routes

---

### 2. Delete Orphaned Frontend Pages: About.tsx, ApiDocs.tsx, Scorecard.tsx, History.tsx + tests

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| VALUE | 1-2 | **About.tsx** (98 lines): generic product description, AI disclosure, contact email — none of this helps traders trade. **ApiDocs.tsx** (260 lines): developer API docs inside a trader-facing web app — wrong audience. **Scorecard.tsx** (223 lines): calibration metrics ("setup-worked rate", "avg T+5 move") — useful for the product team, not traders. **History.tsx** (95 lines): paginated archive duplicating Feed + Search functionality. |
| USAGE | 0 | All 4 pages have **zero inbound links** after R4 removed them from nav/footer. Only reachable via direct URL typing. Build output shows these as tiny lazy-loaded chunks (4.3KB, 8.1KB, 7.0KB, 2.5KB) — dead weight. |
| REMOVE SCORE | **9/10** |

**Lines removed:** ~676 frontend + ~71 test lines (About.test.tsx, ApiDocs.test.tsx) + route definitions in App.tsx
**Risk:** Low — users who bookmarked `/scorecard` or `/history` get 404. Acceptable after 2 rounds of nav removal.
**Action:** Delete page files, test files, remove route definitions from App.tsx, remove lazy imports

---

### 3. Delete Dead Components: SourceBadge.tsx, SimilarEventRow.tsx

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| VALUE | 0 | **SourceBadge.tsx** (46 lines): exported but imported by zero files. Likely orphaned when source filter UI was removed in R4. **SimilarEventRow.tsx** (16 lines): exported but imported by zero files. Orphaned when similar events rendering was consolidated. |
| USAGE | 0 | Not rendered anywhere. Pure dead exports. |
| REMOVE SCORE | **9/10** |

**Lines removed:** ~62
**Risk:** None — zero imports confirmed via codebase search
**Action:** Delete both files

---

### 4. Collapse EventDetail Evidence Tab — Merge SimilarPastEvents into EventHistory, Remove Bull/Bear Fallback

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| VALUE | 2 | **SimilarPastEvents.tsx** (103 lines) on the Summary tab duplicates **EventHistory.tsx** (143 lines) on the Evidence tab — both render the same `similarEvents` data, outcome stats, and best/worst case boxes. Users see identical historical context twice. **Bull/Bear fallback** in EventEnrichment.tsx generates generic template text ("If the event lands better than feared...") when real enrichment is missing — presented as analysis but is AI filler with zero informational value. |
| USAGE | 3 | Event detail is a core page, but the Evidence tab is secondary. The bull/bear fallback fires on events without enrichment (common for recent events). |
| REMOVE SCORE | **7/10** |

**Lines removed:** ~150 (SimilarPastEvents.tsx deletion + fallback removal from EventEnrichment.tsx)
**Risk:** Low — EventHistory on Evidence tab retains all historical context. Removing fallback means bull/bear columns show nothing when enrichment is absent (cleaner than showing filler).
**Action:**
- Delete `SimilarPastEvents.tsx`, remove from Summary tab in `EventDetail/index.tsx`
- Remove `deriveFallbackBullBear` calls from `EventEnrichment.tsx` — show bull/bear only when real enrichment exists
- Keep `EventHistory.tsx` on Evidence tab as the single historical context component

---

### 5. Simplify Landing Page — Strip Marketing Bloat or Replace with Direct Login Redirect

| Dimension | Score | Reasoning |
|-----------|-------|-----------|
| VALUE | 1 | Landing.tsx (273 lines) is a full marketing page: hero, feature cards, fake preview events, stats strip, pricing card. For a **live $39/month product** with paying users, the landing page serves initial conversion only. It fetches the Scorecard API to populate stats (unnecessary API call). The hardcoded PREVIEW_ROWS and FEATURE_CARDS are static marketing copy, not product functionality. |
| USAGE | 2 | Only shown to unauthenticated visitors at "/". Logged-in users never see it. |
| REMOVE SCORE | **6/10** |

**Lines removed:** ~273 (full page) or ~140 (strip to minimal CTA)
**Risk:** Medium — removing entirely means unauthenticated users land on login page directly (fine for a paid product). Stripping to minimal "Event Radar — Sign in" CTA is safer.
**Action (conservative):** Replace 273-line marketing page with ~30-line minimal CTA: logo + tagline + sign-in button + pricing line. Remove StatsStrip API call, feature cards, preview table.
**Action (aggressive):** Delete Landing.tsx, redirect "/" to "/login" for unauthenticated users.

---

## Summary Table

| # | Target | Lines | Risk | Score |
|---|--------|-------|------|-------|
| 1 | Dead backend routes (5 files) | ~2,048 | None | 10/10 |
| 2 | Orphaned pages (4 files + tests) | ~747 | Low | 9/10 |
| 3 | Dead components (2 files) | ~62 | None | 9/10 |
| 4 | EventDetail dedup + fallback removal | ~150 | Low | 7/10 |
| 5 | Landing page simplification | ~140-273 | Medium | 6/10 |

**Total estimated removal: ~3,150-3,280 lines**
**Cumulative after R5: ~16,150-16,280 lines removed**

---

## Honorable Mentions (Not Top 5, But Worth Noting)

| Target | Lines | Why Not Top 5 |
|--------|-------|---------------|
| **Watchlist inline notes** (WatchlistRow edit state, 60+ lines) | ~60 | Actually useful for power users; removing reduces product value |
| **Watchlist weekly stats** (correct predictions, accuracy %) | ~22 | Small, and provides feedback loop for traders |
| **EventSourceCard 7-branch switch** (265 lines, most branches rarely hit) | ~100 removable | Too intertwined with EventDetail; risky refactor for marginal gain |
| **Onboarding ticker packs** (pre-curated sector groups) | ~40 | Helps new user conversion; removing hurts onboarding |
| **PricingCard component** | ~30 | Only used on Landing — if Landing is stripped, this dies with it |
| **RegimeContextCard** | ~40 | Frequently null but clean conditional — no harm keeping it |

---

## Architectural Observation

After 5 rounds, the product is approaching its **essential shape**: Feed + Watchlist + Calendar + Search + Settings, with EventDetail as the deep-dive view and TickerProfile as the discovery layer. Everything outside this core (Landing marketing, About, ApiDocs, Scorecard calibration, History archive, admin dashboard routes) is now confirmed dead weight. The next frontier after R5 would be **within-page simplification** — trimming EventDetail's 36KB bundle, reducing AlertCard's rendering branches, and consolidating the Settings page. But those are optimization, not subtraction.
