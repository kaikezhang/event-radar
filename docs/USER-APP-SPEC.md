# Event Radar — User App Spec (V1)

> Consolidated from PM + UX design reviews. This is the implementation spec.

## Product Positioning

**One line**: AI stock market radar — catch market-moving events before mainstream media, with historical context that tells you what happened last time.

**Target user**: Active retail traders who currently rely on Twitter/X, Discord, and StockTwits. They want speed + context, can't afford Bloomberg ($24k/yr), tired of noise.

**Differentiator**: Speed + AI enrichment + historical pattern matching in one card. No competitor does all three.

**Not**: A trading platform, a Bloomberg replacement, or a charting tool.

---

## Business Model — Freemium

| | Free | Pro ($15/mo) |
|--|------|-------------|
| Feed | 15-min delayed | Real-time |
| AI analysis | Summary only | Full (impact + action + historical) |
| Historical patterns | Match count only | Full stats + similar events |
| Watchlist | 5 tickers | Unlimited |
| Push notifications | Critical only | All severity levels |
| Sources | Gov + news | All (social, options flow) |

---

## Pages & Navigation

### Sitemap
```
/                        → Alert Feed (public, delayed; real-time if logged in + Pro)
/event/:id               → Alert Detail
/ticker/:symbol          → Ticker Profile (event history for that ticker)
/watchlist               → Watchlist management + Saved alerts
/search                  → Search (V1.5, not MVP)
/settings                → Account + Notification prefs
/login                   → Login
/register                → Register
/onboarding              → First-run flow (ticker picker → push permission)
```

### Bottom Nav (4 tabs)
```
[ 🏠 Feed ]  [ 👁 Watchlist ]  [ 🔍 Search ]  [ ⚙️ Settings ]
```

Search tab shows "Coming Soon" in MVP. Keeps the nav stable for future.

---

## Core Features (MVP)

### 1. 📱 Alert Feed (Home)

**Public access**: Feed is browsable without login. Events delayed 15 min. Banner at top: "Sign up for real-time alerts →"

**Card design (compact, 3 lines)**:
```
┌────────────────────────────────────┐
│🔴 CRITICAL · SEC Filing  $NVDA  2m│
│   NVDA 10-K Shows Revenue Decline  │
│   Revenue dropped 12% YoY in...    │
└────────────────────────────────────┘
```

- 3px left severity bar (color + pattern for a11y)
- Line 1: severity label + source badge + ticker chip(s) + relative time
- Line 2: title (bold)
- Line 3: AI summary truncated to 1 line with ellipsis
- Tap → navigate to `/event/:id`
- ~5-6 cards visible per viewport on 375px

**Severity indicators (accessible)**:
| Level | Color | Icon | Bar Style |
|-------|-------|------|-----------|
| CRITICAL | Red #EF4444 | ⚠ | Solid 3px |
| HIGH | Orange #F97316 | ▲ | Dashed 3px |
| MEDIUM | Yellow #EAB308 | ● | Dotted 3px |
| LOW | Gray #6B7280 | ▽ | Thin 1px |

Always show text label + icon alongside color. Never color-only.

**New events**: "3 new alerts" sticky pill at top. Tap to load. No auto-insertion (prevents layout shift).

**Pull-to-refresh**: Standard pattern. Show existing cards during refresh.

**Swipe gestures**:
- Swipe right → ⭐ Save/Bookmark
- Swipe left → ✓ Mark as read / Dismiss

**Scroll position**: MUST restore on back navigation.

**Filters**: Bottom sheet with severity / source pills. Tap filter icon in header.

### 2. 🔔 Alert Detail (`/event/:id`)

Scroll order: AI Analysis → Historical → Source → Feedback

```
┌─────────────────────────────────────┐
│ ← Back                    ⭐ 🔗     │  sticky header
├─────────────────────────────────────┤
│ 🔴 CRITICAL                        │  action badge
│                                     │
│ NVDA 10-K Annual Filing Shows       │
│ Revenue Decline                     │
│ SEC Filing · $NVDA $AMD · 2m ago    │  metadata
├─────────────────────────────────────┤
│                                     │
│ Summary                             │
│ NVIDIA's annual filing reveals a    │
│ 12% year-over-year revenue...       │
│                                     │
│ Market Context                      │  ← NOT "Market Impact" or "Action"
│ ▼ $NVDA  Bearish context            │     (avoid investment advice framing)
│ ▼ $AMD   Related exposure           │
│ ▲ $INTC  Potential beneficiary      │
│                                     │
├─────────────────────────────────────┤
│ Historical Pattern     87% match    │  ← Pro only (Free: match count only)
│ ┌─────────────────────────────────┐ │
│ │ 23 similar events found         │ │
│ │ Avg move T+5:  -3.2%           │ │
│ │ Avg move T+20: -1.8%           │ │
│ │ Win rate: 74%                   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Similar Events (top 3)              │
│ ┌ INTC 10-K Rev Decline  2024-01 ┐ │
│ ┌ AMD Q3 Miss             2023-09 ┐ │
│ ┌ NVDA Export Ban         2023-03 ┐ │
│   Show all 23 →                     │
├─────────────────────────────────────┤
│ 📄 View original source →          │
├─────────────────────────────────────┤
│ Was this useful?                    │
│    👍  Yes      👎  No              │
├─────────────────────────────────────┤
│ ⚖️ Not investment advice.          │
│ Historical patterns are not         │
│ predictions of future results.      │
└─────────────────────────────────────┘
```

