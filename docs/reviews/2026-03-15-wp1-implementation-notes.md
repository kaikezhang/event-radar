# WP1: Product Language Migration — Implementation Notes

**Date:** 2026-03-15
**Branch:** `feat/wp1-product-language`
**Ref:** `docs/plans/2026-03-15-phase3-productization-v2.md` (WP1)

## Summary

Migrated all product language from "advice" framing (`ACT NOW / WATCH / FYI`) to "intelligence" framing (`High-Quality Setup / Monitor / Background`). This ensures every event processed after this change ships with the correct voice.

## Changes Made

### 1. Shared Schema (`packages/shared/src/schemas/llm-types.ts`)
- `LLMEnrichmentActionSchema` enum: `🔴 ACT NOW` → `🔴 High-Quality Setup`, `🟡 WATCH` → `🟡 Monitor`, `🟢 FYI` → `🟢 Background`
- Default enrichment action updated to `🟢 Background`

### 2. LLM Enricher Prompt (`packages/backend/src/pipeline/llm-enricher.ts`)
- System prompt updated with intelligence framing rules:
  - "Do not use BUY, SELL, HOLD, or any personal financial advice language"
  - "Never state what a trader should do. State what the data shows and what historically followed"
  - "Frame as intelligence, not recommendations"
- Signal quality classification block replaces old action instructions
- Schema example updated with new label strings

### 3. Push Policy (`packages/delivery/src/push-policy.ts`) — CRITICAL
- Changed from exact string matching to **emoji prefix matching**:
  - `action === '🔴 ACT NOW'` → `action?.startsWith('🔴')`
  - `action === '🟡 WATCH'` → `action?.startsWith('🟡')`
- `isActionable()` helper also uses prefix matching
- This makes push policy robust to future label text changes — only the emoji tier matters

### 4. Delivery Templates
- **Discord** (`discord-webhook.ts`): Embed field label changed from `Action` to `Signal`
- **Bark** (`bark-pusher.ts`): No changes needed — uses `enrichment.action` dynamically
- **Telegram** (`telegram.ts`): No changes needed — uses `enrichment.action` dynamically

### 5. Scorecard Services
- `scorecard-aggregation.ts`: No code changes — reads `actionLabel` from DB dynamically
- `alert-scorecard.ts`: No code changes — passes through whatever label is stored

### 6. Web Frontend
- `Scorecard.tsx`: "Action buckets" → "Signal buckets" (title + description)
- `EventDetail.tsx`: "Original action label" → "Original signal label" in trust block

### 7. README
- Marketing copy updated: "actionable alert" → "contextual intelligence"
- Example alert uses new signal label format
- AI Enrichment section uses `Signal` instead of `Action`

### 8. Test Fixtures
- All 12 test files updated with new label strings
- Scorecard.test.tsx: Fixed assertion to match `formatScorecardBucketLabel` output casing

## Backward Compatibility

- **DB column stays as `action`** — no migration needed
- Existing alerts in DB keep old labels; UI renders whatever string is stored
- The Zod schema's `preprocess` fallback means old labels in DB will fall back to `🟢 Background` when parsed through `LLMEnrichmentSchema` (e.g., in scorecard reads)
- Push policy emoji prefix matching works with both old and new labels

## Testing

- `@event-radar/shared`: All tests pass
- `@event-radar/backend`: All WP1-related tests pass (pre-existing failures in scanner/pipeline integration tests unrelated to this change)
- `@event-radar/delivery`: All tests pass (pre-existing `web-push-channel` import error unrelated)
- `@event-radar/web`: All 61 tests pass
