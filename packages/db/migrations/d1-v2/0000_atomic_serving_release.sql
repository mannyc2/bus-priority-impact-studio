-- Plan 098 forward-only D1 lineage.
-- This migration creates only additive release-control, candidate projection,
-- and current-signal split tables. It never edits the legacy migration ledger.

PRAGMA foreign_keys = ON;

CREATE TABLE serving_candidate (
  candidate_id TEXT PRIMARY KEY NOT NULL CHECK(length(candidate_id) = 64),
  state TEXT NOT NULL CHECK(state IN ('staging', 'ready', 'rejected')),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  semantic_input_fingerprint TEXT NOT NULL CHECK(length(semantic_input_fingerprint) = 64),
  source_commit TEXT NOT NULL CHECK(length(source_commit) = 40),
  canonical_manifest_key TEXT NOT NULL,
  canonical_manifest_sha256 TEXT NOT NULL CHECK(length(canonical_manifest_sha256) = 64),
  projection_schema TEXT NOT NULL,
  projection_sha256 TEXT NOT NULL CHECK(length(projection_sha256) = 64),
  exact_identity_projection_sha256 TEXT NOT NULL CHECK(length(exact_identity_projection_sha256) = 64),
  exact_identity_route_count INTEGER NOT NULL CHECK(exact_identity_route_count >= 0),
  expected_dataset_count INTEGER NOT NULL CHECK(expected_dataset_count >= 0),
  expected_artifact_count INTEGER NOT NULL CHECK(expected_artifact_count >= 0),
  expected_d1_table_count INTEGER NOT NULL CHECK(expected_d1_table_count >= 0),
  created_at TEXT NOT NULL,
  ready_at TEXT,
  rejected_at TEXT,
  rejection_code TEXT,
  CHECK(
    (state = 'staging' AND ready_at IS NULL AND rejected_at IS NULL AND rejection_code IS NULL)
    OR (state = 'ready' AND ready_at IS NOT NULL AND rejected_at IS NULL AND rejection_code IS NULL)
    OR (state = 'rejected' AND ready_at IS NULL AND rejected_at IS NOT NULL AND rejection_code IS NOT NULL)
  )
);

CREATE TABLE serving_candidate_builder (
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  builder_rank INTEGER NOT NULL CHECK(builder_rank >= 0),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY(candidate_id, builder_rank),
  UNIQUE(candidate_id, name)
);

CREATE TABLE serving_candidate_dataset (
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  dataset_id TEXT NOT NULL,
  grain TEXT NOT NULL CHECK(grain IN ('month', 'day', 'snapshot', 'realtime')),
  coverage_start TEXT,
  coverage_end TEXT NOT NULL,
  source_snapshot_ids_json TEXT NOT NULL,
  PRIMARY KEY(candidate_id, dataset_id),
  CHECK(coverage_start IS NULL OR coverage_start <= coverage_end)
);

CREATE TABLE serving_candidate_artifact (
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  logical_id TEXT NOT NULL,
  physical_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  media_type TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  verified_at TEXT,
  PRIMARY KEY(candidate_id, logical_id),
  UNIQUE(candidate_id, physical_key),
  CHECK(instr(physical_key, sha256) > 0)
);

CREATE INDEX serving_candidate_artifact_physical_idx
  ON serving_candidate_artifact(physical_key, sha256);

CREATE TABLE serving_candidate_d1_count (
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  table_name TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  PRIMARY KEY(candidate_id, table_name)
);

CREATE TABLE serving_release (
  release_id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  published_at TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  retained_public INTEGER NOT NULL DEFAULT 1 CHECK(retained_public IN (0, 1)),
  canonical_manifest_sha256 TEXT NOT NULL CHECK(length(canonical_manifest_sha256) = 64),
  operation_id TEXT NOT NULL UNIQUE
);

CREATE TABLE serving_activation_intent (
  operation_id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared', 'committed', 'failed')),
  expected_release_id TEXT,
  expected_generation INTEGER NOT NULL CHECK(expected_generation >= 0),
  release_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES serving_candidate(candidate_id),
  published_at TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  canonical_manifest_sha256 TEXT NOT NULL CHECK(length(canonical_manifest_sha256) = 64),
  new_generation INTEGER NOT NULL CHECK(new_generation = expected_generation + 1),
  created_at TEXT NOT NULL,
  committed_at TEXT,
  CHECK((state = 'committed') = (committed_at IS NOT NULL))
);

