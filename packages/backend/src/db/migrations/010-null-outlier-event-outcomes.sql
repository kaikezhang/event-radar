UPDATE event_outcomes
SET change_1h = NULL
WHERE ABS(change_1h) > 200;

UPDATE event_outcomes
SET change_1d = NULL
WHERE ABS(change_1d) > 200;

UPDATE event_outcomes
SET change_t5 = NULL
WHERE ABS(change_t5) > 200;

UPDATE event_outcomes
SET change_t20 = NULL
WHERE ABS(change_t20) > 200;

UPDATE event_outcomes
SET change_1w = NULL
WHERE ABS(change_1w) > 200;

UPDATE event_outcomes
SET change_1m = NULL
WHERE ABS(change_1m) > 200;
