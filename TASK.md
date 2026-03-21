# TASK: Fix PR #183 Review Issues (Sprint 2 Trust Reframe)

⚠️ **DO NOT MERGE THE PR. DO NOT MERGE. STOP AFTER PUSHING.**

## Context
PR #183 (`feat/sprint-2-trust-reframe`) was reviewed by Codex. Three issues found — CHANGES REQUESTED. You are on the `feat/sprint-2-trust-reframe` branch. Fix all issues, commit, and push.

## Issues to Fix

### 1. 🔴 Hard-coded scorecard metrics (HIGH)
**File**: `packages/web/src/pages/Scorecard.tsx:230-248`
**Problem**: "15+ sources", "15 Active Sources", "< 5 min Avg Alert Latency" are hard-coded values, not from API data. They will become stale.
**Fix**: Either:
- Pull these values from `ScorecardSummary` API response (preferred — add fields to the API if needed), OR
- If the API doesn't have these fields yet, clearly label them as static product description (e.g. "Up to 15 sources" or similar framing that doesn't imply live data), OR
- Remove them and replace with actual dynamic metrics from the existing API data

### 2. 🔴 Wrong "5 trading days" copy (HIGH)
**File**: `packages/web/src/pages/EventDetail/WhatHappenedNext.tsx:80-93`
**Problem**: New all-pending branch says "results appear after 5 trading days" but the component uses a 1-day outcome window. First follow-up can appear after 1 trading day.
**Fix**:
- Change copy to accurately reflect the outcome window (e.g. "first results typically appear within 1 trading day")
- Restore the event-price baseline row that was removed from the pending state

### 3. ⚠️ Collapsible panel state not in URL (MEDIUM)
**File**: `packages/web/src/pages/Scorecard.tsx:546-690`
**Problem**: Five collapsible panels use local `useState` — state resets on reload, can't be deep-linked/shared.
**Fix**: Either:
- Sync expanded panel state to URL search params (preferred, consistent with existing app patterns), OR
- Keep the most important sections (like "Recent Alerts" and the main scorecard grid) expanded by default so reload doesn't hide critical content

## Requirements
- Build passes: `pnpm --filter @event-radar/web build`
- Lint passes: `pnpm --filter @event-radar/web lint`
- Commit message: `fix: address PR #183 review — dynamic metrics, correct copy, URL-synced panels`

## ⚠️ DO NOT MERGE. Push and stop. Only 晚晚 merges.
