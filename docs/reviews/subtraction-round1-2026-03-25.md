# Subtraction CrowdTest — Round 1
**Date:** 2026-03-25
**Methodology:** Every page, section, feature, button, filter, and API endpoint scored on VALUE (1-10) x USAGE LIKELIHOOD (1-10) = Priority Score. Lower score = stronger removal candidate.

---

## 1. Full Feature Inventory with Priority Scores

### Pages

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Feed page | 10 | 10 | 100 | Core product. The reason people open the app |
| Event Detail page | 10 | 9 | 90 | Essential — users need to understand events |
| Watchlist page | 9 | 8 | 72 | Core engagement loop |
| Search page | 8 | 7 | 56 | Direct intent — users looking for specific tickers/events |
| Settings page | 7 | 5 | 35 | Necessary but infrequent |
| Calendar page | 7 | 5 | 35 | Forward-looking events, useful for planning |
| History page | 6 | 4 | 24 | Backward-looking — less urgent, overlaps with Search |
| Scorecard page | 6 | 3 | 18 | Trust-building, but most users won't dig into accuracy stats |
| Ticker Profile page | 7 | 5 | 35 | Useful but duplicates info from Feed + Event Detail |
| Landing page | 8 | 6 | 48 | First impression for new users |
| Login page | 8 | 5 | 40 | Necessary for auth |
| Onboarding wizard | 7 | 3 | 21 | One-time use, 4 steps is heavy |
| Pricing page | 5 | 3 | 15 | Identical to Landing page — redundant |
| About page | 3 | 2 | 6 | Nice to have, almost nobody reads it |
| Privacy Policy | 3 | 1 | 3 | Legal requirement but near-zero engagement |
| Terms of Service | 3 | 1 | 3 | Legal requirement but near-zero engagement |
| API Docs page | 5 | 2 | 10 | Niche audience (developers/power users) |
| 404 page | 4 | 1 | 4 | Necessary but shouldn't be reached |

### Feed Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Feed list with AlertCards | 10 | 10 | 100 | Core |
| Severity badges + direction | 10 | 10 | 100 | Core signal information |
| Real-time WebSocket updates | 9 | 9 | 81 | Core — live is the point |
| Smart Feed tab | 8 | 7 | 56 | Good default filter |
| My Watchlist tab | 8 | 7 | 56 | Personalization |
| All Events tab | 6 | 4 | 24 | Noisy — who wants unfiltered firehose? |
| Feed Signal Bar | 5 | 4 | 20 | Minor info, takes up space |
| Feed Filters (severity, source) | 7 | 5 | 35 | Power user feature |
| Filter presets (save/load) | 4 | 2 | 8 | Over-engineered — how many presets does one person need? |
| Sort mode (latest/severity) | 5 | 3 | 15 | Minor utility |
| Swipeable cards (mobile) | 6 | 4 | 24 | Nice gesture UX |
| Keyboard navigation (j/k) | 5 | 2 | 10 | Desktop power users only |
| Dedup count + related sources | 7 | 6 | 42 | Good signal compression |
| Pull-to-refresh | 6 | 5 | 30 | Expected mobile behavior |
| Pending alerts banner | 7 | 6 | 42 | Useful for awareness |
| Connection status indicator | 6 | 3 | 18 | Useful but mostly ignored when working |

### Event Detail Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Summary tab — What Happened | 10 | 9 | 90 | Core |
| Summary tab — Bull/Bear Case | 8 | 7 | 56 | Actionable framing |
| Summary tab — What Happened Next | 9 | 8 | 72 | Outcome data is the differentiator |
| Summary tab — Similar Past Events | 7 | 5 | 35 | Interesting but secondary |
| Evidence tab — Market Data | 8 | 6 | 48 | Useful context |
| Evidence tab — Source Evidence | 8 | 7 | 56 | Transparency |
| Evidence tab — Why It Matters Now | 7 | 5 | 35 | Nice but often generic |
| Evidence tab — Key Risks | 6 | 4 | 24 | Often boilerplate |
| Evidence tab — Historical Similar Events | 5 | 3 | 15 | Redundant with Summary tab's "Similar Past Events" |
| Trust tab — Source Journey | 5 | 2 | 10 | Cool but niche — most users don't care about pipeline provenance |
| Trust tab — Verification card | 6 | 3 | 18 | Trust-building |
| Trust tab — Confirmed Sources | 6 | 3 | 18 | Trust-building |
| Trust tab — Feedback buttons | 4 | 2 | 8 | Rarely used in practice |
| Trust tab — Disclaimer | 3 | 1 | 3 | Legal necessity, near-zero engagement |
| Share button | 4 | 2 | 8 | Rarely used for financial alerts |

