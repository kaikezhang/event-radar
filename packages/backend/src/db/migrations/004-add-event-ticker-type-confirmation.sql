ALTER TABLE events ADD COLUMN ticker VARCHAR(10);
ALTER TABLE events ADD COLUMN event_type VARCHAR(50);

CREATE INDEX idx_events_ticker_type_time ON events(ticker, event_type, created_at DESC);

UPDATE events
SET
  ticker = metadata->>'ticker',
  event_type = metadata->>'eventType'
WHERE ticker IS NULL OR event_type IS NULL;