CREATE TABLE serving_active_release (
  singleton_id INTEGER PRIMARY KEY NOT NULL CHECK(singleton_id = 1),
  release_id TEXT REFERENCES serving_release(release_id),
  generation INTEGER NOT NULL CHECK(generation >= 0),
  last_operation_id TEXT,
  CHECK((generation = 0 AND release_id IS NULL AND last_operation_id IS NULL) OR generation > 0)
);

INSERT INTO serving_active_release(singleton_id, release_id, generation, last_operation_id)
VALUES (1, NULL, 0, NULL);

CREATE TABLE serving_pointer_transition (
  operation_id TEXT PRIMARY KEY NOT NULL,
  from_release_id TEXT,
  to_release_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  expected_generation INTEGER NOT NULL,
  new_generation INTEGER NOT NULL,
  canonical_manifest_sha256 TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  CHECK(new_generation = expected_generation + 1)
);

CREATE TABLE serving_operation_receipt (
  operation_id TEXT NOT NULL,
  receipt_kind TEXT NOT NULL,
  physical_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(operation_id, receipt_kind)
);

CREATE TRIGGER serving_operation_receipt_immutable_update
BEFORE UPDATE ON serving_operation_receipt
BEGIN
  SELECT RAISE(ABORT, 'serving operation receipts are immutable');
END;

CREATE TRIGGER serving_operation_receipt_immutable_delete
BEFORE DELETE ON serving_operation_receipt
BEGIN
  SELECT RAISE(ABORT, 'serving operation receipts are immutable');
END;

CREATE TRIGGER serving_active_release_no_delete
BEFORE DELETE ON serving_active_release
BEGIN
  SELECT RAISE(ABORT, 'serving active pointer cannot be deleted');
END;

CREATE TRIGGER serving_active_release_singleton
BEFORE INSERT ON serving_active_release
WHEN EXISTS(SELECT 1 FROM serving_active_release)
BEGIN
  SELECT RAISE(ABORT, 'serving active pointer is a singleton');
END;

CREATE TRIGGER serving_active_release_validate_cas
BEFORE UPDATE ON serving_active_release
BEGIN
  SELECT CASE
    WHEN NEW.generation != OLD.generation + 1
      THEN RAISE(ABORT, 'serving pointer generation must increment by one')
    WHEN NEW.release_id IS NULL
      THEN RAISE(ABORT, 'serving pointer cannot return to null')
    WHEN NEW.last_operation_id IS NULL
      THEN RAISE(ABORT, 'serving pointer requires an operation id')
    WHEN NOT EXISTS(
      SELECT 1
      FROM serving_activation_intent AS intent
      JOIN serving_candidate AS candidate ON candidate.candidate_id = intent.candidate_id
      WHERE intent.operation_id = NEW.last_operation_id
        AND intent.state = 'prepared'
        AND intent.expected_generation = OLD.generation
        AND intent.new_generation = NEW.generation
        AND intent.expected_release_id IS OLD.release_id
        AND intent.release_id = NEW.release_id
        AND candidate.state = 'ready'
        AND candidate.canonical_manifest_sha256 = intent.canonical_manifest_sha256
    ) THEN RAISE(ABORT, 'serving activation intent is invalid or candidate is not ready')
  END;
END;

CREATE TRIGGER serving_active_release_commit
AFTER UPDATE ON serving_active_release
BEGIN
  INSERT INTO serving_release(
    release_id, candidate_id, published_at, activated_at,
    retained_public, canonical_manifest_sha256, operation_id
  )
  SELECT
    release_id, candidate_id, published_at, activated_at,
    1, canonical_manifest_sha256, operation_id
  FROM serving_activation_intent
  WHERE operation_id = NEW.last_operation_id
  ON CONFLICT(release_id) DO NOTHING;

  SELECT CASE WHEN NOT EXISTS(
    SELECT 1
    FROM serving_release AS release
    JOIN serving_activation_intent AS intent ON intent.operation_id = NEW.last_operation_id
    WHERE release.release_id = intent.release_id
      AND release.candidate_id = intent.candidate_id
      AND release.published_at = intent.published_at
      AND release.canonical_manifest_sha256 = intent.canonical_manifest_sha256
  ) THEN RAISE(ABORT, 'serving release identity collision') END;

  INSERT INTO serving_pointer_transition(
    operation_id, from_release_id, to_release_id, candidate_id,
    expected_generation, new_generation, canonical_manifest_sha256, committed_at
  )
  SELECT
    operation_id, expected_release_id, release_id, candidate_id,
    expected_generation, new_generation, canonical_manifest_sha256, activated_at
  FROM serving_activation_intent
  WHERE operation_id = NEW.last_operation_id;

  UPDATE serving_activation_intent
  SET state = 'committed', committed_at = activated_at
  WHERE operation_id = NEW.last_operation_id;
END;

