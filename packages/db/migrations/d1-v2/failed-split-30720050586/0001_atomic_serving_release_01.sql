-- Plan 098 split migration 01/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

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
