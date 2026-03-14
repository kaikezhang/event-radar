-- Migration: Add indexes identified by post-merge review of ai-observability.ts

-- Critical #1: trace endpoint needs event_id index
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_event_id
ON pipeline_audit (event_id);

-- Critical #2: false negative / signal validation JOIN needs composite index
-- (source_event_id alone was added in 002, this adds the composite)
CREATE INDEX IF NOT EXISTS idx_events_source_event_id_source
ON events (source_event_id, source);
