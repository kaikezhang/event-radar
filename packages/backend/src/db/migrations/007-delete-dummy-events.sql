-- Delete dummy/test events and their audit trail
DELETE FROM events WHERE source = 'dummy';
DELETE FROM pipeline_audit WHERE source = 'dummy';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'delivery_feed'
  ) THEN
    EXECUTE 'DELETE FROM delivery_feed WHERE source = ''dummy''';
  END IF;
END $$;
