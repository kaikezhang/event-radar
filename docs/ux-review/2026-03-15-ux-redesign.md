# Event Radar — Complete UX/UI Review & Redesign Spec

> **Date:** 2026-03-15
> **Reviewer:** CEO + Senior UX/UI Designer
> **Target:** Mobile-first PWA for swing traders
> **Tech:** React 19 + Tailwind CSS 4 + Lucide icons
> **Viewport:** 375px–428px primary (iPhone 13/14/15 Pro)

---

## Table of Contents

1. [Part 1: CEO / Product Review](#part-1-ceo--product-review)
2. [Part 2: UX/UI Design Review](#part-2-uxui-design-review)
3. [Part 3: New Design System](#part-3-new-design-system)
4. [Part 4: Page-by-Page Redesign Spec](#part-4-page-by-page-redesign-spec)

---

## Part 1: CEO / Product Review

### 1.1 Feed Page — First Impression (Critical)

**Current state:** An unauthenticated user lands on the feed and sees:
1. A header with "EVENT RADAR / Delayed public feed" on the left and a "Feed" pill on the right
2. A hero card: "⚡ Event Radar / AI-powered market intelligence / Reconnecting"
3. Tabs: "My Watchlist" (selected) | "All Events"
4. An empty state because the user has no watchlist

**This is catastrophic for conversion.** A new visitor sees zero content above the fold. The product looks broken.

**Problems identified:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Default tab is "My Watchlist" for unauth users — shows empty state | **Critical** |
| 2 | Hero card wastes ~120px of prime real estate with branding already in the header | **High** |
| 3 | "EVENT RADAR" appears twice: header logo + hero card "⚡ Event Radar" | **High** |
| 4 | Connection status ("Reconnecting") is a prominent badge — should be a tiny indicator | **Medium** |
| 5 | No date sections — events are a flat, undifferentiated list | **High** |
| 6 | No pull-to-refresh on mobile | **Medium** |
| 7 | Feed card titles are truncated at 2 lines but summaries at 1 line — feels cramped | **Medium** |
| 8 | Filter/Refresh buttons are inside the hero card — should be in a filter bar | **Low** |

**CEO verdict:** The feed should show real historical events immediately. Group by date. Remove the hero card. Move connection status to header. Default unauth to "All Events."

### 1.2 Event Detail Page

**Current state:** Well-structured with clear sections (What happened, Why it matters now, Why you were notified, Trust check). The "Landing Guide" with jump links is smart.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Too many sections for mobile — page is very long | **Medium** |
| 2 | The metadata grid (Severity, Source, Tickers, etc.) uses all-caps labels that are hard to scan | **Low** |
| 3 | "Was this useful?" feedback section is too low — most users won't scroll there | **Medium** |
| 4 | The back button + share button feel disconnected from the header | **Low** |
| 5 | Bottom nav overlaps "Why you were notified" section content | **High** |
| 6 | Disclaimer block at the bottom is too prominent — scares users | **Low** |

**CEO verdict:** Good content structure, needs visual polish. Collapsible sections would help. Move feedback higher.

### 1.3 Scorecard Page

**Current state:** Shows "Scorecard unavailable" error state with a chart icon and "Back to feed" button.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Empty/error state is generic and unhelpful | **Medium** |
| 2 | No skeleton loading state — just an immediate error | **Medium** |
| 3 | The "Back to feed" button uses the accent blue CTA style for a secondary action | **Low** |

**CEO verdict:** Needs proper loading skeleton and a more informative error state. When data is available, the scorecard should be the product's "receipt" — show accuracy metrics prominently.

### 1.4 Watchlist Page

**Current state:** Shows onboarding flow with ticker input, sector packs, and trending tickers.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Good content but the onboarding card + ticker input + sector packs + trending + custom ticker = too many competing CTAs | **Medium** |
| 2 | "Add at least 3 more to continue" with a "Start watching" button feels like a gate | **Low** |
| 3 | Sector pack cards (Tech Leaders, Biotech, Energy, Finance) should be tappable chips, not large cards | **Medium** |

**CEO verdict:** Simplify. The watchlist onboarding should feel like a 10-second setup, not a form to fill out. Trending tickers as quick-add chips is good — make them more prominent.

### 1.5 Settings Page

**Current state:** Comprehensive notification settings with push alerts, quiet hours, sound config.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Too much text for each setting — descriptions are paragraphs | **Low** |
| 2 | The "Enable push in under a minute" tutorial should be a bottom sheet / modal, not inline | **Medium** |
| 3 | Good feature set but overwhelming on mobile | **Low** |

**CEO verdict:** Acceptable. Low priority for redesign. Group settings into collapsible sections.

### 1.6 Login Page

**Current state:** Clean magic-link login with email input. Centered card.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Too much empty space — page feels barren | **Low** |
| 2 | No value proposition messaging alongside the login | **Medium** |
| 3 | The card background is slightly different gray than page — looks unintentional | **Low** |

**CEO verdict:** Add a brief value proposition above the login card. "Track market-moving events. Get alerts that matter."

### 1.7 Onboarding Page

**Current state:** Full-page ticker selection with sector packs and trending tickers.

**CEO verdict:** Good concept. Should be simplified into a wizard-style bottom sheet or multi-step flow rather than a long scrollable page.

### 1.8 Landing Page

**Current state:** Well-written copy. Good structure: Hero → Example Alert → Problem Statement → How It Works → Scorecard → Self-Host → Cloud Beta.

**Problems:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | "Not more alerts. Better setups." — strong headline | **N/A** |
| 2 | Example alert card looks good but uses different styling than the actual app | **Low** |
| 3 | The 4-step "How it works" grid is clear | **N/A** |
| 4 | Self-host section competes with Cloud Beta CTA — pick one primary CTA | **Medium** |

**CEO verdict:** Landing page is the strongest part of the current design. Keep the copy, align visual style with the redesigned app.

---

## Part 2: UX/UI Design Review

### 2.1 Color Palette — Current vs. Proposed

**Current palette problems:**
- `#0a0a0a` background is nearly pure black — harsh, not "dark mode done right"
- `#141414` surface is too close to background — cards don't lift
- `#3b82f6` blue accent is generic Tailwind blue-500 — no brand identity
- Severity colors (red/orange/yellow/gray) are standard but the orange `#fb923c` is too bright on dark backgrounds
- Border color `#1f1f1f` is almost invisible — cards look like they're floating in void
- Overall: the palette feels "default dark mode" rather than "Bloomberg meets Robinhood"

**Proposed new palette — "Midnight Terminal":**

```
BACKGROUNDS
──────────────────────────────────
--bg-primary:     #09090b     Zinc-950 — true dark base
--bg-surface:     #18181b     Zinc-900 — card surface (lifted)
--bg-elevated:    #27272a     Zinc-800 — hover states, elevated cards
--bg-inset:       #0f0f12     Recessed areas (filter bars, tab wells)

BORDERS
──────────────────────────────────
--border-default: #27272a     Zinc-800 — visible but subtle
--border-bright:  #3f3f46     Zinc-700 — interactive borders
--border-accent:  #2563eb33   Blue with 20% opacity — accent borders

TEXT
──────────────────────────────────
--text-primary:   #fafafa     Zinc-50  — headings, key data
--text-secondary: #a1a1aa     Zinc-400 — body text, descriptions
--text-tertiary:  #71717a     Zinc-500 — timestamps, metadata
--text-inverse:   #09090b     Zinc-950 — text on bright buttons

ACCENT (Brand Blue)
──────────────────────────────────
--accent:         #2563eb     Blue-600 — primary actions
--accent-hover:   #1d4ed8     Blue-700 — hover
--accent-soft:    #2563eb1a   Blue-600/10 — tinted backgrounds
--accent-border:  #2563eb33   Blue-600/20 — tinted borders

SEVERITY (Semantic)
──────────────────────────────────
--severity-critical: #dc2626  Red-600    — CRITICAL alerts
--severity-high:     #ea580c  Orange-600 — HIGH alerts
--severity-medium:   #ca8a04  Yellow-600 — MEDIUM alerts (less eye-burning)
--severity-low:      #52525b  Zinc-600   — LOW alerts

SUCCESS / WARNING / INFO
──────────────────────────────────
--success:        #16a34a     Green-600
--warning:        #d97706     Amber-600
--info:           #0891b2     Cyan-600

SPECIAL
──────────────────────────────────
--ws-connected:   #16a34a     Green dot
--ws-reconnecting:#d97706     Amber dot
--ws-disconnected:#dc2626     Red dot
```

**Key changes:**
- Shifted from pure black (`#0a0a0a`) to zinc-tinted dark (`#09090b`) — warmer, less harsh
- Increased contrast between bg/surface/elevated — cards actually "lift"
- Severity colors shifted to -600 variants — less neon, more professional
- Blue accent shifted from blue-500 to blue-600 — deeper, more authoritative

### 2.2 Typography

**Current problems:**
- System UI font is fine but `text-[20px]` heading feels too small for a page title
- `text-[17px]` card titles work on mobile
- `text-[11px]` badges are at the limit of readability
- No consistent type scale — sizes are ad-hoc (`17px`, `20px`, `15px`, `11px`)
- All-caps tracking (`tracking-[0.16em]`, `tracking-[0.2em]`) is overused — feels "Stripe-y" but less refined

**Proposed type scale:**

```
HEADINGS
──────────────────────────────────
Page title:   text-xl (20px) font-semibold leading-7
              → Used for: "Feed", "Watchlist", "Settings"

Section head: text-lg (18px) font-semibold leading-7
              → Used for: "What happened", "Trust check"

Card title:   text-[15px] font-semibold leading-5
              → Used for: Alert card headlines

BODY
──────────────────────────────────
Body:         text-sm (14px) font-normal leading-5
              → Used for: Descriptions, summaries

Caption:      text-xs (12px) font-medium leading-4
              → Used for: Timestamps, source labels, metadata

BADGES & LABELS
──────────────────────────────────
Badge:        text-[11px] font-semibold uppercase tracking-wider
              → Used for: Severity badges, tab labels

Mini:         text-[10px] font-medium
              → Used for: Connection status dot label
```

**Font stack — keep system UI but add Inter as preferred:**
```css
font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
```

Load Inter via `@fontsource/inter` (variable weight) at 400, 500, 600 weights only. Inter has superior number rendering for a trading app.

### 2.3 Spacing & Density

**Current problems:**
- Cards use `rounded-[28px]` — too round, feels bubbly/consumer, not "trading terminal"
- `space-y-4` between cards is good density
- Container padding `px-4` (16px) is fine for mobile
- Bottom padding `pb-28` is too much — bottom nav is only ~60px

**Proposed spacing system:**

```
BORDER RADIUS
──────────────────────────────────
Card:         rounded-2xl (16px)    — was 28px, now sharper/pro
Badge:        rounded-full          — keep pills for badges
Button:       rounded-xl (12px)     — was rounded-full, now more rectangular
Input:        rounded-xl (12px)     — consistent with buttons
Bottom nav:   rounded-none          — flush to bottom edge

SPACING
──────────────────────────────────
Page padding: px-4 (16px)           — keep
Card padding: p-4 (16px)           — was p-5, tighter
Card gap:     space-y-3 (12px)      — was space-y-4, denser
Section gap:  mt-6 (24px)           — between major sections
Inner gap:    gap-2 (8px)           — between badge chips

BOTTOM NAV
──────────────────────────────────
Nav height:   h-16 (64px) + safe-area
Content pad:  pb-20 (80px)          — was pb-28 (112px)
```

### 2.4 Component Issues

**Cards:** Too rounded, insufficient surface contrast. The severity left-bar pattern (solid/striped/dotted) is clever but the different patterns are too subtle — use color + width instead.

**Badges:** SeverityBadge is `min-h-11` (44px) — way too tall for a badge. Should be ~24–28px. The min-h-11 tap target rule should apply to tappable elements, not display badges.

**Tabs:** The pill toggle for "My Watchlist / All Events" works but the active state (solid blue fill) is too heavy. Use a subtle underline or lighter fill.

**Bottom nav:** Current 5-tab layout (Feed, Scorecard, Watchlist, Search, Settings) is correct for the feature set. But the active state (`bg-white/6`) is too subtle — needs a stronger indicator.

**Header:** The current header with the logo pill on the left and "Feed" pill on the right is confusing — "Feed" in the header when you're already on the feed page is redundant. The header should show contextual info (connection status, user avatar/login) not navigation that duplicates the bottom nav.

### 2.5 Interaction Patterns

**Missing:**
- Pull-to-refresh (mobile essential for a live feed)
- Skeleton loading states (cards shimmer while loading)
- Swipe-to-dismiss on filter chips
- Haptic feedback on severity badge taps (via Vibration API)
- Scroll-to-top on tab re-tap (iOS convention)

**Existing patterns to keep:**
- Tab switching between Watchlist/All Events
- Filter chips with X to remove
- Collapsible filter panel

---

## Part 3: New Design System

### 3.1 CSS Custom Properties (Updated `index.css`)

```css
@theme {
  /* Backgrounds */
  --color-bg-primary: #09090b;
  --color-bg-surface: #18181b;
  --color-bg-elevated: #27272a;
  --color-bg-inset: #0f0f12;

  /* Borders */
  --color-border-default: #27272a;
  --color-border-bright: #3f3f46;

  /* Text */
  --color-text-primary: #fafafa;
  --color-text-secondary: #a1a1aa;
  --color-text-tertiary: #71717a;

  /* Accent */
  --color-accent-default: #2563eb;
  --color-accent-hover: #1d4ed8;

  /* Severity */
  --color-severity-critical: #dc2626;
  --color-severity-high: #ea580c;
  --color-severity-medium: #ca8a04;
  --color-severity-low: #52525b;

  /* Status */
  --color-success: #16a34a;
  --color-warning: #d97706;
}
```

### 3.2 New Header Design

**Replace** the current two-pill header with a minimal status bar:

```
┌─────────────────────────────────────────────┐
│  ⚡ Event Radar          ● Live    [Avatar] │
│                                      or     │
│                                   [Sign in] │
└─────────────────────────────────────────────┘
```

**Spec:**
```jsx
<header className="flex h-12 items-center justify-between px-4">
  {/* Left: Logo */}
  <div className="flex items-center gap-2">
    <Zap className="h-4 w-4 text-accent-default" />
    <span className="text-sm font-semibold text-text-primary tracking-tight">
      Event Radar
    </span>
  </div>

  {/* Right: Status + Auth */}
  <div className="flex items-center gap-3">
    {/* Connection indicator — tiny dot + label */}
    <span className="flex items-center gap-1.5 text-[10px] font-medium text-text-tertiary">
      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
      Live
    </span>

    {/* Auth: Avatar circle or Sign In link */}
    {user ? (
      <Link to="/settings" className="h-7 w-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-semibold text-text-secondary">
        {user.initials}
      </Link>
    ) : (
      <Link to="/login" className="text-xs font-medium text-accent-default">
        Sign in
      </Link>
    )}
  </div>
</header>
```

**Key decisions:**
- Lightning bolt icon (Zap from Lucide) replaces the RadioTower icon — more energetic
- Connection status is a 6px dot with "Live" / "Reconnecting" label — minimal
- No "Feed" button — that's what the bottom nav is for
- "Delayed public feed" subtitle removed — not needed on every page. Show it as a subtle banner on the feed page for unauth users instead
- Header is `h-12` (48px) — compact, not `min-h-11` with padding

### 3.3 New Bottom Navigation

**Keep 5 tabs but redesign the active indicator:**

```
┌─────────────────────────────────────────────┐
│   🏠        📊        👁        🔍       ⚙️  │
│  Feed    Scorecard  Watchlist  Search  Settings│
│  ────                                         │
│  (blue underline on active)                   │
└─────────────────────────────────────────────────┘
```

**Spec:**
```jsx
<nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-bg-primary/95 backdrop-blur-xl">
  <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)] pt-1.5">
    {navItems.map(({ to, label, icon: Icon }) => (
      <NavLink
        to={to}
        className={({ isActive }) => cn(
          'flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
          isActive
            ? 'text-accent-default'
            : 'text-text-tertiary'
        )}
      >
        {({ isActive }) => (
          <>
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.5} />
            <span>{label}</span>
            {isActive && (
              <span className="mt-0.5 h-0.5 w-4 rounded-full bg-accent-default" />
            )}
          </>
        )}
      </NavLink>
    ))}
  </div>
</nav>
```

**Key changes:**
- Active state: blue icon + blue text + blue underline dot (replaces `bg-white/6` highlight)
- Icon stroke weight increases on active (1.5 → 2.5) for more contrast
- `max-w-lg` instead of `max-w-3xl` — tabs don't need to stretch on iPad
- Label font size: `text-[10px]` — compact, readable
- Removed `rounded-2xl` per-item background — cleaner

### 3.4 New Feed Card Design

**Current card problems:**
- 28px border radius is too bubbly
- SeverityBadge is 44px tall — way too much vertical space for metadata
- Left severity bar is clever but the striped/dotted patterns are too subtle
- Summary truncated at 1 line wastes potential

**New card design:**

```
┌──────────────────────────────────────────────┐
│ ▌CRITICAL  Breaking News · 2m ago       AAPL │
│ ▌                                        NVDA│
│ ▌Apple announces $110B stock buyback          │
│ ▌program, largest in history                  │
│ ▌                                             │
│ ▌Apple Inc. announces a massive $110B stock   │
│ ▌buyback program, the largest in corporate... │
└──────────────────────────────────────────────┘
```

**Spec:**
```jsx
<article className="relative overflow-hidden rounded-2xl border border-border-default bg-bg-surface p-4 pl-5 transition-colors active:bg-bg-elevated">
  {/* Severity bar — left edge, 3px wide, full height, color-coded */}
  <div className={cn(
    'absolute inset-y-0 left-0 w-[3px]',
    severity === 'CRITICAL' && 'bg-severity-critical',
    severity === 'HIGH'     && 'bg-severity-high',
    severity === 'MEDIUM'   && 'bg-severity-medium',
    severity === 'LOW'      && 'bg-severity-low',
  )} />

  {/* Row 1: Metadata */}
  <div className="flex items-center gap-2 text-xs">
    {/* Severity label */}
    <span className={cn(
      'font-semibold uppercase tracking-wider',
      severity === 'CRITICAL' && 'text-severity-critical',
      severity === 'HIGH'     && 'text-severity-high',
      severity === 'MEDIUM'   && 'text-severity-medium',
      severity === 'LOW'      && 'text-severity-low',
    )}>
      {severity}
    </span>

    <span className="text-text-tertiary">·</span>

    {/* Source + time */}
    <span className="text-text-tertiary">
      {source} · {relativeTime}
    </span>

    {/* Tickers — right-aligned */}
    <div className="ml-auto flex gap-1">
      {tickers.slice(0, 2).map(t => (
        <span key={t} className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-text-primary">
          {t}
        </span>
      ))}
    </div>
  </div>

  {/* Row 2: Title */}
  <h2 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5 text-text-primary">
    {title}
  </h2>

  {/* Row 3: Summary */}
  <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-text-secondary">
    {summary}
  </p>
</article>
```

**Key changes vs. current:**
- Removed SeverityBadge component (was 44px tall pill) → inline text label
- Removed SourceBadge component → inline text with dot separator
- Removed TickerChip component → compact inline chips (no border, just bg)
- Severity bar: uniform 3px solid bar (no more striped/dotted patterns)
- Border radius: `rounded-2xl` (16px) instead of `rounded-[28px]`
- Summary: `line-clamp-2` instead of `line-clamp-1` — more preview text
- Added `active:bg-bg-elevated` for tap feedback
- Overall card height reduced by ~30% due to compact metadata row

### 3.5 Date-Sectioned Feed Layout

**New feed structure:**

```
┌─ Header ──────────────────────────────────────┐
│  ⚡ Event Radar              ● Live  [Sign in]│
└───────────────────────────────────────────────┘

┌─ Filter Bar ──────────────────────────────────┐
│  All Events ▾   Filters ▾   [pull ↓ refresh]  │
└───────────────────────────────────────────────┘

── Today ────────────────────────────────────────
  [Card] Apple announces $110B buyback...
  [Card] META announces massive layoffs...
  [Card] Google announces Gemini 3.0...

── Yesterday ────────────────────────────────────
  [Card] Tesla announces surprise OB AI...
  [Card] Flights halted at DC airports...

── March 13 ─────────────────────────────────────
  [Card] Big Move in Crypto: Regulated...
  [Card] Emergency oil stockpiles...
```

**Date section header spec:**
```jsx
<div className="sticky top-0 z-10 -mx-4 px-4 py-2 backdrop-blur-xl">
  <div className="flex items-center gap-3">
    <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
      {label} {/* "Today", "Yesterday", "Mar 13" */}
    </span>
    <div className="h-px flex-1 bg-border-default" />
    <span className="text-[10px] text-text-tertiary">
      {count} events
    </span>
  </div>
</div>
```

**Key features:**
- `sticky top-0` — date headers stick while scrolling through that section
- `backdrop-blur-xl` — frosted glass effect on scroll
- Event count on the right — gives users a sense of volume
- Horizontal rule fills remaining space — clean separator
- Labels: "Today", "Yesterday", then "Mar 13", "Mar 12" etc.

### 3.6 Filter Bar (replaces hero card + tabs)

**Remove** the hero card and tab toggle. Replace with a compact filter bar:

```
┌───────────────────────────────────────────────┐
│  All Events ▾          🔽 Severity  🔽 Source │
└───────────────────────────────────────────────┘
```

**Spec:**
```jsx
<div className="flex items-center gap-2 py-2">
  {/* Feed mode toggle */}
  <button className="flex items-center gap-1.5 rounded-xl bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary border border-border-default">
    {isWatchlist ? 'My Watchlist' : 'All Events'}
    <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
  </button>

  <div className="flex-1" />

  {/* Filter buttons */}
  <button className="flex items-center gap-1 rounded-xl bg-bg-surface px-2.5 py-2 text-xs font-medium text-text-secondary border border-border-default">
    <SlidersHorizontal className="h-3.5 w-3.5" />
    Filters
    {activeFilterCount > 0 && (
      <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-default text-[10px] text-white">
        {activeFilterCount}
      </span>
    )}
  </button>
</div>

{/* Active filter chips — only shown when filters are active */}
{activeFilters.length > 0 && (
  <div className="flex flex-wrap gap-1.5 pb-2">
    {activeFilters.map(f => (
      <button className="inline-flex items-center gap-1 rounded-lg bg-accent-default/10 border border-accent-default/20 px-2 py-1 text-[11px] font-medium text-accent-default">
        {f.label}
        <X className="h-3 w-3" />
      </button>
    ))}
  </div>
)}
```

**Unauth user banner** (replaces "Delayed public feed" header subtitle):
```jsx
{!user && (
  <div className="flex items-center justify-between rounded-xl bg-accent-default/5 border border-accent-default/10 px-3 py-2 mb-3">
    <span className="text-xs text-text-secondary">
      Viewing delayed public feed
    </span>
    <Link to="/login" className="text-xs font-medium text-accent-default">
      Sign in for live →
    </Link>
  </div>
)}
```

---

## Part 4: Page-by-Page Redesign Spec

### 4.1 Feed Page (Priority: CRITICAL)

#### Remove:
1. **Hero card** ("⚡ Event Radar / AI-powered market intelligence / Connected status") — entirely. Connection status moves to header. Branding is already in the header.
2. **Tab toggle** as a horizontal pill toggle — replace with the dropdown in the filter bar.
3. **"Delayed public feed"** subtitle from the header — replace with the inline banner (see 3.6).

#### Move:
1. **Connection status** → header bar (tiny dot indicator, see 3.2)
2. **Filter/Refresh buttons** → filter bar (see 3.6)
3. **Tab switching** (Watchlist/All Events) → dropdown in filter bar

#### Add:
1. **Date section headers** — group events by day with sticky headers (see 3.5)
2. **Pull-to-refresh** — implement via `touchstart`/`touchmove`/`touchend` handlers:
   ```jsx
   // Pull indicator at top of feed
   <div className={cn(
     'flex items-center justify-center py-3 transition-opacity',
     isPulling ? 'opacity-100' : 'opacity-0'
   )}>
     <RefreshCw className={cn('h-4 w-4 text-text-tertiary', isRefreshing && 'animate-spin')} />
   </div>
   ```
3. **Skeleton loading cards** — show while feed loads:
   ```jsx
   <div className="rounded-2xl border border-border-default bg-bg-surface p-4 animate-pulse">
     <div className="flex gap-2 mb-3">
       <div className="h-4 w-16 rounded bg-bg-elevated" />
       <div className="h-4 w-24 rounded bg-bg-elevated" />
     </div>
     <div className="h-5 w-full rounded bg-bg-elevated mb-2" />
     <div className="h-5 w-3/4 rounded bg-bg-elevated mb-2" />
     <div className="h-4 w-full rounded bg-bg-elevated" />
   </div>
   ```
4. **Scroll-to-top** — tap the Feed tab icon when already on Feed page to scroll to top
5. **Default to "All Events" tab for unauthenticated users** — they have no watchlist; show them content immediately
6. **Ensure historical events load for unauth users** — the feed should never be empty on first visit

#### New component hierarchy:
```
Feed Page
├── Unauth banner (if not logged in)
├── Filter bar (mode dropdown + filter buttons)
├── Active filter chips (if any)
├── Pull-to-refresh indicator
├── Date sections
│   ├── Sticky date header ("Today")
│   ├── AlertCard
│   ├── AlertCard
│   ├── Sticky date header ("Yesterday")
│   ├── AlertCard
│   └── ...
└── Load more / infinite scroll trigger
```

### 4.2 Event Detail Page

#### Remove:
1. **"Landing Guide" section title** ("Read this in under 30 seconds") — keep the jump-link chips but remove the instructional text. Users don't need to be told how long it takes to read.
2. **"LANDING GUIDE" label** — unnecessary

#### Move:
1. **"Was this useful?" feedback** → sticky bottom bar (above bottom nav):
   ```jsx
   <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border-default bg-bg-primary/95 backdrop-blur-xl px-4 py-2">
     <div className="flex items-center justify-between max-w-3xl mx-auto">
       <span className="text-xs text-text-secondary">Was this useful?</span>
       <div className="flex gap-2">
         <button className="flex items-center gap-1 rounded-lg bg-bg-surface px-3 py-1.5 text-xs">
           <ThumbsUp className="h-3.5 w-3.5" /> Yes
         </button>
         <button className="flex items-center gap-1 rounded-lg bg-bg-surface px-3 py-1.5 text-xs">
           <ThumbsDown className="h-3.5 w-3.5" /> No
         </button>
       </div>
     </div>
   </div>
   ```
2. **Disclaimer** → collapsed/accordion at bottom (expandable), not a full block

#### Add:
1. **Back navigation** — replace text "← Back" with a proper back arrow in the header area:
   ```jsx
   <div className="flex items-center gap-3 py-3">
     <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-surface text-text-secondary">
       <ChevronLeft className="h-5 w-5" />
     </button>
     <div className="flex-1" />
     <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg-surface text-text-secondary">
       <Share2 className="h-4 w-4" />
     </button>
   </div>
   ```
2. **Collapsible sections** — "Trust and Verification" and "Why this alert" should be collapsed by default (expandable). Most users care about "What happened" and "Why it matters now" — the pipeline internals are for power users.
   ```jsx
   <details className="group rounded-2xl border border-border-default bg-bg-surface">
     <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-semibold text-text-primary">
       Trust and Verification
       <ChevronDown className="h-4 w-4 text-text-tertiary transition-transform group-open:rotate-180" />
     </summary>
     <div className="border-t border-border-default p-4">
       {/* content */}
     </div>
   </details>
   ```
3. **Ticker price context** — if tickers are tagged, show current price + % change inline

#### Component spec changes:
- **Metadata grid**: Change from 2-column grid with all-caps labels to a compact list:
  ```jsx
  <div className="space-y-2 rounded-2xl bg-bg-surface p-4">
    <div className="flex justify-between text-sm">
      <span className="text-text-tertiary">Severity</span>
      <span className="font-medium text-severity-high">High</span>
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-text-tertiary">Source</span>
      <span className="font-medium text-text-primary">Breaking News</span>
    </div>
    {/* ... */}
  </div>
  ```
- **Section headers**: Remove "CATALYST / EVENT SUMMARY" all-caps labels. Just use "What happened" as the section title directly.
- **Jump-link chips**: Keep but restyle:
  ```jsx
  <div className="flex flex-wrap gap-1.5 py-3">
    {sections.map(s => (
      <button className="rounded-lg bg-bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary border border-border-default transition-colors hover:text-text-primary hover:border-border-bright">
        {s.label}
      </button>
    ))}
  </div>
  ```

### 4.3 Scorecard Page

#### Remove:
1. Nothing — page is minimal already

#### Add:
1. **Loading skeleton** — show before data arrives:
   ```jsx
   <div className="space-y-4">
     <div className="rounded-2xl bg-bg-surface p-4 animate-pulse">
       <div className="h-6 w-48 rounded bg-bg-elevated mb-4" />
       <div className="h-32 w-full rounded-xl bg-bg-elevated" />
     </div>
     <div className="rounded-2xl bg-bg-surface p-4 animate-pulse">
       <div className="h-6 w-32 rounded bg-bg-elevated mb-4" />
       <div className="h-20 w-full rounded-xl bg-bg-elevated" />
     </div>
   </div>
   ```
2. **Better error state**:
   ```jsx
   <div className="flex flex-col items-center justify-center py-16 text-center">
     <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-surface mb-4">
       <BarChart3 className="h-6 w-6 text-text-tertiary" />
     </div>
     <h2 className="text-base font-semibold text-text-primary mb-1">
       Scorecard building
     </h2>
     <p className="text-sm text-text-secondary max-w-xs mb-4">
       The scorecard needs at least 7 days of tracked alerts. Check back soon.
     </p>
     <button className="rounded-xl bg-bg-surface border border-border-default px-4 py-2 text-sm font-medium text-text-primary">
       Back to feed
     </button>
   </div>
   ```

### 4.4 Watchlist Page

#### Remove:
1. **"Watchlist-first onboarding" section** with Step 1/Step 2 — redundant with the ticker input above it
2. **"Add at least 3 more to continue"** gate — let users start with 1 ticker

#### Move:
1. **Trending tickers** → move above sector packs (trending is more actionable)
2. **"Enable push alerts" CTA** → move to a post-setup prompt (after user adds first ticker)

#### Redesign:
1. **Onboarding header** — shorter, more direct:
   ```jsx
   <div className="rounded-2xl bg-accent-default/5 border border-accent-default/10 p-4 mb-4">
     <h1 className="text-lg font-semibold text-text-primary">
       What do you trade?
     </h1>
     <p className="mt-1 text-sm text-text-secondary">
       Add tickers to get high-confidence alerts for the names you care about.
     </p>
   </div>
   ```

2. **Ticker input** — cleaner, with inline add:
   ```jsx
   <div className="flex gap-2 mb-4">
     <input
       className="flex-1 rounded-xl bg-bg-surface border border-border-default px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none focus:ring-1 focus:ring-accent-default"
       placeholder="Search tickers..."
     />
     <button className="rounded-xl bg-accent-default px-4 py-2.5 text-sm font-medium text-white">
       Add
     </button>
   </div>
   ```

3. **Trending tickers** — horizontal scrollable row:
   ```jsx
   <div className="mb-4">
     <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
       Trending this week
     </h3>
     <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
       {trending.map(t => (
         <button className="flex shrink-0 items-center gap-1.5 rounded-xl bg-bg-surface border border-border-default px-3 py-2 text-sm">
           <Plus className="h-3 w-3 text-accent-default" />
           <span className="font-medium text-text-primary">{t.symbol}</span>
           <span className="text-text-tertiary">{t.count}</span>
         </button>
       ))}
     </div>
   </div>
   ```

4. **Sector packs** — compact chips instead of large cards:
   ```jsx
   <div className="mb-4">
     <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
       Quick add by sector
     </h3>
     <div className="flex flex-wrap gap-2">
       {sectors.map(s => (
         <button className="rounded-xl bg-bg-surface border border-border-default px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-accent-default/40">
           {s.name}
         </button>
       ))}
     </div>
   </div>
   ```

### 4.5 Settings Page

#### Remove:
1. **"Enable push in under a minute"** inline tutorial — replace with a one-tap setup

#### Move:
1. **Push notification status** → top of page as a banner (if not enabled)

#### Redesign:
1. **Section grouping** — use `<details>` for each settings group:
   ```jsx
   <details open className="rounded-2xl border border-border-default bg-bg-surface">
     <summary className="flex cursor-pointer items-center justify-between p-4">
       <div>
         <h3 className="text-sm font-semibold text-text-primary">Push notifications</h3>
         <p className="text-xs text-text-secondary mt-0.5">Alerts when the app is closed</p>
       </div>
       <ChevronDown className="h-4 w-4 text-text-tertiary" />
     </summary>
     <div className="border-t border-border-default p-4 space-y-4">
       {/* settings items */}
     </div>
   </details>
   ```

2. **Toggle switches** — replace checkboxes with toggle switches:
   ```jsx
   <label className="flex items-center justify-between py-2">
     <div>
       <span className="text-sm text-text-primary">{label}</span>
       <span className="block text-xs text-text-tertiary">{description}</span>
     </div>
     <button
       role="switch"
       className={cn(
         'relative h-6 w-11 rounded-full transition-colors',
         enabled ? 'bg-accent-default' : 'bg-bg-elevated'
       )}
     >
       <span className={cn(
         'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
         enabled && 'translate-x-5'
       )} />
     </button>
   </label>
   ```

### 4.6 Login Page

#### Add:
1. **Value proposition** above the login card:
   ```jsx
   <div className="text-center mb-8">
     <Zap className="mx-auto h-8 w-8 text-accent-default mb-3" />
     <h1 className="text-xl font-semibold text-text-primary mb-2">
       Event Radar
     </h1>
     <p className="text-sm text-text-secondary max-w-xs mx-auto">
       Market-moving events detected in real time. AI-powered historical context. Receipts, not promises.
     </p>
   </div>
   ```

#### Redesign:
1. **Login card** — simplify:
   ```jsx
   <div className="rounded-2xl bg-bg-surface border border-border-default p-6 max-w-sm mx-auto">
     <h2 className="text-base font-semibold text-text-primary text-center mb-1">
       Sign in
     </h2>
     <p className="text-sm text-text-secondary text-center mb-6">
       Enter your email for a magic link
     </p>
     <input
       type="email"
       className="w-full rounded-xl bg-bg-inset border border-border-default px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-default focus:outline-none focus:ring-1 focus:ring-accent-default mb-3"
       placeholder="you@example.com"
     />
     <button className="w-full rounded-xl bg-accent-default py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
       Send magic link
     </button>
   </div>
   ```

### 4.7 Onboarding Flow

#### Redesign as multi-step wizard:
Replace the single long scrollable page with a 3-step flow:

**Step 1: Pick tickers**
```
┌─────────────────────────────────────────┐
│  What do you trade?          Step 1/3   │
│                                         │
│  [Search tickers...]                    │
│                                         │
│  TRENDING                               │
│  [+SPY 71] [+USO 69] [+PATH 54] ...   │
│                                         │
│  SECTORS                                │
│  [Tech] [Biotech] [Energy] [Finance]   │
│                                         │
│  Selected: AAPL, NVDA, TSLA            │
│                                         │
│           [ Continue → ]                │
└─────────────────────────────────────────┘
```

**Step 2: Enable push (optional)**
```
┌─────────────────────────────────────────┐
│  Stay ahead of the market    Step 2/3   │
│                                         │
│  🔔                                     │
│  Enable push notifications so you       │
│  never miss a high-confidence signal.   │
│                                         │
│  [ Enable push alerts ]                 │
│  [ Skip for now ]                       │
└─────────────────────────────────────────┘
```

**Step 3: Done**
```
┌─────────────────────────────────────────┐
│  You're set.                 Step 3/3   │
│                                         │
│  ✓ Watching 5 tickers                   │
│  ✓ Push notifications on                │
│                                         │
│  Event Radar will alert you when        │
│  something moves your names.            │
│                                         │
│          [ Open my feed → ]             │
└─────────────────────────────────────────┘
```

**Step indicator spec:**
```jsx
<div className="flex items-center gap-2 mb-6">
  {[1, 2, 3].map(s => (
    <div
      key={s}
      className={cn(
        'h-1 flex-1 rounded-full transition-colors',
        s <= currentStep ? 'bg-accent-default' : 'bg-bg-elevated'
      )}
    />
  ))}
</div>
```

### 4.8 Empty States

**Feed empty state** (when watchlist mode has no events):
```jsx
<div className="flex flex-col items-center py-16 text-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-surface mb-4">
    <Zap className="h-6 w-6 text-text-tertiary" />
  </div>
  <h3 className="text-base font-semibold text-text-primary mb-1">
    No events for your watchlist
  </h3>
  <p className="text-sm text-text-secondary max-w-xs mb-4">
    When something moves your tickers, it'll show up here.
  </p>
  <button
    onClick={() => switchToAllEvents()}
    className="rounded-xl bg-bg-surface border border-border-default px-4 py-2 text-sm font-medium text-text-primary"
  >
    Browse all events
  </button>
</div>
```

**Watchlist empty state** (no tickers added):
```jsx
<div className="flex flex-col items-center py-16 text-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-default/10 mb-4">
    <Eye className="h-6 w-6 text-accent-default" />
  </div>
  <h3 className="text-base font-semibold text-text-primary mb-1">
    Build your watchlist
  </h3>
  <p className="text-sm text-text-secondary max-w-xs mb-4">
    Add the tickers you trade to get personalized high-confidence alerts.
  </p>
  <Link
    to="/watchlist"
    className="rounded-xl bg-accent-default px-4 py-2.5 text-sm font-semibold text-white"
  >
    Add tickers
  </Link>
</div>
```

---

## Summary: Priority Order

| Priority | Page/Component | Effort | Impact |
|----------|---------------|--------|--------|
| **P0** | Feed page redesign (date sections, remove hero, filter bar) | High | Critical — first impression |
| **P0** | New color palette + CSS variables | Medium | Affects everything |
| **P0** | New header (compact, connection dot) | Low | Removes redundancy |
| **P0** | Feed card redesign (compact metadata) | Medium | Density + readability |
| **P1** | Bottom nav redesign (active indicator) | Low | Polish |
| **P1** | Pull-to-refresh | Medium | Mobile-essential |
| **P1** | Skeleton loading states | Medium | Perceived performance |
| **P1** | Default unauth to All Events tab | Low | Critical for conversion |
| **P2** | Event detail collapsible sections | Medium | Reduces scroll depth |
| **P2** | Watchlist page simplification | Medium | Better onboarding |
| **P2** | Login page value proposition | Low | Conversion |
| **P3** | Settings toggle switches | Low | Polish |
| **P3** | Onboarding wizard flow | High | Better first-run |
| **P3** | Scorecard loading/error states | Low | Edge case |

---

## Appendix: Quick Reference

### Color Palette (Copy-Paste)
```
Background:    #09090b  #18181b  #27272a  #0f0f12
Borders:       #27272a  #3f3f46
Text:          #fafafa  #a1a1aa  #71717a
Accent:        #2563eb  #1d4ed8
Severity:      #dc2626  #ea580c  #ca8a04  #52525b
Status:        #16a34a  #d97706  #dc2626
```

### Border Radius
```
Cards:     rounded-2xl  (16px)
Buttons:   rounded-xl   (12px)
Badges:    rounded-full
Inputs:    rounded-xl   (12px)
```

### Spacing
```
Page px:   px-4         (16px)
Card p:    p-4          (16px)
Card gap:  space-y-3    (12px)
Section:   mt-6         (24px)
Chip gap:  gap-2        (8px)
```

### Font
```
Family:    Inter, system-ui, sans-serif
Weights:   400 (body), 500 (medium), 600 (semibold)
Sizes:     text-xl (20px), text-lg (18px), text-[15px], text-sm (14px), text-xs (12px), text-[11px], text-[10px]
```