### Watchlist Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Add/remove tickers | 9 | 8 | 72 | Core |
| Ticker price + change | 8 | 7 | 56 | Quick glance value |
| Event count per ticker | 7 | 6 | 42 | Good signal |
| Drag-and-drop sections | 5 | 2 | 10 | Over-engineered — who creates custom watchlist sections? |
| Custom section management | 4 | 1 | 4 | CRUD for sections nobody will create |
| Section color customization | 2 | 1 | 2 | Vanity feature, near-zero utility |
| "Set up push alerts" banner | 6 | 4 | 24 | Good nudge |

### Settings Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Push alert enable/disable | 9 | 6 | 54 | Core notification feature |
| Discord webhook config | 7 | 3 | 21 | Niche audience |
| Email notification | 5 | 3 | 15 | Rarely checked for time-sensitive events |
| Minimum severity dropdown | 7 | 4 | 28 | Good filter |
| Font size selector | 3 | 1 | 3 | Accessibility edge case, browser zoom exists |
| Alert sound toggle | 5 | 3 | 15 | Annoying in practice |
| Alert sound volume slider | 3 | 1 | 3 | If you have sound, you probably just want on/off |
| Quiet hours config | 5 | 3 | 15 | Nice but markets are open fixed hours anyway |
| Timezone selector | 4 | 2 | 8 | Should auto-detect |
| Audio squawk enable/disable | 4 | 2 | 8 | Gimmicky — TTS for financial events? |
| Audio squawk "speak when hidden" | 2 | 1 | 2 | Sub-feature of a gimmick |
| Daily push cap slider | 4 | 2 | 8 | Confusing — users don't know what cap to set |
| Push non-watchlist events | 5 | 3 | 15 | Useful toggle |
| Restore daily briefing | 4 | 2 | 8 | Unclear what this does |
| Signal tier reference table | 5 | 3 | 15 | Educational but static info |

### Scorecard Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Overview stats (events, sources, price data) | 6 | 3 | 18 | Headline numbers |
| Coverage + Setup Rate | 6 | 3 | 18 | Trust metric |
| Source Accuracy bar chart | 6 | 3 | 18 | Cool visualization |
| Severity Breakdown pie chart | 5 | 2 | 10 | Pie charts are generally bad |
| Rolling Accuracy Trend (placeholder) | 1 | 0 | 0 | LITERALLY A PLACEHOLDER — "Coming soon" |
| Advanced Analytics (collapsible) | 4 | 1 | 4 | Buried metrics nobody will find |
| Bucket sections (4 collapsible) | 4 | 1 | 4 | Overwhelming detail |
| Window toggle (30d/90d/All) | 5 | 2 | 10 | Minor utility |

### Calendar Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Date-grouped event cards | 7 | 5 | 35 | Core calendar value |
| Range toggle (This Week/Next/Month) | 6 | 4 | 24 | Good filter |
| Historical move context | 7 | 4 | 28 | Differentiator |
| Coverage note banner | 3 | 2 | 6 | Meta-commentary about data quality |

### Search Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Text search input | 9 | 7 | 63 | Core |
| Matched ticker pills | 7 | 5 | 35 | Good UX |
| Recent searches | 6 | 4 | 24 | Convenience |
| Popular tickers section | 5 | 3 | 15 | Filler content for empty state |

### Onboarding — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Step 1 — Welcome | 5 | 3 | 15 | Necessary but brief is better |
| Step 2 — Watchlist setup | 8 | 4 | 32 | Core value — gets tickers added |
| Step 3 — Notifications | 7 | 3 | 21 | Push permission prompt |
| Step 4 — Done (confetti) | 2 | 3 | 6 | Confetti is charming but wasteful |
| Sector packs | 6 | 3 | 18 | Nice shortcut |
| Trending tickers in onboarding | 6 | 3 | 18 | Helpful |

