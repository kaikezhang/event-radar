-- Downgrade legacy StockTwits noise from MEDIUM to LOW.
UPDATE events
SET severity = 'LOW'
WHERE source = 'stocktwits'
  AND severity = 'MEDIUM';

UPDATE pipeline_audit
SET severity = 'LOW'
WHERE source = 'stocktwits'
  AND severity = 'MEDIUM';
