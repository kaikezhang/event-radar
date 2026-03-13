# UX Design Review — Event Radar User App

**Reviewer**: Chief UX Designer
**Date**: 2026-03-13
**Spec reviewed**: `docs/USER-APP-SPEC.md`

---

## 1. Information Architecture

### What works
- Flat, shallow hierarchy — 3-tab bottom nav is correct for the scope.
- Feed → Detail is a natural drill-down. No unnecessary nesting.

### Problems

**Watchlist is buried under Settings.**
Watchlist is a *core workflow*, not a preference. Users will edit it constantly — whenever they spot a ticker they care about or want to mute one. Putting it two taps deep under Settings makes it invisible.

**Recommendation**: Promote Watchlist to the bottom nav. 4 tabs:

```
[ 🏠 Feed ]  [ 👁 Watchlist ]  [ 🔍 Search ]  [ ⚙️ Settings ]
```

4 tabs is the sweet spot for mobile. 3 feels underfilled, 5 gets cramped. Apple HIG and Material both recommend 3–5.

**No dedicated "Saved" / "Bookmarked" view.**
The detail page has a ⭐ Save action, but there's no page to view saved items. Users will save alerts during the day and review them later. Without a saved-items view, the feature is useless.

**Recommendation**: Add a Saved section accessible from the Watchlist tab (toggle: "My Tickers" / "Saved Alerts") or as a sub-page of Feed.

**Missing: Ticker Profile page.**
When a user taps a ticker badge (e.g., `$NVDA`), where do they go? Currently, nowhere. This is a dead end. Every stock app has a ticker-centric view.

**Recommendation**: Add `/ticker/:symbol` — shows recent events for that ticker, watchlist add/remove toggle, and a mini-chart placeholder for V2.

```
Proposed sitemap:

/                        → Alert Feed (home)
/event/:id               → Alert Detail
/ticker/:symbol          → Ticker Profile (event history for ticker)
/watchlist               → Watchlist management + Saved alerts
/search                  → Search
/settings                → Account + Notification prefs
/login                   → Login
/register                → Register
```

---

## 2. Mobile UX Patterns

### Pull-to-refresh + 30s polling — Good
Standard pattern. Tip: show a subtle "3 new events" pill at the top of feed instead of auto-inserting items (which causes layout shift). Let user tap to load.

```
┌─────────────────────────┐
│  ↓ 3 new alerts — tap   │  ← sticky pill, tap to insert
├─────────────────────────┤
│  [card]                 │
│  [card]                 │
│  [card]                 │
└─────────────────────────┘
```

### Bottom sheet — Good for filters, not for detail
Bottom sheet is correct for filter/sort drawers and quick actions. But the spec says detail view is a full page (`/event/:id`). This is right — AI analysis + historical data is too content-heavy for a sheet.

### Missing: Swipe actions on cards
No swipe behavior defined for feed cards. Users expect swipe affordances on mobile list items.

**Recommendation**:
- **Swipe right** → Save/Bookmark (star icon reveals)
- **Swipe left** → Dismiss/Mark-as-read (check icon reveals)
- Light haptic feedback (10ms) on threshold crossing

```
      ← swipe left                        swipe right →
┌──────────────────────────────────────────────────┐
│ ✓ Read │    Alert Card Content    │ ⭐ Save      │
└──────────────────────────────────────────────────┘
```

### Missing: Skeleton loading states
Spec mentions nothing about loading. The feed MUST show skeleton cards on first load and during refresh, not a spinner. Spinners on content feeds feel slow and dated.

```
┌─────────────────────────────┐
│ ▓▓▓▓  ░░░░░░░░░░░░░░░░░░░  │
│ ░░░░░░░░░░░░░  ░░░░░░      │
│ ░░░░░░░░░░░░░░░░░           │
│ ░░░░  ░░░░░░                │
└─────────────────────────────┘
```

### Missing: Scroll position preservation
When user taps a card → views detail → presses back, the feed MUST restore the exact scroll position. This is a top-3 mobile UX frustration when broken.

---

## 3. Alert Card Design

### Current spec layout:
```
┌────────────────────────────────────┐
│ 🔴│ SEC Filing                     │  ← severity bar + source badge
│   │ NVDA 10-K Annual Filing Shows  │  ← title
│   │ Revenue Decline                │
│   │ $NVDA                          │  ← ticker
│   │ AI: Revenue dropped 12% YoY... │  ← AI summary
│   │ 2m ago                         │  ← time
└────────────────────────────────────┘
```

### Issues

