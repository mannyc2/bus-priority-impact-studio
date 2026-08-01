-- Plan 098 split migration 14/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TRIGGER source_month_coverage_v2_terminal_no_delete
BEFORE DELETE ON source_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
