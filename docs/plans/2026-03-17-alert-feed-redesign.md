# Event Radar — Alert Feed & Event Detail Redesign Plan

> Date: 2026-03-17 | Author: Product Design Research | Status: Draft
> Context: Product Vision (`2026-03-14-product-vision.md`), Phase 3 Plan (`2026-03-15-phase3-productization-v2.md`)

---

## Industry Research Summary

### What the Best Financial Apps Do Right

**Robinhood** — Radical simplification. Card-based feed, green/red perceptual mapping for direction, mobile-first with micro-interactions. News items are scannable in <2 seconds: headline + ticker chip + time. Detail page leads with a chart, not text.

**Bloomberg Terminal** — "Conceal complexity" philosophy. High-density side-by-side panels for power users, but contextual alerts never interrupt workflow. News items have structured severity (URGENT / BREAKING / regular). Detail drills down with linked data panels.

**Unusual Whales** — Tag/badge classification system (SWEEP, BLOCK, Floor). Context-aware severity scaled by market cap. Left-column severity bar + timestamp + fill price + tag layout. Cards are dense but scannable because of consistent visual anchors.

**TradingView** — Chart-first card design in ideas feed. 34% improved data access from their 2024 UX redesign. Touch-friendly mobile with swipe interactions. Ideas show author credibility metrics inline.

**Benzinga Pro** — Persistent squawk icon for ambient awareness. Per-category custom sounds. Curated-not-firehose editorial approach. Real-time ticker scrolling with severity-colored backgrounds.

**The Fly** — Source confidence labels (Rumors vs. Confirmed vs. Periodicals). Visual-first scannable layout. Category-based filtering with sticky filter bar. Minimalist cards — no images, pure text density.

**Koyfin** — Linked color groups synchronize widgets. Drag-and-drop ticker-to-news filtering. Fully customizable widget grid. News pane shows source + time + headline in compressed rows.

**Seeking Alpha** — "Bulls Say / Bears Say" dual-perspective component. Clickable factor grades with progressive disclosure. 50+ customizable cards. Article detail has structured sections with anchor navigation.

### Top Patterns to Adopt

| Pattern | Source | Why |
|---------|--------|-----|
| Left-border severity bar (not full background) | Unusual Whales, Koyfin | Communicates urgency without overwhelming the feed |
| Bulls Say / Bears Say format | Seeking Alpha | Perfect for our AI analysis — shows both sides |
| Confidence labels (visual, not numeric) | The Fly, Bloomberg | "High Confidence" > "0.82 confidence score" |
| Slide-over detail panel (desktop) | Bloomberg, Koyfin | Preserves feed context while drilling down |
| Sparkline/mini-chart in card | TradingView, Robinhood | Lead with visual, not just text |
| Source credibility inline | TradingView, The Fly | Trust cue right where the decision happens |
| Sticky filter bar with presets | Benzinga Pro, The Fly | Fast context-switching without modal overhead |
| "Live Scanning" indicator | Benzinga Pro | Ambient awareness that system is working |

### Anti-Patterns to Avoid

- Full-background severity colors (Bloomberg Terminal legacy) — fatigues the eye
- Raw probability numbers without labels — "0.73" means nothing to a trader
- Wall-of-text AI analysis — needs structured sections
- Modal filter panels for simple operations — use inline filters
- Hiding the source or making provenance secondary — our differentiator
- Gamification (confetti, streaks) — undermines trust for serious traders

---

## Current Implementation Audit

### Feed Page (`Feed.tsx`) — Pain Points

1. **Information hierarchy is flat.** Severity bar, source, time, trust cue, confirmation count, watchlist button, and tickers all compete for attention on a single metadata row. Nothing is "loud."

2. **No direction indicator.** `AlertSummary.direction` (bullish/bearish/neutral) exists in the data but is NOT displayed in feed cards. This is the single most important piece of information for a trader scanning the feed.

3. **Trust cue is cryptic.** Source hit rate shown as a small percentage — traders don't know what "72% hit rate" means without context.

4. **No price context.** No sparkline, no current price, no move since event. Trader must click into detail to understand market impact.

5. **Watchlist tab hidden by default.** Only appears when user has items — should be the PRIMARY tab per product vision.

6. **Filter UX requires modal.** Opening a filter panel to change severity is too many taps for a real-time feed.

7. **Date headers are visually weak.** Sticky headers blend with card backgrounds.

8. **No real-time pulse.** No indicator that the system is actively scanning. "New alerts" pill appears but no ambient "live" signal.

### Alert Card (`AlertCard.tsx`) — Pain Points

1. **Title and summary have identical visual weight.** Both use `line-clamp-2` with similar styling. Title should dominate.

2. **No direction signal.** The most important field for quick scanning is missing entirely.

3. **Severity bar is too subtle.** 3px left border in a dark theme — easy to miss.

