-- Trading halts should never be below HIGH severity.
UPDATE events
SET severity = 'HIGH'
WHERE source = 'trading-halt'
  AND severity IN ('MEDIUM', 'LOW');

UPDATE pipeline_audit
SET severity = 'HIGH'
WHERE source = 'trading-halt'
  AND severity IN ('MEDIUM', 'LOW');