### Landing Page — Sub-Features

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Hero section | 9 | 6 | 54 | First impression |
| Feed Preview (mock terminal) | 7 | 5 | 35 | Shows the product |
| Stats Strip (3 cards) | 6 | 5 | 30 | Social proof |
| Feature Cards (4 cards) | 5 | 4 | 20 | Standard marketing |
| Pricing section on landing | 6 | 4 | 24 | Good — no separate page needed |

### Global Elements

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Bottom nav bar (7 items) | 8 | 10 | 80 | Core navigation |
| Global ticker search (Cmd+K) | 7 | 5 | 35 | Power user shortcut |
| Keyboard shortcuts modal | 3 | 1 | 3 | Nobody presses ? |
| Footer links | 3 | 1 | 3 | Standard but rarely clicked |
| Squawk indicator in header | 3 | 1 | 3 | Visual noise for a rarely-used feature |

### API Endpoints (Backend-only, no frontend usage)

| Feature | Value | Usage | Priority | Notes |
|---------|-------|-------|----------|-------|
| Rule Engine CRUD (7 endpoints) | 3 | 0 | 0 | No UI, no external consumers |
| Adaptive Classifier (4 endpoints) | 3 | 0 | 0 | Internal ML tooling with no UI |
| Story Groups (2 endpoints) | 3 | 0 | 0 | Never surfaced in frontend |
| Historical analysis (3 endpoints) | 4 | 1 | 4 | Could be useful but unused |
| Analytics/Win-rate (6 endpoints) | 5 | 0 | 0 | Rich data, zero consumers |
| Accuracy endpoints (5 endpoints) | 4 | 0 | 0 | Overlap with Scorecard API |
| Budget/Delivery control (5 endpoints) | 5 | 0 | 0 | Admin tooling — useful but no admin UI |
| Feedback endpoints (3 endpoints) | 4 | 0 | 0 | Trust tab has buttons but they don't call these |
| Judge endpoints (2 endpoints) | 3 | 0 | 0 | Internal debugging |
| Regime endpoints (2 endpoints) | 4 | 0 | 0 | No frontend consumer |
| Weekly report endpoint | 4 | 0 | 0 | Never generated or displayed |
| AI Observability endpoint | 3 | 0 | 0 | Monitoring with no dashboard |
| `/api/events/search` | 4 | 0 | 0 | Redundant — frontend uses text search on `/api/events` |
| `/api/stats` | 3 | 0 | 0 | Unused stats endpoint |

---

## 2. BOTTOM 10 Features (Lowest Priority — Strongest Removal Candidates)

| Rank | Feature | Priority | Why it's at the bottom |
|------|---------|----------|------------------------|
| 1 | Rolling Accuracy Trend (Scorecard) | **0** | Literally a "Coming soon" placeholder. Ships nothing. |
| 2 | Rule Engine API (7 endpoints) | **0** | No UI, no external consumers. Dead code. |
| 3 | Adaptive Classifier API (4 endpoints) | **0** | Internal ML plumbing with zero consumers. |
| 4 | Story Groups API (2 endpoints) | **0** | Feature never shipped to frontend. |
| 5 | Analytics/Win-rate API (6 endpoints) | **0** | Rich analytics nobody can access. |
| 6 | Section color customization (Watchlist) | **2** | Vanity feature. Zero impact on trading decisions. |
| 7 | Audio squawk "speak when hidden" | **2** | Sub-feature of a gimmick. |
| 8 | Privacy/Terms pages | **3** | Can't remove (legal), but should be minimal. |
| 9 | Font size selector (Settings) | **3** | Browser zoom/OS accessibility exist. Wasted settings real estate. |
| 10 | Keyboard shortcuts modal | **3** | Nobody discovers or uses `?` key. |

---

## 3. TOP 5 REMOVAL RECOMMENDATIONS

