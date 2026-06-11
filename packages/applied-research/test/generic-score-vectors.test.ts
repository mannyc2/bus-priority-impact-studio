import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { loadGenericDetectorScoreVectorLocalDbRows } from "@bp/applied-research/local-db";
import {
  buildGenericDetectorScoreVectorArtifact,
  buildGenericDetectorScoreVectorStudy,
} from "@bp/applied-research/score-vectors";

describe("generic detector score vectors", () => {
  test("joins coverage rows to candidate scores and falls back for clean no-hit rows", () => {
    const artifact = buildGenericDetectorScoreVectorArtifact({
      coverageRows: coverageRows(),
      candidateRows: candidateRows(),
      ...studyMetadata(),
    });

    expect(artifact.summary.detectorCount).toBeGreaterThan(1);
    expect(artifact.summary.entryCount).toBe(2);
    expect(artifact.summary.flaggedCount).toBe(1);
    expect(artifact.summary.cleanNoHitCount).toBe(1);

    const vector = artifact.detectors.find(
      (detector) => detector.detectorId === "persistent_speed_hotspot",
    );
    expect(vector?.status).toBe("available");
    expect(vector?.featureGrains).toEqual(["route_segment_month"]);
    expect(vector?.summary.maxScore).toBe(87);
    expect(vector?.entries[0]?.candidateId).toBe("c1");
    expect(vector?.entries[0]?.hasCandidateScore).toBe(true);
    expect(vector?.entries[1]?.score).toBe(0);
    expect(vector?.entries[1]?.hasCandidateScore).toBe(false);
    expect(
      artifact.detectors.some((detector) => detector.status === "missing_execution_coverage"),
    ).toBe(true);
  });

  test("builds a generic detector score-vector study from explicit rows and metadata", () => {
    const artifact = buildGenericDetectorScoreVectorStudy({
      metadata: studyMetadata(),
      rows: {
        coverageRows: coverageRows(),
        candidateRows: candidateRows(),
      },
    });

    expect(artifact.artifactKind).toBe("generic_detector_score_vectors");
    expect(artifact.window).toEqual({ startMonth: "2026-03", endMonth: "2026-03" });
    expect(artifact.summary.entryCount).toBe(2);
  });

  test("loads score-vector rows from the local SQLite detector tables", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_finding_coverage_audit (
        detector_id TEXT,
        month TEXT,
        scope_kind TEXT,
        scope_id TEXT,
        outcome TEXT,
        reason_code TEXT
      );
      CREATE TABLE local_finding_candidate (
        candidate_id TEXT,
        detector_id TEXT,
        month TEXT,
        scope_kind TEXT,
        scope_id TEXT,
        route_id TEXT,
        detector_score REAL,
        reason_code TEXT,
        confidence TEXT,
        severity TEXT
      );
      INSERT INTO local_finding_coverage_audit
        (detector_id, month, scope_kind, scope_id, outcome, reason_code)
      VALUES
        ('persistent_speed_hotspot', '2026-03', 'route', 'M15', 'hit', 'slow_segment'),
        ('persistent_speed_hotspot', '2026-04', 'route', 'M16', 'hit', 'outside_window');
      INSERT INTO local_finding_candidate
        (candidate_id, detector_id, month, scope_kind, scope_id, route_id, detector_score, reason_code, confidence, severity)
      VALUES
        ('c1', 'persistent_speed_hotspot', '2026-03', 'route', 'M15', 'M15', 87, 'slow_segment', 'high', 'high');
    `);
    try {
      const rows = loadGenericDetectorScoreVectorLocalDbRows({
        sqlite,
        startMonth: "2026-03",
        endMonth: "2026-03",
      });

      expect(rows.coverageRows).toHaveLength(1);
      expect(rows.candidateRows).toHaveLength(1);
      expect(rows.coverageRows[0]?.scope_id).toBe("M15");
      expect(rows.candidateRows[0]?.candidate_id).toBe("c1");
    } finally {
      sqlite.close();
    }
  });
});

function studyMetadata() {
  return {
    startMonth: "2026-03",
    endMonth: "2026-03",
    releaseMonth: "2026-03",
    generatedAt: "2026-06-01T00:00:00.000Z",
    dbPath: "data/local/pipeline.sqlite",
    artifactPath: "data/artifacts/detector-score-vectors.json",
  };
}

function coverageRows() {
  return [
    {
      detector_id: "persistent_speed_hotspot",
      month: "2026-03",
      scope_kind: "route",
      scope_id: "M15",
      outcome: "hit",
      reason_code: "slow_segment",
    },
    {
      detector_id: "persistent_speed_hotspot",
      month: "2026-03",
      scope_kind: "route",
      scope_id: "M16",
      outcome: "clean_no_hit",
      reason_code: "below_threshold",
    },
  ];
}

function candidateRows() {
  return [
    {
      candidate_id: "c1",
      detector_id: "persistent_speed_hotspot",
      month: "2026-03",
      scope_kind: "route",
      scope_id: "M15",
      route_id: "M15",
      detector_score: 87,
      reason_code: "slow_segment",
      confidence: 0.9,
      severity: 0.8,
    },
  ];
}
