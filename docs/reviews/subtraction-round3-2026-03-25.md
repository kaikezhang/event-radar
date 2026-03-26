# Subtraction CrowdTest — Round 3
**Date:** 2026-03-25
**Previous Rounds:** R1 removed squawk, trust tab, watchlist sections/DnD, simplified scorecard. R2 removed sound alerts, font size, email digest, daily briefing restore, timezone selector, signal bar, filter presets, keyboard shortcuts, history filters, onboarding steps 1+4, /pricing route, About+ApiDocs from nav.

---

## 1. Round 1+2 Removal Impact Assessment

### What's clean
| Removal | Status |
|---------|--------|
| Audio Squawk | Clean. No header indicator, no settings panel. |
| Trust Tab | Clean. Event Detail is 2 tabs (Summary + Evidence). |
| Watchlist Sections/DnD | Frontend clean. **Backend still has dead code** (see below). |
| Scorecard simplification | Clean. 5 metric cards, no bucket sections, no pie chart. |
| Sound alerts panel | Clean. Removed from Settings. |
| Signal bar | Clean. Removed from FeedHeader. |
| Filter preset CRUD | Clean. Removed from UI. |
| Keyboard shortcuts | Clean. No `?` handler, no modal, no hint text. |
| History filters | Clean. Bare reverse-chronological list with load-more. |
| Onboarding 4→2 steps | Clean. Step 1 (watchlist) + Step 2 (notifications) → redirect to feed. |
| /pricing route | Clean. Removed from router. |
| About/ApiDocs from nav | Clean. Routes exist but not in BottomNav or footer. |

### BREAKAGE: Dead references still present

| Issue | Severity | Location | Notes |
|-------|----------|----------|-------|
| `watchlist_sections` DB table still exists | **Medium** | `packages/backend/src/db/schema.ts:462` | Orphaned table with full schema definition. No UI, no active endpoints. |
| `sectionId` field still in watchlist schema | **Medium** | `packages/backend/src/db/schema.ts:487` | Foreign key to dead `watchlist_sections` table. |
| `sectionId` still accepted in PATCH/POST watchlist API | **Medium** | `packages/backend/src/routes/watchlist.ts:167,234` | Dead field validation, dead section ownership checks (lines 187-201, 254-261). ~40 lines of dead code processing a field nobody sends. |
| `watchlist_sections` in test helpers | **Low** | `packages/backend/src/__tests__/helpers/test-db.ts:36,317` | Test setup creates/cleans dead table. |
| `SimilarEventRow.tsx` component orphaned | **Low** | `packages/web/src/components/SimilarEventRow.tsx` | Exported, never imported anywhere. Dead file. |
| `SourceBadge.tsx` component orphaned | **Low** | `packages/web/src/components/SourceBadge.tsx` | Exported, never imported anywhere. Dead file. |
| `font-scale.ts` utility still active | **Medium** | `packages/web/src/lib/font-scale.ts` | Imported in `main.tsx`. Font size selector was removed from Settings but the utility still runs on every page load. `index.html` inline script still reads `er-font-size` from localStorage. Dead feature still executing code. |
| `restoreDailyBriefing()` still exported | **Low** | `packages/web/src/lib/daily-briefing.ts:23` | The "restore daily briefing" button was removed but the function is still exported. No callers. |
| `GET /api/v1/scorecards/severity-breakdown` still active | **Low** | Backend | Endpoint exists, frontend never calls it. Dead endpoint from R1. |
| `GET /api/v1/story-groups` returns empty `[]` | **Low** | Backend | Feature never shipped. Returns empty arrays. |
| ~50+ dead backend API endpoints | **High** | Various backend route files | Rule Engine (7), Adaptive Classifier (4), Analytics/Win-Rate (6+), Accuracy (5), Feedback (3), Judge, Regime history, Budget admin, Weekly Report, AI Observability, Dashboard, Story Groups, etc. Massive dead attack surface. |

**Verdict:** Frontend removals from R1+R2 were clean. **Backend cleanup was never done.** The `sectionId`/`watchlist_sections` dead code is the most concerning — it's active code processing a dead field. The font-scale utility is running code for a removed feature.

---

## 2. Updated Feature Inventory (Post Round 2)

### Pages — 17 routes, 7 in bottom nav

