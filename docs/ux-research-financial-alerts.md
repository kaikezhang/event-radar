# Financial Alert & News Feed UX Research

Comprehensive research into UX patterns across major financial alert/news platforms, with actionable recommendations for Event Radar.

---

## 1. Platform-by-Platform Analysis

### 1.1 Robinhood

**News Feed Structure**
- Algorithmic newsfeed surfaces stories relevant to stocks users hold or watch
- Ad-free content from Reuters, Barron's, WSJ, CNN Business
- Video content integrated inline (Cheddar, Reuters video)
- Robinhood Snacks newsletter embedded directly in-app

**Visual Hierarchy**
- Primary color: "bright jungle green" (distinct from typical stock-market greens)
- Minimal text — deliberate reduction to avoid overwhelming users
- Dark/night mode signals market open vs. closed status
- Green for gains/buy actions, red outlined for sell — reinforces "perceptual mapping"

**Feed-to-Detail Transition**
- Cards group share prices, recent news, and notifications
- Tapping a news card opens full article inline
- Stock ticker links from news items go to stock detail pages with charts + news tab

**Mobile Design**
- Mobile-first, touch-optimized
- Three distinct Buy/Sell/Options buttons replaced a single ambiguous Trade button
- "Odometer effect" micro-interaction shows real-time bid/ask price updates
- Confetti animations on first purchases (gamification)

**Key Weakness**: No custom date range on portfolio view. Limited drill-down for asset allocation.

**Takeaway for Event Radar**: Robinhood proves that radical simplification works. Their card-based news with algorithmic relevance filtering and inline video sets a high bar for consumer-grade financial feeds.

---

### 1.2 Bloomberg Terminal

**Design Philosophy**
- "Conceal complexity from the user" — thousands of functions across asset classes, but surfaced contextually
- Users are alerted in advance of UI changes with explanations of value and workflow impact
- Observational research drives design decisions

**Information Density**
- Side-by-side layout: live TV + news feeds + alerts + charts + messaging + market monitors
- Designed for color accessibility (published case study on terminal color accessibility)
- High information density is acceptable because users are professionals who scan known layouts

**Alert Integration**
- Bloomberg Television media player sits alongside news feeds and market data
- Alerts are persistent and contextual — they don't interrupt workflow

**Takeaway for Event Radar**: Bloomberg's approach of concealing complexity is critical. Event Radar should show simple alert cards by default but allow power users to drill into full analysis without leaving context. Pre-announcing UI changes is a trust-building pattern worth adopting.

---

### 1.3 Unusual Whales

**Alert Types & Structure**
Preset flow alert rules with distinct categories:
- **Sweeps Followed By Floor**: Series of sweep orders (min 10) followed by large floor trade (>$100K premium)
- **Repeated Hits**: Grouped trades within 100ms, >5 transactions, premium thresholds scaled by market cap ($10K small cap, $50K for >$50B, $100K for >$500B)
- **Repeated Hits Ascending/Descending Fill**: Direction-based variants
- **OTM Earnings Floor**: Floor trades within 14 days of earnings, >$250K premium
- **Low Historic Volume Floor**: Volume exceeds 3-day average, >$50K premium
- **Floor Trade Small/Mid Cap**: Market-cap-specific, >$100K premium or >1000 volume

**Alert Card Layout**
- Left column: Trade timestamps
- Middle columns: Fill prices and exchange info
- Right column: Trade tags ("SWEEP", "Floor") as classification badges
- Modular design — each alert type has consistent structure but different thresholds

**Filtering**
- Interval flow filters can be loaded into custom alerts
- Users build custom alert rules from existing filter presets

**Takeaway for Event Radar**: The tag/badge system for classifying alert types is highly effective. Event Radar should adopt typed badges (e.g., "SEC Filing", "Insider Trade", "Earnings", "Price Spike") with consistent color coding. The market-cap-aware thresholds are a smart pattern — context-aware severity.

---

### 1.4 TradingView

**Layout & Navigation**
- Multi-chart management with simplified layouts
- Hierarchical information architecture aligned with trading workflows (not technical structures)
- Streamlined alert system with reduced cognitive load

**Ideas Feed (Social)**
- Community-driven ideas feed where traders share annotated chart analysis
- Ideas include title, chart screenshot, written analysis, author profile, engagement metrics
- Feed is card-based with large chart thumbnails as primary visual element

