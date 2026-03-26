# Subtraction Round 8 Review — 2026-03-26

Rounds 1–7 removed ~24,000 lines. Bundle 418→396KB. This round targets the long tail: dead exports, orphaned services, unused schemas, and dead scanner helpers.

## Estimated Savings: ~4,500+ lines

---

## 1. Dead Backend Services (2,877 lines)

### Entirely dead files — services only tested, never used in production

| File | Lines | Notes |
|------|-------|-------|
| `services/rule-engine-v2.ts` | ~300 | Only imported in its test |
| `services/weekly-report.ts` | ~400 | Only imported in its test |
| `services/direction-analytics.ts` | ~350 | Only imported in its test |
| `services/progressive-severity.ts` | ~200 | Zero imports, zero tests |
| `utils/scanner-runtime-status.ts` | ~100 | Zero imports |
| **Tests for above 3 services** | **847** | Dead test files |

**Action**: Delete all 8 files (5 services + 3 test files).

### Dead plugin infrastructure (342 lines)

| File | Lines | Notes |
|------|-------|-------|
| `plugins/plugin-loader.ts` | 146 | Re-exported from index but never imported |
| `plugins/plugin-registry.ts` | 122 | Only used by plugin-loader |
| `plugins/plugin-config.ts` | 74 | Only used by plugin-loader |

**Action**: Delete all 3 files, remove re-exports from `plugins/index.ts`.

---

## 2. Dead Pipeline Exports (153+ lines removable)

### `classification-metrics.ts` — entire file is dead (153 lines)
Exports `classificationTotal`, `classificationByConfidence`, `classificationByRule`, `averageConfidence`, `trackClassification()`, `getClassificationMetrics()`, `resetClassificationMetrics()`. **None imported anywhere.**

**Action**: Delete `pipeline/classification-metrics.ts`.

### `event-type-mapper.ts` — dead exports
- `lookupSector()` — never imported
- `resolveSectorForTicker()` — never imported
- `resetSectorCacheForTests()` — only in tests

**Action**: Remove exports; if functions are only used internally, un-export them.

### `historical-enricher.ts` — dead re-export
- `generatePatternSummary` re-exported at line 154 — never imported by any consumer.

**Action**: Remove the re-export.

### `market-calendar.ts` — dead exports
- `getNYSEHolidaysForYear()` — only used in tests
- `isEarlyClose()` — only used in tests

**Action**: Un-export these (keep as internal helpers if used within the file).

---

## 3. Dead Shared Package Exports (~139 exports, 736+ lines in dead schema files)

### Entire files with zero external consumers

| File | Lines | Dead Exports |
|------|-------|-------------|
| `schemas/scanner-health.ts` | 14 | ScannerHealthSchema |
| `schemas/rule.ts` | 103 | 5 schemas |
| `schemas/accuracy-types.ts` | 85 | 8 schemas + 6 types |
| `schemas/similarity-types.ts` | 30 | 3 schemas + types |
| `schemas/dedup-types.ts` | 63 | 5 schemas + 4 types |
| `schemas/confirmation-types.ts` | 31 | 2 schemas + 2 types |
| `schemas/feedback-types.ts` | 89 | 8 schemas + 8 types |
| `schemas/adaptive-types.ts` | 48 | 2 schemas + 2 types |
| `schemas/rule-types.ts` | 115 | 15 schemas + 10 types |
| `schemas/history-types.ts` | 46 | 3 schemas + 3 types |
| `schemas/impact-types.ts` | 22 | 2 schemas + 2 types |
| `schemas/social-types.ts` | 20 | 2 schemas + 2 types |
| `types/regime.ts` | 70 | 4 schemas + 2 types |
| **Total** | **736** | **~139 exports** |

### Additional dead exports in files that ARE used
These files have other live exports, but these specific items are dead:
- `normalizeLegacyActionLabel` — exported from shared, only used internally in `llm-types.ts` Zod preprocessing
- `BaseScannerOptions`, `ScannerFetchOptions` — type exports never imported
- `RedisEventBus`, `RedisEventBusOptions` — never imported externally
- Various `LLM*Schema` and `LLM*` types from `llm-classification.ts` / `llm-types.ts`
- `DeliveryChannelSchema`, `DeliveryResultSchema`, `TelegramConfigSchema`, `WebhookConfigSchema`, `DeliveryConfigSchema` from `delivery.ts`
- `PriceDataSchema`, `PriceChangeSchema`, and related price schemas from `price-types.ts`

**Action**: Delete the 13 entirely-dead schema/type files. Remove their re-exports from `shared/src/index.ts`. Un-export or remove dead items from partially-used files.

---

## 4. Dead Frontend Code (~100 lines)