CREATE TRIGGER serving_release_immutable_update
BEFORE UPDATE ON serving_release
BEGIN
  SELECT RAISE(ABORT, 'serving releases are immutable');
END;

CREATE TRIGGER serving_release_immutable_delete
BEFORE DELETE ON serving_release
BEGIN
  SELECT RAISE(ABORT, 'serving releases are immutable');
END;

CREATE TRIGGER serving_pointer_transition_immutable_update
BEFORE UPDATE ON serving_pointer_transition
BEGIN
  SELECT RAISE(ABORT, 'serving pointer transitions are immutable');
END;

CREATE TRIGGER serving_pointer_transition_immutable_delete
BEFORE DELETE ON serving_pointer_transition
BEGIN
  SELECT RAISE(ABORT, 'serving pointer transitions are immutable');
END;

CREATE TRIGGER serving_candidate_ready_guard
BEFORE UPDATE OF state ON serving_candidate
WHEN NEW.state = 'ready'
BEGIN
  SELECT CASE
    WHEN OLD.state != 'staging'
      THEN RAISE(ABORT, 'only staging candidates can become ready')
    WHEN (SELECT COUNT(*) FROM serving_candidate_dataset WHERE candidate_id = OLD.candidate_id)
      != OLD.expected_dataset_count
      THEN RAISE(ABORT, 'candidate dataset count is incomplete')
    WHEN (SELECT COUNT(*) FROM serving_candidate_artifact WHERE candidate_id = OLD.candidate_id)
      != OLD.expected_artifact_count
      THEN RAISE(ABORT, 'candidate artifact count is incomplete')
    WHEN EXISTS(
      SELECT 1 FROM serving_candidate_artifact
      WHERE candidate_id = OLD.candidate_id AND verified_at IS NULL
    ) THEN RAISE(ABORT, 'candidate artifacts are not fully verified')
    WHEN (SELECT COUNT(*) FROM serving_candidate_d1_count WHERE candidate_id = OLD.candidate_id)
      != OLD.expected_d1_table_count
      THEN RAISE(ABORT, 'candidate D1 count inventory is incomplete')
  END;
END;

