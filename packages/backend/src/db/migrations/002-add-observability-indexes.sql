-- Migration: Add composite indexes for AI observability queries

-- Composite indexes for time-windowed pipeline aggregations
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_outcome_created 
ON pipeline_audit (outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_source_created 
ON pipeline_audit (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_audit_stopped_created 
ON pipeline_audit (stopped_at, created_at DESC);

-- Partial index for questionable blocks query (filtered by LLM judge)
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_filtered_judge 
ON pipeline_audit (created_at DESC) 
WHERE outcome = 'filtered' AND stopped_at = 'llm_judge';

-- Index for events JOIN (currently unindexed — critical for trace/report queries)
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
