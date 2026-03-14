# Current Task: AI Observability Prerequisites

Fix all prerequisites identified during RFC review before implementing the observability APIs.

## 1. Enable Outcome Tracker Processing (P0 — CRITICAL)

**Problem:** `OutcomeTracker.processOutcomes()` is defined but NEVER called. 4912 event_outcomes rows have NULL change_1d/1w/1m.

**Fix in `packages/backend/src/app.ts`:**

After the app starts and grace period ends, set up a recurring interval to call `processOutcomes()`:

```typescript
// After the server starts listening, add a periodic outcome processing job
if (outcomeTracker) {
  // Process outcomes every 15 minutes
  const OUTCOME_PROCESS_INTERVAL_MS = 15 * 60 * 1000;
  
  const processOutcomesPeriodically = async () => {
    try {
      await outcomeTracker.processOutcomes();
    } catch (e) {
      logger.error('Outcome processing failed:', e);
    }
  };
  
  // Start after a delay to avoid processing during startup
  setTimeout(() => {
    processOutcomesPeriodically(); // Run once immediately after delay
    setInterval(processOutcomesPeriodically, OUTCOME_PROCESS_INTERVAL_MS);
  }, 120_000); // Wait 2 minutes after startup
}
```

**Important:** `processOutcomes()` processes 50 rows per interval per time bucket. With 4912 pending rows, it will take multiple cycles to backfill everything. This is by design — avoid hammering Yahoo Finance API.

## 2. Add `confidence` Column to pipeline_audit (P0)

**Create migration:** `packages/backend/src/db/migrations/add-audit-confidence.sql`

```sql
ALTER TABLE pipeline_audit 
ADD COLUMN IF NOT EXISTS confidence DECIMAL(5,4);

-- Backfill from existing reason text where possible
UPDATE pipeline_audit 
SET confidence = CAST(
  SUBSTRING(reason FROM 'confidence: ([0-9.]+)') AS DECIMAL(5,4)
)
WHERE confidence IS NULL 
  AND reason LIKE '%confidence:%';

-- Index for observability queries
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_confidence 
ON pipeline_audit (confidence) 
WHERE confidence IS NOT NULL;
```

**Update schema in `packages/backend/src/db/schema.ts`:**
Add `confidence` column to `pipelineAudit` table definition.

**Update audit writer:** When writing to pipeline_audit, include the confidence value directly instead of only embedding it in the reason string. Find where `pipeline_audit` INSERT happens (likely in `pipeline/audit-log.ts` or directly in `app.ts`) and add the confidence field.

## 3. Add Database Indexes (P1)

**Create migration:** `packages/backend/src/db/migrations/add-observability-indexes.sql`

```sql
-- Composite indexes for time-windowed observability queries
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_outcome_created 
ON pipeline_audit (outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_source_created 
ON pipeline_audit (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_stopped_created 
ON pipeline_audit (stopped_at, created_at DESC);

-- Partial index for questionable blocks query
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_filtered_judge 
ON pipeline_audit (created_at DESC) 
WHERE outcome = 'filtered' AND stopped_at = 'llm_judge';

-- Index for events JOIN (currently unindexed!)
CREATE INDEX IF NOT EXISTS idx_events_source_event_id 
ON events (source_event_id);

CREATE INDEX IF NOT EXISTS idx_events_source_source_event_id 
ON events (source, source_event_id);

-- Partial indexes for outcome backfill queries
CREATE INDEX IF NOT EXISTS idx_event_outcomes_pending_1d 
ON event_outcomes (event_time) 
WHERE price_1d IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_outcomes_pending_1w 
ON event_outcomes (event_time) 
WHERE price_1w IS NULL;
```

## 4. Fix RFC change_1d Threshold (P1)

**Update `docs/ai-observability-rfc.md`:**
- Change `ABS(eo.change_1d) > 0.03` to `ABS(eo.change_1d) > 3` (change_1d stores percentage points, not decimals)
- Similarly update signal validation thresholds
- Add comment documenting that change_1d is in percentage points (3.0 = 3%)

## 5. Add LLM Enrichment Metrics (P2)

**Update `packages/backend/src/metrics.ts`:**

```typescript
/** Counter: LLM enrichment results */
export const llmEnrichmentTotal = new Counter({
  name: 'llm_enrichment_total',
  help: 'LLM enrichment outcomes',
  labelNames: ['result'] as const,  // 'success' | 'error' | 'timeout'
  registers: [registry],
});

/** Histogram: LLM enrichment duration */
export const llmEnrichmentDurationSeconds = new Histogram({
  name: 'llm_enrichment_duration_seconds',
  help: 'Duration of LLM enrichment calls in seconds',
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});
```

**Instrument the LLM enrichment call in `app.ts`:** Wrap the existing enrichment call with timing + counter increments.

## Execution

- Branch: `fix/observability-prereqs`
- Run all migrations via `docker exec`
- Update schema.ts, app.ts, metrics.ts
- Run `pnpm build && pnpm test`
- Create PR, do NOT merge

## Constraints
- TypeScript strict mode, ESM with `.js` extensions
- Do NOT change existing test behavior
- Migrations must be idempotent (IF NOT EXISTS / IF NOT NULL)