**Visual System**
- Consistent, scalable visual identity supporting data-heavy environments
- Typography and color systems balance precision and accessibility
- Clean, modern aesthetic despite high information density

**Mobile**
- Touch-friendly layouts adapted from desktop
- Quick market monitoring without sacrificing clarity
- Key pain point: paper trading feature was buried in menus, not visually surfaced

**Performance Impact**: Design improvements yielded 34% better real-time data access and 26% increased trader efficiency.

**Takeaway for Event Radar**: TradingView's ideas feed proves that chart-heavy, visually rich cards drive engagement. Event Radar's AI analysis cards should lead with a visual element (chart, heatmap, or sparkline) rather than text-only summaries.

---

### 1.5 Benzinga Pro

**Real-Time Feed Design**
- "Modern and clean" interface with real-time news feed
- Customizable filters by source type, market metrics, geography, content type
- React + Redux architecture for "lightning-fast" feed updates

**Squawk System**
- Audio Squawk broadcasts 6 AM - 6 PM EST (market hours only)
- Squawk icon stays persistently visible — does not require navigating away
- Two tiers: Squawk Equity (full day) and High Beta Squawk (market hours, add-on)
- Only "critical market-moving breaking news" is broadcast — curated, not firehose

**Alert Customization**
- Custom sound alerts per news type
- Desktop notifications (browser pop-ups)
- Email notifications when away from station
- Users can assign specific tones to different alert categories

**Takeaway for Event Radar**: The persistent Squawk icon pattern is excellent — a non-intrusive "ambient awareness" indicator. Event Radar should consider a persistent status indicator showing live scan activity. Per-category custom sounds is a power-user feature worth noting for future iterations.

---

### 1.6 The Fly (thefly.com)

**Feed Structure**
- Breaking News page is the homepage and core feature
- Visual-first presentation compared to competitors' "big wall of text"
- Scannable layout prioritized over text-heavy design

**Content Categories**
- Primary: Market Stories, Street Research, Events
- Secondary: Hot Stocks, General News, Earnings, Technical Analysis, Options
- Specialized: Rumors, Periodicals, Syndicate (IPOs/secondaries)

**Alert Type Classification**
- **Rumors**: Unconfirmed market chatter from trading desks/social media
- **Periodicals**: Mainstream media headlines (not endorsed)
- **Syndicate**: Financial transactions (IPOs, secondary offerings)
- Clear labeling distinguishes confirmed vs. unconfirmed information

**Custom Portfolios**: Up to 12 portfolios with 150 stocks each, instant alerts filtered by portfolio, story type, or ticker.

**Weakness**: Noted as "sluggish" with slow page loads and search performance.

**Takeaway for Event Radar**: The Fly's distinction between confirmed and unconfirmed information (Rumors vs. verified) is crucial for trust. Event Radar should clearly label AI-generated analysis confidence levels and distinguish between confirmed events and speculative signals.

---

### 1.7 Koyfin

**Dashboard Architecture**
- Fully customizable widget-based dashboards
- Widgets are resizable and draggable
- One-click to add new elements

**Linked Color Groups (Innovative Pattern)**
- 7 color groups available for widget linking
- Assign a color group to any dashboard component via upper-left corner click
- All widgets in the same color group synchronize: selecting a stock in one widget updates all linked widgets
- Default: new widgets assigned to blue group
- News widget can be linked to watchlist/chart widgets for synchronized context

**News Integration**
- Custom News Screens with topic tuning
- Watchlist News: news/filings/transcripts filtered to your watchlist
- Drag-and-drop tickers from watchlists to news widgets for instant filtering

**Takeaway for Event Radar**: Koyfin's linked color groups pattern is the most innovative widget interaction model in this research. If Event Radar builds a dashboard view, linked contexts (selecting a ticker updates all panels) is a must-have. The drag-and-drop ticker-to-news filtering is also excellent.

---

### 1.8 Seeking Alpha

**Symbol Summary Page Structure**
- Opens with ratings snapshot: Quant, SA Analyst, Sell-Side Analyst ratings
- Quant Rating with 5 factor grades: Value, Growth, Profitability, Momentum, EPS Revisions
- Each factor grade is clickable, expanding to show 100+ underlying metrics
- "Bulls Say / Bears Say" component for quick decision-making
- Peer comparison: 6-stock side-by-side Key Stats Comparison

