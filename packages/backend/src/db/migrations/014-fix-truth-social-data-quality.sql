WITH duplicate_truth_social_events AS (
  SELECT newer.id
  FROM events AS newer
  INNER JOIN events AS older
    ON newer.source = 'truth-social'
    AND older.source = 'truth-social'
    AND newer.id <> older.id
    AND LOWER(BTRIM(newer.title)) = LOWER(BTRIM(older.title))
    AND older.received_at >= newer.received_at - INTERVAL '24 hours'
    AND (
      older.received_at < newer.received_at
      OR (
        older.received_at = newer.received_at
        AND older.created_at < newer.created_at
      )
      OR (
        older.received_at = newer.received_at
        AND older.created_at = newer.created_at
        AND older.id < newer.id
      )
    )
)
DELETE FROM deliveries
WHERE event_id IN (SELECT id FROM duplicate_truth_social_events);

WITH duplicate_truth_social_events AS (
  SELECT newer.id
  FROM events AS newer
  INNER JOIN events AS older
    ON newer.source = 'truth-social'
    AND older.source = 'truth-social'
    AND newer.id <> older.id
    AND LOWER(BTRIM(newer.title)) = LOWER(BTRIM(older.title))
    AND older.received_at >= newer.received_at - INTERVAL '24 hours'
    AND (
      older.received_at < newer.received_at
      OR (
        older.received_at = newer.received_at
        AND older.created_at < newer.created_at
      )
      OR (
        older.received_at = newer.received_at
        AND older.created_at = newer.created_at
        AND older.id < newer.id
      )
    )
)
DELETE FROM events
WHERE id IN (SELECT id FROM duplicate_truth_social_events);

-- Normalize duplicate titles with LOWER(BTRIM(title)) before applying the 24h window.
UPDATE events
SET classification = CASE
  WHEN source = 'truth-social'
    AND (classification IS NULL OR BTRIM(classification) = '')
    AND (
      title ILIKE '%military%'
      OR summary ILIKE '%military%'
      OR title ILIKE '%war%'
      OR summary ILIKE '%war%'
      OR title ILIKE '%threat%'
      OR summary ILIKE '%threat%'
      OR title ILIKE '%strike%'
      OR summary ILIKE '%strike%'
      OR title ILIKE '%attack%'
      OR summary ILIKE '%attack%'
    ) THEN 'BEARISH'
  WHEN source = 'truth-social'
    AND (classification IS NULL OR BTRIM(classification) = '')
    AND (
      title ILIKE '%deal%'
      OR summary ILIKE '%deal%'
      OR title ILIKE '%peace%'
      OR summary ILIKE '%peace%'
      OR title ILIKE '%economy%'
      OR summary ILIKE '%economy%'
      OR title ILIKE '%jobs%'
      OR summary ILIKE '%jobs%'
      OR title ILIKE '%growth%'
      OR summary ILIKE '%growth%'
    ) THEN 'BULLISH'
  WHEN source = 'truth-social'
    AND (classification IS NULL OR BTRIM(classification) = '')
    AND (
      title ILIKE '%biden%'
      OR summary ILIKE '%biden%'
      OR title ILIKE '%democrat%'
      OR summary ILIKE '%democrat%'
      OR title ILIKE '%kamala%'
      OR summary ILIKE '%kamala%'
      OR title ILIKE '%opponent%'
      OR summary ILIKE '%opponent%'
    ) THEN 'NEUTRAL'
  ELSE 'NEUTRAL'
END,
classification_confidence = CASE
  WHEN source = 'truth-social'
    AND (classification IS NULL OR BTRIM(classification) = '')
    THEN COALESCE(classification_confidence, '0.6500'::DECIMAL(5, 4))
  ELSE classification_confidence
END
WHERE source = 'truth-social'
  AND (classification IS NULL OR BTRIM(classification) = '');