**Too much text per card.**
Six lines per card means ~3 cards per viewport on a 375px screen. For a feed you want to "scroll like Twitter," this is too dense. Users will fatigue before card 10.

**Recommendation**: Two-tier card design.

**Compact card (default feed view):**
```
┌────────────────────────────────────┐
│🔴 SEC Filing     $NVDA      2m ago│
│   NVDA 10-K Shows Revenue Decline  │
│   Revenue dropped 12% YoY...       │  ← 1-line truncated summary
└────────────────────────────────────┘
```

3 lines. ~5-6 cards visible per viewport. The AI summary is truncated to one line with ellipsis. Tap for full detail.

**Expanded card (on tap, before navigating to detail page):**
Could optionally expand in-place showing the full summary, with a "View full analysis →" link to the detail page. This gives a two-stage drill-down: scan → preview → deep dive.

**Severity bar position:**
Left-edge vertical bar is a proven pattern (Linear, GitHub issues). Keep it. But make it 3px wide, not a full block — subtlety matters in a minimalist design.

**Time format:**
Use relative time for <24h ("2m ago", "3h ago"), absolute for older ("Mar 12"). Never show full timestamps in the feed card.

**Ticker as tappable chip:**
`$NVDA` should be a tappable chip/badge that navigates to `/ticker/NVDA`. This is a key cross-linking affordance.

---

## 4. Detail Page Scroll Order

### Current spec: AI Analysis → Historical → Source

**This order is correct.** It follows the information-seeking pattern:
1. "What happened?" → AI summary + impact (answer the headline)
2. "Has this happened before?" → Historical patterns (add context)
3. "Let me verify" → Source link (trust but verify)

### Section design recommendations:

```
┌─────────────────────────────────────┐
│ ← Back                    ⭐ 🔗     │  ← sticky header
├─────────────────────────────────────┤
│ 🔴 IMMEDIATE ACTION                │  ← action badge, full-width
│                                     │
│ NVDA 10-K Annual Filing Shows       │
│ Revenue Decline                     │
│ SEC Filing · $NVDA $AMD · 2m ago    │  ← metadata line
├─────────────────────────────────────┤
│                                     │
│ Summary                             │
│ NVIDIA's annual filing reveals a    │
│ 12% year-over-year revenue...       │
│                                     │
│ Market Impact                       │
│ ▼ $NVDA  Bearish                    │
│ ▼ $AMD   Slightly bearish           │
│ ▲ $INTC  Potential beneficiary      │
│                                     │
├─────────────────────────────────────┤
│ Historical Pattern     87% match    │
│ ┌─────────────────────────────────┐ │
│ │ 23 similar events found         │ │
│ │ Avg return T+5:  -3.2%         │ │
│ │ Avg return T+20: -1.8%         │ │
│ │ Win rate: 74%                   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Similar Events                      │
│ ┌ INTC 10-K Rev Decline  2024-01 ┐ │
│ ┌ AMD Q3 Miss             2023-09 ┐ │
│ ┌ NVDA Export Ban Impact  2023-03 ┐ │
│                                     │
├─────────────────────────────────────┤
│ Source                              │
│ 📄 View original filing →          │
├─────────────────────────────────────┤
│ Was this helpful?                   │
│    👍  Useful     👎  Not useful    │
└─────────────────────────────────────┘
```

### Collapse/expand behavior:
- **Do NOT collapse sections by default.** The detail page is purposefully entered — the user wants to read. Collapsed sections add taps for no reason.
- **Exception**: "Similar Events" list can show top 3 with a "Show all 23 →" expansion, since the long list would push Source off-screen.
- Historical pattern stats card should always be fully visible — it's the product's differentiator.

### Sticky behavior:
- Back button + action buttons (save/share) should stick to top on scroll.
- The action badge (🔴 IMMEDIATE ACTION) should NOT stick — it's context, not navigation.

---

## 5. Onboarding

**The spec has zero onboarding. This is a critical gap.**

A stock alert app with AI analysis requires trust-building. Users need to understand: what am I seeing? Why should I trust this AI? How do I customize it?

### Recommended first-run flow:

**Step 1: Value prop (1 screen)**
```
┌─────────────────────────────────┐
│                                 │
│     ⚡ Event Radar              │
│                                 │
│   AI-powered stock alerts       │
│   with historical context       │
│                                 │
│   Real events. Pattern match.   │
│   Seconds, not hours.           │
│                                 │
│   [ Get Started ]               │
│                                 │
└─────────────────────────────────┘
```