### Unused functions in `lib/format.ts` (4 functions, ~30 lines)
- `formatPrice()` — never imported (shadowed by local in `WhatHappenedNext.tsx`)
- `formatMonthYear()` — never imported
- `formatNumber()` — never imported
- `formatPercent()` — never imported

**Action**: Delete all 4 functions. If `format.ts` becomes empty, delete the file.

### Unnecessarily exported functions (~10 lines of export cleanup)
- `urlBase64ToUint8Array()` in `lib/web-push.ts` — only used internally, remove `export`
- `mapSource()` in `lib/api.ts` — only used internally, remove `export`
- `getViewportTickerSymbols()` in `hooks/useTickerBatchPrices.ts` — only used internally, remove `export`

### Dead component props
- `SwipeableCard`: `leftLabel`/`rightLabel` props always use defaults — remove props, hardcode values

**Action**: Delete unused functions, un-export internal-only functions, simplify SwipeableCard props.

---

## 5. Dead Scanner Helper Exports (scattered across ~18 scanner files)

These exported parse/classify helper functions are never imported outside their own files (or only in their own tests). They're artifacts from when scanner logic was extracted into helpers, then consolidated back into scanner classes:

| Scanner File | Dead Exports |
|-------------|-------------|
| `halt-scanner.ts` | `parseNasdaqTradeHaltsRss`, `parseNasdaqTradeHaltsJson`, `parseFeedTimestamp`, `mapHaltReasonSeverity`, `describeHaltReason`, `isLuldHaltCode`, `buildHaltDedupKey` |
| `congress-scanner.ts` | `parseCongressTrades`, `isCommitteeRelevant` |
| `fedwatch-scanner.ts` | `parseFedWatchResponse`, `detectShifts` |
| `earnings-scanner.ts` | `parseEarningsCalendar`, `earningsSurpriseType`, `isUpcoming` |
| `fda-scanner.ts` | `classifyFdaAction`, `isFdaRelevant`, `extractDrugName` |
| `breaking-news-scanner.ts` | `parseRssXml`, `matchKeywords` |
| `truth-social-scanner.ts` | `parseTruthSocialPosts`, `parseTruthSocialRssFeed` |
| `short-interest-scanner.ts` | `parseShortInterest`, `isSignificantChange`, `isMostShorted` |
| `doj-scanner.ts` | `classifyDojAction`, `extractCompanyNames` |
| `analyst-scanner.ts` | `parseAnalystRatings`, `ratingSeverity` |
| `dilution-scanner.ts` | `estimateAmount`, `parseDilutionAtomFeed`, `detectDilutionType`, `mapDilutionSeverity` |
| `options-scanner.ts` | `parseUnusualOptions`, `isSignificantActivity`, `inferSignal` |
| `reddit-scanner.ts` | `parseRedditResponse`, `isHighEngagement` |
| `stocktwits-scanner.ts` | `parseTrendingResponse`, `analyzeSentiment` |
| `newswire-scanner.ts` | `classifySeverity` |
| `federal-register-scanner.ts` | `parseFederalRegisterDocs`, `isMarketRelevant`, `extractTopics` |
| `sec-edgar-scanner.ts` | `map8KSeverity`, `mapForm4Severity`, `parseEdgarAtomFeed` |
| `warn-scanner.ts` | `parseWarnNotices`, `warnSeverity` |
| `ir-monitor-scanner.ts` | `parseIrMonitorCompaniesEnv`, `hashContent`, `buildIrMonitorEventId`, `extractPressReleasesFromHtml` |
| `econ-calendar-scanner.ts` | `loadCalendarConfig`, `getScheduledReleases`, `isPreAlertWindow`, `isPostRelease` |
| `sec-edgar-feed-utils.ts` | `deterministicScannerUuid` |
| `x-scanner.ts` | `isMarketHours` |

**Action**: Remove `export` keyword from all of these. If any are truly internal-only (called within the file), keep the function but un-export. If not called at all, delete the function entirely.

**Note**: Some of these are tested in scanner test files. When un-exporting, also remove the corresponding test imports and test cases for those specific helpers. This is a large but mechanical cleanup.

---

## Execution Priority

| Priority | Category | Est. Lines | Risk |
|----------|----------|-----------|------|
| 1 | Dead backend services + tests | ~2,877 | Low — verified zero production usage |
| 2 | Dead shared schema files | ~736 | Low — verified zero external imports |
| 3 | Dead plugin infrastructure | ~342 | Low — never loaded |
| 4 | `classification-metrics.ts` | ~153 | Low — never imported |
| 5 | Scanner helper un-exports | ~200 export removals | Med — need to update tests |
| 6 | Frontend dead code | ~100 | Low — unused functions |
| 7 | Pipeline dead exports | ~50 | Low — un-export only |

**Total estimated removable**: ~4,500+ lines
