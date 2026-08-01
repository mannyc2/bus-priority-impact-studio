-- Plan 098 split migration 10/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TRIGGER route_batch_issue_v2_terminal_no_update
BEFORE UPDATE ON route_batch_issue_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_issue_v2_terminal_no_delete
BEFORE DELETE ON route_batch_issue_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_status_v2_terminal_no_insert
BEFORE INSERT ON route_batch_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_status_v2_terminal_no_update
BEFORE UPDATE ON route_batch_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_status_v2_terminal_no_delete
BEFORE DELETE ON route_batch_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_peak_window_v2_terminal_no_insert
BEFORE INSERT ON route_brief_peak_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_peak_window_v2_terminal_no_update
BEFORE UPDATE ON route_brief_peak_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_peak_window_v2_terminal_no_delete
BEFORE DELETE ON route_brief_peak_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_slowest_window_v2_terminal_no_insert
BEFORE INSERT ON route_brief_slowest_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_slowest_window_v2_terminal_no_update
BEFORE UPDATE ON route_brief_slowest_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_slowest_window_v2_terminal_no_delete
BEFORE DELETE ON route_brief_slowest_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_summary_v2_terminal_no_insert
BEFORE INSERT ON route_brief_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_summary_v2_terminal_no_update
BEFORE UPDATE ON route_brief_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_brief_summary_v2_terminal_no_delete
BEFORE DELETE ON route_brief_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_build_plan_v2_terminal_no_insert
BEFORE INSERT ON route_build_plan_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_build_plan_v2_terminal_no_update
BEFORE UPDATE ON route_build_plan_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_build_plan_v2_terminal_no_delete
BEFORE DELETE ON route_build_plan_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_v2_terminal_no_insert
BEFORE INSERT ON route_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_v2_terminal_no_update
BEFORE UPDATE ON route_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