| Page | Value | Usage | Priority | Notes |
|------|-------|-------|----------|-------|
| Feed | 10 | 10 | **100** | Core. No change. |
| Event Detail | 10 | 9 | **90** | 2 tabs. Clean. |
| Watchlist | 9 | 8 | **72** | Flat list. Good. |
| Search | 8 | 7 | **56** | Working well. |
| Ticker Profile | 7 | 5 | **35** | Good per-ticker depth. |
| Calendar | 7 | 5 | **35** | Forward-looking value. |
| Landing | 8 | 6 | **48** | Good first impression. |
| Login | 8 | 5 | **40** | Necessary. |
| Settings | 7 | 5 | **35** | 3 panels now (Push + Channels + Budget). |
| History | 6 | 4 | **24** | Bare list. Overlaps with Search. |
| Scorecard | 6 | 3 | **18** | 5 metrics. Clean. Occupies a nav slot. |
| Onboarding | 7 | 3 | **21** | 2 steps. Good. |
| About | 3 | 2 | **6** | Route-only, no nav. |
| API Docs | 5 | 2 | **10** | Route-only, no nav. |
| Privacy/Terms | 3 | 1 | **3** | Legal. |
| 404 | 4 | 1 | **4** | Necessary. |

### Feed Page — Sub-Features (Post R2)

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Feed list + AlertCards | 10 | 10 | **100** | Core |
| WebSocket live updates | 9 | 9 | **81** | Core |
| Smart Feed tab | 8 | 7 | **56** | Good default |
| My Watchlist tab | 8 | 7 | **56** | Personalization |
| Severity/source filters | 7 | 5 | **35** | Power user, no preset CRUD now |
| Dedup + confirmed sources | 7 | 6 | **42** | Good signal |
| Pending alerts banner | 7 | 6 | **42** | Useful |
| Pull-to-refresh | 6 | 5 | **30** | Expected |
| **Daily Briefing card** | **5** | **3** | **15** | Dismissable morning summary. Duplicates feed info. |
| **All Events tab** | **5** | **3** | **15** | Noisy firehose. Smart Feed + Watchlist cover 95% of use. |
| Swipeable cards | 6 | 4 | **24** | Nice mobile UX |
| Sort mode (latest/severity) | 5 | 3 | **15** | Minor utility |
| Connection status | 6 | 3 | **18** | Useful when broken |

### Settings Page — Sub-Features (Post R2)

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Push alert enable/disable | 9 | 6 | **54** | Core |
| Discord webhook config | 7 | 3 | **21** | Real audience |
| Minimum severity dropdown | 7 | 4 | **28** | Good filter |
| **Signal tier reference table** | **4** | **2** | **8** | 4 rows of static text. Takes up significant space in Notification Budget panel. |
| **Quiet hours config** | **4** | **2** | **8** | Markets have fixed hours. Most users won't configure this. |
| **Daily push cap selector** | **4** | **2** | **8** | Confusing — users don't know what number to pick. Default 20 is fine. |
| **Non-watchlist toggle** | **5** | **3** | **15** | Useful but buried in Budget panel |

### Backend — Dead Endpoints (STILL present from R1 recommendation)

| Endpoint Group | Count | Status |
|----------------|-------|--------|
| Rule Engine CRUD | 7 | No UI, no consumers |
| Analytics/Win-Rate | 6+ | No consumers |
| Accuracy metrics | 5 | Overlap with Scorecard |
| Budget/Delivery admin | 5+ | No admin UI |
| Adaptive Classifier | 4 | Internal ML, no consumers |
| Feedback endpoints | 3 | Trust tab removed |
| Historical analysis | 5 | Not called by frontend |
| Story Groups | 2 | Returns empty `[]` |
| Judge endpoints | 2 | Internal debugging |
| Regime history | 1 | No frontend consumer |
| Weekly Report | 1 | Never generated |
| AI Observability | 1 | No dashboard |
| Dashboard | 1 | Comprehensive metrics, no UI |
| Severity lock/history | 3 | No UI |
| `/api/events/search` | 1 | Redundant with `/api/events` |
| `/api/stats` | 1 | Unused |
| Classify debug | 1 | Internal tool |
| Event impact | 1 | Not called |
| Delivery admin | 3 | No admin UI |

**Total dead endpoints: ~53** — unchanged from R1. None were cleaned up.

---

## 3. TOP 5 REMOVAL RECOMMENDATIONS (Round 3)

### 1. NUKE: 50+ Dead Backend API Endpoints
**Priority Score:** 0 across the board. None have UI consumers.
**Effort: Medium-High** (bulk deletion, needs internal usage audit)

**What to remove:**
All endpoint groups listed above. Every one returns data that no frontend page, no cron job, no external consumer ever reads. Specifically:
- `packages/backend/src/routes/rules.ts` — entire file
- `packages/backend/src/routes/adaptive.ts` — entire file
- `packages/backend/src/routes/story-groups.ts` — entire file
- `packages/backend/src/routes/accuracy.ts` — entire file
- `packages/backend/src/routes/feedback.ts` — entire file
- `packages/backend/src/routes/winrate.ts` (or analytics direction accuracy routes) — entire file
- `packages/backend/src/routes/judge.ts` — entire file
- `packages/backend/src/routes/reports.ts` — entire file
- `packages/backend/src/routes/budget.ts` — remove admin-only endpoints (keep user-facing if any)
- `packages/backend/src/routes/admin-delivery.ts` — entire file (no admin UI)
- Dead single endpoints: `/api/events/search`, `/api/stats`, `/api/v1/dashboard`, `/api/v1/classify`, `/api/v1/scorecards/severity-breakdown`, event impact, severity lock/history, regime history, AI observability

