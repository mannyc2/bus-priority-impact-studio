import { describe, expect, test } from "bun:test";
import { buildDetectorCoverageAuditArtifact } from "../../../src/commands/findings/coverage-audit.ts";

describe("findings coverage-audit", () => {
  test("summarizes candidates, evidence, coverage outcomes, reasons, and top candidates", () => {
    const artifact = buildDetectorCoverageAuditArtifact({
      month: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      candidateSummaries: [
        { detector_id: "speed_pace_hotspot", candidate_count: 2 },
        { detector_id: "persistent_speed_hotspot", candidate_count: 1 },
      ],
      evidenceSummaries: [{ detector_id: "speed_pace_hotspot", evidence_count: 4 }],
      coverageSummaries: [
        {
          detector_id: "speed_pace_hotspot",
          outcome: "hit",
          reason_code: null,
          coverage_count: 2,
        },
        {
          detector_id: "speed_pace_hotspot",
          outcome: "skipped_missing_input",
          reason_code: "insufficient_speed_observations",
          coverage_count: 3,
        },
      ],
      candidateReasonSummaries: [
        {
          detector_id: "speed_pace_hotspot",
          reason_code: "slow_pace_hotspot",
          candidate_count: 2,
        },
      ],
      topCandidatesByDetectorId: new Map([
        [
          "speed_pace_hotspot",
          [
            {
              candidate_id: "candidate-1",
              detector_id: "speed_pace_hotspot",
              route_id: "M15",
              scope_kind: "segment",
              scope_id: "M15:0:1",
              reason_code: "slow_pace_hotspot",
              severity: "high",
              confidence: "medium",
              detector_score: 91,
              claim_safe_label: "issue_needs_review",
              claim_text: "Segment is slow.",
            },
          ],
        ],
      ]),
    });

    expect(artifact.detectorCount).toBe(2);
    const speed = artifact.detectors.find(
      (detector) => detector.detectorId === "speed_pace_hotspot",
    );
    expect(speed?.candidateCount).toBe(2);
    expect(speed?.evidenceCount).toBe(4);
    expect(speed?.coverageCount).toBe(5);
    expect(speed?.outcomeCounts).toEqual({ hit: 2, skipped_missing_input: 3 });
    expect(speed?.reasonCounts).toEqual({ insufficient_speed_observations: 3 });
    expect(speed?.candidateReasonCounts).toEqual({ slow_pace_hotspot: 2 });
    expect(speed?.topCandidates[0]?.candidateId).toBe("candidate-1");
  });
});
