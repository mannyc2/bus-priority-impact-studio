import { describe, expect, test } from "bun:test";

import type { AgentFindingProposal } from "@bp/domain/findings";

import { buildBridgedReviewQueue } from "../../../src/commands/findings/agent-proposals-to-review.ts";

function makeProposal(overrides: Partial<AgentFindingProposal>): AgentFindingProposal {
  return {
    proposalId: "prop-1",
    runId: "run-1",
    routeId: "B44" as unknown as AgentFindingProposal["routeId"],
    scopeKind: "route" as never,
    category: "reliability" as never,
    severity: "medium" as never,
    confidence: "medium" as never,
    claimText: "Observed long-gap share elevated for the third month.",
    claimStrength: "observation" as never,
    evidenceRefs: [{ kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" }],
    counterEvidenceRefs: [],
    interventionRecordIds: [],
    documentCandidateIds: [],
    metricClaims: [],
    caveats: [],
    missingEvidence: [],
    duplicateCheck: { matchedPromotedFindingId: null, reason: "no peer findings checked" },
    validationState: "valid" as never,
    validationErrors: [],
    ...overrides,
  } as AgentFindingProposal;
}

describe("buildBridgedReviewQueue", () => {
  test("includes only valid proposals", () => {
    const valid = makeProposal({ proposalId: "prop-valid" });
    const rejected = makeProposal({
      proposalId: "prop-bad",
      validationState: "rejected" as never,
    });
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [valid, rejected],
      proposalsArtifactPath: "/tmp/proposals.json",
      validationArtifactPath: "/tmp/validation.json",
    });
    expect(artifact.candidates.length).toBe(1);
    expect(artifact.candidates[0]!.candidateId).toBe("prop-valid");
    expect(artifact.candidates[0]!.source).toBe("agent_proposal");
    expect(artifact.candidates[0]!.proposalId).toBe("prop-valid");
  });

  test("tags every entry with the agent_proposal source enum value", () => {
    const proposal = makeProposal({});
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [proposal],
      proposalsArtifactPath: "/tmp/p.json",
      validationArtifactPath: "/tmp/v.json",
    });
    expect(artifact.candidates[0]!.detectorId).toBe("agent_proposal");
    expect(artifact.candidates[0]!.source).toBe("agent_proposal");
  });

  test("encodes evidenceRefs as strings reviewers can re-resolve", () => {
    const proposal = makeProposal({
      evidenceRefs: [
        { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-9" },
        {
          kind: "signal_feature",
          routeId: "B44" as never,
          month: "2026-03" as never,
          window: "weekday_peak" as never,
          feature: "routeWeightedAverageSpeedMph",
        },
        { kind: "promoted_finding", promotedFindingId: "pf-42" },
      ],
    });
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [proposal],
      proposalsArtifactPath: "/tmp/p.json",
      validationArtifactPath: "/tmp/v.json",
    });
    expect(artifact.candidates[0]!.evidenceRefs).toEqual([
      "packet:pkt-1:link-9",
      "signal:B44:weekday_peak:routeWeightedAverageSpeedMph",
      "promoted:pf-42",
    ]);
    expect(artifact.candidates[0]!.evidenceRefCount).toBe(3);
  });

  test("derives a detector score from severity + confidence", () => {
    const high = makeProposal({
      proposalId: "p-high",
      severity: "high" as never,
      confidence: "high" as never,
    });
    const low = makeProposal({
      proposalId: "p-low",
      severity: "low" as never,
      confidence: "insufficient" as never,
    });
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [high, low],
      proposalsArtifactPath: "/tmp/p.json",
      validationArtifactPath: "/tmp/v.json",
    });
    const highRow = artifact.candidates.find((c) => c.candidateId === "p-high")!;
    const lowRow = artifact.candidates.find((c) => c.candidateId === "p-low")!;
    expect(highRow.detectorScore).toBeGreaterThan(lowRow.detectorScore);
  });

  test("summary tallies category and severity counts", () => {
    const a = makeProposal({
      proposalId: "a",
      category: "reliability" as never,
      severity: "high" as never,
    });
    const b = makeProposal({
      proposalId: "b",
      category: "reliability" as never,
      severity: "low" as never,
    });
    const c = makeProposal({
      proposalId: "c",
      category: "speed" as never,
      severity: "high" as never,
    });
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [a, b, c],
      proposalsArtifactPath: "/tmp/p.json",
      validationArtifactPath: "/tmp/v.json",
    });
    expect(artifact.summary.totalCandidates).toBe(3);
    expect(artifact.summary.byCategory["reliability"]).toBe(2);
    expect(artifact.summary.byCategory["speed"]).toBe(1);
    expect(artifact.summary.bySeverity["high"]).toBe(2);
  });

  test("returns an empty queue when no proposals are valid", () => {
    const rejected = makeProposal({ validationState: "rejected" as never });
    const artifact = buildBridgedReviewQueue({
      month: "2026-03",
      runId: "run-1",
      proposals: [rejected],
      proposalsArtifactPath: "/tmp/p.json",
      validationArtifactPath: "/tmp/v.json",
    });
    expect(artifact.candidates.length).toBe(0);
    expect(artifact.summary.totalCandidates).toBe(0);
  });
});