**Step 2: Pick your tickers (Watchlist seed)**
```
┌─────────────────────────────────┐
│                                 │
│  What do you follow?            │
│                                 │
│  Popular:                       │
│  [NVDA] [TSLA] [AAPL] [MSFT]   │
│  [AMZN] [META] [GOOG] [SPY]    │
│                                 │
│  🔍 Search for a ticker...      │
│                                 │
│  Selected: NVDA, TSLA           │
│                                 │
│  [ Continue → ]                 │
│  Skip for now                   │
│                                 │
└─────────────────────────────────┘
```

This seeds the watchlist AND gives the app immediate personalization signal. Without this, the feed is the same for every user on day one.

**Step 3: Notification permission (1 screen)**
```
┌─────────────────────────────────┐
│                                 │
│  🔔 Stay ahead of the market    │
│                                 │
│  Get push alerts for critical   │
│  events on your watchlist.      │
│                                 │
│  [ Enable Notifications ]       │
│  Maybe later                    │
│                                 │
└─────────────────────────────────┘
```

Request push permission HERE, not randomly. Users are 3x more likely to accept when they understand the value (iOS guidelines call this a "pre-permission" screen).

**Step 4: Drop into Feed**
Show the feed with a one-time coach mark pointing at the first card: "Tap any alert to see AI analysis and historical patterns."

### Total: 3 screens + 1 tooltip. Under 30 seconds.

---

## 6. Empty States

The spec defines zero empty states. Every single one of these needs design:

### Empty Feed (new user, no events yet)
```
┌─────────────────────────────────┐
│                                 │
│          📡                     │
│                                 │
│    Scanning for events...       │
│                                 │
│    We monitor SEC filings,      │
│    breaking news, and more.     │
│    New alerts appear here       │
│    in real-time.                │
│                                 │
│    [ Add tickers to watchlist ] │
│                                 │
└─────────────────────────────────┘
```

### Empty Search Results
```
┌─────────────────────────────────┐
│                                 │
│          🔍                     │
│                                 │
│    No events found for          │
│    "XYZZ"                       │
│                                 │
│    Try a different ticker        │
│    or keyword.                  │
│                                 │
└─────────────────────────────────┘
```

### Empty Watchlist
```
┌─────────────────────────────────┐
│                                 │
│          👁                     │
│                                 │
│    No tickers yet               │
│                                 │
│    Add tickers to get           │
│    prioritized alerts.          │
│                                 │
│    [ + Add Ticker ]             │
│                                 │
└─────────────────────────────────┘
```

### Empty Saved
```
┌─────────────────────────────────┐
│                                 │
│          ⭐                     │
│                                 │
│    No saved alerts              │
│                                 │
│    Star alerts from the feed    │
│    to review them later.        │
│                                 │
└─────────────────────────────────┘
```

### Error State (network failure)
```
┌─────────────────────────────────┐
│                                 │
│          ⚠️                     │
│                                 │
│    Can't reach the server       │
│                                 │
│    Check your connection and    │
│    try again.                   │
│                                 │
│    [ Retry ]                    │
│                                 │
└─────────────────────────────────┘
```

**Rule**: Every empty state MUST have (1) an illustration/icon, (2) a short explanation, (3) an actionable CTA. Never show a blank screen.

---

## 7. Accessibility

### Critical issues in the current spec:

**1. Color-only severity indicators (WCAG 2.1 failure)**
The spec relies entirely on 🔴🟡🟢 color bars to communicate severity. ~8% of men are color-blind. Red/green is the most common confusion.

**Fix**: Pair color with text labels and/or icons:
```
🔴 CRITICAL   → red bar + "CRITICAL" text + ⚠ icon
🟠 HIGH       → orange bar + "HIGH" text + ▲ icon
🟡 MEDIUM     → yellow bar + "MEDIUM" text + ● icon
🟢 LOW        → green bar + "LOW" text + ▽ icon
```

Also use distinct shapes/patterns, not just hue:
- Critical: solid filled bar
- High: dashed bar
- Medium: dotted bar
- Low: thin line

**2. Contrast ratios on dark background**
- `#737373` (muted text) on `#0A0A0A` = **4.74:1** — passes AA for normal text but fails AAA. For small/muted labels, this is borderline.
- **Fix**: Bump muted text to `#8A8A8A` (5.5:1) for comfortable readability.
- Orange `#F97316` on `#0A0A0A` = **4.5:1** — barely passes AA. Bump to `#FB923C` for safety.

