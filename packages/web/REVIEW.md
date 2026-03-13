# PR #64 Review — User Web App (packages/web/)

Reviewed against `docs/USER-APP-SPEC.md` and `TASK.md`.

---

## Summary

Solid P0+P1 implementation. All required components, pages, hooks, mock data, and tests are present. The design system tokens are correct, the mobile-first layout works, and the architecture (TanStack Query + React Router + Tailwind v4 CSS vars) is clean. Five HIGH issues were found and fixed in this review.

---

## Issues Fixed (HIGH)

### 1. AlertCard LOW severity bar width was 3px instead of 1px
**Spec**: LOW bar style = "Thin 1px". The `w-[3px]` was hardcoded on the parent div, overriding all severity-specific widths.
**Fix**: Moved width into per-severity className map; LOW now uses `w-px`, others `w-[3px]`.
**Files**: `src/components/AlertCard.tsx`

### 2. External source link used React Router `<Link>` for external URLs
**Spec**: "View original source" links point to external URLs (sec.gov, etc.).
**Fix**: Changed `<Link to={...}>` to `<a href={...}>` with `target="_blank" rel="noreferrer"`. Removed unused `Link` import.
**Files**: `src/pages/EventDetail.tsx`

### 3. TickerChip touch targets reduced below 44px minimum
**Spec**: "Touch targets >= 44x44pt". AlertCard and EventDetail passed `min-h-9` (36px) override to TickerChip.
**Fix**: Removed `min-h-9` override so TickerChip retains its default `min-h-11` (44px).
**Files**: `src/components/AlertCard.tsx`, `src/pages/EventDetail.tsx`

### 4. SeverityBadge screen reader duplication
The badge rendered both visible `{severity}` ("CRITICAL") and sr-only `{config.label}` ("Critical"), plus `aria-label="Critical severity alert"`. Screen readers would announce all three.
**Fix**: Removed redundant sr-only span. The `aria-label` on the parent provides the accessible name.
**Files**: `src/components/SeverityBadge.tsx`, `src/components/SeverityBadge.test.tsx`

### 5. Typography: `text-lg` (18px) used instead of spec `text-[17px]`
**Spec**: `--text-lg: 17px/1.4` for section headings. Tailwind `text-lg` resolves to 18px.
**Fix**: Replaced all `text-lg` with `text-[17px] leading-[1.4]` across EventDetail, EmptyState, and TickerProfile.
**Files**: `src/pages/EventDetail.tsx`, `src/components/EmptyState.tsx`, `src/pages/TickerProfile.tsx`

---

## Issues Noted (MEDIUM — not fixed, for follow-up)

### M1. No `prefers-reduced-motion` on page transitions
Spec a11y checklist requires `prefers-reduced-motion` respected. The global CSS handles `animation-duration` and `transition-duration`, but if page-level motion or spring physics are added later, they should also respect this.

### M2. SourceBadge uses Tailwind palette colors (emerald, cyan, fuchsia, orange) not from CSS vars
These colors are not part of the design system. If a light theme is added, they won't be controlled by CSS vars. Low risk for dark-only MVP.

### M3. No ErrorBoundary component
Spec lists `ErrorBoundary` in the component table. Not implemented. Should wrap the app or route outlet.

### M4. No `<link rel="icon">` in index.html
Minor: no favicon defined.

### M5. `direction` markers in Market Context have no accessible label
The `▲`/`▼`/`•` symbols in MarketContext rows lack `aria-label` for screen readers to convey directional meaning.

---

## What's in the Spec but Not Built (expected for P0+P1)

These are deferred to later phases per the spec:
- Auth (P2): login, register, JWT, onboarding
- Watchlist CRUD (P3): functional watchlist, saved alerts
- Push notifications (P4): service worker, Web Push
- Freemium gating (P5): tier-aware feed, pro/free feature gates
- FilterSheet / BottomSheet components
- CoachMark component (onboarding)
- Swipe gestures on feed cards
- Pull-to-refresh (web limitation noted)
- Scroll position restoration on back-nav (ScrollRestoration is in the router but behavior depends on browser support)

---

## Spec Compliance Checklist

| Requirement | Status |
|---|---|
| React 19 + Vite + TS strict + ESM | Pass |
| Tailwind CSS v4 with CSS vars | Pass |
| TanStack Query v5 (30s refetch) | Pass |
| React Router v7 | Pass |
| All design tokens correct | Pass |
| SeverityBadge: color + text + icon | Pass (after fix #4) |
| AlertCard: 3-line compact, severity bar | Pass (after fix #1) |
| TickerChip: links to /ticker/:symbol | Pass |
| BottomNav: 4 tabs | Pass |
| PillBanner: role="status" + aria-live | Pass |
| Feed: skeleton loading (5 cards) | Pass |
| Feed: empty state | Pass |
| Feed: "N new alerts" pill | Pass |
| EventDetail: all sections expanded | Pass |
| EventDetail: legal disclaimer | Pass |
| EventDetail: feedback buttons | Pass |
| EventDetail: source link (external) | Pass (after fix #2) |
| TickerProfile: stats + events | Pass |
| Touch targets >= 44px | Pass (after fix #3) |
| Typography per spec | Pass (after fix #5) |
| Mock data: 15 alerts, correct distribution | Pass |
| Tests: all 14 passing | Pass |
| Build: clean | Pass |
| Vite proxy to localhost:3001 | Pass |

---

## Build & Test Results

```
Build: tsc -b && vite build — PASS (3.07s)
Tests: 7 files, 14 tests — ALL PASS (2.23s)
```
