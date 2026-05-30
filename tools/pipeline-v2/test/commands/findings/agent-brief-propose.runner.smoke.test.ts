import { describe, expect, test } from "bun:test";

import type {
  AgentFindingProposalModelMeta,
  PromotedFinding,
} from "@bp/domain";

import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import { runAgentBriefPropose } from "../../../src/commands/findings/_brief_runner.ts";

function corpusWithPromoted(routeId: string, findingId: string): LoadedCorpus {
  const finding = {
    promotedFindingId: findingId,
    routeId,
    claimText: "Promoted finding seed.",
    approvedEvidenceRefs: [],
    detectorId: "detector-1",
    category: "reliability",
    severity: "medium",
    confidence: "medium",
  } as unknown as PromotedFinding;
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
    promotedFindings: new Map([[findingId, finding]]),
    promotedFindingsByRoute: new Map([[routeId, [finding]]]) as never,
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

describe("runAgentBriefPropose (mock model)", () => {
  test("parses a clean response and produces a valid brief proposal", async () => {
    const corpus = corpusWithPromoted("B44", "pf-1");
    const canned = {
      proposals: [
        {
          brief: {
            routeSlug: "b44",
            title: "B44 reliability draft",
            status: "Draft",
            version: "draft-v1",
            summary: "B44 observed long-gap share elevated relative to peers.",
            dek: "Draft brief on B44 reliability evidence.",
            kpis: [],
            sections: [
              {
                title: "What changed",
                body: ["Observed long-gap share remains elevated relative to peer routes."],
              },
              {
                title: "Evidence",
                body: ["Promoted finding pf-1 anchors this draft."],
              },
            ],
            claims: [
              {
                n: 1,
                title: "B44 long-gap share elevated relative to peers",
                strength: 70,
                evidenceIds: ["ev-1"],
                caveatIds: ["cv-1"],
              },
            ],
            evidence: [
              {
                id: "ev-1",
                kind: "source",
                title: "Promoted finding pf-1",
                detail: "Anchoring promoted finding for the long-gap share claim.",
              },
            ],
            caveats: [
              {
                id: "cv-1",
                title: "Draft caveat",
                body: "Draft brief — not editorially reviewed.",
              },
            ],
          },
          evidenceProvenance: [
            {
              evidenceId: "ev-1",
              citedRefs: [
                { kind: "promoted_finding", promotedFindingId: "pf-1" },
              ],
              metricClaims: [],
            },
          ],
          selectedFindingIds: ["pf-1"],
          selectedInterventionRecordIds: [],
          curationRationale:
            "pf-1 anchors the long-gap claim; no overlapping briefs exist on routeSlug b44.",
          caveats: [],
          missingEvidence: [],
        },
      ],
    };
    const result = await runAgentBriefPropose({
      corpus,
      routes: ["B44"],
      runId: "smoke-run-1",
      model,
      modelComplete: async () => JSON.stringify(canned),
    });
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]!.validationState).toBe("valid");
    expect(result.proposals[0]!.validationErrors).toEqual([]);
    expect(result.proposalsArtifact.summary.totalProposals).toBe(1);
    expect(result.proposalsArtifact.summary.validCount).toBe(1);
    expect(result.validationArtifact.validations.length).toBe(1);
    expect(result.validationArtifact.validations[0]!.checks.length).toBe(9);
  });

  test("rejects a proposal with a fabricated promoted-finding id", async () => {
    const corpus = corpusWithPromoted("B44", "pf-1");
    const canned = {
      proposals: [
        {
          brief: {
            routeSlug: "b44",
            title: "B44 brief",
            status: "Draft",
            version: "draft-v1",
            summary: "Draft summary.",
            dek: "Draft dek.",
            kpis: [],
            sections: [
              { title: "Framing", body: ["Body."] },
              { title: "Evidence", body: ["Body."] },
            ],
            claims: [
              {
                n: 1,
                title: "Bad claim",
                strength: 50,
                evidenceIds: ["ev-1"],
                caveatIds: ["cv-1"],
              },
            ],
            evidence: [
              {
                id: "ev-1",
                kind: "source",
                title: "Bad evidence",
                detail: "Fake source.",
              },
            ],
            caveats: [
              { id: "cv-1", title: "Caveat", body: "Note." },
            ],
          },
          evidenceProvenance: [
            {
              evidenceId: "ev-1",
              citedRefs: [
                { kind: "promoted_finding", promotedFindingId: "pf-fabricated" },
              ],
              metricClaims: [],
            },
          ],
          selectedFindingIds: ["pf-fabricated"],
          selectedInterventionRecordIds: [],
          curationRationale: "Rationale.",
          caveats: [],
          missingEvidence: [],
        },
      ],
    };
    const result = await runAgentBriefPropose({
      corpus,
      routes: ["B44"],
      runId: "smoke-run-2",
      model,
      modelComplete: async () => JSON.stringify(canned),
    });
    expect(result.proposals[0]!.validationState).toBe("rejected");
    expect(
      result.proposals[0]!.validationErrors.some((e) =>
        e.startsWith("[evidence_provenance_resolves]"),
      ),
    ).toBe(true);
  });

  test("throws on an unparseable model response", async () => {
    const corpus = corpusWithPromoted("B44", "pf-1");
    await expect(
      runAgentBriefPropose({
        corpus,
        routes: ["B44"],
        runId: "smoke-run-3",
        model,
        modelComplete: async () => "not json at all",
      }),
    ).rejects.toThrow(/failed to parse brief model response/);
  });
});
