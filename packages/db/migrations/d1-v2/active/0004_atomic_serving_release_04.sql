-- Plan 098 split migration 04/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TABLE route_batch_built_route_v2 AS SELECT * FROM route_batch_built_route WHERE 0;

ALTER TABLE route_batch_built_route_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_batch_built_route_v2_candidate_key ON route_batch_built_route_v2(candidate_id, month, route_rank);

CREATE INDEX route_batch_built_route_v2_candidate_idx ON route_batch_built_route_v2(candidate_id);

CREATE TABLE route_batch_issue_v2 AS SELECT * FROM route_batch_issue WHERE 0;

ALTER TABLE route_batch_issue_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_batch_issue_v2_candidate_key ON route_batch_issue_v2(candidate_id, month, issue_rank);

CREATE INDEX route_batch_issue_v2_candidate_idx ON route_batch_issue_v2(candidate_id);

CREATE TABLE route_batch_status_v2 AS SELECT * FROM route_batch_status WHERE 0;

ALTER TABLE route_batch_status_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_batch_status_v2_candidate_key ON route_batch_status_v2(candidate_id, month);

CREATE INDEX route_batch_status_v2_candidate_idx ON route_batch_status_v2(candidate_id);

CREATE TABLE route_brief_peak_window_v2 AS SELECT * FROM route_brief_peak_window WHERE 0;

ALTER TABLE route_brief_peak_window_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_brief_peak_window_v2_candidate_key ON route_brief_peak_window_v2(candidate_id, route_id, month, window_rank);

CREATE INDEX route_brief_peak_window_v2_candidate_idx ON route_brief_peak_window_v2(candidate_id);

CREATE TABLE route_brief_slowest_window_v2 AS SELECT * FROM route_brief_slowest_window WHERE 0;

ALTER TABLE route_brief_slowest_window_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_brief_slowest_window_v2_candidate_key ON route_brief_slowest_window_v2(candidate_id, route_id, month, window_rank);

CREATE INDEX route_brief_slowest_window_v2_candidate_idx ON route_brief_slowest_window_v2(candidate_id);

CREATE TABLE route_brief_summary_v2 AS SELECT * FROM route_brief_summary WHERE 0;

ALTER TABLE route_brief_summary_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_brief_summary_v2_candidate_key ON route_brief_summary_v2(candidate_id, route_id, month);

CREATE INDEX route_brief_summary_v2_candidate_idx ON route_brief_summary_v2(candidate_id);

CREATE TABLE route_build_plan_v2 AS SELECT * FROM route_build_plan WHERE 0;

ALTER TABLE route_build_plan_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_build_plan_v2_candidate_key ON route_build_plan_v2(candidate_id, route_id, month);

CREATE INDEX route_build_plan_v2_candidate_idx ON route_build_plan_v2(candidate_id);

CREATE TABLE route_catalog_v2 AS SELECT * FROM route_catalog WHERE 0;

ALTER TABLE route_catalog_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
