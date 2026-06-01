import { describe, expect, test } from "bun:test";
import { FindingCandidateSchema, FindingCoverageAuditSchema } from "@bp/domain";
import { buildRegistryDetectorRunArtifact } from "../src/detector-runs";

describe("detector run artifacts", () => {
  test("summarizes detector outputs and feature contract satisfaction", () => {
    const artifact = buildRegistryDetectorRunArtifact({
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "speed_pace_hotspot-run.json",
      wroteDb: false,
      inputSummary: { featureCount: 1 },
      output: {
        candidates: [
          FindingCandidateSchema.parse({
            candidateId: "c1",
            detectorRunId: "speed_pace_hotspot-2026-03-test",
            detectorId: "speed_pace_hotspot",
            month: "2026-03",
            routeId: "M15",
            physicalId: null,
            scopeKind: "segment",
            scopeId: "seg-1",
            category: "speed",
            reasonCode: "slow_segment",
            severity: "medium",
            confidence: "medium",
            detectorScore: 75,
            claimText: "Segment is slow.",
            claimSafeLabel: "issue_needs_review",
            status: "open",
            reviewState: "unreviewed",
            windowStart: null,
            windowEnd: null,
            createdAt: "2026-06-01T00:00:00.000Z",
          }),
        ],
        evidence: [],
        coverage: [
          FindingCoverageAuditSchema.parse({
            auditId: "a1",
            detectorRunId: "speed_pace_hotspot-2026-03-test",
            detectorId: "speed_pace_hotspot",
            month: "2026-03",
            scopeKind: "segment",
            scopeId: "seg-1",
            outcome: "hit",
            reasonCode: null,
            reason: null,
            inputsSeenJson: JSON.stringify({ routeId: "M15", sampleCount: 20 }),
            inputsExpectedJson: JSON.stringify({ minSampleCount: 15 }),
            createdAt: "2026-06-01T00:00:00.000Z",
          }),
        ],
      },
    });

    expect(artifact.outputSummary).toMatchObject({
      candidateCount: 1,
      hitCount: 1,
      cleanNoHitCount: 0,
    });
    expect(artifact.featureContracts.map((contract) => contract.status)).toContain("resolved");
    expect(artifact.candidateSamples[0]?.candidateId).toBe("c1");
    expect(artifact.candidateSamples[0]?.detectorScore).toBe(75);
  });
});
