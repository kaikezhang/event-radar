UPDATE events
SET classification = 'BEARISH'
WHERE classification = 'NEUTRAL'
  AND severity IN ('CRITICAL', 'HIGH')
  AND (
    title ILIKE '%war%'
    OR title ILIKE '%military%'
    OR title ILIKE '%strike%'
    OR title ILIKE '%attack%'
    OR title ILIKE '%bomb%'
  )
  AND (
    title ILIKE '%iran%'
    OR title ILIKE '%hormuz%'
    OR title ILIKE '%middle east%'
  );
