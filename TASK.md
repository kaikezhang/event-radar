# TASK: Fix PR #182 Review Issues

⚠️ **DO NOT MERGE THIS PR. DO NOT MERGE. STOP AFTER PUSHING.**

## Context
You are on branch `feat/sprint-1-price-integration` (PR #182). Codex reviewed and found 3 issues. Fix issues #1 and #3 below. Issue #2 is accepted as follow-up.

## Issue #1: Add `outcome` field to EventDetailData type

**Files**: `packages/web/src/types/index.ts`, `packages/web/src/hooks/useEventDetail.ts`
**Problem**: The hook returns `{ ...detail, outcome }` but `EventDetailData` type doesn't have an `outcome` field. The field bypasses compile-time checking.
**Fix**: Add `outcome?: EventOutcome | null` to the `EventDetailData` interface in `types/index.ts`. Import `EventOutcome` type if needed.

## Issue #3: Flat price moves (change === 0) rendered as down/negative

**Files**: `packages/web/src/components/AlertCard.tsx`, `packages/web/src/pages/EventDetail/WhatHappenedNext.tsx`
**Problem**: Both `PriceChange`/`formatChange` use `change > 0` for positive branch, so `change === 0` falls into the red `▼` styling. Should show neutral/flat.
**Fix**: 
- Add a third branch for `change === 0`: show gray/neutral color, no arrow or a `—` indicator, text like "Flat" or "0.00%"
- In verdict helpers, treat `change === 0` as neutral/unclear rather than wrong call for bearish setups

## Requirements
- `pnpm --filter web build` must pass
- Commit message: `fix: add outcome type to EventDetailData and handle flat price changes`
- Push to the same branch

## ⚠️ DO NOT MERGE. CREATE NO NEW PR. JUST COMMIT AND PUSH.
