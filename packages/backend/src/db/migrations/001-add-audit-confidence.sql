-- Migration: Add confidence column to pipeline_audit
-- Purpose: Store LLM judge confidence directly instead of parsing from reason text

ALTER TABLE pipeline_audit 
ADD COLUMN IF NOT EXISTS confidence DECIMAL(5,4);

-- Backfill confidence from existing reason text
UPDATE pipeline_audit 
SET confidence = CAST(
  SUBSTRING(reason FROM 'confidence: ([0-9.]+)') AS DECIMAL(5,4)
)
WHERE confidence IS NULL 
  AND reason LIKE '%confidence:%';

-- Index for observability queries (low-confidence filtered events)
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_confidence 
ON pipeline_audit (confidence) 
WHERE confidence IS NOT NULL;
