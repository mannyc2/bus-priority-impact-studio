-- Plan 098 split migration 07/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE UNIQUE INDEX route_reliability_gap_window_v2_candidate_key ON route_reliability_gap_window_v2(candidate_id, route_id, month, window_rank);

CREATE INDEX route_reliability_gap_window_v2_candidate_idx ON route_reliability_gap_window_v2(candidate_id);

CREATE TABLE route_scorecard_v2 AS SELECT * FROM route_scorecard WHERE 0;

ALTER TABLE route_scorecard_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_scorecard_v2_candidate_key ON route_scorecard_v2(candidate_id, route_id, month);

CREATE INDEX route_scorecard_v2_candidate_idx ON route_scorecard_v2(candidate_id);

CREATE TABLE route_scorecard_citation_v2 AS SELECT * FROM route_scorecard_citation WHERE 0;

ALTER TABLE route_scorecard_citation_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_scorecard_citation_v2_candidate_key ON route_scorecard_citation_v2(candidate_id, route_id, month, citation_rank);

CREATE INDEX route_scorecard_citation_v2_candidate_idx ON route_scorecard_citation_v2(candidate_id);

CREATE TABLE route_speed_history_coverage_v2 AS SELECT * FROM route_speed_history_coverage WHERE 0;

ALTER TABLE route_speed_history_coverage_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_speed_history_coverage_v2_candidate_key ON route_speed_history_coverage_v2(candidate_id, route_id, month);

CREATE INDEX route_speed_history_coverage_v2_candidate_idx ON route_speed_history_coverage_v2(candidate_id);

CREATE TABLE route_timeline_index_v2 AS SELECT * FROM route_timeline_index WHERE 0;

ALTER TABLE route_timeline_index_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_timeline_index_v2_candidate_key ON route_timeline_index_v2(candidate_id, route_id, month);

CREATE INDEX route_timeline_index_v2_candidate_idx ON route_timeline_index_v2(candidate_id);

CREATE TABLE source_month_coverage_v2 AS SELECT * FROM source_month_coverage WHERE 0;

ALTER TABLE source_month_coverage_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX source_month_coverage_v2_candidate_key ON source_month_coverage_v2(candidate_id, source_id, month);

CREATE INDEX source_month_coverage_v2_candidate_idx ON source_month_coverage_v2(candidate_id);

-- Candidate metadata and projection rows are writable only while their header
-- remains in staging. Ready/rejected candidates are immutable release inputs.
CREATE TRIGGER serving_candidate_builder_terminal_no_insert
BEFORE INSERT ON serving_candidate_builder
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_builder_terminal_no_update
BEFORE UPDATE ON serving_candidate_builder
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_builder_terminal_no_delete
BEFORE DELETE ON serving_candidate_builder
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_dataset_terminal_no_insert
BEFORE INSERT ON serving_candidate_dataset
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_dataset_terminal_no_update
BEFORE UPDATE ON serving_candidate_dataset
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_dataset_terminal_no_delete
BEFORE DELETE ON serving_candidate_dataset
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_artifact_terminal_no_insert
BEFORE INSERT ON serving_candidate_artifact
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_artifact_terminal_no_update
BEFORE UPDATE ON serving_candidate_artifact
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