### 1. DELETE: Watchlist Drag-and-Drop Sections System
**Priority Score:** Sections (4), Color customization (2), Section CRUD (4) = avg 3.3
**What to remove:** Custom sections, drag-and-drop reordering between sections, section color picker, section CRUD (create/rename/delete), plus 5 related API endpoints (`/sections`, `/sections/:id`, `/reorder`).
**Why:**
- Over-engineered for the problem. A watchlist is a flat list of 10-30 tickers. Nobody needs "folders" for their watchlist.
- Drag-and-drop is notoriously buggy on mobile and adds significant JS bundle weight (`@dnd-kit` library).
- Color customization is pure vanity — it doesn't help anyone make better trading decisions.
- Cognitive load: new users see "Add section" and wonder "do I NEED sections? Am I using this wrong?"
- This complexity makes the watchlist page feel like a project management tool, not a trading alert app.

**Impact:**
- Positive: Simpler watchlist UX, smaller bundle, fewer bugs, faster page load, less backend code
- Negative: Power users with 50+ tickers lose organization (but they can use Search instead)
- **Effort: Medium** — remove frontend components, remove 5 API endpoints, simplify watchlist schema

---

### 2. DELETE: Audio Squawk Feature
**Priority Score:** Enable/disable (8), Speak when hidden (2), Header indicator (3) = avg 4.3
**What to remove:** Audio squawk toggle, "speak when app hidden" sub-toggle, squawk indicator in header, TTS engine code.
**Why:**
- Gimmicky. Text-to-speech reading financial alerts aloud is a novelty, not a workflow.
- Competes with push notifications (which actually work when app is hidden).
- The header squawk indicator adds visual noise to EVERY page for a feature <5% of users will try once.
- TTS quality for financial jargon (ticker symbols, percentages, SEC filing types) is poor.
- "Speak when app hidden" is a sub-feature of a feature nobody uses — complexity squared.

**Impact:**
- Positive: Cleaner header, simpler settings page, less audio permission complexity
- Negative: The 1-2 users who love it lose a unique feature
- **Effort: Easy** — remove components, remove settings, remove TTS code

---

### 3. DELETE: Unused Backend API Endpoints (40+ endpoints)
**Priority Score:** 0 across the board
**What to remove:** Rule Engine (7), Adaptive Classifier (4), Story Groups (2), Analytics/Win-rate (6), Accuracy (5), Budget/Delivery admin (5), Feedback (3), Judge (2), Historical (3), Regime (2), Weekly Report (1), AI Observability (1), `/api/events/search` (1), `/api/stats` (1) = **43 endpoints total**.
**Why:**
- Dead code. No frontend page calls any of these. No documented external API consumers.
- Security surface area: 43 unauthenticated or lightly-authenticated endpoints that serve no user.
- Maintenance burden: every schema change, every Drizzle migration, every TypeScript upgrade has to consider these dead routes.
- Some are half-built visions that never materialized (Story Groups, Adaptive Classifier, Rule Engine UI).
- The ones with value (Analytics, Accuracy) should be surfaced in UI or removed — zombie endpoints help nobody.

**Impact:**
- Positive: Massively reduced attack surface, simpler codebase, faster build times, clearer architecture
- Negative: If you later want an admin dashboard, you'll rebuild some of these. But YAGNI.
- **Effort: Medium** — straightforward deletion, but needs careful check for internal usage (cron jobs, pipeline calls)

---

### 4. DELETE: Event Detail Trust Tab
**Priority Score:** Source Journey (10), Verification (18), Confirmed Sources (18), Feedback buttons (8), Disclaimer (3) = avg 11.4
**What to remove:** The entire "Trust" tab on Event Detail, including Source Journey provenance timeline, Verification card, Confirmed Sources badges, Feedback buttons, and Disclaimer section.
**Why:**
- Internal tooling exposed as UI. "Source -> Rule Filter -> AI Judge -> Enriched -> Delivered" is a pipeline diagram, not user information.
- Feedback buttons ("Was this useful?") are wired to nothing — the backend feedback endpoints aren't connected to the frontend.
- The Disclaimer is boilerplate that belongs in Terms of Service, not on every event.
- Users want to know "what happened" and "should I care" — not "how did the sausage get made."
- 3 tabs on event detail is cognitive load. Summary + Evidence is enough.

**Impact:**
- Positive: Event detail page becomes 2 clean tabs instead of 3. Removes dead feedback UI. Less confusion about provenance.
- Negative: Loses transparency story for trust-conscious users. But Summary + Evidence already provide source info.
- **Effort: Easy** — remove one tab component and its sub-components