**Why:**
- **Attack surface:** 53 endpoints, many unauthenticated or lightly authenticated, serving data to zero users. Every endpoint is an attack vector.
- **Maintenance tax:** Every TypeScript upgrade, every Drizzle migration, every Fastify version bump must account for 53 unused route handlers.
- **Cognitive load:** New developers see 80+ routes and can't distinguish live features from dead code.
- **This was recommended in R1 and R2. Still hasn't been done.** It's the single biggest simplification remaining.

**Impact:**
- Positive: ~60% reduction in backend route files. Dramatically smaller attack surface. Clearer architecture.
- Negative: If admin dashboard is ever built, some will be rebuilt. But YAGNI — build when needed, not before.
- Risk: Need to verify no internal cron/pipeline calls these endpoints. Grep for internal fetch/axios calls before deleting.

---

### 2. CLEAN: Dead watchlist_sections Code + sectionId Field
**Priority Score:** 0 — entirely dead code actively executing
**Effort: Easy**

**What to remove:**
- `watchlist_sections` table definition from `packages/backend/src/db/schema.ts:462-475`
- `sectionId` foreign key from watchlist schema (`schema.ts:487`)
- All `sectionId` handling in `packages/backend/src/routes/watchlist.ts` (lines 45, 153-201, 234-261, 288) — ~40 lines of dead validation logic
- `watchlist_sections` references in test helpers (`test-db.ts:36, 317-338`)
- Create a Drizzle migration to drop the `watchlist_sections` table and `section_id` column from `watchlist`

**Why:**
- This is **live dead code** — the PATCH endpoint actively queries a dead table to validate section ownership for a field nobody sends. It's not just dead weight; it's executing unnecessary database queries.
- Left over from R1. Should have been cleaned in R2. Third round and it's still there.

**Impact:**
- Positive: Cleaner schema, fewer DB queries, no confusion about "sections" feature.
- Negative: None. The feature is gone.

---

### 3. REMOVE: Daily Briefing Component
**Priority Score:** VALUE 5 x USAGE 3 = **15**
**Effort: Easy**

**What to remove:**
- `packages/web/src/components/DailyBriefing.tsx` — entire component
- `packages/web/src/components/DailyBriefing.test.tsx` — test file
- `packages/web/src/lib/daily-briefing.ts` — dismiss/restore utilities
- Import in `packages/web/src/pages/Feed/FeedList.tsx:9` — remove `<DailyBriefing />` from feed list
- `getDailyBriefing` from `packages/web/src/lib/api.ts`
- `DailyBriefingData` type from `packages/web/src/types/index.ts`
- `GET /api/v1/briefing/daily` backend endpoint

**Why:**
- **Duplicates the feed itself.** The Daily Briefing shows "3 critical events today, 5 high events, source breakdown" — the exact same information visible by scrolling the feed for 2 seconds.
- **Dismissable = skippable = low value.** If users dismiss it every day (which the "dismiss for today" button encourages), why show it at all?
- **Takes premium screen real estate.** It sits at the top of the feed, pushing actual alerts down. On mobile, the briefing card can occupy the entire above-the-fold viewport.
- **The "restore daily briefing" button was already removed in R2** — even the R2 review recognized this feature's restore mechanism was a dead edge case. The feature itself is the same category.
- **Market regime inference is naive.** The `inferMarketRegime()` function just counts severity levels — "Risk elevated" if any critical, "Headline-driven" if 3+ high. This is not real regime detection; it's a label generator.

**Impact:**
- Positive: Feed loads faster. First thing user sees is actual alerts, not a summary of alerts. One fewer API call on feed load.
- Negative: Users lose the "morning glance" summary. But the feed IS the morning glance.

---

### 4. COLLAPSE: Settings "Notification Budget" Panel → Merge Into Push Alerts
**Priority Score:** Signal tier table (8), Quiet hours (8), Daily push cap (8), Non-watchlist toggle (15) = avg **9.75**
**Effort: Easy**