**3. No mention of focus management**
- Every interactive element needs visible focus indicators for keyboard navigation.
- Bottom sheet must trap focus when open.
- Detail page back navigation must restore focus to the originating card.

**4. Touch targets**
- Bottom nav icons: minimum 44×44pt tap targets (Apple HIG). Spec doesn't specify sizing.
- Card tap targets should be the full card area, not just the title text.
- Action buttons (save/share/feedback) need adequate spacing — minimum 8px between tappable elements.

**5. Screen reader considerations**
- Cards need semantic `<article>` tags with `aria-label` summarizing: "Critical alert: NVDA 10-K Revenue Decline, SEC Filing, 2 minutes ago"
- Severity color bars need `aria-label` (color alone is invisible to screen readers)
- Live region (`aria-live="polite"`) for new events appearing in feed
- "3 new alerts" pill needs `role="status"`

**6. Motion sensitivity**
- Pull-to-refresh animation and card transitions should respect `prefers-reduced-motion`
- Provide alternative static feedback for users who disable animations

---

## 8. Dark Theme — Dark-Only Assessment

### Verdict: Acceptable for V1, but plan for light mode in V2.

**Arguments for dark-only:**
- Stock/finance audience tends to prefer dark UIs (Bloomberg, TradingView, most trading platforms)
- Simplifies implementation — one theme, no variables to maintain
- Matches the "radar/surveillance" brand identity
- Saves battery on OLED devices (real benefit for a feed users check many times daily)

**Arguments against:**
- Outdoor readability is poor on dark backgrounds — stock traders check alerts throughout the day, including commutes and outdoor settings
- Some users have accessibility needs that require light backgrounds
- App Store / Play Store screenshots look more distinctive with light themes (dark is now the default, ironically)

**Recommendation:**
Ship V1 dark-only. But:
- Build with CSS custom properties / Tailwind `dark:` classes from day one so adding light mode is a config change, not a rewrite
- Add `prefers-color-scheme` media query support as a fast-follow
- The `#0A0A0A` background is good — true black (`#000`) causes halation on OLED; near-black is the right call

---

## 9. Interaction Details

### Transitions needed:

**Feed → Detail**
- Shared element transition: the card "expands" into the detail view
- The severity bar, title, and ticker should animate from card position to detail position
- Fallback: simple slide-from-right (300ms ease-out)

**Bottom sheet**
- Spring physics animation (not linear ease)
- 3 snap points: closed → half → full
- Background dims with `rgba(0,0,0,0.5)` overlay
- Tap overlay to dismiss, or swipe down

**Card interactions**
- Tap: 100ms scale-down (0.98) + subtle background highlight
- Long press: show quick-action menu (Save, Share, Dismiss)
- Swipe: reveal action (as defined in section 2)

### Loading states needed:

| State | Treatment |
|-------|-----------|
| Initial feed load | 5 skeleton cards |
| Refresh (pull) | Spinner in pull-to-refresh indicator, cards stay visible |
| Load more (scroll) | Spinner at bottom of list |
| Detail page load | Skeleton for AI section, keep header visible |
| Search typing | Debounce 300ms, then show results or skeleton |
| Watchlist save | Optimistic UI — add immediately, revert on error |
| Save/feedback | Instant icon fill + haptic, async POST |

### Haptics (PWA limited, but plan for native wrapper):

| Action | Pattern |
|--------|---------|
| Pull-to-refresh threshold | Light impact |
| Swipe action threshold | Light impact |
| Save/bookmark | Medium impact |
| New critical alert arrives | Heavy notification |

---

## 10. Design System — Components to Standardize

Build these as reusable primitives before page development:

### Core components:

| Component | Usage |
|-----------|-------|
| `AlertCard` | Feed list item. Props: severity, source, title, ticker[], summary, time, saved |
| `SeverityBadge` | Color + label + icon. Used in cards and detail page |
| `SourceBadge` | SEC Filing, Breaking News, etc. Consistent chip style |
| `TickerChip` | Tappable `$NVDA` pill. Links to ticker profile |
| `ActionBar` | Save / Feedback / Share button row |
| `BottomSheet` | Reusable sheet with snap points |
| `BottomNav` | 4-tab navigation |
| `SkeletonCard` | Loading placeholder for feed |
| `EmptyState` | Icon + message + CTA template |
| `FilterBar` | Bottom sheet with severity/source/ticker filter pills |
| `SearchInput` | Debounced input with ticker autocomplete |
| `StatCard` | Number + label for historical stats (match count, win rate, etc.) |
| `SimilarEventRow` | Compact row for "similar events" list |
| `CoachMark` | Tooltip overlay for onboarding |
| `PillBanner` | "3 new alerts" sticky banner |
| `ErrorBoundary` | Catch + display friendly error with retry |