**News Feed Design**
- Premium News Feed includes "Notable Calls" — curated stock picks from external sources
- Dedicated news editors team for editorial curation
- Over 50 customizable cards for home page layout
- Article search with filtering by: ratings, news, analysis, earnings transcripts, press releases

**Navigation**
- Ticker symbols everywhere are clickable, leading to symbol summary pages
- Symbol pages are primary research entry points

**Takeaway for Event Radar**: The "Bulls Say / Bears Say" pattern is directly applicable to Event Radar's AI analysis. Present bullish and bearish arguments side by side for each detected event. The clickable factor grades with progressive disclosure is an excellent drill-down pattern.

---

## 2. Cross-Platform Design Patterns

### 2.1 Alert/News Item Structure (Common Pattern)

Most platforms structure alert items with these elements in this visual order:

1. **Timestamp** (small, muted, top-right or top-left)
2. **Category Badge/Tag** (colored pill: "Earnings", "SEC Filing", "Insider Trade")
3. **Headline/Title** (bold, largest text, primary scan target)
4. **Ticker Symbol(s)** (clickable, monospace or pill-styled)
5. **Summary/Preview** (1-2 lines, muted color)
6. **Sentiment Indicator** (green/red arrow, bullish/bearish badge, or AI score)
7. **Action Buttons** (bookmark, share, expand, add to watchlist)

### 2.2 Visual Hierarchy Consensus

| Priority | Element | Treatment |
|----------|---------|-----------|
| 1st | Headline | Bold, 16-18px, high contrast |
| 2nd | Ticker symbol | Pill/badge, clickable, brand color |
| 3rd | Sentiment/severity | Color-coded (green/red/amber) |
| 4th | Category tag | Small colored badge |
| 5th | Summary text | Regular weight, muted |
| 6th | Timestamp | Smallest, most muted |
| 7th | Actions | Icon-only, revealed on hover (desktop) or always visible (mobile) |

### 2.3 Severity/Importance Communication

**Color Patterns (Industry Standard)**
- Green: Bullish / positive / confirming
- Red: Bearish / negative / warning
- Blue: Informational / neutral
- Amber/Orange: Caution / mixed signals
- Gray: Low importance / stale

**Beyond Color (Accessibility)**
- Directional arrows (up/down triangles)
- Size scaling (larger cards for higher importance)
- Position (most important = top of feed)
- Badge intensity (filled vs. outlined badges)
- Animation (subtle pulse for breaking/urgent alerts)
- Texture/patterns for colorblind support (hashes, dotted lines)

### 2.4 Layout Patterns

| Pattern | Used By | Best For |
|---------|---------|----------|
| **Card Feed** | Robinhood, TradingView Ideas, Seeking Alpha | Rich content with images/charts |
| **Dense List** | Bloomberg, Benzinga Pro, The Fly | High-frequency scanning, professional use |
| **Timeline** | Unusual Whales flow | Chronological event sequences |
| **Widget Grid** | Koyfin, Bloomberg | Customizable dashboards |

**Recommendation for Event Radar**: Use a **Card Feed as primary** with an optional **Dense List toggle** for power users. The card should expand inline or slide-over to detail view.

### 2.5 Feed-to-Detail Transitions

| Pattern | Platform | Pros | Cons |
|---------|----------|------|------|
| **Inline Expand** | Robinhood | No context loss | Limited space for detail |
| **Slide-Over Panel** | Bloomberg, Koyfin | Maintains feed context | Split attention |
| **Full Page** | Seeking Alpha | Maximum detail space | Loses feed context |
| **Drawer** | Dashboard pattern | Flexible, preservable context | Can feel cramped |

**Recommendation for Event Radar**: **Slide-over panel** on desktop (keeps feed visible), **full page push** on mobile. The detail view should include: full AI analysis, historical precedent chart, related events timeline, and action buttons.

### 2.6 Mobile vs. Desktop Differences

| Aspect | Desktop | Mobile |
|--------|---------|--------|
| Feed density | 3-5 visible items | 2-3 visible items |
| Actions | Hover-reveal | Always visible (icons) |
| Detail view | Side panel / split view | Full page push |
| Filters | Sidebar or toolbar | Bottom sheet or modal |
| Charts | Full interactive | Simplified sparklines |
| Navigation | Tab bar + sidebar | Bottom tab bar |