**What to remove/restructure:**
- Remove the entire "Notification budget" CollapsiblePanel as a separate section
- Move "Non-watchlist alerts" toggle into the Push Alerts panel (it's the only setting in Budget that users actually think about)
- Remove the signal tier reference table (4 static rows explaining CRITICAL/HIGH/MEDIUM/LOW delivery rules). This is documentation, not a setting.
- Remove quiet hours configuration — markets have fixed hours (9:30 AM - 4 PM ET). Pre-market (4 AM) and after-hours (4-8 PM) are well-defined. If users don't want alerts at night, they can use their phone's Do Not Disturb.
- Remove daily push cap selector — the default of 20 is fine. Power users who want unlimited can be served later. Exposing a "how many pushes do you want?" dropdown creates anxiety ("what if I miss something because I set it to 10?").

**Why:**
- Settings currently has **3 CollapsiblePanels** with significant content in each. For a focused alert app, this is still too much.
- The "Notification budget" panel name is confusing — "budget" implies cost. It's really "timing and volume."
- Quiet hours: Your phone has Do Not Disturb. Your OS has Focus modes. A third layer of quiet hours in an app is redundant.
- Daily push cap: Confusing UX. Nobody knows what number to pick. The default works. Critical alerts bypass the cap anyway.
- Signal tier table: Nice documentation but doesn't belong in a settings form. Move it to the About page or remove it entirely — users learn severity from the feed, not from a reference table.

**Impact:**
- Positive: Settings goes from 3 panels to 2 (Push + Channels). Much simpler. Fewer decisions for users.
- Negative: Power users lose quiet hours and push cap control. But phone DND handles quiet hours, and the default cap handles volume.

---

### 5. REMOVE: "All Events" Feed Tab
**Priority Score:** VALUE 5 x USAGE 3 = **15**
**Effort: Easy**

**What to remove:**
- "All Events" tab from feed tabs (in `FeedTabs.tsx`)
- Associated query/state in `useFeedState.ts` for the "all" tab
- Any tab routing logic specific to the "all" tab

**Why:**
- **Smart Feed already filters for quality.** It shows AI-curated high-signal events. That's the product.
- **My Watchlist shows personalized events.** Between Smart Feed and Watchlist, 95%+ of user needs are covered.
- **"All Events" is a noisy firehose.** It shows every LOW-severity, every medium-confidence event, every macro blip. This is the opposite of what the product promises ("signal, not noise").
- **3 tabs creates cognitive load.** Users see three tabs and wonder which one they should be on. Two tabs (Smart + Watchlist) is a clear mental model: "the best stuff" vs "my stuff."
- **Nobody uses it.** If a user wants to see everything, Search exists. History exists. The "all" firehose adds no unique value.

**Impact:**
- Positive: Feed becomes 2 tabs instead of 3. Cleaner header. Clearer mental model. Fewer queries on page load.
- Negative: Users who want the unfiltered firehose lose direct access. But Search + History provide the same data.

---

## 4. Honorable Mentions (Round 4 candidates)

| Feature | Score | Why defer |
|---------|-------|-----------|
| **Scorecard nav slot** | 18 | 5 metrics is already lean. But does it need a bottom nav slot? Could be a widget on Feed or accessible via Settings. |
| **History nav slot** | 24 | Bare list with load-more. Heavily overlaps with Search. Could merge into Search with a "recent" tab. |
| **Landing page FeedPreview** | 35 | The mock terminal is nice marketing but it's static lies — hardcoded "NVDA +6.4%" that never updates. Consider making it live or removing it. |
| **font-scale.ts utility** | 0 | Dead code still executing on every page load. Should be removed with the `index.html` inline script. Easy cleanup. |
| **About page** | 6 | Route exists, no nav. Fine as-is unless we want to trim routes further. |

---

## 5. Overall Simplification Score

**Post R1: 5/10**
**Post R2: 7/10**
**Post R3 (projected): 8.5/10**

If all 5 Round 3 recommendations are implemented:
- Backend: ~53 dead endpoints → 0 (massive cleanup)
- Dead code: `watchlist_sections` / `sectionId` finally removed
- Feed: 3 tabs → 2 tabs, no Daily Briefing card
- Settings: 3 panels → 2 panels (Push + Channels)
- Feed loads faster (no briefing API call, fewer tab queries)

**To reach 9.5/10 (future rounds):**
- Bottom nav from 7 → 5 items (drop History + Scorecard)
- Remove `font-scale.ts` + `index.html` font script
- Consider making Landing FeedPreview use live data or removing it
- Remove About page if SEO doesn't justify it

---

## 6. Summary

Round 3's theme: **clean up the debt and cut the last pieces of unnecessary complexity.**

Rounds 1+2 were surgical frontend removals — clean, no breakage. But the backend was never touched. 53 dead endpoints still serve no user. The `watchlist_sections` dead code is still actively executing database queries for a removed feature. The Daily Briefing summarizes information the feed already shows. The "Notification Budget" panel adds settings most users will never touch. The "All Events" tab undermines the product's promise of signal over noise.

The product is close to lean. These 5 removals would bring it there.