---

### 5. DELETE: Scorecard Page (or Radically Simplify)
**Priority Score:** Page overall (18), sub-features avg 8
**What to remove:** Either remove entirely OR gut it down to 3 numbers: events tracked, setup worked rate, avg T+20 move.
**Why:**
- The page tries to be a Bloomberg terminal-grade accuracy dashboard for a consumer alert app.
- "Rolling Accuracy Trend" is literally a placeholder saying "Coming soon" — half-baked.
- 4 collapsible bucket sections (Signal, Confidence, Source, Event Type) with 4 metrics each = 16 data points nobody will parse.
- Pie chart of severity breakdown adds nothing — if I see "60% HIGH" what do I do with that?
- The Advanced Analytics section is hidden behind a collapse — if you have to hide it, users don't want it.
- Occupies a precious bottom nav slot (1 of 7) for something 95% of users will visit once and never return.

**Impact:**
- Positive: Frees a nav slot for something more useful. Dramatically simpler app. Removes one of the most intimidating pages.
- Negative: Loses the "trust through transparency" story. But a simpler scorecard widget on the Feed page would be better.
- **Effort: Easy** (full removal) / **Medium** (simplification to widget)

---

## 4. Features That Should STAY (Justified)

### Must Keep — Core Product
| Feature | Why |
|---------|-----|
| **Feed page + AlertCards** | The product IS the feed. Everything else is secondary. |
| **Event Detail — Summary tab** | Users need context on what happened and why it matters. |
| **Event Detail — Evidence tab** | Source transparency + market data = credibility. |
| **Watchlist (flat list)** | Personalization drives engagement and push alert targeting. |
| **Push notifications** | The killer feature — knowing before the market moves. |
| **Real-time WebSocket** | "Live" is the value prop. Without it, this is just a news archive. |
| **Search page** | Direct intent fulfillment. Users know what they want. |
| **Smart Feed + Watchlist tabs** | Good filtering without complexity. |

### Should Keep — High Value
| Feature | Why |
|---------|-----|
| **Calendar page** | Forward-looking events (earnings, FDA, economic data) are uniquely valuable. No other page does this. |
| **Landing page** | First impression. The mock terminal preview is particularly effective. |
| **Login + Auth** | Necessary for personalization. Magic link is good UX. |
| **Ticker Profile** | Gives depth per-ticker. Good for research workflow. |
| **Settings — Push + Discord** | Core delivery configuration. |
| **Onboarding (simplified)** | Getting tickers into watchlist is critical activation. Could be 2 steps instead of 4. |

### Keep but Simplify
| Feature | Why to keep | What to simplify |
|---------|-------------|------------------|
| **History page** | Users need to look back | Remove filters — just show a chronological list with search |
| **Feed filters** | Power users need them | Remove preset save/load — too complex for the benefit |
| **Settings page** | Necessary | Remove font size, squawk, volume slider, quiet hours. Keep: push, Discord, severity minimum |
| **Bottom nav** | Core navigation | 7 items is too many. Remove Scorecard slot. Consider merging History into Search. |
| **Onboarding** | Critical activation | Reduce from 4 steps to 2 (watchlist + push permission). Kill confetti. |

---

## 5. Summary: The Subtraction Thesis

Event Radar's core value is **"know what moves markets before it moves."** Everything should serve this mission.

**The product has 18 routes, 80+ API endpoints, 7 nav items, and dozens of sub-features.** For a focused alert product, this is 2-3x more surface area than needed.

**The simplest version of Event Radar is:**
1. **Feed** — see alerts in real-time
2. **Watchlist** — pick your tickers (flat list)
3. **Event Detail** — understand what happened (2 tabs)
4. **Search** — find specific events/tickers
5. **Calendar** — see what's coming
6. **Settings** — configure push + delivery

That's 6 pages, not 18. That's 5 nav items, not 7. That's ~35 API endpoints, not 80+.

**The removed complexity doesn't make the product worse — it makes it faster, clearer, and more trustworthy.** A trader who opens the app at 9:30 AM doesn't want to wonder "should I check the Scorecard? What are Story Groups? Why is there a confetti screen?" They want: **what happened, should I care, what's next.**

Remove ruthlessly. Ship less. Win more.