---

## 3. Innovative Patterns Worth Adopting

### 3.1 Koyfin's Linked Color Groups
Widgets assigned to the same color group synchronize context. Selecting AAPL in a watchlist updates the chart widget, news widget, and fundamentals widget simultaneously. This is the most powerful pattern for a multi-panel analysis view.

### 3.2 Seeking Alpha's Bulls Say / Bears Say
Side-by-side bullish and bearish arguments for any stock. Directly applicable to Event Radar's AI analysis output — present both sides of every detected event.

### 3.3 Unusual Whales' Context-Aware Thresholds
Alert severity thresholds scale by market cap. A $50K options trade on a $2B company is significant; on Apple, it's noise. Event Radar should apply similar context-aware significance scoring.

### 3.4 Robinhood's Market State Indicators
Dark/night mode shift indicates market open vs. closed. Subtle but effective ambient information. Event Radar could use similar ambient indicators for scan status (active scanning, market closed, data delayed).

### 3.5 Benzinga's Persistent Audio Squawk Icon
A non-intrusive persistent indicator of live information flow. Event Radar could show a persistent "Live Scanning" indicator with event count badge.

### 3.6 The Fly's Source Confidence Labels
Distinguishing Rumors vs. Confirmed vs. Periodicals helps users calibrate trust. Event Radar should label AI confidence levels explicitly: "High Confidence", "Moderate", "Speculative".

### 3.7 TradingView's Chart-First Cards
Ideas feed leads with chart thumbnails, not text. For Event Radar, leading with a sparkline or mini-chart showing the price movement around the detected event would increase scan speed.

### 3.8 Seeking Alpha's Factor Grades with Progressive Disclosure
Five clickable grades that expand to show 100+ metrics. Perfect pattern for Event Radar's historical analysis — show a summary score that expands to reveal the underlying analysis.

---

## 4. Actionable Recommendations for Event Radar

### 4.1 Alert Card Design

```
+----------------------------------------------------------+
| [BADGE: SEC Filing]  [TICKER: AAPL]        2 min ago     |
|                                                          |
| **Insider Sale: CEO Tim Cook sold 200K shares**          |
|                                                          |
| First CEO sale in 18 months. Historical analysis shows   |
| similar sales preceded -3.2% avg drawdown over 5 days.   |
|                                                          |
| [====== BEARISH 72% ======]                              |
|                                                          |
| [Sparkline chart showing price context]                  |
|                                                          |
| [Bookmark]  [Watchlist +/-]  [Share]  [Deep Dive ->]     |
+----------------------------------------------------------+
```

Key elements:
- Category badge (colored) top-left
- Ticker pill (clickable) next to badge
- Relative timestamp top-right
- Bold headline as primary scan target
- 2-line AI summary
- Sentiment bar with percentage (green/red gradient)
- Inline sparkline for price context
- Action row at bottom

### 4.2 Severity Tiers (Visual Treatment)

| Tier | Visual Treatment | Example |
|------|-----------------|---------|
| **Critical** | Red left border, larger card, subtle pulse animation | SEC halt, massive insider dump |
| **High** | Orange left border, normal size | Significant insider activity, earnings miss |
| **Medium** | Blue left border, normal size | Routine filings, analyst changes |
| **Low** | Gray left border, compact size | Minor amendments, routine updates |

Use left-border color (not full background) to communicate severity without overwhelming the feed.

### 4.3 Feed Layout

- Default: Card feed with severity-based sizing
- Toggle: Dense list mode for power users (one-line per alert)
- Filter bar: Category pills (All | SEC | Insider | Earnings | Price | Custom)
- Sort: Latest first (default), Severity first (option)

### 4.4 Detail View

**Desktop**: Slide-over panel (60% width) from right side
**Mobile**: Full page push with back gesture

Detail view sections:
1. Event header (type, ticker, timestamp, severity badge)
2. AI Analysis summary (Bulls Say / Bears Say format)
3. Historical precedent chart (similar events plotted on timeline)
4. Key metrics table (progressive disclosure — summary scores click to expand)
5. Related events timeline
6. Raw source link / filing link
7. Action bar (add to watchlist, set follow-up alert, share)

