ALTER TABLE events
ADD COLUMN IF NOT EXISTS classification VARCHAR(20);

ALTER TABLE events
ADD COLUMN IF NOT EXISTS classification_confidence DECIMAL(5, 4);

CREATE INDEX IF NOT EXISTS idx_events_classification
ON events (classification);