Sections are NOT collapsed by default. "Similar Events" shows top 3 + "Show all N →" expansion.

**Legal**: Every detail page shows disclaimer footer. AI outputs framed as "historical context" not "action recommendations".

### 3. 📊 Ticker Profile (`/ticker/:symbol`)

Accessed by tapping any ticker chip ($NVDA).

- Ticker name + current price (if available)
- Watchlist add/remove toggle
- Recent events for this ticker (same card format as feed)
- Quick stats: total events, avg severity, most common source

### 4. 👁 Watchlist Tab

Two views (segmented control toggle):
- **My Tickers**: list of watched tickers with notification level per ticker
- **Saved Alerts**: bookmarked alerts

**Add ticker**: search input with autocomplete at top.

**Per-ticker settings**: tap ticker → bottom sheet with:
- Notification level: All / High+ / Critical only / Off
- Remove from watchlist

### 5. ⚙️ Settings

- Account info (email, name)
- Push notifications: on/off
- Severity threshold: default HIGH+ (not ALL — prevent notification fatigue)
- Sign out
- About / Legal / Disclaimer

### 6. 👤 Auth

- Email + password (V1). Google OAuth in V1.1.
- JWT tokens.
- Registration → immediate redirect to onboarding flow.

### 7. 🎓 Onboarding (first-run only)

3 screens + 1 coach mark, <30 seconds total:

**Screen 1: Value prop**
```
⚡ Event Radar
AI-powered stock alerts with historical context.
Real events. Pattern match. Seconds, not hours.
[ Get Started ]
```

**Screen 2: Pick tickers** (seeds watchlist)
```
What do you follow?
Popular: [NVDA] [TSLA] [AAPL] [MSFT] [AMZN] [META] [GOOG] [SPY]
🔍 Search for a ticker...
Selected: NVDA, TSLA
[ Continue → ]   Skip for now
```

**Screen 3: Push permission**
```
🔔 Stay ahead of the market
Get push alerts for critical events on your watchlist.
[ Enable Notifications ]   Maybe later
```

**Screen 4**: Drop into Feed with one-time coach mark on first card: "Tap any alert for AI analysis + historical patterns"

---

## Empty States

Every empty screen has: icon + explanation + CTA.

| Screen | Icon | Message | CTA |
|--------|------|---------|-----|
| Empty feed | 📡 | Scanning for events... We monitor SEC filings, news, and more. | Add tickers to watchlist |
| Empty search | 🔍 | No events found for "XYZZ" | Try a different ticker |
| Empty watchlist | 👁 | No tickers yet. Add tickers to get prioritized alerts. | + Add Ticker |
| Empty saved | ⭐ | No saved alerts. Star alerts from the feed to review later. | Go to Feed |
| Network error | ⚠️ | Can't reach the server. | Retry |
| Market closed | 🌙 | Markets are closed. Here's today's summary: N events, top movers... | View today's recap |

---

## Loading States

| State | Treatment |
|-------|-----------|
| Initial feed load | 5 skeleton cards |
| Pull-to-refresh | Spinner in pull indicator, cards stay visible |
| Load more (scroll) | Spinner at bottom |
| Detail page | Skeleton for AI section, header visible immediately |
| Watchlist save | Optimistic UI — add immediately, revert on error |
| Save/feedback buttons | Instant icon fill + async POST |

Skeleton cards:
```
┌─────────────────────────────────┐
│ ▓▓▓▓  ░░░░░░░░░░░░░░░░░░░░░░  │
│ ░░░░░░░░░░░░░░░  ░░░░░░░      │
│ ░░░░░░░░░░░░░░░░░░░            │
└─────────────────────────────────┘
```

---

## Design System

### Color Palette (Dark theme, CSS vars for future light mode)
```
--bg-primary:    #0A0A0A    (near black, not true black — avoids OLED halation)
--bg-surface:    #141414    (cards, sheets)
--bg-elevated:   #1C1C1C    (hover, active states)
--border:        #1F1F1F
--text-primary:  #FAFAFA
--text-secondary:#8A8A8A    (bumped from #737373 for WCAG AA contrast)
--severity-critical: #EF4444
--severity-high:     #FB923C  (bumped from #F97316 for contrast)
--severity-medium:   #EAB308
--severity-low:      #6B7280
--accent:        #3B82F6    (links, interactive)
```

### Typography
```
--text-xs:    11px/1.4   → timestamps, metadata
--text-sm:    13px/1.5   → source badges, secondary
--text-base:  15px/1.5   → body, AI summaries
--text-lg:    17px/1.4   → card titles
--text-xl:    20px/1.3   → detail page title
--text-2xl:   24px/1.2   → stat numbers
```
Font: System stack. Numbers: monospace (`SF Mono`, `Consolas`).

