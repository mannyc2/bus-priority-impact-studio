import { describe, expect, test } from "bun:test";
import { buildGenericDetectorScoreVectorArtifact } from "@bp/applied-research/score-vectors";

describe("generic detector score vectors", () => {
  test("joins coverage rows to candidate scores and falls back for clean no-hit rows", () => {
    const artifact = buildGenericDetectorScoreVectorArtifact({
      coverageRows: [
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
      ],
      candidateRows: [
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
      ],
      startMonth: "2026-03",
      endMonth: "2026-03",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/detector-score-vectors.json",
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
});
