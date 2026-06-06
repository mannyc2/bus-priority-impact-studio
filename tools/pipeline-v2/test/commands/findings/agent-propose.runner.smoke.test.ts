import { describe, expect, test } from "bun:test";

import type { AgentFindingProposalModelMeta } from "@bp/domain/findings";

import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import { runAgentPropose } from "../../../src/commands/findings/_runner.ts";

function emptyCorpus(): LoadedCorpus {
  return {
    month: "2026-03" as never,
    paths: {
      reviewPackets: "/tmp/review-packets.json",
      promotionQueue: null,
      promotedFindings: null,
      signalFeatures: null,
      contextAppendix: null,
      interventionPublishable: null,
      interventionPublishableByRoute: null,
      interventionRecords: null,
      documentCandidates: null,
    },
    routes: new Set(["B44"]) as never,
    reviewPackets: new Map(),
    reviewPacketsByRoute: new Map() as never,
    evidenceLinks: new Map(),
    promotionQueue: null,
    promotedFindings: new Map(),
    promotedFindingsByRoute: new Map() as never,
    signalFeaturesArtifact: null,
    signalFeaturesByRoute: new Map() as never,
    contextAppendixByRoute: new Map() as never,
    interventionRecords: new Map(),
    interventionRecordsByRoute: new Map() as never,
    documentCandidates: new Map(),
    publishableInterventions: [],
    publishableInterventionsByRoute: new Map() as never,
    briefs: new Map(),
    briefsByRouteSlug: new Map(),
  };
}

const model: AgentFindingProposalModelMeta = {
  provider: "mock",
  modelId: "mock/v0",
  temperature: 0,
  maxOutputTokens: 4096,
};

describe("runAgentPropose (mock model)", () => {
  test("parses a clean response and runs validators", async () => {
    const corpus = emptyCorpus();
    // Seed one review packet + intervention record so the proposal's refs resolve.
    (corpus.reviewPackets as Map<string, unknown>).set("pkt-1", {});
    (corpus.evidenceLinks as Map<string, unknown>).set("link-1", {});
    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 2,
      runId: "run-test-1",
      model,
      modelComplete: async () =>
        JSON.stringify({
          proposals: [
            {
              proposalId: "p-test-1",
              routeId: "B44",
              scopeKind: "route",
              category: "reliability",
              severity: "medium",
              confidence: "medium",
              claimText:
                "Observed long-gap share remained in the elevated tier for the third consecutive month.",
              claimStrength: "observation",
              evidenceRefs: [{ kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" }],
              counterEvidenceRefs: [],
              interventionRecordIds: [],
              documentCandidateIds: [],
              metricClaims: [],
              caveats: [],
              missingEvidence: [],
            },
          ],
        }),
    });
    expect(result.proposals.length).toBe(1);
    const proposal = result.proposals[0]!;
    expect(proposal.proposalId).toBe("p-test-1");
    if (proposal.validationState !== "valid") {
      throw new Error(`expected valid, got: ${JSON.stringify(proposal.validationErrors)}`);
    }
    expect(result.proposalsArtifact.summary.totalProposals).toBe(1);
    expect(result.proposalsArtifact.summary.validCount).toBe(1);
    expect(result.proposalsArtifact.summary.rejectedCount).toBe(0);
    expect(result.validationArtifact.validations.length).toBe(1);
  });

  test("marks proposals with forbidden language as rejected", async () => {
    const corpus = emptyCorpus();
    (corpus.reviewPackets as Map<string, unknown>).set("pkt-1", {});
    (corpus.evidenceLinks as Map<string, unknown>).set("link-1", {});
    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 2,
      runId: "run-test-2",
      model,
      modelComplete: async () =>
        JSON.stringify({
          proposals: [
            {
              routeId: "B44",
              scopeKind: "route",
              category: "speed",
              severity: "high",
              confidence: "high",
              claimText: "The bus lane caused speed gains on Main Street.",
              claimStrength: "qualified_claim",
              evidenceRefs: [{ kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" }],
            },
          ],
        }),
    });
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]!.validationState).toBe("rejected");
    expect(result.proposalsArtifact.summary.validCount).toBe(0);
    expect(result.proposalsArtifact.summary.rejectedCount).toBe(1);
  });

  test("accepts a fenced JSON response", async () => {
    const corpus = emptyCorpus();
    (corpus.reviewPackets as Map<string, unknown>).set("pkt-1", {});
    (corpus.evidenceLinks as Map<string, unknown>).set("link-1", {});
    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 1,
      runId: "run-test-3",
      model,
      modelComplete: async () =>
        `\`\`\`json\n${JSON.stringify({
          proposals: [
            {
              routeId: "B44",
              scopeKind: "route",
              category: "reliability",
              severity: "low",
              confidence: "low",
              claimText:
                "Long-gap share is computable but no peer comparison was triggered this month.",
              claimStrength: "observation",
              evidenceRefs: [{ kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" }],
            },
          ],
        })}\n\`\`\``,
    });
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]!.validationState).toBe("valid");
  });

  test("handles an empty proposal list cleanly", async () => {
    const corpus = emptyCorpus();
    const result = await runAgentPropose({
      corpus,
      routes: ["B44"],
      maxProposalsPerRoute: 1,
      runId: "run-test-4",
      model,
      modelComplete: async () => JSON.stringify({ proposals: [] }),
    });
    expect(result.proposals.length).toBe(0);
    expect(result.proposalsArtifact.summary.totalProposals).toBe(0);
  });

  test("rejects malformed model JSON", async () => {
    const corpus = emptyCorpus();
    await expect(
      runAgentPropose({
        corpus,
        routes: ["B44"],
        maxProposalsPerRoute: 1,
        runId: "run-test-5",
        model,
        modelComplete: async () => "this is not JSON",
      }),
    ).rejects.toThrow(/failed to parse model response/);
  });
});
