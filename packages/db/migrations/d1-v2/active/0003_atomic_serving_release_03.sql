-- Plan 098 split migration 03/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

CREATE UNIQUE INDEX corridor_hotspot_v2_candidate_key ON corridor_hotspot_v2(candidate_id, corridor_id, month, corridor_hotspot_rank);

CREATE INDEX corridor_hotspot_v2_candidate_idx ON corridor_hotspot_v2(candidate_id);

CREATE TABLE corridor_intervention_context_v2 AS SELECT * FROM corridor_intervention_context WHERE 0;

ALTER TABLE corridor_intervention_context_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX corridor_intervention_context_v2_candidate_key ON corridor_intervention_context_v2(candidate_id, corridor_id, month, context_rank);

CREATE INDEX corridor_intervention_context_v2_candidate_idx ON corridor_intervention_context_v2(candidate_id);

CREATE TABLE corridor_month_summary_v2 AS SELECT * FROM corridor_month_summary WHERE 0;

ALTER TABLE corridor_month_summary_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX corridor_month_summary_v2_candidate_key ON corridor_month_summary_v2(candidate_id, corridor_id, month);

CREATE INDEX corridor_month_summary_v2_candidate_idx ON corridor_month_summary_v2(candidate_id);

CREATE TABLE corridor_route_member_v2 AS SELECT * FROM corridor_route_member WHERE 0;

ALTER TABLE corridor_route_member_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX corridor_route_member_v2_candidate_key ON corridor_route_member_v2(candidate_id, corridor_id, month, route_id);

CREATE INDEX corridor_route_member_v2_candidate_idx ON corridor_route_member_v2(candidate_id);

CREATE TABLE exact_route_identity_release_v2 AS SELECT * FROM exact_route_identity_release WHERE 0;

ALTER TABLE exact_route_identity_release_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX exact_route_identity_release_v2_candidate_key ON exact_route_identity_release_v2(candidate_id, release_id);

CREATE INDEX exact_route_identity_release_v2_candidate_idx ON exact_route_identity_release_v2(candidate_id);

CREATE TABLE intervention_event_v2 AS SELECT * FROM intervention_event WHERE 0;

ALTER TABLE intervention_event_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX intervention_event_v2_candidate_key ON intervention_event_v2(candidate_id, event_id);

CREATE INDEX intervention_event_v2_candidate_idx ON intervention_event_v2(candidate_id);

CREATE TABLE map_release_catalog_v2 AS SELECT * FROM map_release_catalog WHERE 0;

ALTER TABLE map_release_catalog_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX map_release_catalog_v2_candidate_key ON map_release_catalog_v2(candidate_id, release_id);

CREATE INDEX map_release_catalog_v2_candidate_idx ON map_release_catalog_v2(candidate_id);

CREATE TABLE route_artifact_v2 AS SELECT * FROM route_artifact WHERE 0;

ALTER TABLE route_artifact_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX route_artifact_v2_candidate_key ON route_artifact_v2(candidate_id, route_id, month, artifact_name);

CREATE INDEX route_artifact_v2_candidate_idx ON route_artifact_v2(candidate_id);
