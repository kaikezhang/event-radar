# Subtraction Rounds 9 & 10 (FINAL) — Exhaustive Dead Code Audit

**Date:** 2026-03-26
**Rounds 1–8 removed:** ~28,500 lines estimated. Bundle 418→396KB.
**This round:** Final sweep — every export, every dep, every file.

---

## Methodology

Audited every `export` in every package against all imports across the full monorepo. Checked every dependency in every `package.json`. Inspected all test files, config files, and dead directories.

---

## 1. Dead Root Dependencies (package.json)

All 4 root `dependencies` are misplaced or unused:

| Dependency | Status | Action |
|-----------|--------|--------|
| `http-proxy` ^1.18.1 | **UNUSED** — zero imports in entire codebase | Delete |
| `ws` ^8.19.0 | **UNUSED** — `@fastify/websocket` handles WebSocket; `ws` never imported directly | Delete |
| `@fastify/websocket` ^11.2.0 | **DUPLICATE** — already in `packages/backend/package.json` | Delete from root |
| `lightweight-charts` ^5.1.0 | **DUPLICATE** — already in `packages/web/package.json` | Delete from root |

**Action**: Remove all 4 entries from root `package.json` `dependencies`. The root should have zero runtime dependencies.

---

## 2. Dead Directories (~454 lines)

### `packages/landing/` — Dead artifact
- Contains only `index.html` (454 lines)
- No `package.json`, no build scripts, no TypeScript
- Not imported or referenced by any other package
- Last touched 2026-03-15 (CTA alignment)
- **Action**: Delete entire directory

### `packages/e2e/` — Empty shell
- Contains only `.turbo/turbo-test.log` (cache artifact)
- No `package.json`, no source files
- CI has it disabled: `# TODO: Re-enable e2e when Docker issues are resolved`
- **Action**: Delete entire directory

**Estimated removal**: ~454 lines (landing HTML) + directory cleanup

---

## 3. Dead Frontend Exports — `packages/web/`

### `packages/web/src/lib/format.ts` (2 dead functions, ~12 lines)

| Export | Imports | Action |
|--------|---------|--------|
| `formatNumber()` | 0 (dashboard has its own in `dashboard/src/lib/utils.ts`) | Delete function |
| `formatMonthYear()` | 0 — never imported anywhere | Delete function |

### `packages/web/src/lib/font-scale.ts` (2 exports to un-export, 0 lines removed)

| Export | External Imports | Action |
|--------|-----------------|--------|
| `FONT_SCALE_STORAGE_KEY` | 0 (used internally only) | Remove `export` keyword |
| `applyFontScale()` | 0 (used internally by `setStoredFontScale` and `applyStoredFontScaleGuard`) | Remove `export` keyword |

### `packages/web/src/hooks/useTickerBatchPrices.ts` (1 export to un-export)

| Export | External Imports | Action |
|--------|-----------------|--------|
| `getViewportTickerSymbols()` | 0 production imports (only test file imports it) | Keep exported for testability — **no action** |

**Estimated removal**: ~12 lines

---

## 4. Dead Backend Exports — Un-export Only (keep as internal)

### `packages/backend/src/services/` — 26 unused exports

These are exported but never imported outside their defining file. All are used internally. Action: remove `export` keyword.

| File | Unused Exports |
|------|---------------|
| `market-regime.ts` | `getRegimeLabel()`, `toRegimeHistoryPoint()` |
| `pattern-matcher.ts` | `toHistoricalContext()`, `PatternConfidenceLabel`, `PatternMatchExample`, `PatternMatchCase`, `PatternMatcherOptions` |
| `llm-classifier.ts` | `ClassifyInput`, `ClassifyResponse`, `LLMClassifierServiceOptions` |
| `delivery-kill-switch.ts` | `KillSwitchStatus` |
| `health-monitor.ts` | `DeliveryStats`, `HealthMonitorOptions` |
| `notification-settings-store.ts` | `UserNotificationSettings`, `UserNotificationSettingsPatch` |
| `outcome-tracker.ts` | `OutcomeRecord` |
| `push-subscription-store.ts` | `UpsertPushSubscriptionInput` |
| `scorecard-aggregation.ts` | `ScorecardSummarySchema`, `ScorecardSeverityBreakdownSchema`, `ScorecardSeverityBreakdownItem` |
| `scorecard-semantics.ts` | `ScorecardDirectionVerdict`, `ScorecardSetupVerdict`, `ScorecardVerdictWindowLabel` |
| `similarity.ts` | `AggregateStats` |
| `user-preferences-store.ts` | `NotificationPreferencesPatch` |
| `user-webhook-delivery.ts` | `UserWebhookAlert`, `UserWebhookDeliveryService` |
| `golden-judge.ts` | `GoldenDirectionSchema`, `GoldenDirection`, `GoldenEventSampleSchema`, `GoldenJudgeThresholds`, `GoldenJudgeRegressionMetric`, `GoldenJudgeRegressionResult`, `RunGoldenJudgeOptions` |
| `create-market-data-provider.ts` | `CreateMarketDataProviderOptions` |
| `alert-scorecard.ts` | `AlertScorecardSchema`, `AlertScorecard` |

### `packages/backend/src/pipeline/` — 16 unused exports

