# Subtraction Round 6 — Audit (2026-03-25)

After 5 rounds removing ~19,000 lines (bundle 418→396KB), here's the next batch.

---

## 1. Dead Backend Services + Tests (HIGH — ~800 lines)

Three services with **zero production consumers** — only called from their own test files:

| Service | File | Lines | Test File |
|---------|------|-------|-----------|
| AlertBudgetService | `packages/backend/src/services/alert-budget.ts` | ~200 | `__tests__/alert-budget-progressive-severity.test.ts` |
| StoryGroupService | `packages/backend/src/services/story-group.ts` | ~150 | `__tests__/story-group.test.ts` |
| WinRateAnalysisService | `packages/backend/src/services/win-rate-analysis.ts` | ~150 | `__tests__/win-rate-analysis.test.ts` |

**Action:** Delete all 6 files (3 services + 3 tests). ~800 lines.

Related dead shared types (exported but zero consumers outside shared/):
- `packages/shared/src/schemas/alert-budget-types.ts`
- `packages/shared/src/schemas/story-group-types.ts`
- `packages/shared/src/schemas/win-rate-types.ts`

Remove their exports from `packages/shared/src/index.ts`. ~200 lines.

**Do NOT remove:** `regime-types.ts` (used by MarketRegimeService), `feedback-types.ts` (used by UserFeedbackService→AdaptiveClassifier).

---

## 2. Dead Frontend Code (MEDIUM — ~130 lines)

### Dead hook: `useTheme`
- **File:** `packages/web/src/hooks/useTheme.ts` — 95 lines, zero imports
- App uses `applyDarkModeGuard()` from `lib/theme-guard.ts` instead
- **Action:** Delete file

### Dead API functions in `packages/web/src/lib/api.ts`
| Function | Line | Consumers |
|----------|------|-----------|
| `getScorecardSummary()` | ~689 | Zero — no component calls it |
| `formatScorecardBucketLabel()` | ~1187 | Zero — no component calls it |
| `bulkAddToWatchlist()` | ~968 | Zero — duplicate of used `bulkAddWatchlist()` |

**Action:** Delete these 3 functions. ~30 lines.

---

## 3. Dead CSS (LOW — ~10 lines)

### Unused `confetti-fall` keyframe
- **File:** `packages/web/src/index.css` lines 126-135
- Confetti onboarding step was removed in Round 2. Animation definition left behind.
- **Action:** Delete `@keyframes confetti-fall` block

### Broken CSS variable reference
- **File:** `packages/web/src/pages/Feed/FeedFilters.tsx` lines 142, 164
- Uses `hover:border-border-bright` but `--color-border-bright` is **never defined** in the theme
- **Action:** Replace with `hover:border-border-default` or `hover:border-overlay-light`

---

## 4. Unused API Response Fields (MEDIUM — bandwidth savings)

Fields computed/fetched by backend but **never consumed** by any frontend component:

| Field | Returned by | Frontend usage |
|-------|-------------|---------------|
| `mergedFrom` | `/api/events`, `/api/v1/feed` | Zero |
| `isDuplicate` | `/api/events`, `/api/v1/feed` | Zero |
| `sourceEventId` | `/api/events` | Zero |
| `classificationConfidence` | `/api/events` | Zero |
| `llmReason` | `/api/v1/feed` | Zero |

**Action:** Stop selecting/returning these 5 fields from event API responses. Reduces payload size ~10-15% per event.

---

## 5. Over-Engineered Patterns (LOW priority — refactor candidates)

These aren't dead code but are complexity that could be simplified in a future pass:

### FeedList prop drilling (46+ props)
- `packages/web/src/pages/Feed/FeedList.tsx` takes 46+ props passed from Feed parent
- Could be simplified with React Context or by having FeedList call `useFeedState` directly

### AlertCard internal sub-components (~535 lines)
- `packages/web/src/components/AlertCard.tsx` has 7 internal helper components (PriceChip, SourceDetailStrip, OutcomeBadge, etc.) totaling ~300 lines
- SourceDetailStrip alone is 130 lines with a source-type switch
- Could be split into separate files for maintainability

### Single-use page re-export wrappers
- `packages/web/src/pages/Feed.tsx` — single line re-exporting `./Feed/index.js`
- `packages/web/src/pages/EventDetail.tsx` — same pattern
- Unnecessary indirection; could import the index directly

---

## 6. Summary

| Category | Files | Est. Lines | Priority |
|----------|-------|-----------|----------|
| Dead services + tests | 6 | ~800 | HIGH |
| Dead shared types | 3 + index.ts edits | ~200 | HIGH |
| Dead hook (useTheme) | 1 | ~95 | HIGH |
| Dead API functions | 3 in api.ts | ~30 | MEDIUM |
| Dead CSS keyframe | 1 in index.css | ~10 | LOW |
| Broken CSS var | 1 in FeedFilters.tsx | 2 lines | LOW |
| Unused API fields | events.ts, feed.ts | bandwidth | MEDIUM |
| **Total removable** | **~14 files** | **~1,135 lines** | |

Running total after R6: ~20,135 lines removed across 6 rounds.
