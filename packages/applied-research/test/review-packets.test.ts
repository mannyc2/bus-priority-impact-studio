import { describe, expect, test } from "bun:test";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import {
  FindingCandidateSchema,
  FindingCoverageAuditSchema,
  DetectorIdSchema,
  FindingEvidenceLinkSchema,
  type FindingCandidate,
  type FindingCoverageAudit,
  type FindingEvidenceLink,
} from "@bp/domain";
import { buildReviewPacketArtifacts } from "../src/review-packets";

const generatedAt = "2026-06-01T00:00:00.000Z";
const month = "2026-03";

function candidate(input: {
  candidateId: string;
  detectorId: string;
  detectorRunId: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  routeId: string | null;
  category: "reliability" | "speed" | "intervention" | "data_quality" | "context";
  detectorScore: number;
  reasonCode: string;
}): FindingCandidate {
  return FindingCandidateSchema.parse({
    candidateId: input.candidateId,
    detectorId: input.detectorId,
    detectorRunId: input.detectorRunId,
    month,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    routeId: input.routeId,
    physicalId: null,
    category: input.category,
    severity: "high",
    confidence: "medium",
    detectorScore: input.detectorScore,
    reasonCode: input.reasonCode,
    claimSafeLabel: "issue_needs_review",
    claimText: `${input.detectorId} candidate for ${input.scopeId}.`,
    status: "open",
    reviewState: "needs_review",
    windowStart: "2026-03-01T00:00:00.000Z",
    windowEnd: "2026-03-31T23:59:59.000Z",
    createdAt: generatedAt,
  });
}

function evidence(input: {
  linkId: string;
  candidateId: string;
  role: "primary" | "counter_evidence" | "context" | "caveat" | "missing_data" | "coverage_audit";
  kind?:
    | "metric"
    | "context_event"
    | "source_row"
    | "missing_data"
    | "source_doc"
    | "coverage_audit";
}): FindingEvidenceLink {
  return FindingEvidenceLinkSchema.parse({
    linkId: input.linkId,
    candidateId: input.candidateId,
    evidenceKind: input.kind ?? "metric",
    evidenceRole: input.role,
    evidenceRef: JSON.stringify({ linkId: input.linkId, role: input.role }),
    evidenceWeight: 1,
    note: null,
  });
}

function coverage(input: {
  auditId: string;
  detectorRunId: string;
  detectorId: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  outcome?: "hit" | "clean_no_hit" | "skipped_missing_input" | "skipped_failed_join" | "source_lag";
}): FindingCoverageAudit {
  return FindingCoverageAuditSchema.parse({
    auditId: input.auditId,
    detectorRunId: input.detectorRunId,
    detectorId: input.detectorId,
    month,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    outcome: input.outcome ?? "hit",
    reasonCode: "persistent_low_speed",
    reason: null,
    inputsSeenJson: "{}",
    inputsExpectedJson: "{}",
    createdAt: generatedAt,
  });
}

function build(input: {
  candidates: FindingCandidate[];
  evidenceLinks: FindingEvidenceLink[];
  coverageRows: FindingCoverageAudit[];
  existingPacketIdsByCandidateId?: ReadonlyMap<string, string>;
}) {
  return buildReviewPacketArtifacts({
    month,
    generatedAt,
    detectorSpecsArtifactPath: "data/artifacts/findings/detector-specs.json",
    reviewPacketsArtifactPath: "data/artifacts/findings/2026-03/review-packets.json",
    promotionQueueArtifactPath: "data/artifacts/findings/2026-03/promotion-queue.json",
    coverageArtifactPath: "data/artifacts/findings/2026-03/review-packet-coverage.json",
    candidates: input.candidates,
    evidenceLinks: input.evidenceLinks,
    coverageRows: input.coverageRows,
    ...(input.existingPacketIdsByCandidateId === undefined
      ? {}
      : { existingPacketIdsByCandidateId: input.existingPacketIdsByCandidateId }),
  });
}