4. **Watchlist button is add-only** (known bug, TASK.md issue #1).

5. **"+N more" tickers not clickable** — breaks the pattern set by clickable ticker chips.

6. **No visual difference between confirmed and unconfirmed alerts.** Confirmation count is just a number in metadata.

### Event Detail (`EventDetail.tsx`) — Pain Points

1. **15 distinct sections with minimal progressive disclosure.** Only Risks, Provenance, and Disclaimer are collapsible. User must scroll through everything.

2. **No anchor navigation / table of contents.** On a long page with 15+ sections, no way to jump to what matters.

3. **AI analysis is a text blob.** Summary, impact, and reasoning are separate sections but all rendered as paragraphs. No structured "reasoning chain" presentation.

4. **Historical pattern is undersold.** This is the product's key differentiator but it's buried after 6 other sections. Stats use jargon ("Avg Alpha T+5") instead of plain language.

5. **No stock price/chart on the detail page.** `marketData` field exists in the type but is NEVER rendered. Trader has zero price context on the most important page.

6. **Market context section shows direction icons but no price data.** Ticker directions shown without actual numbers.

7. **Verification section is confusing.** Two data sources (scorecard vs. historical pattern) presented in a single grid with unclear labels ("Original signal label", "Direction verdict").

8. **Sticky feedback bar overlaps content on mobile.** Fixed at bottom, last section hidden behind it.

9. **"Similar events" shows title + move but no match quality indicator.** User doesn't know WHY these events are considered similar.

10. **Provenance is a collapsible afterthought.** CEO directive says provenance is "critical product differentiation" — it should be prominent, not hidden.

---

## A. Feed Card Redesign

### Design Philosophy

The card must answer three questions in 3 seconds:
1. **What happened?** (headline)
2. **Which way?** (direction + confidence)
3. **Should I click?** (severity + source credibility)

### New Card Layout — Standard Tier

```
┌─────────────────────────────────────────────────────────┐
│▌                                                        │
│▌  🔴 CRITICAL · SEC EDGAR · 2m ago        ✓ Confirmed  │
│▌  ──────────────────────────────────────────────────── │
│▌                                                        │
│▌  MRNA — FDA Grants Accelerated Approval for RSV Vaccine│
│▌                                                        │
│▌  ┌──────────┐  Moderna gets fast-track approval,      │
│▌  │ ▲ BULLISH │  expanding pipeline into $8B RSV market.│
│▌  │ High conf │  Stock oversold (RSI 22) at catalyst.   │
│▌  └──────────┘                                          │
│▌                                                        │
│▌  [MRNA ↑3.2%] [PFE] [+2]     72% source accuracy  ★  │
│▌                                                        │
└─────────────────────────────────────────────────────────┘
```

#### Visual Hierarchy (top to bottom)

**Row 1 — Signal metadata** (smallest text, 11px, `text-text-tertiary`)
- Severity label with color dot (CRITICAL/HIGH/MEDIUM/LOW)
- Source name
- Relative time
- Confirmation badge (only if `confirmationCount > 1`)

**Row 2 — Headline** (largest text, 17px, `text-text-primary`, `font-semibold`)
- Ticker symbol(s) — bold, separated by em-dash
- Event headline — plain language, max 2 lines

**Row 3 — Direction + Summary** (side by side layout)
- **Direction badge** (left, fixed width):
  - `▲ BULLISH` — green background (`bg-emerald-500/15 text-emerald-400`)
  - `▼ BEARISH` — red background (`bg-red-500/15 text-red-400`)
  - `● NEUTRAL` — gray background (`bg-zinc-500/15 text-zinc-400`)
  - Confidence label underneath: "High conf" / "Moderate" / "Speculative"
- **Summary text** (right, flexible width): 2-line clamp, plain language

**Row 4 — Footer** (11px, `text-text-tertiary`)
- Ticker chips (clickable, with inline price change if available)
- Source accuracy badge (right-aligned)
- Watchlist star toggle (right-aligned)

#### Left Severity Bar

Width increased from 3px to 4px. Colors:
- CRITICAL: `#f97316` (orange) — pulsing glow animation on first appearance
- HIGH: `#fb923c` (light orange)
- MEDIUM: `#facc15` (yellow)
- LOW: `#94a3b8` (slate) — no bar, just border

### Card Variations by Tier

#### Critical Tier — "Stop Everything" Card

```
┌─────────────────────────────────────────────────────────┐
│▌▌                                                       │
│▌▌ 🔴 CRITICAL · Breaking News · NOW        🔴 LIVE     │
│▌▌ ═══════════════════════════════════════════════════   │
│▌▌                                                       │
│▌▌ NVDA — Emergency Halt: SEC Announces Investigation    │
│▌▌                                                       │
│▌▌ ┌──────────┐  SEC has launched formal investigation   │
│▌▌ │ ▼ BEARISH │  into Nvidia's data center revenue      │
│▌▌ │ High conf │  reporting practices.                   │
│▌▌ └──────────┘                                          │
│▌▌                                                       │
│▌▌ ┌───────────────────────────────────────────────────┐ │
│▌▌ │  📊 Historical: SEC probes → avg -18% in 5 days  │ │
│▌▌ │  Win rate: 12/15 (80%) moved in predicted dir.   │ │
│▌▌ └───────────────────────────────────────────────────┘ │
│▌▌                                                       │
│▌▌ [NVDA ↓5.1%] [AMD] [INTC]    Source: 91% accuracy    │
│▌▌                                                       │
└─────────────────────────────────────────────────────────┘
```

Differences from standard:
- **Double-width severity bar** (8px) with pulse animation
- **"LIVE" badge** top-right, pulsing red dot
- **Historical preview row** — shows key stat inline (avg move + win rate)
- **Double border** or elevated background (`bg-bg-elevated`)
- Sound/vibration trigger on mobile (ties to push notification)

#### Low Tier — Compressed Card

```
┌─────────────────────────────────────────────────────────┐
│  ○ LOW · StockTwits · 45m ago                           │
│  AAPL — Unusual social volume spike (3.2x average)      │
│  ● Neutral · Speculative    [AAPL]    48% accuracy      │
└─────────────────────────────────────────────────────────┘
```

Differences:
- No severity bar
- Single line summary (no separate summary text)
- Compressed to ~3 rows
- No historical preview
- Muted colors throughout

### Direction Badge Design

The direction badge is the most important new element. It must be:
- **Immediately recognizable** — color + arrow + word
- **Not confused with advice** — it says "Catalyst favors upside/downside" not "BUY/SELL"
- **Sized appropriately** — prominent but not dominant over headline

```
 Bullish:           Bearish:           Neutral:
┌──────────┐       ┌──────────┐       ┌──────────┐
│ ▲ BULLISH │       │ ▼ BEARISH│       │ ● NEUTRAL│
│ High conf │       │ Moderate │       │ Speculat.│
└──────────┘       └──────────┘       └──────────┘

bg-emerald-500/15   bg-red-500/15      bg-zinc-500/15
text-emerald-400    text-red-400       text-zinc-400
border-emerald/20   border-red/20      border-zinc/20
```

### Confidence Display

Replace raw numbers with human-readable labels:

| Confidence Range | Label | Visual |
|-----------------|-------|--------|
| ≥ 0.80 | "High confidence" | Solid badge, full opacity |
| 0.60 – 0.79 | "Moderate" | Semi-transparent badge |
| < 0.60 | "Speculative" | Dashed border, low opacity |
| No data | "Unrated" | No badge shown |

### Interaction Design

- **Tap/click card body** → Navigate to EventDetail page
- **Tap ticker chip** → Navigate to TickerProfile
- **Tap star icon** → Toggle watchlist (add/remove)
- **Long press / right-click** → Context menu: "Share", "Dismiss", "Mute ticker"
- **Swipe left (mobile)** → Quick dismiss (mark as read)
- **Swipe right (mobile)** → Quick add to watchlist

---

## B. Event Detail Page Redesign

### Design Philosophy

The detail page is where the trader makes a decision. It must:
1. **Lead with the verdict** — direction + confidence + key stat
2. **Show the reasoning chain** — structured, not a wall of text
3. **Provide evidence** — chart, historical data, market context
4. **Build trust** — provenance, accuracy, transparency

### Layout — Mobile (Primary)

```
┌─────────────────────────────────────────┐
│  ← Back                    ⤴ Share  ★   │
├─────────────────────────────────────────┤
│                                         │
│  🔴 CRITICAL · SEC EDGAR · 2m ago       │
│                                         │
│  MRNA — FDA Grants Accelerated          │
│  Approval for RSV Vaccine               │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │    ▲ BULLISH · High Confidence      ││
│  │    "Catalyst favors upside"         ││
│  └─────────────────────────────────────┘│
│                                         │
├── ANCHOR NAV ───────────────────────────┤
│  [Summary] [History] [Context] [Trust]  │
├─────────────────────────────────────────┤
│                                         │
│  ── WHAT HAPPENED ──────────────────    │
│                                         │
│  FDA granted accelerated approval for   │
│  Moderna's RSV vaccine candidate,       │
│  mRNA-1345. This expands Moderna's      │
│  commercial pipeline beyond COVID-19    │
│  into the ~$8B RSV market.              │
│                                         │
│  ── WHY IT MATTERS NOW ─────────────    │
│                                         │
│  • Stock is oversold (RSI 22) after     │
│    28% decline over 3 weeks             │
│  • Addresses key bear thesis: "one-     │
│    product company" narrative            │
│  • RSV market is large, validated       │
│    (GSK's Arexvy doing $1.5B/yr)        │
│                                         │
│  ── BULL CASE vs BEAR CASE ─────────    │
│                                         │
│  ┌─────────────┬──────────────────────┐ │
│  │  ▲ Bull     │  ▼ Bear              │ │
│  ├─────────────┼──────────────────────┤ │
│  │ Pipeline    │ Competitive RSV      │ │
│  │ expansion   │ market (GSK, Pfizer) │ │
│  │ validates   │                      │ │
│  │ platform    │ Accelerated ≠ full   │ │
│  │             │ approval; conditions │ │
│  │ Oversold    │ may be attached      │ │
│  │ bounce +    │                      │ │
│  │ catalyst    │ mRNA manufacturing   │ │
│  │ = high-     │ cost concerns remain │ │
│  │ conviction  │                      │ │
│  │ setup       │                      │ │
│  └─────────────┴──────────────────────┘ │
│                                         │
│  ── KEY RISKS ──────────────────────    │
│                                         │
│  ⚠ Competitor readouts (GSK Phase 3)   │
│    could overshadow within 30 days      │
│  ⚠ Accelerated approval may carry      │
│    post-marketing requirements          │
│                                         │
│  ═══════════════════════════════════    │
│                                         │
│  ── STOCK CONTEXT ──────────────────    │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  MRNA · $85.20 · ↓28% (3wk)        ││
│  │  ┌─────────────────────────────────┐││
│  │  │         📈 Chart                │││
│  │  │     (candlestick, 3mo)          │││
│  │  │     with event marker ▼         │││
│  │  └─────────────────────────────────┘││
│  │  RSI: 22  │  Vol: 2.3x  │  52w: -41% │
│  └─────────────────────────────────────┘│
│                                         │
│  ── MARKET REGIME ──────────────────    │
│                                         │
│  Risk-off · VIX 22.4 · Biotech         │
│  showing relative strength (+1.2%)      │
│                                         │
│  ═══════════════════════════════════    │
│                                         │
│  ── WHAT HAPPENED BEFORE ───────────    │
│  (Historical Similar Events)            │
│                                         │
│  Based on 14 similar events:            │
│  "Oversold biotech + FDA catalyst"      │
│                                         │
│  ┌──────────┬──────────┬──────────┐     │
│  │ Avg Move │ Win Rate │ Median   │     │
│  │ +22.4%   │ 79%      │ +18.1%   │     │
│  │ (20 days)│ (11/14)  │ (20 days)│     │
│  └──────────┴──────────┴──────────┘     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Best:  VRTX +41% (Mar 2024)    │    │
│  │ Worst: BIIB -5%  (Sep 2023)    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Similar events:                        │
│  ┌─────────────────────────────────┐    │
│  │ VRTX — FDA Approval, CF drug   │    │
│  │ Mar 2024 · +41% in 20d         │    │
│  │ Match: 89% similar             │    │
│  ├─────────────────────────────────┤    │
│  │ GILD — FDA Accelerated, HIV    │    │
│  │ Nov 2023 · +28% in 20d         │    │
│  │ Match: 84% similar             │    │
│  ├─────────────────────────────────┤    │
│  │ BIIB — FDA Accel, Alzheimer's  │    │
│  │ Sep 2023 · -5% in 20d          │    │
│  │ Match: 76% similar             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Confidence: ███████░░░ High            │
│  (n=14, sufficient sample)              │
│                                         │
│  ═══════════════════════════════════    │
│                                         │
│  ── WHY YOU SHOULD TRUST THIS ──────    │
│  (Provenance & Verification)            │
│                                         │
│  Source Journey:                        │
│  ┌─────────────────────────────────┐    │
│  │ 📡 SEC EDGAR         10:32 AM  │    │
│  │  ↓                              │    │
│  │ 🔍 Rule Filter       10:32 AM  │    │
│  │    Matched: "fda_approval"      │    │
│  │  ↓                              │    │
│  │ 🤖 AI Judge          10:32 AM  │    │
│  │    Confidence: 0.94             │    │
│  │  ↓                              │    │
│  │ 📊 Enriched          10:33 AM  │    │
│  │    + market context             │    │
│  │    + 14 historical matches      │    │
│  │  ↓                              │    │
│  │ 📱 Delivered          10:33 AM │    │
│  │    Total: 48 seconds            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Source Accuracy: SEC EDGAR             │
│  ┌─────────────────────────────────┐    │
│  │ 90-day hit rate: 72%            │    │
│  │ Total alerts: 847               │    │
│  │ Avg T+5 move: +4.2%            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ✓ Also confirmed by:                  │
│  PR Newswire (1m later)                 │
│  Reuters (3m later)                     │
│                                         │
│  [View original filing →]               │
│                                         │
│  ═══════════════════════════════════    │
│                                         │
│  ── RELATED EVENTS ─────────────────    │
│                                         │
│  • MRNA — Earnings miss (3 wks ago)    │
│  • PFE — RSV vaccine data (1 mo ago)   │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Was this alert useful?                 │
│  [👍 Useful]  [👎 Not useful]  [🚫 Bad] │
│                                         │
└─────────────────────────────────────────┘
```

### Section Order & Rationale

The page is divided into three "zones" separated by thick dividers:

**Zone 1 — "The Verdict" (above first divider)**
1. Header (severity, source, time)
2. Headline + direction badge
3. What Happened (AI summary)
4. Why It Matters Now (AI analysis, bullet points)
5. Bull Case vs Bear Case (structured dual-column)
6. Key Risks

**Zone 2 — "The Evidence" (between dividers)**
7. Stock Context (price, chart, technicals)
8. Market Regime
9. Historical Similar Events (stats + examples)

**Zone 3 — "The Trust" (below second divider)**
10. Provenance (source journey timeline)
11. Source Accuracy
12. Confirmation badges
13. Related Events
14. Feedback bar

### Anchor Navigation

Sticky horizontal scroll nav below the header:
```
[Summary] [History] [Context] [Trust]
```

- Tapping scrolls to the corresponding zone
- Active section highlights as user scrolls
- On desktop: becomes a sidebar table of contents

### AI Analysis Presentation — "Reasoning Chain"

**Current problem:** AI analysis is rendered as paragraphs of text. Users skip it.

**New approach:** Structure as discrete, labeled sections with visual differentiation:

1. **"What Happened"** — 2-3 sentence factual summary. No opinion.
2. **"Why It Matters Now"** — Bullet points connecting event to current market state.
3. **"Bull Case vs Bear Case"** — Seeking Alpha-inspired dual column. Each side gets 3-4 bullet points.
4. **"Key Risks"** — Warning icon + short risk statements.

This requires modifying the LLM enrichment prompt to output structured sections rather than a single `summary` + `impact` pair.

### Historical Similar Events Display

**Current problem:** Stats use jargon ("Avg Alpha T+5"), similar events show no match quality.

**New approach:**

Stats grid uses plain language:
- "Avg Move" instead of "Avg Alpha T+5"
- "Win Rate" with fraction: "79% (11/14)"
- "Median Move" instead of raw percentile

Each similar event card shows:
- Ticker + headline
- Date + outcome ("↑41% in 20 days")
- **Match quality percentage** — "89% similar" — computed from event-type similarity, market regime similarity, technical setup similarity

Confidence bar:
```
Confidence: ███████░░░ High (n=14)
```
- n < 10: "Insufficient data" (grayed out, bar barely filled)
- n = 10-29: "Moderate" (yellow, bar half-filled)
- n ≥ 30: "High" (green, bar mostly filled)

### Stock Context Panel

**Currently missing entirely.** The `marketData` field in `EventDetailData` is never rendered.

New section:
- Ticker symbol + current price + change (1d / 5d / 20d)
- Candlestick chart (reuse existing `EventChart` component, embed inline)
- Event marker on chart showing when this event occurred
- Key technicals row: RSI | Volume ratio | 52-week range position

### Provenance — First-Class Section

**Currently:** Collapsible, hidden by default, buried at bottom.

**New:** "Why You Should Trust This" section with visual timeline showing the event's journey through the pipeline:

```
Source → Rule Filter → AI Judge → Enrichment → Delivery
```

Each step shows:
- Icon + name
- Timestamp
- Key decision (e.g., "Matched: fda_approval", "Confidence: 0.94")

Below the timeline: source accuracy stats and confirmation badges.

### Desktop Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Feed                              ⤴ Share    ★   │
├────────────────────────────────┬─────────────────────────────┤
│                                │                             │
│  MAIN CONTENT                  │  SIDEBAR                    │
│  (2/3 width)                   │  (1/3 width, sticky)        │
│                                │                             │
│  Header + Direction            │  STOCK CONTEXT              │
│  ─────────────────             │  MRNA · $85.20 · ↓28%      │
│  What Happened                 │  ┌───────────────────┐      │
│  Why It Matters Now            │  │   📈 Chart        │      │
│  Bull vs Bear                  │  └───────────────────┘      │
│  Key Risks                     │  RSI: 22 │ Vol: 2.3x       │
│  ───────────────               │                             │
│  Historical Events             │  MARKET REGIME              │
│  (stats + examples)            │  Risk-off · VIX 22.4       │
│  ───────────────               │                             │
│  Provenance                    │  QUICK ACTIONS              │
│  Related Events                │  [Add to watchlist]         │
│  Feedback                      │  [Share alert]              │
│                                │  [View original]            │
│                                │                             │
├────────────────────────────────┴─────────────────────────────┤
│  Feedback bar (not floating — inline at bottom)              │
└──────────────────────────────────────────────────────────────┘
```

Key desktop differences:
- **Sticky sidebar** with chart, technicals, and quick actions
- **Main content scrolls** independently
- **Feedback bar is inline** at bottom, not floating (no overlap)
- **Anchor nav becomes sidebar TOC** (optional, for very long pages)

---

## C. Feed Page Layout

### Header Redesign

```
┌─────────────────────────────────────────┐
│  EVENT RADAR              🔴 Live       │
├─────────────────────────────────────────┤
│  [My Watchlist]  [All Events]  [Search] │
├─────────────────────────────────────────┤
│  Filters: [Critical ✕] [SEC ✕] [+Add]  │
└─────────────────────────────────────────┘
```

#### Changes from Current

1. **"Live" indicator** — pulsing red dot in header, shows system is scanning. Communicates ambient awareness.

2. **Tab bar replaces mode toggle** — "My Watchlist" is the default active tab for authenticated users. "All Events" is secondary. Clearer than the current toggle.

3. **Inline filter chips** — Active filters shown as removable chips directly below tabs. No need to open a filter panel for common operations.

4. **"+Add" filter button** — Opens compact dropdown (not full modal) for adding severity, source, or ticker filters.

### Filter/Sort System

#### Inline Filters (always visible)
- Severity: chip toggles (Critical, High, Medium, Low)
- Active source filters shown as chips
- Ticker filter (type-ahead search)

#### Sort Options (dropdown)
- Latest first (default)
- Highest severity first
- Most confirmed first

#### Filter Presets
- "High Signal" — Critical + High severity only (current default)
- "SEC Only" — Source = SEC EDGAR
- "My Watchlist" — Tickers in user's watchlist
- "All" — No filters
- Save custom preset (stored in localStorage, synced to user prefs when auth available)

### Layout Options

**Primary: Timeline list** (current approach, refined)
- Best for real-time scanning
- Date section headers with counts
- Cards stack vertically

**Not recommended:**
- Card grid — doesn't work for scanning; cards have variable height
- Infinite scroll pagination — keep current approach (10-item pages, sentinel-based)

### Real-Time Update Indicators

```
┌─────────────────────────────────────────┐
│        ↑ 3 new alerts · Tap to load     │
└─────────────────────────────────────────┘
```

- **New alerts pill** — Already exists, keep but style more prominently
- **Count badge on tab** — "All Events (12)" shows unread count
- **Subtle card entrance animation** — New cards slide in from top with brief highlight
- **Sound option** — Settings toggle: play subtle chime on Critical alerts (off by default)

### Empty States

#### No alerts (filters too restrictive)
```
┌─────────────────────────────────────────┐
│                                         │
│         🔍 No alerts match              │
│                                         │
│    Your filters are hiding all alerts.  │
│    [Clear filters]  or  [Broaden]       │
│                                         │
└─────────────────────────────────────────┘
```

#### Empty watchlist
```
┌─────────────────────────────────────────┐
│                                         │
│         📋 Your watchlist is empty       │
│                                         │
│    Add tickers to see relevant alerts.  │
│                                         │
│    Popular right now:                   │
│    [NVDA +] [AAPL +] [TSLA +]          │
│    [MRNA +] [META +]                   │
│                                         │
│    [Browse all events →]                │
│                                         │
└─────────────────────────────────────────┘
```

#### System quiet (no recent events)
```
┌─────────────────────────────────────────┐
│                                         │
│         🔴 Live · Scanning              │
│                                         │
│    Markets are quiet. No new events     │
│    in the last 2 hours.                 │
│                                         │
│    Last alert: AAPL insider buy (2h ago)│
│                                         │
└─────────────────────────────────────────┘
```

### Mobile-Specific Layout

- **Bottom nav** — Keep existing 4-tab bottom nav (Feed, Watchlist, Search, Settings)
- **Pull-to-refresh** — Keep existing, add haptic feedback
- **Swipe gestures** — Left to dismiss, right to add to watchlist
- **Card tap target** — Entire card body navigates to detail (current behavior)
- **Filter chips** — Horizontally scrollable row below tabs
- **Landscape** — Not optimized (traders use portrait on mobile)

### Desktop-Specific Layout (≥1024px)

```
┌────────────────────────────────────────────────────────────┐
│  EVENT RADAR    [My Watchlist] [All Events]     🔴 Live    │
├────────────────────────────────────────────────────────────┤
│  Filters: [Critical ✕] [High ✕] [+Add]    Sort: Latest ▼ │
├─────────────────────────────────┬──────────────────────────┤
│                                 │                          │
│  FEED (scrollable)              │  DETAIL PANEL            │
│  ┌───────────────────────────┐  │  (slide-over, 50% width) │
│  │ Card 1                    │  │                          │
│  └───────────────────────────┘  │  Shows EventDetail       │
│  ┌───────────────────────────┐  │  without leaving feed    │
│  │ Card 2 (selected) ◀──────┤──│                          │
│  └───────────────────────────┘  │  Close: ✕ or Escape      │
│  ┌───────────────────────────┐  │  Expand: ↗ full page     │
│  │ Card 3                    │  │                          │
│  └───────────────────────────┘  │                          │
│                                 │                          │
└─────────────────────────────────┴──────────────────────────┘
```

Key desktop features:
- **Slide-over detail panel** — Click a card → detail appears in right panel without navigating away from feed. Inspired by Bloomberg/Koyfin.
- **Keyboard navigation** — `j`/`k` to move between cards, `Enter` to open detail, `Escape` to close panel
- **Feed stays scrollable** while detail is open
- **Full-page expand** button on detail panel for deep reading

---

## D. Implementation Work Packages

### Priority Matrix

| WP | Name | Impact | Effort | Priority |
|----|------|--------|--------|----------|
| D1 | Direction Badge + Confidence Labels | 🔴 Critical | 1 day | P0 |
| D2 | Feed Card Redesign | 🔴 Critical | 2-3 days | P0 |
| D3 | Event Detail Restructure | 🔴 Critical | 3-4 days | P0 |
| D4 | Stock Context Panel | 🟠 High | 2 days | P1 |
| D5 | Provenance Timeline | 🟠 High | 1.5 days | P1 |
| D6 | Feed Page Chrome | 🟡 Medium | 1.5 days | P2 |
| D7 | Desktop Split-Panel | 🟡 Medium | 2 days | P2 |
| D8 | Swipe Gestures + Mobile Polish | 🟢 Low | 1 day | P3 |

**Total estimated: 14-17 days** (single developer)

---

### WP-D1: Direction Badge + Confidence Labels
**Effort:** 1 day | **Dependencies:** None (data already exists in `AlertSummary.direction`)

#### Scope
- Create `DirectionBadge` component
  - Props: `direction: 'bullish' | 'bearish' | 'neutral'`, `confidence?: number`
  - Renders arrow + label + confidence tier label
  - Color-coded: green/red/gray
- Create `ConfidenceLabel` sub-component
  - Maps numeric confidence → "High confidence" / "Moderate" / "Speculative" / "Unrated"
- Integrate into `AlertCard.tsx` and `EventDetail.tsx`

#### Files to Create/Modify
- **Create:** `packages/web/src/components/DirectionBadge.tsx`
- **Modify:** `packages/web/src/components/AlertCard.tsx` — add direction badge to card layout
- **Modify:** `packages/web/src/pages/EventDetail.tsx` — add direction badge to header
- **Modify:** `packages/web/src/types/index.ts` — verify `direction` field in `AlertSummary`

#### Data Requirements
- `AlertSummary.direction` already exists (bullish/bearish/neutral)
- Confidence score: check if available in `enrichment` or `audit` data
  - If not available on summary: add `confidence?: number` to `AlertSummary` and populate from `enrichment.confidence` or `audit.llmJudge.confidence` in API response

---

### WP-D2: Feed Card Redesign
**Effort:** 2-3 days | **Dependencies:** WP-D1

#### Scope
- Restructure `AlertCard.tsx` layout to match new wireframe
- Four-row layout: metadata → headline → direction+summary → footer
- Severity bar width increase (3px → 4px)
- Card tier variations (Critical with historical preview, Low compressed)
- Fix watchlist toggle (if not already fixed per TASK.md)
- Ticker chips with inline price change (conditional on `marketData` availability)
- Confirmation badge ("✓ Confirmed by N sources")

#### Files to Modify
- **Major rewrite:** `packages/web/src/components/AlertCard.tsx`
- **Modify:** `packages/web/src/pages/Feed.tsx` — pass additional props to AlertCard
- **Modify:** `packages/web/src/index.css` — add severity bar pulse animation keyframes

#### Key Implementation Notes
- Direction badge imported from WP-D1
- Card tier logic: check `severity` field to determine which variant to render
- Critical cards: need `historicalPattern` preview data — may need API change to include abbreviated historical stats in `AlertSummary`
- Compressed low-tier cards: conditionally render fewer rows based on severity

#### API Changes Needed
- Add to `GET /api/v1/feed` response:
  - `direction` (already exists in data, may need explicit inclusion in API response)
  - `confidence` (from enrichment)
  - `historicalPreview?: { avgMove: number, winRate: number, sampleSize: number }` — abbreviated stats for critical-tier card preview

---

### WP-D3: Event Detail Page Restructure
**Effort:** 3-4 days | **Dependencies:** WP-D1

#### Scope
- Reorganize into three zones (Verdict / Evidence / Trust) with thick dividers
- Add anchor navigation (sticky horizontal scroll bar)
- Restructure AI analysis into labeled sections (What Happened, Why Now, Bull/Bear, Risks)
- Add "Bull Case vs Bear Case" dual-column component
- Improve historical events display (match quality %, plain language stats)
- Move provenance from collapsible-at-bottom to prominent section with visual timeline
- Fix sticky feedback bar overlap on mobile (make inline at bottom, not fixed)
- Desktop: sidebar layout with sticky chart panel

#### Files to Modify
- **Major rewrite:** `packages/web/src/pages/EventDetail.tsx`
- **Create:** `packages/web/src/components/BullBearPanel.tsx`
- **Create:** `packages/web/src/components/ProvenanceTimeline.tsx`
- **Create:** `packages/web/src/components/AnchorNav.tsx`
- **Create:** `packages/web/src/components/HistoricalStats.tsx`

#### Key Implementation Notes
- Anchor navigation: use `IntersectionObserver` to highlight active section as user scrolls
- Bull/Bear panel: requires LLM enrichment prompt change to output structured `bullCase[]` and `bearCase[]` arrays instead of single `impact` string. **This is a backend change.**
- Provenance timeline: read from existing `pipeline_audit` data (already available via API)
- Desktop sidebar: use CSS Grid with `position: sticky` on right column
- Feedback bar: change from `fixed bottom-0` to normal flow at page bottom

#### Backend Changes Needed
- **LLM enrichment prompt update:** Output structured sections:
  ```json
  {
    "whatHappened": "...",
    "whyItMattersNow": ["bullet 1", "bullet 2"],
    "bullCase": ["point 1", "point 2", "point 3"],
    "bearCase": ["point 1", "point 2", "point 3"],
    "keyRisks": ["risk 1", "risk 2"]
  }
  ```
- **Backward compatibility:** Frontend falls back to `summary` + `impact` if structured fields not present (for old events)
- **Similar events:** Add `matchQuality` percentage to historical match response

---

### WP-D4: Stock Context Panel
**Effort:** 2 days | **Dependencies:** Market data service (from Phase 3 plan)

#### Scope
- Create `StockContext` component for EventDetail page
- Display: ticker, current price, change (1d/5d/20d), RSI, volume ratio, 52w range
- Embed `EventChart` component inline (candlestick with event marker)
- On mobile: full-width section in main flow
- On desktop: sticky sidebar panel

#### Files to Create/Modify
- **Create:** `packages/web/src/components/StockContext.tsx`
- **Modify:** `packages/web/src/pages/EventDetail.tsx` — integrate StockContext
- **Modify:** `packages/web/src/components/EventChart.tsx` — support embed mode (smaller, no range selector)

#### Data Requirements
- Depends on `marketData` field in `EventDetailData` being populated by backend
- If market data service not yet built: show "Market data unavailable" placeholder
- Price change formatting: use existing `formatSignedPercent()` utility

#### Blocked By
- Market data provider + cache (WP from Phase 3 plan, not yet implemented)
- Can build the component shell with mock data, wire up when backend is ready

---

### WP-D5: Provenance Timeline
**Effort:** 1.5 days | **Dependencies:** None (data exists in `pipeline_audit`)

#### Scope
- Create `ProvenanceTimeline` component
  - Visual vertical timeline with icons per pipeline step
  - Each step: icon, name, timestamp, key decision/metric
  - Total processing time shown at bottom
- Source accuracy stats panel
- Confirmation sources list
- Replace current collapsible provenance section

#### Files to Create/Modify
- **Create:** `packages/web/src/components/ProvenanceTimeline.tsx`
- **Modify:** `packages/web/src/pages/EventDetail.tsx` — replace `Provenance` collapsible with timeline

#### Data Requirements
- `audit` field in `EventDetailData` already contains pipeline step data
- Source accuracy: already available via `getTrustCue()` pattern in Feed.tsx
- Confirmation: `confirmedSources` array in event data

---

### WP-D6: Feed Page Chrome
**Effort:** 1.5 days | **Dependencies:** None

#### Scope
- Add "Live" scanning indicator to header
- Redesign tab bar (My Watchlist / All Events)
- Inline filter chips (replace filter modal for common operations)
- Unread count badge on All Events tab
- Improved date section headers (bolder, with event count)
- Improved empty states (three variants: filtered-out, empty-watchlist, system-quiet)

#### Files to Modify
- **Modify:** `packages/web/src/pages/Feed.tsx` — header, tabs, filters, empty states
- **Create:** `packages/web/src/components/LiveIndicator.tsx`
- **Create:** `packages/web/src/components/FilterChips.tsx`

---

### WP-D7: Desktop Split-Panel
**Effort:** 2 days | **Dependencies:** WP-D2, WP-D3

#### Scope
- Feed page: click card → slide-over panel shows EventDetail on right side
- Panel takes 50% width, feed takes 50%
- Selected card highlighted in feed
- Close panel: click ✕ or press Escape
- Expand to full page: ↗ button
- Keyboard navigation: j/k to move between cards

#### Files to Modify
- **Modify:** `packages/web/src/pages/Feed.tsx` — add panel state, responsive layout
- **Create:** `packages/web/src/components/DetailPanel.tsx` — wrapper that renders EventDetail in panel mode
- **Modify:** `packages/web/src/pages/EventDetail.tsx` — accept `mode: 'page' | 'panel'` prop

#### Key Implementation Notes
- Only activate on screens ≥1024px
- Use CSS Grid: `grid-template-columns: 1fr 1fr` when panel is open
- Panel slides in from right with animation
- Feed scroll position preserved when panel opens/closes
- Keyboard shortcuts: add to existing keyboard shortcut system

---

### WP-D8: Swipe Gestures + Mobile Polish
**Effort:** 1 day | **Dependencies:** WP-D2

#### Scope
- Swipe left on card → dismiss (mark as read)
- Swipe right on card → add to watchlist
- Pull-to-refresh haptic feedback
- Card entrance animations for new alerts
- Severity bar pulse animation for critical alerts

#### Files to Modify
- **Modify:** `packages/web/src/components/AlertCard.tsx` — add touch gesture handlers
- **Modify:** `packages/web/src/index.css` — add animations

#### Key Implementation Notes
- Use touch events (`touchstart`, `touchmove`, `touchend`) — no external library needed
- Swipe threshold: 80px horizontal movement
- Visual feedback during swipe: card tilts and reveals action icon underneath
- Keep simple — this is polish, not core functionality

---

### Execution Order

```
Week 1:  WP-D1 (Direction) → WP-D2 (Card Redesign)
Week 2:  WP-D3 (Detail Restructure) + WP-D5 (Provenance) in parallel
Week 3:  WP-D6 (Feed Chrome) + WP-D4 (Stock Context — shell only)
Week 4:  WP-D7 (Desktop Split-Panel) + WP-D8 (Mobile Polish)
```

### Backend Changes Required (Summary)

These changes are prerequisites or co-requisites, not part of the frontend WPs:

1. **LLM enrichment prompt restructure** — Output `whatHappened`, `whyItMattersNow`, `bullCase[]`, `bearCase[]`, `keyRisks[]` instead of flat `summary` + `impact`
2. **Feed API: include `direction` and `confidence`** in `AlertSummary` response
3. **Feed API: add `historicalPreview`** for critical-tier cards
4. **Historical match API: add `matchQuality` percentage** to similar events
5. **Market data integration** — Populate `marketData` in EventDetail response (depends on Phase 3 market data service)

---

## Appendix: Color System Reference

```css
/* Direction */
--direction-bullish-bg:    rgba(16, 185, 129, 0.15);  /* emerald-500/15 */
--direction-bullish-text:  #34d399;                     /* emerald-400 */
--direction-bearish-bg:    rgba(239, 68, 68, 0.15);    /* red-500/15 */
--direction-bearish-text:  #f87171;                     /* red-400 */
--direction-neutral-bg:    rgba(113, 113, 122, 0.15);  /* zinc-500/15 */
--direction-neutral-text:  #a1a1aa;                     /* zinc-400 */

/* Severity (existing, kept) */
--severity-critical:  #f97316;
--severity-high:      #fb923c;
--severity-medium:    #facc15;
--severity-low:       #94a3b8;

/* Confidence */
--confidence-high:     #34d399;  /* emerald-400 */
--confidence-moderate: #facc15;  /* yellow-400 */
--confidence-low:      #a1a1aa;  /* zinc-400 */
```

## Appendix: Keyboard Shortcuts (Desktop)

| Key | Action |
|-----|--------|
| `j` / `↓` | Next card in feed |
| `k` / `↑` | Previous card in feed |
| `Enter` | Open detail panel |
| `Escape` | Close detail panel |
| `w` | Toggle watchlist for selected card |
| `f` | Focus filter search |
| `1` | Switch to "My Watchlist" tab |
| `2` | Switch to "All Events" tab |
| `?` | Show keyboard shortcuts help |
