# TASK.md — Phase 4 Sprint 16 + 17: UX Defects + Content Quality

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Fix UX defects from CrowdTest + Alex review, plus content quality improvements.
Create ONE PR with all changes.

## Sprint 16: UX Defect Fixes

### 16.1 Fix "What is Smart Feed?" button
- File: `packages/web/src/pages/Feed/FeedTabs.tsx`
- The "What is Smart Feed?" button/tooltip is broken (does nothing on click)
- Make it show a popover/tooltip explaining: "Smart Feed shows events matching your watchlist tickers, plus all CRITICAL events and HIGH-severity events from trusted sources like SEC filings and breaking news."
- Use a simple click-to-toggle popover, not hover (mobile-friendly)

### 16.2 Settings Save confirmation feedback
- File: `packages/web/src/pages/Settings.tsx`
- After saving settings successfully:
  - Change Save button text to "Saved ✓" with green styling for 2 seconds, then revert
  - On failure: show toast "Failed to save. Please try again."
- Check if the Discord webhook "Test" button also needs feedback (add if missing)
- NOTE: There's already some save state logic — enhance it, make sure the button visually changes

### 16.3 Sort preference persistence
- Files: `packages/web/src/pages/Feed/index.tsx`, `packages/web/src/pages/Feed/FeedHeader.tsx`
- Store the user's feed sort preference in localStorage key `er-feed-sort`
- On page load, read from localStorage and apply as default sort
- When user changes sort, save to localStorage immediately

### 16.4 Watchlist new ticker appends to bottom
- File: `packages/web/src/pages/Watchlist.tsx`
- When adding a new ticker to watchlist, append it to the END of the list
- Don't reorder existing tickers (e.g. don't sort alphabetically after add)
- Check the API/mutation — if the backend returns sorted, handle client-side ordering

## Sprint 17: Content Quality

### 17.1 Evidence tab — real source evidence
- Files: `packages/web/src/pages/EventDetail/EventEnrichment.tsx`, `packages/web/src/pages/EventDetail/index.tsx`
- Current problem: Evidence tab just repeats the AI-generated summary text
- Fix: Show REAL evidence from the event's source data:
  - **Source URL**: clickable link to original source (from event metadata `sourceUrl` or `url` field)
  - **Raw excerpt**: original source text (from `rawContent` or `description` field), not AI-rewritten
  - **Source type indicator**: "SEC Filing", "Breaking News", "Social Media", etc.
  - If event has `metadata.accessionNumber` → show SEC EDGAR link
  - If no additional evidence available: show "Source data not available for this event. Classification was based on the original alert text."
- Check the event API response to see what source fields are available

### 17.2 History page — default HIGH+ severity filter  
- File: `packages/web/src/pages/History.tsx` + `packages/web/src/hooks/useHistory.ts`
- Default severity filter to `['HIGH', 'CRITICAL']` when page first loads
- Show a subtle banner at top: "Showing important events only" with a "Show all →" link that clears the filter
- If user explicitly changes filter, respect their choice (don't override)
- Store filter preference in localStorage `er-history-severity` for persistence

### 17.3 Remove dummy source data
- Backend: Write a SQL migration `packages/backend/src/db/migrations/004-remove-dummy-events.sql`
  - `DELETE FROM events WHERE source = 'dummy';`
  - `DELETE FROM pipeline_audit WHERE source = 'dummy';`
  - Also remove from delivery_feed if exists
- Frontend: In any source filter dropdown, exclude 'dummy' from the options list
- File: `packages/web/src/pages/Feed/FeedFilters.tsx` — filter out 'dummy' from source options

### 17.4 Event detail enrichment consistency
- File: `packages/web/src/pages/EventDetail/EventEnrichment.tsx`
- For ALL HIGH/CRITICAL events, ensure consistent sections are shown:
  - Bull Case + Bear Case (if LLM provided them)
  - If a section is missing from LLM response, show "Analysis not available" in gray text
  - Don't show empty sections or wildly different layouts between events
- Check what fields the enrichment API returns and handle missing fields gracefully

## Testing Requirements
- Run `pnpm --filter @event-radar/web test` — all tests must pass
- Run `pnpm --filter @event-radar/backend test` — all tests must pass  
- If you add new UI logic, add corresponding test cases
- Build must succeed: `pnpm --filter @event-radar/web build`

## PR
- Branch: `feat/phase4-s16-s17-ux-content`
- Title: `feat: Phase 4 S16+S17 — UX defect fixes + content quality improvements`
- Body: List all changes with checkboxes
- **DO NOT MERGE. Create PR and stop.**
