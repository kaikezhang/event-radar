# Phase 0: Technical Debt Cleanup

Follow `docs/plans/2026-03-14-phase-0.md` for detailed specifications.

## Tasks

### Task 1: Unify Event Taxonomy (3 days)

Expand `LLMEventTypeSchema` from 7 to ~20 types:

```typescript
// packages/shared/src/schemas/llm-types.ts
export const LLMEventTypeSchema = z.enum([
  // Earnings
  'earnings_beat',
  'earnings_miss',
  'earnings_guidance',
  
  // SEC / Corporate Filings
  'sec_form_8k',
  'sec_form_4',
  'sec_form_10q',
  'sec_form_10k',
  
  // Regulatory
  'fda_approval',
  'fda_rejection',
  'fda_orphan_drug',
  'ftc_antitrust',
  'doj_settlement',
  
  // Government
  'executive_order',
  'congress_bill',
  'federal_register',
  
  // Macro
  'economic_data',
  'fed_announcement',
  
  // Technical / Flow
  'unusual_options',
  'insider_large_trade',
  'short_interest',
  
  // Sentiment
  'social_volume_spike',
  'reddit_trending',
  'news_breaking',
]);
```

**Steps:**
1. Update `packages/shared/src/schemas/llm-types.ts` — expand enum
2. Update `packages/shared/src/schemas/llm-classification.ts` — use unified enum
3. Map scanner outputs to new types in scanner files
4. Fix `packages/backend/src/pipeline/event-type-mapper.ts` — remove exclusions for fda/congress/doj/whitehouse
5. Update LLM classification prompt in `llm-gatekeeper.ts`

### Task 2: Add T+5 / T+20 Outcome Tracking (2 days)

**Steps:**
1. Add columns to schema (`packages/backend/src/db/schema.ts`):
   - `price_t5`, `price_t20` (numeric)
   - `change_t5`, `change_t20` (numeric)
   - `evaluated_t5_at`, `evaluated_t20_at` (timestamp)

2. Update `packages/backend/src/services/outcome-tracker.ts`:
   ```typescript
   { hours: 120, column: 'price_t5', changeCol: 'change_t5', label: 'T+5d' },
   { hours: 480, column: 'price_t20', changeCol: 'change_t20', label: 'T+20d' },
   ```

3. Run migration: `pnpm --filter @event-radar/backend migration:generate add_t5_t20`

4. Fix `packages/backend/src/pipeline/historical-enricher.ts` — remove incorrect mapping from `change1d` to `avgAlphaT5`

### Task 3: Fix LLM Output: Chinese → English (1 day)

**Steps:**
1. Update action labels in `packages/shared/src/schemas/llm-types.ts`:
   ```typescript
   export const LLMEnrichmentActionSchema = z.enum([
     '🔴 ACT NOW',
     '🟡 WATCH',
     '🟢 FYI',
   ]);
   ```

2. Update enrichment prompt in `packages/backend/src/pipeline/llm-enricher.ts`:
   - Change "Chinese summary" → "English summary"
   - Remove Chinese fallbacks

3. Update delivery channels (`packages/delivery/src/*.ts`) to use English labels

### Task 4: Document Scanner Latency (0.5 day)

Create `docs/SCANNERS.md` with:
- Table of all scanners with poll intervals
- Typical latency per scanner
- SLA targets for swing traders vs day traders

### Task 5: Fix Source Naming Inconsistency (1 day)

**Steps:**
1. Audit all scanners for `source` field values
2. Add alias mapping in `packages/shared/src/scanner-registry.ts`:
   ```typescript
   const SOURCE_ALIASES: Record<string, string> = {
     'x': 'x-scanner',
     'twitter': 'x-scanner',
     'form-4': 'sec-edgar-scanner',
     '8k': 'sec-edgar-scanner',
   };
   ```

## Verification

Before each commit, run:
```bash
pnpm build && pnpm --filter @event-radar/backend lint
```

## Output

- Create branch: `fix/phase-0-cleanup`
- One commit per task
- Single PR at the end combining all fixes
- DO NOT merge — create PR and stop