describe("review packet artifacts", () => {
  test("builds packets and queues for multiple detector families", () => {
    const persistent = candidate({
      candidateId: "c-persistent",
      detectorId: "persistent_speed_hotspot",
      detectorRunId: "persistent_speed_hotspot-2026-03-test",
      scopeKind: "segment",
      scopeId: "M15:0:s1:s2",
      routeId: "M15",
      category: "speed",
      detectorScore: 88,
      reasonCode: "persistent_low_speed",
    });
    const speedPace = candidate({
      candidateId: "c-speed-pace",
      detectorId: "speed_pace_hotspot",
      detectorRunId: "speed_pace_hotspot-2026-03-test",
      scopeKind: "segment",
      scopeId: "M14:1:s4:s5",
      routeId: "M14",
      category: "speed",
      detectorScore: 91,
      reasonCode: "slow_pace_hotspot",
    });

    const artifacts = build({
      candidates: [persistent, speedPace],
      evidenceLinks: [
        evidence({ linkId: "e1", candidateId: persistent.candidateId, role: "primary" }),
        evidence({ linkId: "e2", candidateId: persistent.candidateId, role: "counter_evidence" }),
        evidence({ linkId: "e3", candidateId: speedPace.candidateId, role: "primary" }),
        evidence({ linkId: "e4", candidateId: speedPace.candidateId, role: "counter_evidence" }),
      ],
      coverageRows: [
        coverage({
          auditId: "a1",
          detectorRunId: persistent.detectorRunId,
          detectorId: persistent.detectorId,
          scopeKind: persistent.scopeKind,
          scopeId: persistent.scopeId,
        }),
        coverage({
          auditId: "a2",
          detectorRunId: speedPace.detectorRunId,
          detectorId: speedPace.detectorId,
          scopeKind: speedPace.scopeKind,
          scopeId: speedPace.scopeId,
        }),
      ],
      existingPacketIdsByCandidateId: new Map([[persistent.candidateId, "old-packet-id"]]),
    });

    expect(artifacts.detectorSpecs.detectorCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(artifacts.reviewPackets.packetCount).toBe(2);
    expect(artifacts.reviewPackets.summary.detectorCounts[DetectorIdSchema.parse("speed_pace_hotspot")]).toBe(1);
    const persistentPacket = artifacts.reviewPackets.packets.find(
      (packet) => packet.candidate.candidateId === persistent.candidateId,
    );
    expect(persistentPacket?.packetId).toBe("old-packet-id");
    expect(artifacts.promotionQueue.summary.readyForReviewCount).toBe(2);
    expect(artifacts.reviewQueue.totalCandidateCount).toBe(2);
    expect(artifacts.reviewQueue.candidates[0]?.evidenceRefCount).toBe(2);
    expect(
      artifacts.coverage.detectors.find((detector) => detector.detectorId === "speed_pace_hotspot")
        ?.status,
    ).toBe("complete");
  });

  test("marks partial packets when counter-evidence or coverage is missing", () => {
    const observed = candidate({
      candidateId: "c-observed",
      detectorId: "observed_reliability",
      detectorRunId: "observed_reliability-2026-03-test",
      scopeKind: "route",
      scopeId: "M15",
      routeId: "M15",
      category: "reliability",
      detectorScore: 77,
      reasonCode: "high_long_gap_share",
    });

    const artifacts = build({
      candidates: [observed],
      evidenceLinks: [evidence({ linkId: "e1", candidateId: observed.candidateId, role: "primary" })],
      coverageRows: [],
    });

    expect(artifacts.reviewPackets.summary.candidatesWithoutCounterEvidence).toBe(1);
    expect(artifacts.promotionQueue.summary.blockedCount).toBe(1);
    const observedCoverage = artifacts.coverage.detectors.find(
      (detector) => detector.detectorId === "observed_reliability",
    );
    expect(observedCoverage?.status).toBe("partial");
    expect(observedCoverage?.packetsWithoutCounterEvidence).toBe(1);
    expect(observedCoverage?.packetsWithoutCoverage).toBe(1);
  });

  test("waives counter-evidence for source_gap data-quality packets", () => {
    const sourceGap = candidate({
      candidateId: "c-source-gap",
      detectorId: "source_gap",
      detectorRunId: "source_gap-2026-03-test",
      scopeKind: "route",
      scopeId: "M15",
      routeId: "M15",
      category: "data_quality",
      detectorScore: 90,
      reasonCode: "missing_speed",
    });

    const artifacts = build({
      candidates: [sourceGap],
      evidenceLinks: [
        evidence({
          linkId: "e1",
          candidateId: sourceGap.candidateId,
          role: "missing_data",
          kind: "missing_data",
        }),
      ],
      coverageRows: [
        coverage({
          auditId: "a1",
          detectorRunId: sourceGap.detectorRunId,
          detectorId: sourceGap.detectorId,
          scopeKind: sourceGap.scopeKind,
          scopeId: sourceGap.scopeId,
          outcome: "hit",
        }),
      ],
    });

    const gapCoverage = artifacts.coverage.detectors.find(
      (detector) => detector.detectorId === "source_gap",
    );
    expect(gapCoverage?.status).toBe("complete");
    expect(gapCoverage?.packetsWithoutCounterEvidence).toBe(0);
  });
});
