# Subtraction CrowdTest — Round 2
**Date:** 2026-03-25
**Previous Round:** Round 1 removed Audio Squawk, Trust Tab, Watchlist Sections/DnD, Simplified Scorecard
**Methodology:** Full audit of every remaining page, panel, sub-feature, setting, and API endpoint. VALUE (1-10) x USAGE (1-10) = Priority Score.

---

## 1. Round 1 Removal Impact Assessment

### What went well
| Removal | Impact |
|---------|--------|
| **Audio Squawk** | Clean removal. Header is cleaner, Settings is simpler. No orphaned code. |
| **Trust Tab** | Event Detail is now 2 tabs (Summary + Evidence). Faster comprehension. No breakage. |
| **Watchlist Sections/DnD** | Flat list works perfectly. No `@dnd-kit` dependency bloat. Page loads faster. |
| **Scorecard simplification** | 5 key metrics dashboard is dramatically more readable than the previous 16+ data points. |

### Orphaned/broken remnants from Round 1
| Issue | Severity | Notes |
|-------|----------|-------|
| `sectionId` still in watchlist API responses | **Low** | Backend `PATCH /api/watchlist/:ticker` and `POST /api/watchlist/bulk` still accept `sectionId`. Dead field. |
| `watchlist_sections` DB table still exists | **Low** | Orphaned table — no endpoints, no UI. Should be dropped in a migration. |
| `GET /api/v1/scorecards/severity-breakdown` still active | **Low** | Endpoint exists but frontend no longer calls it. Dead endpoint. |
| `SimilarEventRow.tsx` component unused | **Low** | Exported but never imported anywhere. Dead component file. |
| `SourceBadge.tsx` component unused | **Low** | Exported but never imported anywhere. Dead component file. |

**Verdict: Round 1 was clean.** No user-facing breakage. A few backend remnants to clean up but nothing blocking.

---

## 2. Updated Feature Inventory (Post Round 1)

### Pages — Current State

| Page | Value | Usage | Priority | Round 1 Change | Notes |
|------|-------|-------|----------|----------------|-------|
| Feed | 10 | 10 | **100** | — | Core product. No change needed. |
| Event Detail | 10 | 9 | **90** | Removed Trust tab → 2 tabs | Cleaner, faster. |
| Watchlist | 9 | 8 | **72** | Flat list (removed sections/dnd) | Simpler, better. |
| Search | 8 | 7 | **56** | — | Working well. |
| Landing | 8 | 6 | **48** | — | Good first impression. |
| Ticker Profile | 7 | 5 | **35** | — | Useful per-ticker depth. |
| Calendar | 7 | 5 | **35** | — | Forward-looking value. |
| Settings | 7 | 5 | **35** | Removed squawk | Still has 5 collapsible panels — too many. |
| Login | 8 | 5 | **40** | — | Necessary. |
| History | 6 | 4 | **24** | — | Overlaps heavily with Search. |
| Onboarding | 7 | 3 | **21** | — | 4 steps is still heavy. |
| Scorecard | 6 | 3 | **18** | Simplified to 5 metrics | Better, but still occupies a nav slot. |
| About | 3 | 2 | **6** | — | Near-zero engagement. |
| API Docs | 5 | 2 | **10** | — | Niche audience. |
| Pricing | 5 | 3 | **15** | — | Duplicate of Landing pricing section. |
| Privacy/Terms | 3 | 1 | **3** | — | Legal requirement. |
| 404 | 4 | 1 | **4** | — | Necessary fallback. |

### Feed Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Feed list + AlertCards | 10 | 10 | **100** | Core |
| Severity badges + direction | 10 | 10 | **100** | Core signal |
| WebSocket live updates | 9 | 9 | **81** | Core |
| Smart Feed tab | 8 | 7 | **56** | Good default |
| My Watchlist tab | 8 | 7 | **56** | Personalization |
| Dedup count + confirmed sources | 7 | 6 | **42** | Good signal compression |
| Pending alerts banner | 7 | 6 | **42** | Useful |
| Feed Filters (severity, source) | 7 | 5 | **35** | Power user |
| Pull-to-refresh | 6 | 5 | **30** | Expected behavior |
| All Events tab | 6 | 4 | **24** | Noisy firehose |
| Feed Signal Bar | 5 | 3 | **15** | Takes space, minor info value |
| Swipeable cards | 6 | 4 | **24** | Nice mobile UX |
| Connection status indicator | 6 | 3 | **18** | Useful when broken |
| Sort mode (latest/severity) | 5 | 3 | **15** | Minor utility |
| **Filter presets (save/load/delete)** | **3** | **1** | **3** | Over-engineered. Who saves filter presets? |
| **"Press ? for shortcuts" hint** | **2** | **1** | **2** | Permanently displayed hint text for a feature nobody uses |
| Keyboard nav (j/k) | 5 | 2 | **10** | Desktop power users |

