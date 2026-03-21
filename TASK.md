# TASK: Fix PR #181 Review Issues (Round 2)

⚠️ **DO NOT MERGE THIS PR. DO NOT MERGE. ONLY COMMIT AND PUSH.** ⚠️

## Context
PR #181 (`fix/sprint-0-bug-fixes`) was reviewed by Codex. Four issues found. You are on the `fix/sprint-0-bug-fixes` branch. Fix all issues, commit, and push. **DO NOT create a new PR. DO NOT merge.**

## Issues to Fix

### 1. B5 regression — activeTab defaults to watchlist for all users
**File**: `packages/web/src/pages/Feed/useFeedState.ts:136`
**Problem**: `activeTab` now starts as `'watchlist'` unconditionally. The init effect only overrides for explicit `tab=` params or authenticated users. Logged-out users and authenticated users without a saved tab default into empty Watchlist.
**Fix**: Default `activeTab` to `'all'`. Only switch to `'watchlist'` when the user is authenticated AND has a saved tab preference of `'watchlist'`.

### 2. B4 incomplete — light mode users stuck with no recovery
**File**: `packages/web/src/pages/Settings.tsx:304` and `packages/web/index.html:16-17`
**Problem**: Settings panel hides the theme toggle, but the bootstrap script in index.html still reads `localStorage.er-theme`. Users who previously selected light mode are stuck with broken light theme and no way to switch back.
**Fix**: On app startup, force-remove any stored theme preference and set dark mode. Add a one-time migration: if `localStorage.er-theme` exists and is not `'dark'`, delete it and apply dark class. This ensures all users are on dark mode.

### 3. B2 duplicate content — Evidence tab shows market context twice on desktop
**File**: `packages/web/src/pages/EventDetail/index.tsx:181-189` and `:204-206`
**Problem**: Evidence tab renders `EventMarketData` and `RegimeContextCard` in both the main column AND the desktop aside. On `lg` screens, users see duplicate blocks.
**Fix**: Only render market context cards in ONE location. For the Evidence tab, render them in the main column only (not in the aside). The aside should show different content or be empty for the Evidence tab.

### 4. Tab state not reset when switching events in split view
**File**: `packages/web/src/pages/EventDetail/index.tsx:89`
**Problem**: `activeSection` is initialized once and never resets when `id` (selectedEventId) changes. Clicking a new event in the feed keeps the old event's tab.
**Fix**: Add a `useEffect` that resets `activeSection` to `'summary'` whenever `id` changes.

## Requirements
- Build must pass: `pnpm --filter @event-radar/web build`
- Commit message: `fix: address review issues — tab default, dark mode migration, evidence dedup, tab reset`

## ⚠️ DO NOT MERGE. COMMIT AND PUSH ONLY. ⚠️
