-- Delete dummy/test events and their audit trail
DELETE FROM events WHERE source = 'dummy';
DELETE FROM pipeline_audit WHERE source = 'dummy';