### Settings Page — Sub-Features (Post Round 1)

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Push alert enable/disable | 9 | 6 | **54** | Core |
| Discord webhook config | 7 | 3 | **21** | Niche but real audience |
| Minimum severity dropdown | 7 | 4 | **28** | Good filter |
| Push non-watchlist toggle | 5 | 3 | **15** | Useful |
| **Daily push cap slider** | **4** | **2** | **8** | Confusing — users don't know what cap to set |
| **Quiet hours config** | **4** | **2** | **8** | Markets have fixed hours; auto-detect is better |
| **Timezone selector** | **3** | **1** | **3** | Should auto-detect from browser |
| **Sound alerts enable/disable** | **4** | **2** | **8** | Annoying in practice, overlaps with push |
| **Sound volume slider** | **2** | **1** | **2** | If sound is on, you just want on/off |
| **Sound quiet hours (separate!)** | **2** | **1** | **2** | A SECOND quiet hours config for sound? Absurd. |
| **Font size selector** | **3** | **1** | **3** | Browser zoom exists. OS accessibility exists. |
| **Email Digest (disabled placeholder)** | **1** | **0** | **0** | "Coming soon" placeholder. Ships nothing. |
| **Daily Briefing restore button** | **3** | **1** | **3** | Unclear what this does. Niche edge case. |
| Signal tier reference table | 5 | 3 | **15** | Educational but static |

### Onboarding — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Step 2 — Watchlist setup | 8 | 4 | **32** | Critical activation |
| Step 3 — Push notifications | 7 | 3 | **21** | Important permission prompt |
| **Step 1 — Welcome (sample card)** | **4** | **3** | **12** | Filler. Users want to get started, not read marketing. |
| **Step 4 — Done (PartyPopper)** | **2** | **3** | **6** | Celebration screen for completing... a 4-step wizard? |
| Sector packs | 6 | 3 | **18** | Nice shortcut |
| Trending tickers | 6 | 3 | **18** | Helpful |

### Navigation

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Bottom nav (7 items) | 8 | 10 | **80** | Core — but 7 is too many |
| Global ticker search (Cmd+K) | 7 | 5 | **35** | Power user |
| **Keyboard shortcuts modal** | **2** | **1** | **2** | Nobody presses `?`. Nobody. |
| Footer links | 3 | 1 | **3** | Standard |

### Backend — Unused API Endpoints (Still Present!)

Round 1 did NOT remove any backend endpoints. All 43+ unused endpoints remain:

| Endpoint Group | Count | Priority | Status |
|----------------|-------|----------|--------|
| Rule Engine CRUD | 7 | **0** | No UI, no consumers |
| Analytics/Win-Rate | 6 | **0** | Rich data, zero consumers |
| Accuracy metrics | 5 | **0** | Overlap with Scorecard API |
| Budget/Delivery admin | 5+ | **0** | No admin UI |
| Adaptive Classifier | 4 | **0** | Internal ML, no consumers |
| Feedback endpoints | 3 | **0** | Trust tab removed, buttons gone |
| Historical analysis | 5 | **0** | Not called by frontend |
| Story Groups | 2 | **0** | Returns empty `[]`, never shipped |
| Judge endpoints | 2 | **0** | Internal debugging |
| Regime endpoints | 2 | **0** | No frontend consumer |
| Weekly Report | 1 | **0** | Never generated or displayed |
| AI Observability | 1 | **0** | Monitoring with no dashboard |
| `/api/events/search` | 1 | **0** | Redundant — frontend uses `/api/events` |
| `/api/stats` | 1 | **0** | Returns data nobody sees |
| Admin delivery kill switch | 3 | **0** | No admin UI |
| Event impact | 1 | **0** | Not called |
| Classify debug | 1 | **0** | Internal debug tool |
| Dashboard | 1 | **0** | Comprehensive metrics, no UI |
| Severity lock/history | 3 | **0** | Admin-only, no UI |

**Total dead endpoints: ~53** — massive attack surface for zero user value.

---

## 3. NEXT 5 REMOVAL RECOMMENDATIONS (Round 2)

