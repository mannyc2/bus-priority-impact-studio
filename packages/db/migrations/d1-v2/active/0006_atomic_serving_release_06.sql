-- Plan 098 split migration 06/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE TABLE route_month_source_status_v2 AS SELECT * FROM route_month_source_status WHERE 0;

ALTER TABLE route_month_source_status_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_month_source_status_v2_candidate_key ON route_month_source_status_v2(candidate_id, route_id, month, source_scope, source_id);

CREATE INDEX route_month_source_status_v2_candidate_idx ON route_month_source_status_v2(candidate_id);

CREATE TABLE route_month_source_status_current_signal AS SELECT * FROM route_month_source_status WHERE 0;

CREATE UNIQUE INDEX route_month_source_status_current_signal_key ON route_month_source_status_current_signal(route_id, month, source_scope, source_id);

CREATE TABLE route_month_trend_v2 AS SELECT * FROM route_month_trend WHERE 0;

ALTER TABLE route_month_trend_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_month_trend_v2_candidate_key ON route_month_trend_v2(candidate_id, route_id, month);

CREATE INDEX route_month_trend_v2_candidate_idx ON route_month_trend_v2(candidate_id);

CREATE TABLE route_observed_reliability_summary_v2 AS SELECT * FROM route_observed_reliability_summary WHERE 0;

ALTER TABLE route_observed_reliability_summary_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_observed_reliability_summary_v2_candidate_key ON route_observed_reliability_summary_v2(candidate_id, route_id, month, run_id);

CREATE INDEX route_observed_reliability_summary_v2_candidate_idx ON route_observed_reliability_summary_v2(candidate_id);

CREATE TABLE route_observed_reliability_current_signal AS SELECT * FROM route_observed_reliability_summary WHERE 0;

CREATE UNIQUE INDEX route_observed_reliability_current_signal_key ON route_observed_reliability_current_signal(route_id, month, run_id);

CREATE TABLE route_readiness_v2 AS SELECT * FROM route_readiness WHERE 0;

ALTER TABLE route_readiness_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_readiness_v2_candidate_key ON route_readiness_v2(candidate_id, route_id, month);

CREATE INDEX route_readiness_v2_candidate_idx ON route_readiness_v2(candidate_id);

CREATE TABLE route_readiness_missing_input_v2 AS SELECT * FROM route_readiness_missing_input WHERE 0;

ALTER TABLE route_readiness_missing_input_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_readiness_missing_input_v2_candidate_key ON route_readiness_missing_input_v2(candidate_id, route_id, month, input_rank);

CREATE INDEX route_readiness_missing_input_v2_candidate_idx ON route_readiness_missing_input_v2(candidate_id);

CREATE TABLE route_reliability_baseline_v2 AS SELECT * FROM route_reliability_baseline WHERE 0;

ALTER TABLE route_reliability_baseline_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_reliability_baseline_v2_candidate_key ON route_reliability_baseline_v2(candidate_id, route_id, month);

CREATE INDEX route_reliability_baseline_v2_candidate_idx ON route_reliability_baseline_v2(candidate_id);

CREATE TABLE route_reliability_gap_window_v2 AS SELECT * FROM route_reliability_gap_window WHERE 0;

ALTER TABLE route_reliability_gap_window_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
