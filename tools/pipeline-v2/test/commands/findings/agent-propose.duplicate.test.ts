import { describe, expect, test } from "bun:test";

import type {
  AgentFindingProposal,
  PromotedFinding,
} from "@bp/domain";

import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import { validateDuplicate } from "../../../src/commands/findings/_validation.ts";

function buildCorpusWithPromoted(
  routeId: string,
  promoted: Array<{
    promotedFindingId: string;
    claimText: string;
    approvedEvidenceRefs?: string[];
  }>,
): LoadedCorpus {
  const findings: PromotedFinding[] = promoted.map(
    (p) =>
      ({
        promotedFindingId: p.promotedFindingId,
        routeId,
        claimText: p.claimText,
        approvedEvidenceRefs: p.approvedEvidenceRefs ?? [],
      }) as unknown as PromotedFinding,
  );
  const byRoute = new Map<string, PromotedFinding[]>([[routeId, findings]]);
  const byId = new Map<string, PromotedFinding>(
    findings.map((f) => [f.promotedFindingId, f]),
  );
  return {
    month: "2026-03" as never,
    paths: {
      reviewPackets: null,
      promotionQueue: null,
      promotedFindings: null,
      signalFeatures: null,
      contextAppendix: null,
      interventionPublishable: null,
      interventionPublishableByRoute: null,
      interventionRecords: null,
      documentCandidates: null,
    },
    routes: new Set([routeId]) as never,
    reviewPackets: new Map(),
    reviewPacketsByRoute: new Map() as never,
    evidenceLinks: new Map(),
    promotionQueue: null,
    promotedFindings: byId,
    promotedFindingsByRoute: byRoute as never,
    signalFeaturesArtifact: null,
    signalFeaturesByRoute: new Map() as never,
    contextAppendixByRoute: new Map() as never,
    interventionRecords: new Map(),
    interventionRecordsByRoute: new Map() as never,
    documentCandidates: new Map(),
    publishableInterventions: [],
    publishableInterventionsByRoute: new Map() as never,
  };
}

function buildProposal(input: {
  routeId?: string;
  claimText: string;
  approvedEvidenceRefs?: string[];
  evidenceRefStrings?: string[];
}): AgentFindingProposal {
  // We pass the proposal's "evidence ref strings" through the validateDuplicate
  // ref-overlap path by encoding them as promoted_finding refs (the helper
  // calls them `promoted:<id>`).
  const evidenceRefs = (input.evidenceRefStrings ?? []).map((s) => ({
    kind: "promoted_finding" as const,
    promotedFindingId: s,
  }));
  return {
    proposalId: "p-1",
    runId: "r-1",
    routeId: (input.routeId ?? "B44") as AgentFindingProposal["routeId"],
    scopeKind: "route" as never,
    category: "reliability" as never,
    severity: "moderate" as never,
    confidence: "moderate" as never,
    claimText: input.claimText,
    claimStrength: "observation" as never,
    evidenceRefs,
    counterEvidenceRefs: [],
    interventionRecordIds: [],
    documentCandidateIds: [],
    metricClaims: [],
    caveats: [],
    missingEvidence: [],
    duplicateCheck: { matchedPromotedFindingId: null, reason: "" },
    validationState: "pending" as never,
    validationErrors: [],
  } as AgentFindingProposal;
}

describe("validateDuplicate", () => {
  test("passes when no promoted findings exist for the route", () => {
    const corpus = buildCorpusWithPromoted("B44", []);
    const proposal = buildProposal({
      claimText: "Observed long-gap share elevated on weekday peaks.",
    });
    expect(validateDuplicate({ corpus, proposal }).passed).toBe(true);
  });

  test("passes when claim text is unrelated to peer promoted findings", () => {
    const corpus = buildCorpusWithPromoted("B44", [
      {
        promotedFindingId: "pf-old",
        claimText: "Weekday peak speeds remained in the bottom decile.",
      },
    ]);
    const proposal = buildProposal({
      claimText: "Bus lane planned along Main Street, no implementation evidence.",
    });
    expect(validateDuplicate({ corpus, proposal }).passed).toBe(true);
  });

  test("rejects on near-identical claim text", () => {
    const corpus = buildCorpusWithPromoted("B44", [
      {
        promotedFindingId: "pf-old",
        claimText: "Observed long-gap share elevated on weekday peaks for route B44.",
      },
    ]);
    const proposal = buildProposal({
      claimText: "Observed long-gap share elevated on weekday peaks for route B44.",
    });
    const result = validateDuplicate({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("pf-old");
    expect(result.errors[0]).toContain("jaccard");
  });

  test("rejects when proposal shares >=2 evidence refs with a promoted finding", () => {
    const sharedRefs = ["promoted:pf-shared-a", "promoted:pf-shared-b"];
    const corpus = buildCorpusWithPromoted("B44", [
      {
        promotedFindingId: "pf-old",
        claimText: "Completely different wording about coverage gaps and slow trends.",
        approvedEvidenceRefs: sharedRefs,
      },
    ]);
    const proposal = buildProposal({
      claimText: "Brand new headline with unrelated body text describing peer comparisons.",
      evidenceRefStrings: ["pf-shared-a", "pf-shared-b"],
    });
    const result = validateDuplicate({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("evidence refs overlap");
  });

  test("does not match across routes", () => {
    const corpus = buildCorpusWithPromoted("Q65", [
      {
        promotedFindingId: "pf-q65",
        claimText: "Observed long-gap share elevated on weekday peaks.",
      },
    ]);
    const proposal = buildProposal({
      routeId: "B44",
      claimText: "Observed long-gap share elevated on weekday peaks.",
    });
    // Proposal route B44 has no promoted findings; dup only checks same-route peers.
    expect(validateDuplicate({ corpus, proposal }).passed).toBe(true);
  });
});