### 1. GUT: Settings Page — Remove Sound Alerts Panel + Notification Budget Complexity
**Priority Scores:** Sound alerts (8), Volume slider (2), Sound quiet hours (2), Font size (3), Daily push cap (8), Timezone (3), Daily Briefing restore (3), Email placeholder (0) = avg **3.6**

**What to remove:**
- **Entire "Sound alerts" panel** (enable toggle, volume slider, sound quiet hours)
- **Font size selector** (entire "Display" panel)
- **Email Digest placeholder** ("Coming soon" disabled input)
- **Daily Briefing restore button** (unclear edge-case feature)
- **Timezone selector** (auto-detect from `Intl.DateTimeFormat().resolvedOptions().timeZone`)
- **Sound quiet hours** (if sound stays, merge into notification quiet hours — don't have TWO separate quiet hours)

**Why:**
- Settings page has **5 collapsible panels** with 15+ controls. For an alert app, this is absurd. Should be 2 panels max (Push + Discord).
- Sound alerts overlap with push notifications. If you want to be alerted, push is superior (works when app is closed, no browser tab requirement).
- Font size is browser zoom. Email is a non-functional placeholder. Timezone should auto-detect.
- Having separate quiet hours for push AND sound is confusing duplication.
- Daily Briefing restore is an edge case that 0.1% of users would find. It can be a simple "clear local storage" debug step.

**Impact:**
- Positive: Settings goes from 5 panels to 2 (Push Alerts + Notification Channels). Dramatically simpler.
- Negative: Accessibility users lose font size (but browser zoom works), sound alert users lose their feature.
- **Effort: Easy** — remove components, remove one hook (`useAlertSound`)

---

### 2. DELETE: Feed Filter Presets + Signal Bar + "Press ? for shortcuts" Hint
**Priority Scores:** Filter presets (3), Signal bar (15), Shortcuts hint (2) = avg **6.7**

**What to remove:**
- **Filter preset CRUD** (save/load/delete named filter presets) — keep the actual severity/source filters
- **Feed Signal Bar** (the stacked HIGH/MEDIUM/LOW bar with event counts)
- **"Press ? for keyboard shortcuts" text** in feed header
- **Keyboard shortcuts modal** (the `?` key handler + `KeyboardShortcutsHelp` component)

**Why:**
- Filter presets: Who saves named filter configurations? This is a trading alert feed, not a CRM dashboard. The base filters (severity + source) are sufficient.
- Signal Bar: Takes up vertical space on every load. "3 important events today · 12 events · 5 HIGH+ · 7 LOW" — users already see this from the cards themselves. Redundant information.
- Keyboard shortcuts hint: Permanently displayed text "Press ? for keyboard shortcuts" — visual noise on mobile. The shortcuts themselves (j/k navigation) are discoverable by power users who don't need a hint.
- Shortcuts modal: 6 shortcuts listed. Most are standard browser behavior. Nobody discovers this.

**Impact:**
- Positive: Feed header becomes much cleaner — just tabs + sort + filter button. Less visual noise.
- Negative: Power users lose preset management (they can just re-select filters). Signal-at-a-glance lost (but cards provide the same info).
- **Effort: Easy** — remove components, simplify `useFeedState` filter preset logic

---

### 3. MERGE: History Page into Search (or drastically simplify History)
**Priority Score:** History page (24), History filters (date, severity, source, ticker) = heavy overlap with Search

**What to do:** Either **merge History into Search** (add a date range to Search) or **strip History to bare minimum** (remove all filters, just show a reverse-chronological list with load-more).

**Why:**
- History has 4 filters (date range, severity, source, ticker) + filter chips + collapsible panel + badge count. This is a full filter UI that duplicates what Search already does.
- Users looking for past events will naturally use Search. "History" as a separate concept is confusing — "history of what?"
- History occupies 1 of 7 bottom nav slots. Merging it into Search frees a nav slot.
- The History page's `useHistory` hook is essentially a filtered event query — the same thing Search does.

**Recommendation:** Remove History from bottom nav. Keep the route (`/history`) but hide it from primary navigation. If a user wants past events, Search with date filters is the answer.

**Impact:**
- Positive: Bottom nav goes from 7 items to 6. Less cognitive load. Search becomes the single entry point for finding events.
- Negative: Users who habitually use History lose their muscle memory. But Search is literally the same thing.
- **Effort: Easy** (remove from nav) / **Medium** (full merge into Search)

---

### 4. SLIM: Onboarding — Reduce from 4 Steps to 2
**Priority Scores:** Welcome step (12), Done/confetti step (6) = avg **9** for removable steps

**What to remove:**
- **Step 1 (Welcome)** — skip the marketing pitch. User already signed up. Jump straight to watchlist setup.
- **Step 4 (Done/PartyPopper)** — celebration screen for completing a signup wizard is patronizing. Just redirect to feed.

**What to keep:**
- Step 2 (Watchlist setup) → becomes Step 1
- Step 3 (Push notifications) → becomes Step 2
- After Step 2, redirect straight to Feed

**Why:**
- 4 steps for onboarding a simple alert app is too many. Each extra step is drop-off.
- Welcome screen adds zero information the user didn't already get from the Landing page.
- "You're all set!" celebration screen delays the user from seeing the actual product.
- 2 steps: (1) pick your tickers, (2) enable push → go to feed. That's it.

**Impact:**
- Positive: Faster activation. Less drop-off. Users reach the feed sooner.
- Negative: Lose the "warm welcome" feeling. But users want speed, not confetti.
- **Effort: Easy** — modify step flow, remove two step components

---

### 5. REMOVE: Pricing Page Route + About Page from Navigation
**Priority Scores:** Pricing page (15), About page (6)

**What to do:**
- **Remove `/pricing` route** — it just renders the Landing page. The Landing page already has the pricing section. Having a separate `/pricing` URL that shows the exact same Landing page is confusing.
- **Remove About from any navigation** (footer links, etc.) — keep the route for SEO/trust but don't promote it. Near-zero engagement.
- **Remove API Docs page from public navigation** — keep the route for developers who know to go there, but don't waste nav space on it.

**Why:**
- Pricing page is literally `<Landing />`. It's a duplicate route.
- About page has useful content (data sources, AI disclosure) but 98% of users will never visit it.
- API Docs is developer-facing content that doesn't belong in a consumer app's navigation.

**Impact:**
- Positive: Fewer routes to maintain. Cleaner navigation. Less confusion about duplicate pages.
- Negative: Minor SEO impact for `/pricing` (redirect handles this). About page slightly less discoverable.
- **Effort: Easy** — remove route, update footer links

---

## 4. Overall Simplification Score

**Current state (post Round 1): 5/10**

Round 1 made real improvements:
- Event Detail: 3 tabs → 2 tabs (better)
- Watchlist: sections/dnd → flat list (much better)
- Scorecard: Bloomberg terminal → 5 key metrics (much better)
- Settings: removed squawk (marginal — 5 panels remain)

But the product still has:
- **7 bottom nav items** (should be 5)
- **17 routes** (should be ~10)
- **5 collapsible Settings panels** with 15+ controls (should be 2 panels)
- **4-step onboarding** (should be 2)
- **~53 unused backend API endpoints** (should be 0)
- **Filter presets, signal bar, keyboard shortcuts modal** — features nobody asked for
- **"Coming soon" email placeholder** — half-built promise
- **Duplicate pricing route** — same page as Landing
- **Sound alerts with separate quiet hours** — redundant with push notifications

**After Round 2 (projected): 7/10**

If all 5 recommendations are implemented:
- Bottom nav: 7 → 6 items (History removed)
- Settings: 5 panels → 2 panels (Push + Channels)
- Onboarding: 4 steps → 2 steps
- Feed header: cleaner (no signal bar, no presets, no shortcuts hint)
- Routes: cleaner (no duplicate pricing page)
- Still pending: backend endpoint cleanup (Round 3 candidate)

**To reach 9/10 (future rounds):**
- Bottom nav to 5 items (merge Scorecard into Feed as a widget)
- Clean up all 53+ dead backend endpoints
- Consider whether Calendar deserves a nav slot or should be a Feed tab
- Strip the Landing page — is the mock terminal preview still needed post-launch?

---

## 5. Summary

Round 1 was a success — clean removals, no breakage, the product is measurably simpler.

Round 2 targets **settings complexity** (the #1 remaining problem), **feed noise** (presets + signal bar nobody uses), **navigation bloat** (7 items → 6), **onboarding friction** (4 steps → 2), and **dead routes** (pricing duplicate).

The theme: **stop building for power users who don't exist yet.** Filter presets, sound quiet hours, font size selectors, keyboard shortcut modals — these are features for a mature app with 100K users. Event Radar has ~100. Build for the user you have: someone who opens the app, checks the feed, maybe sets up push, and leaves. Everything else is noise.
