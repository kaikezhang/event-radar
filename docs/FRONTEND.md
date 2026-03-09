# Frontend Dashboard

## Design Philosophy

**Bloomberg Terminal meets modern web.** Dark theme, information-dense, zero wasted space. Every pixel earns its place.

The dashboard is a **single-page application** with draggable, resizable panels. Users customize their layout — some want a massive event feed, others want charts front and center.

Reference: [OpenStock](REFERENCES.md#openstock) for Next.js + shadcn/ui patterns.

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  🛰️ EVENT RADAR        [🔴 LIVE]    [🔍 Search]  [⚙️ Settings]     │
├─────────────────┬──────────────────────────┬────────────────────────┤
│                 │                          │                        │
│  📡 LIVE FEED   │  📋 EVENT DETAIL         │  📈 CHART              │
│                 │                          │                        │
│  Scrolling list │  Expanded view of        │  TradingView           │
│  of events,     │  selected event:         │  Lightweight Charts    │
│  color-coded    │                          │  with event markers    │
│  by severity.   │  - Full classification   │                        │
│                 │  - Source + original link │  Click event in feed   │
│  Click to       │  - AI reasoning          │  → chart auto-loads    │
│  expand →       │  - Historical comparisons│  that ticker with      │
│                 │  - Price at detection     │  event annotations     │
│                 │  - Action buttons         │                        │
│                 │                          │                        │
├─────────────────┴──────────────────────────┴────────────────────────┤
│  📊 ANALYTICS BAR                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │Events/hr │ │ Hit Rate │ │ By Type  │ │ By Tier  │ │ Heatmap  │ │
│  │ ▁▂▅█▃▂  │ │   67%    │ │ 🥧 pie  │ │ ▇▅▃▂▁▁ │ │ sectors  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  🏥 HEALTH  SEC ✅ 4s  Trump ✅ 12s  X ✅ 28s  FDA ⚠️ 3m  Uptime: 99.8% │
└─────────────────────────────────────────────────────────────────────┘
```

## Panel Details

### 1. Live Event Feed

The heartbeat of the dashboard. New events slide in from the top with a subtle animation.

**Each event card shows:**
- 🔴/🟡/🟢/⚪ Severity indicator
- Source icon (SEC shield, Trump avatar, X logo, etc.)
- Ticker badge(s)
- One-line headline
- Direction arrow (↗️ bullish / ↘️ bearish / ↔️ neutral)
- Time since detection ("12s ago", "3m ago")
- Confidence score (if AI-classified)

**Filtering:**
- By tier (checkboxes: T1 T2 T3 T4 T5 T6)
- By severity (CRITICAL / HIGH / MEDIUM / LOW)
- By event type (dropdown: restructuring, insider, tariff, FDA, ...)
- By ticker (search box)
- By direction (bullish / bearish / all)

**Behavior:**
- Auto-scrolls when new events arrive (unless user is scrolling up)
- Sound alert on CRITICAL events (configurable)
- Desktop notification on HIGH+ events

### 2. Event Detail Panel

Expands when clicking an event in the feed.

**Sections:**
- **Header**: Ticker, event type, severity badge, direction, confidence
- **Source**: Original source link, filed/posted timestamp, detection latency
- **AI Analysis**: Classification reasoning, key phrases extracted
- **Historical**: Table of similar past events with outcomes (% move at T+1d, T+1w)
- **Correlation**: Related events from other sources (if multi-signal)
- **Actions**:
  - 📄 View Original (opens SEC filing / Truth Social post / etc.)
  - 📊 Full Analysis (triggers stock-analyst integration, if configured)
  - 🔔 Watch Ticker (add to alert list)
  - 📌 Pin Event (stays at top of feed)

### 3. Chart Panel

Professional price chart with event overlay.

**Features:**
- TradingView Lightweight Charts (candlestick)
- **Event markers** on the chart: triangles at the time of each event
  - 🟢 Bullish events (upward triangle)
  - 🔴 Bearish events (downward triangle)
  - 🟡 Neutral (diamond)
- Click marker → jumps to event detail
- Time range selector (1D, 1W, 1M, 3M, 1Y)
- Volume bars
- Optional overlay: RSI, MACD, moving averages

### 4. Analytics Bar

Compact row of mini-charts providing system-wide intelligence.

- **Events/Hour**: Sparkline of event volume (helps detect "quiet" vs "busy" markets)
- **Hit Rate**: Historical accuracy of direction signals (from backtesting)
- **By Type**: Pie chart of event types in last 24h
- **By Tier**: Bar chart of events per tier
- **Sector Heatmap**: Which sectors are seeing the most events

### 5. Health Bar

Always visible at the bottom. At-a-glance system status.

- Per-scanner status: ✅ healthy, ⚠️ degraded (>2x normal latency), ❌ offline
- Last successful poll time for each scanner
- Click to expand → embedded Grafana dashboard

## Interactions & UX

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `J` / `K` | Navigate events up/down |
| `Enter` | Expand selected event |
| `Esc` | Close detail panel |
| `F` | Focus filter bar |
| `/` | Search ticker |
| `A` | Run analysis on selected event's ticker |
| `M` | Mute/unmute sound alerts |
| `1-6` | Toggle tier visibility |

### Responsive Design

- **Desktop (>1280px)**: Full 3-column layout as shown above
- **Tablet (768-1280px)**: 2 columns (feed + detail), chart in tab
- **Mobile (<768px)**: Single column feed, swipe for detail/chart

### Theme

- **Default**: Dark mode (pure black background, #0a0a0a)
- Green for bullish, red for bearish, amber for alerts, blue for neutral
- Monospace font for numbers/prices
- System font for text

### PWA Support

Installable as a Progressive Web App:
- Add to home screen on mobile
- Push notifications even when browser is closed
- Offline access to cached event history

## Tech Stack (Frontend-Specific)

| Component | Library | Notes |
|-----------|---------|-------|
| Framework | Next.js 15 (App Router) | RSC + API routes |
| Styling | Tailwind CSS | Utility-first, dark theme |
| Components | shadcn/ui | Accessible, customizable |
| Data Grid | AG Grid (Community or Enterprise) | Virtual scrolling, streaming updates |
| Charts | TradingView Lightweight Charts | OHLC + markers |
| Analytics Charts | Recharts or AG Charts | Pie, bar, sparkline |
| Layout | react-grid-layout | Draggable, resizable panels |
| State | Zustand | Lightweight, works with streaming |
| Real-time | Socket.io client | WebSocket with fallback |
| Notifications | Web Push API | Browser-native push |

---

*See [Architecture](ARCHITECTURE.md) for how the frontend connects to the backend.*
