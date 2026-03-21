# TASK: Fix Sprint 3 Retention PR #184 Review Issues

## Context
PR #184 (`feat/sprint-3-retention`) was reviewed by Codex. Four issues found, all require fixes. You are fixing the existing branch. Commit, push, and **⚠️ DO NOT MERGE THE PR. DO NOT MERGE. STOP AFTER PUSHING.**

## Issues to Fix

### 1. 🚨 Watchlist stats query not invalidated on mutations
**Files**: `packages/web/src/pages/Watchlist.tsx`, `packages/web/src/hooks/useWatchlist.ts`
**Problem**: The `['watchlist-feed-stats']` query is not keyed by watchlist contents, and watchlist mutations (add/remove/reorder) don't invalidate it. With 5min staleTime, stats show stale data after changes. Stats even persist after removing all tickers.
**Fix**: 
- Key the query by sorted ticker list: `['watchlist-feed-stats', ...sortedTickers]`
- Add `queryClient.invalidateQueries({ queryKey: ['watchlist-feed-stats'] })` to all mutation onSuccess callbacks in useWatchlist.ts
- Disable the query when watchlist is empty (return no data)

### 2. ⚠️ Daily briefing dismiss uses UTC, display uses local time
**File**: `packages/web/src/components/DailyBriefing.tsx`
**Problem**: Dismissal key uses `new Date().toISOString().slice(0, 10)` (UTC date), but the banner shows `toLocaleDateString` (local date). In US timezones the briefing can reappear in the evening.
**Fix**: Use the same local date string for both dismissal key and display. E.g. `new Date().toLocaleDateString('en-CA')` (YYYY-MM-DD format in local time) for the dismiss key.

### 3. ⚠️ Daily briefing label wrong on non-watchlist tabs
**File**: `packages/web/src/components/DailyBriefing.tsx`, `packages/web/src/pages/Feed/FeedList.tsx`
**Problem**: Briefing always says "for your watchlist" but on the `all` tab it's summarizing all events, not just watchlist. Misleading.
**Fix**: Pass a `scope` or `label` prop from FeedList to DailyBriefing. When on `all` tab, say "across all events" instead of "for your watchlist". Or only render DailyBriefing on the watchlist tab.

### 4. ⚠️ Push permission denied recovery UX not PWA-compatible
**File**: `packages/web/src/pages/Settings.tsx`
**Problem**: Recovery instructions say "click the lock/info icon in the address bar" — doesn't work on iOS Safari or installed PWA (no address bar).
**Fix**: Detect platform and show appropriate instructions:
- Desktop browsers: current lock icon guidance
- iOS Safari: "Go to Settings > Safari > [website] > Notifications"
- Android PWA: "Go to Settings > Apps > [app name] > Notifications"
- Installed PWA (no address bar): "Reinstall the app or check your device notification settings"

## Requirements
- Build must pass: `pnpm --filter @event-radar/web build`
- Commit message: `fix: address Sprint 3 review — cache keys, timezone, briefing scope, PWA UX`

## ⚠️ CRITICAL: DO NOT MERGE THE PR. PUSH AND STOP.
