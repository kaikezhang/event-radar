# TASK: Fix PR #185 Review Issues (Sprint 4 UX Polish)

⚠️ **DO NOT MERGE THE PR. DO NOT MERGE. STOP AFTER PUSHING.** ⚠️

## Context
PR #185 (`feat/sprint-4-ux-polish`) was reviewed by Codex with CHANGES REQUESTED. You are on the `feat/sprint-4-ux-polish` branch. Fix all 4 issues, commit, and push. 

## Issues to Fix

### 1. History date filters not counted as active
**Files**: `packages/web/src/pages/History.tsx` (~lines 34, 83)
**Problem**: `hasActiveFilters` / `activeFilterCount` only checks severity, source, ticker. Date range (from/to) is ignored. If user changes date range, Filters button stays inactive, Reset disappears, collapsed chip row shows nothing.
**Fix**: Include non-default `from`/`to` in `hasActiveFilters` and `activeFilterCount`. Show date range in collapsed filter summary chips.

### 2. History filters missing aria attributes
**File**: `packages/web/src/pages/History.tsx` (~line 61)
**Problem**: Filter toggle button doesn't have `aria-expanded`/`aria-controls`. Panel has no label. Screen readers can't tell if filter region is open/closed.
**Fix**: Add `aria-expanded={isOpen}`, `aria-controls="history-filters-panel"` to toggle button. Add `id="history-filters-panel"` and `role="region"` with `aria-label="Event filters"` to the panel.

### 3. Blue accent migration incomplete in feed filters
**Files**: `packages/web/src/pages/Feed/FeedHeader.tsx` (~line 63), `packages/web/src/pages/Feed/FeedFilters.tsx` (~lines 63, 123)
**Problem**: Header/filter trigger migrated to `interactive-default` but active chips, selected options, and save controls inside FeedFilters still use `accent-default`. Mixed accent systems visible simultaneously.
**Fix**: Migrate all feed filter components to use the same token consistently. Use `interactive-default` throughout (or `accent-default` throughout — pick one and be consistent).

### 4. WebSocket indicator lacks accessible name
**File**: `packages/web/src/App.tsx` (~line 42)
**Problem**: Top-bar WS indicator is color-only with `title` for meaning. Not focusable, no accessible name. Touch/screen-reader users can't get connection status.
**Fix**: Add `role="status"` and `aria-label` with the current connection state text (e.g., "Connected", "Reconnecting", "Offline"). Or add a visually-hidden `<span>` with the status text.

## Requirements
- Build passes: `pnpm --filter @event-radar/web build`
- Lint passes: `pnpm --filter @event-radar/web lint`
- Commit message: `fix: address PR #185 review — filters, a11y, accent consistency`
- Push to `feat/sprint-4-ux-polish` branch

## ⚠️ DO NOT MERGE. PUSH AND STOP.
