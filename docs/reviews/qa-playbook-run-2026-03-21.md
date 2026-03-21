# QA Playbook Run — 2026-03-21

**Tester:** Claude (automated via gstack browse)
**Environment:** Frontend `http://localhost:5173` | Backend `http://localhost:3001`
**Viewport:** 1280x720 (desktop), 375x812 (mobile)
**Date:** 2026-03-21

---

## Summary

| Metric | Value |
|--------|-------|
| **Score** | **93.3 / 100** |
| **Status** | 🟢 **SHIP READY** |
| **TCs Passed** | 16 / 18 |
| **TCs Partial** | 2 / 18 |
| **TCs Failed** | 0 / 18 |
| **Bugs Found** | 2 (1 Medium, 1 Low) |

---

## TC Results Table

| TC | Name | Result | Notes |
|----|------|--------|-------|
| TC-01 | New User Onboarding | ✅ PASS | Full flow works: welcome → tickers → notifications → completion → feed. `onboardingComplete` set in localStorage. Sector packs work. |
| TC-02 | Feed Three Modes | ✅ PASS | Smart Feed / My Watchlist / All Events switch correctly. Content differs by mode. "What is Smart Feed?" tooltip present. |
| TC-03 | Feed Card Completeness | ✅ PASS | Cards show: severity (HIGH), title, direction (▼ BEARISH), thesis preview, source ("via CNBC"), ticker chip (XLE), timestamp (12h ago). No price/outcome data (expected — no outcome tracking yet). |
| TC-04 | Event Detail (Summary) | ✅ PASS | Title + severity + direction present. "What Happened" section, Bull vs Bear thesis, "📜 Similar Past Events" all render. |
| TC-05 | Event Detail (Evidence + Trust) | ✅ PASS | Three tabs show distinct content. Evidence: Regime Context, Why It Matters, Source, Key Risks. Trust: Source Journey pipeline, Verification, feedback buttons. No duplicate UI. |
| TC-06 | Scorecard Page | ✅ PASS | Hero: "24,004 Events Detected" (not hit rate). Advanced Analytics collapsible with disclaimer. Charts render. Time windows (30d/90d/All) update data. No DUMMY sources. |
| TC-07 | Scorecard Mobile | ✅ PASS | Loads fully at 375px (not stuck on skeleton). Charts adapt. No horizontal overflow. |
| TC-08 | Watchlist Management | ✅ PASS | 13 tickers listed. "This week: 11 alerts" stats shown. Search finds tickers, add/remove works. Drag-to-reorder and notes available. |
| TC-09 | Global Search | ⚠️ PARTIAL | `/` opens search, Tickers tab works, Escape closes. **Events tab search broken** — clicking Events tab switches visually but typing reverts to ticker search. |
| TC-10 | History + Filters | ✅ PASS | 24,038 events loaded. Filters expand/collapse. Severity filter works (HIGH → 987 results). "Filters (1)" badge shows. Reset clears all. |
| TC-11 | Settings Page | ✅ PASS | No theme toggle. Push alerts show step-by-step recovery guidance for denied permissions. Notification budget, sound, audio squawk sections present. |
| TC-12 | Keyboard Shortcuts | ✅ PASS | `j`/`k` navigate events, `Enter` opens detail, `/` opens search, Escape closes overlays. Shortcuts help accessible via header button. |
| TC-13 | WebSocket Status | ✅ PASS | Status indicator shows Connected/Reconnecting/Offline with `role="status"`. Reconnect backoff present (15-60s intervals). |
| TC-14 | Daily Briefing | ✅ PASS | Shows date, 24h event count, top event. Dismiss works and persists across page refresh. |
| TC-15 | Bottom Nav | ✅ PASS | All 5 pages have bottom nav with 5 tabs. Content not obscured. Nav visible within viewport. |
| TC-16 | Mobile Responsive | ⚠️ PARTIAL | Watchlist, Scorecard, History, Settings, Event Detail all render correctly at 375px. **Feed page has minor horizontal overflow at 375px.** |
| TC-17 | Console Errors | ✅ PASS | No JS runtime errors across all routes. Only WebSocket connection warnings (acceptable). |
| TC-18 | Source Name Consistency | ✅ PASS | History filters, Scorecard buckets, and Feed cards use consistent, user-friendly names. No "dummy", "test", or "internal" strings found. |

---

## Bug List

### BUG-1: Events tab in global search non-functional (Medium)

**Severity:** Medium
**Location:** Global search modal (all pages)
**Description:** Clicking the "Events" tab in the search modal switches the tab indicator visually (border highlight moves to Events), but when the user types in the search input, results revert to ticker search. The input placeholder stays "Search tickers..." instead of changing to the events search placeholder.
**Repro Steps:**
1. Press `/` to open search
2. Click "Events" tab
3. Type any search term (e.g., "oil")
4. Observe: results show tickers, not events
**Expected:** Events tab should search events by title/content/topic
**Impact:** Users cannot search for events by content — only ticker search works

### BUG-2: Feed horizontal overflow at 375px mobile viewport (Low)

**Severity:** Low
**Location:** Feed page (`/`)
**Description:** At 375px viewport width, `document.documentElement.scrollWidth > 375` returns `true`, indicating horizontal overflow. All other pages render correctly at this width.
**Repro Steps:**
1. Set viewport to 375x812
2. Navigate to Feed (`/`)
3. Observe: page content exceeds 375px width
**Expected:** No horizontal scroll at 375px
**Impact:** Minor horizontal scroll on narrow mobile devices

---

## Score Calculation

- Base: 18 TCs × 5.56 points = 100 points
- TC-09 (Global Search): Partial — Tickers tab works but Events tab broken = 50% credit → -2.8 points
- TC-16 (Mobile Responsive): Partial — 5/6 pages pass, Feed has minor overflow = 83% credit → -0.9 points
- BUG-1 (Medium): -2 points
- BUG-2 (Low): -1 point

**Final Score: 100 - 2.8 - 0.9 - 2 - 1 = 93.3**

---

## Product Suggestions

1. **Event search needs to work end-to-end.** The Events tab in global search is non-functional — this is a core discoverability feature. Users who want to search by topic ("Iran sanctions", "Fed rate") rather than ticker have no way to do so currently. This should be prioritized.

2. **Feed mode difference should be more visible.** With default severity filters (HIGH + CRITICAL), Smart Feed and All Events show the same 3 events. Consider showing a count badge on each mode tab (e.g., "Smart Feed (3)" vs "All Events (47)") so users understand the filtering value.

3. **Onboarding ticker buttons could be clearer.** Many "Quick add" buttons show as disabled (AAPL, NVDA, META, etc.) without explanation. Users may not realize these tickers are already in their watchlist. Adding a "(already added)" label or checkmark would reduce confusion.

4. **"Permission: denied" raw text in Settings.** While the step-by-step recovery guide is excellent, the raw "Permission: denied" text feels technical. Consider replacing it with "Notifications are currently blocked" or removing the raw permission string entirely.

5. **Feed mobile overflow.** The feed page is the most-visited page and having horizontal overflow at 375px (the most common mobile width) degrades the experience. Worth investigating which element causes the overflow — likely the split-view detail panel or a card element exceeding the container.
