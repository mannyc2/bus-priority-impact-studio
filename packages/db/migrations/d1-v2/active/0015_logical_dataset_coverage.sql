-- Plan 099: additive, backward-compatible logical-dataset coverage metadata.

ALTER TABLE serving_candidate_dataset ADD COLUMN source_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE serving_candidate_dataset ADD COLUMN missing_intervals_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE route_wait_assessment_v2 (
  route_id TEXT NOT NULL,
  month TEXT NOT NULL,
  assessment_row_count INTEGER NOT NULL CHECK(assessment_row_count >= 0),
  trips_passing_wait REAL NOT NULL CHECK(trips_passing_wait >= 0),
  scheduled_trips REAL NOT NULL CHECK(scheduled_trips >= 0),
  wait_assessment REAL,
  candidate_id TEXT NOT NULL,
  PRIMARY KEY(candidate_id, route_id, month)
);

CREATE INDEX route_wait_assessment_v2_candidate_idx
  ON route_wait_assessment_v2(candidate_id, route_id, month);
