import { describe, expect, test } from "bun:test";
import { evaluateReviewPacketCoverageGate } from "../src/evaluation";

describe("review packet coverage gate", () => {
  test("passes when all candidate-bearing detectors are complete", () => {
    const gate = evaluateReviewPacketCoverageGate({
      releaseMonth: "2026-03",
      artifactPath: "review-packet-coverage.json",
      failOnPartial: false,
      artifact: {
        summary: {
          candidateCount: 2,
          packetCount: 2,
          missingPacketCandidateCount: 0,
          packetCompleteDetectorCount: 1,
          packetPartialDetectorCount: 0,
          packetMissingDetectorCount: 0,
          noCandidateDetectorCount: 17,
        },
        detectors: [
          {
            detectorId: "speed_pace_hotspot",
            candidateCount: 2,
            packetCount: 2,
            missingPacketCount: 0,
            packetsWithoutPrimaryEvidence: 0,
            packetsWithoutCounterEvidence: 0,
            packetsWithoutCoverage: 0,
            status: "complete",
          },
        ],
      },
    });

    expect(gate.status).toBe("pass");
    expect(gate.gaps).toHaveLength(0);
  });

  test("warns on counter-evidence-only partials unless strict mode is enabled", () => {
    const partialArtifact = {
      summary: {
        candidateCount: 1,
        packetCount: 1,
        missingPacketCandidateCount: 0,
        packetCompleteDetectorCount: 0,
        packetPartialDetectorCount: 1,
        packetMissingDetectorCount: 0,
        noCandidateDetectorCount: 17,
      },
      detectors: [
        {
          detectorId: "observed_reliability",
          candidateCount: 1,
          packetCount: 1,
          missingPacketCount: 0,
          packetsWithoutPrimaryEvidence: 0,
          packetsWithoutCounterEvidence: 1,
          packetsWithoutCoverage: 0,
          status: "partial",
        },
      ],
    };

    const loose = evaluateReviewPacketCoverageGate({
      releaseMonth: "2026-03",
      artifactPath: "review-packet-coverage.json",
      failOnPartial: false,
      artifact: partialArtifact,
    });
    const strict = evaluateReviewPacketCoverageGate({
      releaseMonth: "2026-03",
      artifactPath: "review-packet-coverage.json",
      failOnPartial: true,
      artifact: partialArtifact,
    });

    expect(loose.status).toBe("warn");
    expect(strict.status).toBe("fail");
  });

  test("fails when candidates are missing packets or primary/coverage evidence", () => {
    const gate = evaluateReviewPacketCoverageGate({
      releaseMonth: "2026-03",
      artifactPath: "review-packet-coverage.json",
      failOnPartial: false,
      artifact: {
        summary: {
          candidateCount: 1,
          packetCount: 0,
          missingPacketCandidateCount: 1,
          packetCompleteDetectorCount: 0,
          packetPartialDetectorCount: 0,
          packetMissingDetectorCount: 1,
          noCandidateDetectorCount: 17,
        },
        detectors: [
          {
            detectorId: "speed_pace_hotspot",
            candidateCount: 1,
            packetCount: 0,
            missingPacketCount: 1,
            packetsWithoutPrimaryEvidence: 0,
            packetsWithoutCounterEvidence: 0,
            packetsWithoutCoverage: 0,
            status: "missing",
          },
        ],
      },
    });

    expect(gate.status).toBe("fail");
    expect(gate.gaps[0]?.detectorId).toBe("speed_pace_hotspot");
  });
});