### 4.5 Color System

| Semantic | Color | Usage |
|----------|-------|-------|
| Bullish | `#22C55E` (green-500) | Positive signals, gains |
| Bearish | `#EF4444` (red-500) | Negative signals, losses |
| Neutral | `#3B82F6` (blue-500) | Informational, no sentiment |
| Caution | `#F59E0B` (amber-500) | Mixed signals, watch closely |
| Muted | `#6B7280` (gray-500) | Low priority, stale data |

Always pair color with a secondary indicator (arrow, text label, icon) for accessibility.

### 4.6 Real-Time Feed Behavior

- New alerts slide in from top with subtle animation
- Unread indicator (blue dot) on unseen items
- "X new alerts" banner when scrolled down (like Twitter's "new tweets" pattern)
- Persistent "Live" indicator with pulse animation when scans are active
- Sound toggle for high-severity alerts (per Benzinga pattern)

---

## 5. Anti-Patterns to Avoid

1. **Wall of text** (The Fly criticism of competitors) — always use visual hierarchy
2. **Buried features** (TradingView mobile paper trading) — critical actions must be surfaced
3. **Ambiguous actions** (old Robinhood single Trade button) — every button should have one clear meaning
4. **Color-only severity** — always pair with shape/text for colorblind users
5. **Sluggish performance** (The Fly criticism) — real-time feeds must feel instant
6. **Firehose without filtering** — always provide category and severity filters
7. **No confidence labeling** — AI analysis must show confidence levels, not just conclusions

---

## Sources

- [Robinhood UX Design Analysis - Pratt IXD](https://ixd.prattsi.org/2025/02/design-critique-robinhood-ios-app/)
- [Robinhood Redesigned Newsfeed - Apptunix](https://www.apptunix.com/blog/robinhood-app-newsfeed-redesigned/)
- [Robinhood Newsfeed Announcement](https://robinhood.com/us/en/newsroom/from-news-to-newsfeed/)
- [Bloomberg Terminal UX - Concealing Complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)
- [Bloomberg Terminal Color Accessibility](https://www.bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility/)
- [Unusual Whales - Breaking Down Flow Alerts](https://unusualwhales.com/information/breaking-down-flow-alerts)
- [Unusual Whales Platform Features](https://unusualwhales.com/features)
- [TradingView UX Case Study - RON Design Lab](https://rondesignlab.com/cases/tradingview-platform-for-traders)
- [TradingView Mobile UX Case Study](https://medium.com/@kanishk.chauhan.fs09/redesigning-paper-trading-on-tradingview-mobile-a-ux-case-study-7de86f3893c7)
- [Benzinga Pro News Data Analysis - LuxAlgo](https://www.luxalgo.com/blog/benzinga-pro-news-data-analysis/)
- [Benzinga Pro Squawk Feature](https://www.benzinga.com/pro/feature/squawk)
- [TheFly.com Review - DayTradeReview](https://daytradereview.com/thefly-com-news-trading-review/)
- [Koyfin Dashboard Groups](https://www.koyfin.com/help/my-dashboards-groups/)
- [Koyfin Custom Dashboards](https://www.koyfin.com/features/custom-dashboards/)
- [Seeking Alpha Symbol Summary Pages](https://help.seekingalpha.com/premium/how-to-assess-any-stock-using-premium-features-on-symbol-summary-pages)
- [Seeking Alpha Premium News Feed](https://help.seekingalpha.com/premium/what-is-the-premium-news-feed-and-how-can-i-use-it)
- [Fintech Design Guide 2026 - Eleken](https://www.eleken.co/blog-posts/modern-fintech-design-guide)
- [Dashboard UX Patterns - Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)
- [Best Trading Platform Designs 2026 - Merge.rocks](https://merge.rocks/blog/the-10-best-trading-platform-design-examples-in-2024)
- [UX Behind Financial Data Visualization - Think Design](https://medium.com/@marketingtd64/the-ux-behind-financial-data-visualization-tools-fb19548b8704)
- [Fintech UX Design Trends 2025 - Design Studio](https://www.designstudiouiux.com/blog/fintech-ux-design-trends/)
- [Notification Design Guide - Toptal](https://www.toptal.com/designers/ux/notification-design)
- [Status Indicator Pattern - Carbon Design System](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