CREATE TRIGGER serving_candidate_terminal_guard
BEFORE UPDATE ON serving_candidate
WHEN OLD.state IN ('ready', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidates are immutable');
END;

CREATE TRIGGER serving_candidate_no_delete
BEFORE DELETE ON serving_candidate
BEGIN
  SELECT RAISE(ABORT, 'serving candidate deletion requires a separate reviewed GC command');
END;

CREATE TABLE corridor_v2 AS SELECT * FROM corridor WHERE 0;
ALTER TABLE corridor_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX corridor_v2_candidate_key ON corridor_v2(candidate_id, corridor_id);
CREATE INDEX corridor_v2_candidate_idx ON corridor_v2(candidate_id);
CREATE TABLE corridor_artifact_v2 AS SELECT * FROM corridor_artifact WHERE 0;
ALTER TABLE corridor_artifact_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX corridor_artifact_v2_candidate_key ON corridor_artifact_v2(candidate_id, corridor_id, month, artifact_name);
CREATE INDEX corridor_artifact_v2_candidate_idx ON corridor_artifact_v2(candidate_id);
CREATE TABLE corridor_hotspot_v2 AS SELECT * FROM corridor_hotspot WHERE 0;
ALTER TABLE corridor_hotspot_v2 ADD COLUMN candidate_id TEXT NOT NULL DEFAULT '';
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

CREATE TRIGGER serving_candidate_artifact_terminal_no_delete
BEFORE DELETE ON serving_candidate_artifact
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_d1_count_terminal_no_insert
BEFORE INSERT ON serving_candidate_d1_count
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_d1_count_terminal_no_update
BEFORE UPDATE ON serving_candidate_d1_count
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER serving_candidate_d1_count_terminal_no_delete
BEFORE DELETE ON serving_candidate_d1_count
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_v2_terminal_no_insert
BEFORE INSERT ON corridor_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_v2_terminal_no_update
BEFORE UPDATE ON corridor_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_v2_terminal_no_delete
BEFORE DELETE ON corridor_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_artifact_v2_terminal_no_insert
BEFORE INSERT ON corridor_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_artifact_v2_terminal_no_update
BEFORE UPDATE ON corridor_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_artifact_v2_terminal_no_delete
BEFORE DELETE ON corridor_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_hotspot_v2_terminal_no_insert
BEFORE INSERT ON corridor_hotspot_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_hotspot_v2_terminal_no_update
BEFORE UPDATE ON corridor_hotspot_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_hotspot_v2_terminal_no_delete
BEFORE DELETE ON corridor_hotspot_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_intervention_context_v2_terminal_no_insert
BEFORE INSERT ON corridor_intervention_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_intervention_context_v2_terminal_no_update
BEFORE UPDATE ON corridor_intervention_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_intervention_context_v2_terminal_no_delete
BEFORE DELETE ON corridor_intervention_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_month_summary_v2_terminal_no_insert
BEFORE INSERT ON corridor_month_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_month_summary_v2_terminal_no_update
BEFORE UPDATE ON corridor_month_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_month_summary_v2_terminal_no_delete
BEFORE DELETE ON corridor_month_summary_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_route_member_v2_terminal_no_insert
BEFORE INSERT ON corridor_route_member_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_route_member_v2_terminal_no_update
BEFORE UPDATE ON corridor_route_member_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER corridor_route_member_v2_terminal_no_delete
BEFORE DELETE ON corridor_route_member_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER exact_route_identity_release_v2_terminal_no_insert
BEFORE INSERT ON exact_route_identity_release_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER exact_route_identity_release_v2_terminal_no_update
BEFORE UPDATE ON exact_route_identity_release_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER exact_route_identity_release_v2_terminal_no_delete
BEFORE DELETE ON exact_route_identity_release_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER intervention_event_v2_terminal_no_insert
BEFORE INSERT ON intervention_event_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER intervention_event_v2_terminal_no_update
BEFORE UPDATE ON intervention_event_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER intervention_event_v2_terminal_no_delete
BEFORE DELETE ON intervention_event_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER map_release_catalog_v2_terminal_no_insert
BEFORE INSERT ON map_release_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER map_release_catalog_v2_terminal_no_update
BEFORE UPDATE ON map_release_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER map_release_catalog_v2_terminal_no_delete
BEFORE DELETE ON map_release_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_artifact_v2_terminal_no_insert
BEFORE INSERT ON route_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_artifact_v2_terminal_no_update
BEFORE UPDATE ON route_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_artifact_v2_terminal_no_delete
BEFORE DELETE ON route_artifact_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_built_route_v2_terminal_no_insert
BEFORE INSERT ON route_batch_built_route_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_built_route_v2_terminal_no_update
BEFORE UPDATE ON route_batch_built_route_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_built_route_v2_terminal_no_delete
BEFORE DELETE ON route_batch_built_route_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_batch_issue_v2_terminal_no_insert
BEFORE INSERT ON route_batch_issue_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

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

CREATE TRIGGER route_catalog_v2_terminal_no_delete
BEFORE DELETE ON route_catalog_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_trip_type_v2_terminal_no_insert
BEFORE INSERT ON route_catalog_trip_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_trip_type_v2_terminal_no_update
BEFORE UPDATE ON route_catalog_trip_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_trip_type_v2_terminal_no_delete
BEFORE DELETE ON route_catalog_trip_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_type_v2_terminal_no_insert
BEFORE INSERT ON route_catalog_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_type_v2_terminal_no_update
BEFORE UPDATE ON route_catalog_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_catalog_type_v2_terminal_no_delete
BEFORE DELETE ON route_catalog_type_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_comparison_rank_v2_terminal_no_insert
BEFORE INSERT ON route_comparison_rank_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_comparison_rank_v2_terminal_no_update
BEFORE UPDATE ON route_comparison_rank_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_comparison_rank_v2_terminal_no_delete
BEFORE DELETE ON route_comparison_rank_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_direction_v2_terminal_no_insert
BEFORE INSERT ON route_direction_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_direction_v2_terminal_no_update
BEFORE UPDATE ON route_direction_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_direction_v2_terminal_no_delete
BEFORE DELETE ON route_direction_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_equity_context_v2_terminal_no_insert
BEFORE INSERT ON route_equity_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_equity_context_v2_terminal_no_update
BEFORE UPDATE ON route_equity_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_equity_context_v2_terminal_no_delete
BEFORE DELETE ON route_equity_context_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_intervention_comparison_v2_terminal_no_insert
BEFORE INSERT ON route_intervention_comparison_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_intervention_comparison_v2_terminal_no_update
BEFORE UPDATE ON route_intervention_comparison_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = NEW.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

CREATE TRIGGER route_intervention_comparison_v2_terminal_no_delete
BEFORE DELETE ON route_intervention_comparison_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;

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

CREATE TRIGGER source_month_coverage_v2_terminal_no_delete
BEFORE DELETE ON source_month_coverage_v2
WHEN EXISTS(
  SELECT 1 FROM serving_candidate
  WHERE candidate_id = OLD.candidate_id AND state IN ('ready', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'terminal serving candidate rows are immutable');
END;