| File | Unused Exports |
|------|---------------|
| `alert-filter.ts` | `FilterResult` |
| `audit-log.ts` | `AuditRecord` |
| `deduplicator.ts` | `DeduplicatorOptions` |
| `dedup-strategies.ts` | `StrategyMatch` |
| `delivery-gate.ts` | `DeliveryGateResult` |
| `event-type-mapper.ts` | `MappedEventContext` |
| `historical-enricher.ts` | `HistoricalEnricherConfig` |
| `llm-classifier.ts` (pipeline) | `LlmClassifierOptions` |
| `llm-enricher.ts` | `LLMEnricherDependencies`, `LLMEnrichmentPromptContext` |
| `llm-gatekeeper.ts` | `GatekeeperResult` |
| `llm-queue.ts` | `QueueItem` |
| `pipeline-limiter.ts` | `PipelineTask`, `PipelineLimiterOptions` |
| `story-tracker.ts` | `StoryTrackerOptions` |
| `ticker-inference.ts` | `InferredTickerResult` |

**Total**: 42 `export` keywords to remove. ~0 lines deleted (just keyword removal), but cleaner API surface.

---

## 5. Test Files — All Valid

All 177 test files across the project test features that currently exist. No orphaned test files found. The conditional skip in `websocket.test.ts` (loopback unavailable in sandbox) is appropriate.

---

## 6. Configuration — Clean

| Config | Status |
|--------|--------|
| `tsconfig` paths | No dead path mappings |
| `.env.example` | All vars are referenced in source |
| Tailwind config | Using Tailwind v4 with Vite plugin, no dead config |
| CI workflow | Clean (except disabled e2e — addressed above) |

---

## 7. Residual Observations (Not Actionable for Subtraction)

These are not dead code but worth noting:

- **Console statements**: ~15 `console.log/warn/info` calls in `base-scanner.ts`, `auth.ts`, `index.ts`, scanner files, `web-push-channel.ts`. All appear intentional for operational logging.
- **TODO comment** in `prediction-helpers.ts:57`: Rule-engine fallback direction. Should be triaged separately.
- **Dashboard package** (`packages/dashboard/`): 3,638 lines, actively maintained (last commit 2026-03-14), used for operator observability. Not dead.

---

## Execution Plan

### Round 9: Deletions

| # | Action | Est. Lines |
|---|--------|-----------|
| 1 | Delete `packages/landing/` directory | ~454 |
| 2 | Delete `packages/e2e/` directory | ~0 (only cache file) |
| 3 | Remove 4 root `package.json` dependencies | ~4 |
| 4 | Delete `formatNumber()` from `web/src/lib/format.ts` | ~3 |
| 5 | Delete `formatMonthYear()` from `web/src/lib/format.ts` | ~6 |
| **Subtotal** | | **~467** |

### Round 10: Un-exports (API surface cleanup)

| # | Action | Exports Cleaned |
|---|--------|----------------|
| 1 | Un-export 26 backend service exports | 26 |
| 2 | Un-export 16 pipeline exports | 16 |
| 3 | Un-export `FONT_SCALE_STORAGE_KEY` in `font-scale.ts` | 1 |
| 4 | Un-export `applyFontScale` in `font-scale.ts` | 1 |
| **Subtotal** | | **44 exports cleaned** |

---

## FINAL TALLY — All 10 Subtraction Rounds

| Round | Focus | Lines Removed |
|-------|-------|--------------|
| R1 | Watchlist drag-and-drop, alert budget | ~3,500 |
| R2 | Story groups, impact scoring | ~3,200 |
| R3 | Alert categories, dead schemas | ~3,100 |
| R4 | Dashboard routes, admin panels | ~3,200 |
| R5 | Dead routes, pages, simplified surfaces | ~3,150 |
| R6 | Dead services, recharts dep | ~2,500 |
| R7 | Dead services, test files | ~2,700 |
| R8 | Plugin infra, dead exports, helpers | ~4,500 |
| R9 | Landing dir, e2e dir, root deps, dead functions | ~467 |
| R10 | Un-export 44 internal-only exports | ~0 (API cleanup) |
| **Total** | | **~26,300+ lines** |

### Bundle Size

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Main JS bundle | 418 KB | 396.36 KB | **−21.6 KB (−5.2%)** |
| Source lines (TS/TSX, excl. dist) | ~123,000 | ~97,000 | **−26,000 (−21%)** |

### What the Codebase Looks Like Now

```
packages/
  backend/     — Fastify API, scanners, pipeline, services (~55K lines)
  web/         — Mobile PWA: Feed, Watchlist, Calendar, Search, Settings (~15K lines)
  shared/      — Types, schemas, base classes (~4K lines)
  delivery/    — Discord, Bark, Telegram, webhook channels (~5K lines)
  dashboard/   — Operator observability console (~3.6K lines)
services/
  sec-scanner/ — Python SEC EDGAR scanner
```

**The codebase has reached its essential shape.** Every remaining file serves a production purpose. The 44 un-exported internals clean the API surface without removing functionality. The only remaining candidates for future work are:
- Within-page optimization (EventDetail 32KB, Settings 27KB chunks)
- Structured logging to replace console statements
- Re-enabling e2e tests when Docker issues resolve

**Subtraction is complete.**