### Typography scale (mobile-first):

```
--text-xs:    11px / 1.4  → timestamps, metadata
--text-sm:    13px / 1.5  → source badges, secondary text
--text-base:  15px / 1.5  → body text, AI summaries
--text-lg:    17px / 1.4  → card titles
--text-xl:    20px / 1.3  → detail page title
--text-2xl:   24px / 1.2  → stat numbers (T+5 return, win rate)
```

Font: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`). Monospace for numbers: `'SF Mono', 'Fira Code', 'Consolas', monospace`.

### Spacing scale:
Use 4px base: 4, 8, 12, 16, 20, 24, 32, 48. Card padding: 16px. Card gap: 12px. Section gap: 24px.

---

## 11. Competitive UX Audit

### Bloomberg Terminal
- **Steal**: Information density — Bloomberg packs massive data into small space without feeling cluttered because of consistent grid alignment and typography hierarchy
- **Steal**: Keyboard shortcuts for power users — even on mobile, consider gesture shortcuts
- **Avoid**: Overwhelming first-run experience — Bloomberg requires training. Event Radar must be instant-understandable
- **Avoid**: Everything-at-once layout — Bloomberg works on 4 monitors. Event Radar is a phone

### Robinhood Alerts
- **Steal**: The simplicity — Robinhood alerts are dead simple: "NVDA is up 5% today." One line. Clear.
- **Steal**: Push notification format — ticker + one-sentence summary. Copy this for web push
- **Steal**: Ticker profile page — every mention of a ticker leads to a rich profile. Cross-link everything
- **Avoid**: Lack of depth — Robinhood alerts have zero context. This is where Event Radar's AI analysis and historical patterns are the differentiator. Don't dumb it down to match RH
- **Avoid**: Gamification aesthetics (confetti, celebration). Event Radar should feel serious and trustworthy

### StockTwits
- **Steal**: Social proof / sentiment indicators — even without social features, showing "how many users saved this alert" or trending alerts adds social signal
- **Steal**: Ticker-centric navigation — every ticker is a hub
- **Avoid**: Noise — StockTwits is 90% noise. Event Radar's value is curation. Make the filtering obvious: "We scanned 1,250 events and surfaced 75 that matter"
- **Avoid**: Ad-heavy, cluttered layout

### Seeking Alpha
- **Steal**: Article-quality depth — SA articles give thorough analysis. Event Radar's detail page should feel like a mini-article, not a data dump
- **Steal**: "Related articles" pattern — map this to "Similar historical events"
- **Steal**: Earnings data presentation — clean tables with clear up/down indicators
- **Avoid**: Paywall friction — don't tease data behind upgrade walls in V1. Show everything, monetize later
- **Avoid**: Slow load times — SA is notoriously slow. Event Radar must feel instant

### Summary — Event Radar's UX positioning:

```
                Depth of analysis
                      ↑
                      │
          Seeking     │    EVENT RADAR
          Alpha       │    (target)
                      │
  ────────────────────┼──────────────────→ Speed / Simplicity
                      │
          Bloomberg   │    Robinhood
          StockTwits  │
                      │
```

Event Radar should live in the top-right quadrant: **deep analysis delivered with Robinhood-level simplicity.** The AI does the work; the user gets the insight in 5 seconds.

---

## Summary of Recommendations (Priority-Ordered)

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Promote Watchlist to bottom nav (4 tabs) | High | Low |
| 2 | Add onboarding flow (3 screens) | High | Medium |
| 3 | Fix color-only severity — add text + icons | High | Low |
| 4 | Design all empty states | High | Low |
| 5 | Add skeleton loading states | High | Medium |
| 6 | Compact card design (3 lines, not 6) | High | Low |
| 7 | Add ticker profile page `/ticker/:symbol` | Medium | Medium |
| 8 | Add "Saved" view for bookmarked alerts | Medium | Medium |
| 9 | Define swipe gestures on feed cards | Medium | Medium |
| 10 | "N new alerts" pill instead of auto-insert | Medium | Low |
| 11 | Scroll position restoration on back | Medium | Low |
| 12 | Contrast ratio fixes for muted text | Medium | Low |
| 13 | Shared element transitions | Low | High |
| 14 | Haptic feedback definitions | Low | Low |
| 15 | Build with CSS vars for future light mode | Low | Low |

---

*End of review.*
