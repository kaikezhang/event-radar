# Subtraction Round 7 — Review

**Date:** 2026-03-26
**Rounds 1–6 total:** ~21,500 lines removed, bundle 418→396KB
**Round 7 estimate:** ~2,714 lines removable

---

## 1. Dead Services + Their Tests (~2,143 lines)

### Services with zero production consumers

| File | Lines | Notes |
|------|-------|-------|
| `packages/backend/src/services/direction-analytics.ts` | 308 | Zero imports outside self + test. Duplicate of `classification-accuracy.ts` |
| `packages/backend/src/services/rule-engine-v2.ts` | 437 | Zero imports outside self + test. Superseded DSL rule engine, never wired in |
| `packages/backend/src/services/weekly-report.ts` | 289 | Zero imports outside self + test. Orphaned feature |
| `packages/backend/src/services/progressive-severity.ts` | 461 | Zero imports outside self. No test file exists either |
| `packages/backend/src/pipeline/classification-metrics.ts` | 153 | Prometheus metrics defined but never called |
| **Subtotal** | **1,648** | |

### Dead test files (testing above dead services)

| File | Lines |
|------|-------|
| `packages/backend/src/__tests__/direction-analytics.test.ts` | 282 |
| `packages/backend/src/__tests__/rule-engine-v2.test.ts` | 257 |
| `packages/backend/src/__tests__/weekly-report.test.ts` | 308 |
| **Subtotal** | **847** |

**DO NOT remove:**
- `mock-market-regime.ts` — used as test utility by `llm-enricher.test.ts`, `pipeline.test.ts`, `rich-delivery-enricher.test.ts`
- `scorecard-aggregation.ts` — imported by `routes/alert-scorecard.ts`

---

## 2. Dead DB Schema Definitions (~55 lines)

In `packages/backend/src/db/schema.ts`:

| Table | Lines | Notes |
|-------|-------|-------|
| `priceCache` (line 94) | ~12 | Zero references anywhere in production code |
| `storyGroups` (line 185) | ~25 | Story feature removed in R1, service deleted in R6 |
| `storyEvents` (line 210) | ~18 | Companion table to storyGroups, also dead |

**Action:** Delete table definitions. Create a Drizzle migration to drop these tables (or just remove schema defs if tables don't exist in prod).

---

## 3. Dead Shared Type Files (~116 lines)

| File | Lines | Notes |
|------|-------|-------|
| `packages/shared/src/schemas/confirmation-types.ts` | 31 | Zero imports across entire codebase |
| `packages/shared/src/schemas/dedup-types.ts` | 63 | Zero imports across entire codebase |
| `packages/shared/src/schemas/impact-types.ts` | 22 | Zero imports across entire codebase |
| **Subtotal** | **116** | |

**Action:** Delete these 3 files and remove their export blocks from `packages/shared/src/index.ts`:
- Lines 94–105 (dedup-types exports)
- Lines 106–111 (confirmation-types exports)
- Lines 194–199 (impact-types exports)

---

## 4. Unused npm Dependencies

| Package | In | Notes |
|---------|----|-------|
| `recharts` (^2.15.4) | `packages/web/package.json` | Zero imports in web/src. Used only in `packages/dashboard/` — remove from web |

**Action:** `pnpm --filter @event-radar/web remove recharts`

---

## 5. NOT Dead (Verified Active)

These were investigated but confirmed still in use:

- `scorecard-aggregation.ts` — imported by `routes/alert-scorecard.ts`
- `mock-market-regime.ts` — test utility used by 3+ test files
- `accuracy-types.ts` — used in 25+ files
- `adaptive-types.ts` — used in 7 files
- `social-types.ts` — used by keyword extractor + scanners
- `crawlee`, `playwright`, `cheerio`, `resend` — all have active imports in backend
- `classification-accuracy.ts` — active service (direction-analytics is the dead duplicate)
- All route files in `routes/` are actively registered

---

## Summary

| Category | Lines |
|----------|-------|
| Dead services | 1,648 |
| Dead test files | 847 |
| Dead shared types | 116 |
| Dead DB schema | ~55 |
| Dead npm deps | recharts (~0 lines, bundle savings) |
| **Total** | **~2,666 lines** |

### Execution Order

1. Delete 5 dead service/pipeline files
2. Delete 3 dead test files
3. Delete 3 dead shared type files + remove exports from `index.ts`
4. Remove 3 dead table definitions from `db/schema.ts`
5. Remove `recharts` from web `package.json`
6. Run `pnpm --filter @event-radar/backend test` — all tests must pass
7. Run `pnpm --filter @event-radar/shared build` — must succeed
8. Run `pnpm --filter @event-radar/web build` — must succeed
