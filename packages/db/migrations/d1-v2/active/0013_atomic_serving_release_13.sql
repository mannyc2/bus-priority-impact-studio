-- Plan 098 split migration 13/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TRIGGER route_reliability_baseline_v2_terminal_no_update
BEFORE UPDATE ON route_reliability_baseline_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_reliability_baseline_v2_terminal_no_delete
BEFORE DELETE ON route_reliability_baseline_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_reliability_gap_window_v2_terminal_no_insert
BEFORE INSERT ON route_reliability_gap_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_reliability_gap_window_v2_terminal_no_update
BEFORE UPDATE ON route_reliability_gap_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_reliability_gap_window_v2_terminal_no_delete
BEFORE DELETE ON route_reliability_gap_window_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_v2_terminal_no_insert
BEFORE INSERT ON route_scorecard_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_v2_terminal_no_update
BEFORE UPDATE ON route_scorecard_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_v2_terminal_no_delete
BEFORE DELETE ON route_scorecard_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_citation_v2_terminal_no_insert
BEFORE INSERT ON route_scorecard_citation_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_citation_v2_terminal_no_update
BEFORE UPDATE ON route_scorecard_citation_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_scorecard_citation_v2_terminal_no_delete
BEFORE DELETE ON route_scorecard_citation_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_speed_history_coverage_v2_terminal_no_insert
BEFORE INSERT ON route_speed_history_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_speed_history_coverage_v2_terminal_no_update
BEFORE UPDATE ON route_speed_history_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_speed_history_coverage_v2_terminal_no_delete
BEFORE DELETE ON route_speed_history_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_timeline_index_v2_terminal_no_insert
BEFORE INSERT ON route_timeline_index_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_timeline_index_v2_terminal_no_update
BEFORE UPDATE ON route_timeline_index_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_timeline_index_v2_terminal_no_delete
BEFORE DELETE ON route_timeline_index_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER source_month_coverage_v2_terminal_no_insert
BEFORE INSERT ON source_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER source_month_coverage_v2_terminal_no_update
BEFORE UPDATE ON source_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
