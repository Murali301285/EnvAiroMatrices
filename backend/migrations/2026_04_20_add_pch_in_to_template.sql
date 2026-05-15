-- EnvAiroMetrics v2.0 — one-time JSON template patch
-- Adds `"pch_in": "$pch_in"` inside the `pch` sub-object so the scheduled
-- payload carries the IN-delta alongside the existing OUT-delta (pch value).
--
-- Safe to re-run (idempotent via the LIKE guard).
--
-- How to run (psql):
--     \i backend/migrations/2026_04_20_add_pch_in_to_template.sql
-- Or from DBeaver / pgAdmin: open and execute.

BEGIN;

UPDATE tblJsonFormatter
SET jsonTemplate = REPLACE(
        jsonTemplate,
        '"pch_max": "$pch_max"',
        '"pch_max": "$pch_max", "pch_in": "$pch_in"'
    )
WHERE name = 'woloo_scheduled_json'
  AND isDeleted = 0
  AND jsonTemplate LIKE '%"pch_max": "$pch_max"%'
  AND jsonTemplate NOT LIKE '%"pch_in": "$pch_in"%';

-- Inspect the result
SELECT slno, name, LEFT(jsonTemplate, 400) AS preview
FROM tblJsonFormatter
WHERE name = 'woloo_scheduled_json';

COMMIT;
