-- Plan 098 split migration 02/14.
-- Mechanically derived from the checksum-retained failed 0000 migration.

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
