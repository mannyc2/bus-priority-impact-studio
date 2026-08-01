-- Plan 098 split migration 05/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE UNIQUE INDEX route_catalog_v2_candidate_key ON route_catalog_v2(candidate_id, route_id);

CREATE INDEX route_catalog_v2_candidate_idx ON route_catalog_v2(candidate_id);

CREATE TABLE route_catalog_trip_type_v2 AS SELECT * FROM route_catalog_trip_type WHERE 0;

ALTER TABLE route_catalog_trip_type_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_catalog_trip_type_v2_candidate_key ON route_catalog_trip_type_v2(candidate_id, route_id, trip_type_rank);

CREATE INDEX route_catalog_trip_type_v2_candidate_idx ON route_catalog_trip_type_v2(candidate_id);

CREATE TABLE route_catalog_type_v2 AS SELECT * FROM route_catalog_type WHERE 0;

ALTER TABLE route_catalog_type_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_catalog_type_v2_candidate_key ON route_catalog_type_v2(candidate_id, route_id, type_rank);

CREATE INDEX route_catalog_type_v2_candidate_idx ON route_catalog_type_v2(candidate_id);

CREATE TABLE route_comparison_rank_v2 AS SELECT * FROM route_comparison_rank WHERE 0;

ALTER TABLE route_comparison_rank_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_comparison_rank_v2_candidate_key ON route_comparison_rank_v2(candidate_id, month, rank);

CREATE INDEX route_comparison_rank_v2_candidate_idx ON route_comparison_rank_v2(candidate_id);

CREATE TABLE route_direction_v2 AS SELECT * FROM route_direction WHERE 0;

ALTER TABLE route_direction_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_direction_v2_candidate_key ON route_direction_v2(candidate_id, route_id, direction_id);

CREATE INDEX route_direction_v2_candidate_idx ON route_direction_v2(candidate_id);

CREATE TABLE route_equity_context_v2 AS SELECT * FROM route_equity_context WHERE 0;

ALTER TABLE route_equity_context_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_equity_context_v2_candidate_key ON route_equity_context_v2(candidate_id, route_id, month);

CREATE INDEX route_equity_context_v2_candidate_idx ON route_equity_context_v2(candidate_id);

CREATE TABLE route_intervention_comparison_v2 AS SELECT * FROM route_intervention_comparison WHERE 0;

ALTER TABLE route_intervention_comparison_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_intervention_comparison_v2_candidate_key ON route_intervention_comparison_v2(candidate_id, route_id, month, event_id);

CREATE INDEX route_intervention_comparison_v2_candidate_idx ON route_intervention_comparison_v2(candidate_id);

CREATE TABLE route_month_coverage_v2 AS SELECT * FROM route_month_coverage WHERE 0;

ALTER TABLE route_month_coverage_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_month_coverage_v2_candidate_key ON route_month_coverage_v2(candidate_id, route_id, month);

CREATE INDEX route_month_coverage_v2_candidate_idx ON route_month_coverage_v2(candidate_id);