### Spacing
4px base: 4, 8, 12, 16, 20, 24, 32, 48.
Card padding: 16px. Card gap: 12px. Section gap: 24px.

### Touch targets
Minimum 44×44pt for all tappable elements. 8px minimum between adjacent tap targets.

### Components to build
| Component | Description |
|-----------|-------------|
| `AlertCard` | Feed card. Props: severity, source, title, tickers, summary, time, saved |
| `SeverityBadge` | Color bar + text label + icon |
| `SourceBadge` | SEC Filing, Breaking News, etc. Chip style |
| `TickerChip` | Tappable `$NVDA` pill → links to `/ticker/NVDA` |
| `ActionBar` | Save / Feedback / Share buttons |
| `BottomSheet` | Snap points: closed → half → full. Spring physics. |
| `BottomNav` | 4-tab navigation |
| `SkeletonCard` | Loading placeholder |
| `EmptyState` | Icon + message + CTA template |
| `FilterSheet` | Severity/source filter pills in bottom sheet |
| `StatCard` | Number + label for historical stats |
| `SimilarEventRow` | Compact row for similar events list |
| `PillBanner` | "N new alerts" sticky notification |
| `CoachMark` | Tooltip overlay for onboarding |
| `ErrorBoundary` | Friendly error + retry |

---

## Tech Stack

### Frontend (`packages/web/`)
- React 19 + Vite
- Tailwind CSS (with CSS custom properties for theming)
- TanStack Query (data fetch + cache)
- React Router (client-side routing)
- PWA: Service Worker + Web Push via Push API
- `prefers-color-scheme` + `prefers-reduced-motion` respected

### Backend additions
- **Auth**: `users` table + bcrypt + JWT (access + refresh tokens)
- **Feed API**: `/api/v1/feed` — personalized, watchlist-aware, respects free/pro tier
- **Watchlist**: `user_watchlists` table + CRUD API
- **Preferences**: `user_preferences` table
- **Ticker**: `/api/v1/ticker/:symbol` — events for a specific ticker

### New DB Tables
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  tier TEXT DEFAULT 'free',  -- 'free' | 'pro'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  notify_level TEXT DEFAULT 'high',  -- 'all' | 'high' | 'critical' | 'off'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT true,
  severity_threshold TEXT DEFAULT 'HIGH',  -- default HIGH+, not ALL
  timezone TEXT DEFAULT 'America/New_York',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_saved_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);
```

### New API Routes
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me

GET    /api/v1/feed              — alert feed (public delayed, auth real-time)
GET    /api/v1/feed/:id          — alert detail + enrichment + historical

GET    /api/v1/ticker/:symbol    — events for a ticker
GET    /api/v1/ticker/search     — ticker autocomplete

GET    /api/v1/watchlist
POST   /api/v1/watchlist
PUT    /api/v1/watchlist/:id
DELETE /api/v1/watchlist/:id

GET    /api/v1/saved
POST   /api/v1/saved/:eventId
DELETE /api/v1/saved/:eventId

GET    /api/v1/preferences
PUT    /api/v1/preferences

POST   /api/v1/feedback/:eventId  (existing)
```

---

## Development Phases

| Phase | Scope | Notes |
|-------|-------|-------|
| **P0** | Design system: components + tokens + layout | Build primitives first |
| **P1** | Public Feed (no auth) + Alert Detail | Core product, browsable immediately |
| **P2** | Auth (register/login/JWT) + Onboarding | Unlock personalization |
| **P3** | Watchlist + Ticker Profile + Saved | Retention features |
| **P4** | Push notifications (PWA) | Engagement loop |
| **P5** | Freemium gating + settings | Monetization |
| **P6** | Polish: transitions, haptics, empty states, a11y | Production quality |

---

## Accessibility Checklist

- [ ] Severity: color + text label + icon (never color-only)
- [ ] All text meets WCAG AA contrast (4.5:1 normal, 3:1 large)
- [ ] Touch targets ≥ 44×44pt
- [ ] Focus indicators on all interactive elements
- [ ] `<article>` tags with `aria-label` on cards
- [ ] `aria-live="polite"` on new events region
- [ ] `role="status"` on "N new alerts" pill
- [ ] `prefers-reduced-motion` respected
- [ ] Screen reader tested (VoiceOver + TalkBack)
- [ ] Bottom sheet traps focus when open

---

## Legal

- Every detail page: "Not investment advice. Historical patterns are not predictions of future results."
- AI outputs framed as "historical context" — never "recommended action" or "suggested trade"
- Terms of Service + Privacy Policy pages (V1.1)

---

## Competitive Position

```
                Depth of analysis
                      ↑
                      │
          Seeking     │    EVENT RADAR
          Alpha       │    (target quadrant)
                      │
  ────────────────────┼──────────────────→ Speed / Simplicity
                      │
          Bloomberg   │    Robinhood
          StockTwits  │
                      │
```

Deep analysis + Robinhood-level simplicity. The AI does the work; the user gets insight in 5 seconds.
