# Current Task: User-Facing Web App (P0 + P1)

## Overview
Build the user-facing mobile-first web app for Event Radar. This is a NEW package `packages/web/`.

**Read `docs/USER-APP-SPEC.md` carefully** — it has the full spec including design system, components, pages, and wireframes.

## This Task: P0 (Design System) + P1 (Public Feed + Alert Detail)

### P0: Project Setup + Design System

1. **Create `packages/web/`** with:
   - React 19 + Vite + TypeScript (strict, ESM)
   - Tailwind CSS v4
   - TanStack Query v5
   - React Router v7
   - Package name: `@event-radar/web`

2. **Tailwind theme** — use CSS custom properties from spec:
   ```
   --bg-primary:    #0A0A0A
   --bg-surface:    #141414
   --bg-elevated:   #1C1C1C
   --border:        #1F1F1F
   --text-primary:  #FAFAFA
   --text-secondary:#8A8A8A
   --severity-critical: #EF4444
   --severity-high:     #FB923C
   --severity-medium:   #EAB308
   --severity-low:      #6B7280
   --accent:        #3B82F6
   ```

3. **Build these components** (see spec for details):
   - `SeverityBadge` — color bar + text label + icon (CRITICAL/HIGH/MEDIUM/LOW)
   - `SourceBadge` — SEC Filing, Breaking News, Federal Register, etc.
   - `TickerChip` — tappable `$NVDA` pill, links to `/ticker/NVDA`
   - `AlertCard` — compact 3-line card for feed (severity bar + source + tickers + time | title | truncated summary)
   - `SkeletonCard` — loading placeholder
   - `EmptyState` — icon + message + CTA template
   - `BottomNav` — 4 tabs: Feed / Watchlist / Search / Settings
   - `PillBanner` — "N new alerts" sticky notification at top
   - `StatCard` — number + label for historical stats
   - `SimilarEventRow` — compact row for similar events

4. **Layout**: App shell with BottomNav, main content area, safe-area padding

### P1: Public Feed + Alert Detail Pages

5. **Feed page** (`/`):
   - Fetch from `GET /api/v1/feed?limit=50` (TanStack Query, 30s refetch)
   - Render `AlertCard` list
   - Skeleton loading on initial load (5 cards)
   - Pull-to-refresh (if possible in web)
   - "N new alerts" pill when new data arrives (don't auto-insert)
   - Empty state when no events
   - **No auth required** — public feed

6. **Alert Detail page** (`/event/:id`):
   - Fetch from `GET /api/v1/feed/:id`
   - Show: severity badge, title, metadata line (source + tickers + time)
   - AI Summary section
   - Market Context section (tickers with direction)
   - Historical Pattern card (match count, avg move T+5/T+20, win rate)
   - Similar Events list (top 3 + "Show all N →")
   - Source link
   - Feedback buttons (👍 / 👎)
   - Legal disclaimer footer
   - All sections expanded by default (no collapse)

7. **Ticker Profile page** (`/ticker/:symbol`):
   - Show ticker name at top
   - List of events for this ticker (reuse AlertCard)
   - Fetch from `GET /api/v1/ticker/:symbol`

8. **Vite config**: proxy `/api` to `http://localhost:3001` for dev

## Backend API Notes

The feed API doesn't exist yet. For now, **mock the API responses** in the frontend using realistic fake data so the UI can be built and tested independently. Create a `src/mocks/` directory with sample data.

Mock data should include:
- 10-15 sample alerts with varying severities (2 CRITICAL, 3 HIGH, 5 MEDIUM, 5 LOW)
- Various sources: SEC Filing, Breaking News, Federal Register, StockTwits, Reddit
- Tickers: NVDA, TSLA, AAPL, AMZN, META, GOOG
- At least 2 alerts with historical pattern data
- At least 1 alert with AI enrichment (summary + impact + tickers with direction)

## Constraints

- Mobile-first: design for 375px width, responsive up
- Dark theme only (use CSS vars for future light mode)
- All text must meet WCAG AA contrast (4.5:1)
- Touch targets ≥ 44px
- System font stack, monospace for numbers
- Severity: always show color + text label + icon (never color-only)
- TypeScript strict mode
- **Create a branch and PR — do NOT push to main**
- Add basic tests for components (at least render tests)
- Run `pnpm --filter @event-radar/web build` to verify before PR
- Add lint script: `"lint": "eslint src/"`
- Add eslint config (copy from `packages/dashboard/eslint.config.js`)

## File Structure
```
packages/web/
  package.json
  tsconfig.json
  vite.config.ts
  eslint.config.js
  index.html
  src/
    main.tsx
    App.tsx
    components/
      AlertCard.tsx
      SeverityBadge.tsx
      SourceBadge.tsx
      TickerChip.tsx
      SkeletonCard.tsx
      EmptyState.tsx
      BottomNav.tsx
      PillBanner.tsx
      StatCard.tsx
      SimilarEventRow.tsx
    pages/
      Feed.tsx
      EventDetail.tsx
      TickerProfile.tsx
      Watchlist.tsx      (placeholder)
      Search.tsx         (placeholder "Coming Soon")
      Settings.tsx       (placeholder)
    hooks/
      useAlerts.ts
      useEventDetail.ts
    mocks/
      alerts.ts
      event-detail.ts
    types/
      index.ts
    lib/
      api.ts
      format.ts          (relative time, number formatting)
```
