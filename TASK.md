# TASK: Fix PR #186 Review Issues (Sprint 5 — Smart Feed)

⚠️ **DO NOT MERGE THE PR. DO NOT MERGE. NEVER MERGE.** ⚠️
Create commits, push to the branch, and STOP.

## Context
You are on branch `feat/sprint-5-smart-feed`. Codex reviewed PR #186 and found 3 issues. Fix all of them.

## Issues to Fix

### 1. Smart Feed not invalidated on watchlist change
**Files**: `packages/web/src/hooks/useAlerts.ts`, `packages/web/src/hooks/useWatchlist.ts`
**Problem**: `useAlerts()` keys the feed query as `['feed', limit, watchlist, mode]`. Watchlist mutations only invalidate `['watchlist']` / `['watchlist-feed-stats']`. When a user adds/removes a ticker while on Smart Feed, the feed shows stale data until the 30s poll or manual refresh.
**Fix**: After watchlist mutation (add/remove ticker), also invalidate queries starting with `['feed']`. Use `queryClient.invalidateQueries({ queryKey: ['feed'] })` in the watchlist mutation callbacks.

### 2. Event search has no error handling
**Files**: `packages/web/src/components/TickerSearch.tsx`
**Problem**: `searchEvents()` throws on API/auth/network failures, but the component only reads `data` + `isLoading`. Errors fall through to "No events found" empty state, masking real outages.
**Fix**: Read `error` / `isError` from the query hook. Show an error state (e.g. "Search failed — please try again") when `isError` is true. Add a retry button.

### 3. Smart Feed explainer not accessible
**Files**: `packages/web/src/pages/Feed/FeedTabs.tsx`
**Problem**: The Info tooltip uses `onMouseEnter`/`onMouseLeave` on a `<div>`. Not keyboard-focusable, not touch-accessible.
**Fix**: Change the `<div>` to a `<button>` with `aria-label="What is Smart Feed?"`. Add `onFocus`/`onBlur` handlers alongside hover handlers. For mobile, toggle on click/tap.

## Requirements
- Build passes: `pnpm --filter @event-radar/web build`
- Commit message: `fix: address PR #186 review — feed invalidation, search errors, a11y`
- Push to `feat/sprint-5-smart-feed`

## ⚠️ DO NOT MERGE. Push and stop. ⚠️
