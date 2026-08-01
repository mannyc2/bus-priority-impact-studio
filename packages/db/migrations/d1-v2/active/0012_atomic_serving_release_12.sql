-- Plan 098 split migration 12/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TRIGGER route_month_coverage_v2_terminal_no_insert
BEFORE INSERT ON route_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_coverage_v2_terminal_no_update
BEFORE UPDATE ON route_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_coverage_v2_terminal_no_delete
BEFORE DELETE ON route_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_source_status_v2_terminal_no_insert
BEFORE INSERT ON route_month_source_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_source_status_v2_terminal_no_update
BEFORE UPDATE ON route_month_source_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_source_status_v2_terminal_no_delete
BEFORE DELETE ON route_month_source_status_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_trend_v2_terminal_no_insert
BEFORE INSERT ON route_month_trend_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_trend_v2_terminal_no_update
BEFORE UPDATE ON route_month_trend_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_month_trend_v2_terminal_no_delete
BEFORE DELETE ON route_month_trend_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_observed_reliability_summary_v2_terminal_no_insert
BEFORE INSERT ON route_observed_reliability_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_observed_reliability_summary_v2_terminal_no_update
BEFORE UPDATE ON route_observed_reliability_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_observed_reliability_summary_v2_terminal_no_delete
BEFORE DELETE ON route_observed_reliability_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_v2_terminal_no_insert
BEFORE INSERT ON route_readiness_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_v2_terminal_no_update
BEFORE UPDATE ON route_readiness_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_v2_terminal_no_delete
BEFORE DELETE ON route_readiness_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_missing_input_v2_terminal_no_insert
BEFORE INSERT ON route_readiness_missing_input_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_missing_input_v2_terminal_no_update
BEFORE UPDATE ON route_readiness_missing_input_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_readiness_missing_input_v2_terminal_no_delete
BEFORE DELETE ON route_readiness_missing_input_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_reliability_baseline_v2_terminal_no_insert
BEFORE INSERT ON route_reliability_baseline_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
