-- One-time cleanup: remove duplicate StockTwits trending events.
-- Keeps the earliest event per ticker per day (based on received_at).
-- Run inside a transaction and verify count before committing.

BEGIN;

-- Preview: how many duplicates will be removed
SELECT COUNT(*) AS duplicates_to_remove
FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (ticker, DATE(received_at))
    id
  FROM events
  WHERE source = 'stocktwits' AND title LIKE '%entered StockTwits trending%'
  ORDER BY ticker, DATE(received_at), received_at ASC
)
AND source = 'stocktwits'
AND title LIKE '%entered StockTwits trending%';

-- Delete duplicate events (keeps earliest per ticker per day)
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (ticker, DATE(received_at))
    id
  FROM events
  WHERE source = 'stocktwits' AND title LIKE '%entered StockTwits trending%'
  ORDER BY ticker, DATE(received_at), received_at ASC
)
AND source = 'stocktwits'
AND title LIKE '%entered StockTwits trending%';

-- Clean orphaned pipeline_audit rows
DELETE FROM pipeline_audit
WHERE event_id NOT IN (SELECT id FROM events)
AND source = 'stocktwits';

COMMIT;
