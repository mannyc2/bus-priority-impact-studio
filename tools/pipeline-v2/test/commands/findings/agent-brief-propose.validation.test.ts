import { describe, expect, test } from "bun:test";

import type {
  AgentBriefDraft,
  AgentBriefProposal,
  AgentBriefProposalEvidenceProvenance,
  FindingEvidenceLink,
  FindingReviewPacket,
  PromotedFinding,
} from "@bp/domain/findings";
import type { StudioBrief } from "@bp/domain/studio/briefs";
import {
  validateBriefDuplicate,
  validateBriefKpiGrounding,
  validateBriefLanguage,
  validateBriefMetricConsistency,
  validateBriefProposal,
  validateBriefProseNumberCoverage,
  validateBriefReferenceIntegrity,
  validateBriefScopeBlockedClaims,
  validateBriefSectionCoverage,
  validateEvidenceProvenanceResolves,
} from "../../../src/commands/findings/_brief_validation.ts";
import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";

// ---------------------------------------------------------------------------
// Test corpus builder — minimal LoadedCorpus stub. Same approach as the
// finding-side tests: cast through `as unknown` so we only have to supply
// the fields the validators read.

type CorpusSeed = {
  routes?: string[];
  reviewPackets?: Array<{
    packetId: string;
    routeId: string;
    linkIds: Array<string | { linkId: string; payload?: Record<string, unknown> }>;
  }>;
  promotedFindings?: Array<{
    promotedFindingId: string;
    routeId: string;
    claimText: string;
  }>;
  briefs?: Array<Partial<StudioBrief> & { id: string; routeSlug: string }>;
};

function buildBriefCorpus(seed: CorpusSeed): LoadedCorpus {
  const routes = new Set<string>(seed.routes ?? []);
  const reviewPackets = new Map<string, FindingReviewPacket>();
  const evidenceLinks = new Map<string, FindingEvidenceLink>();
  for (const pkt of seed.reviewPackets ?? []) {
    reviewPackets.set(pkt.packetId, {
      packetId: pkt.packetId,
      candidate: { routeId: pkt.routeId },
    } as unknown as FindingReviewPacket);
    routes.add(pkt.routeId);
    for (const entry of pkt.linkIds) {
      const linkId = typeof entry === "string" ? entry : entry.linkId;
      const payload = typeof entry === "string" ? undefined : entry.payload;
      const evidenceRef = payload === undefined ? "" : JSON.stringify(payload);
      evidenceLinks.set(linkId, {
        linkId,
        evidenceRef,
      } as unknown as FindingEvidenceLink);
    }
  }

  const promotedFindings = new Map<string, PromotedFinding>();
  const promotedFindingsByRoute = new Map<string, PromotedFinding[]>();
  for (const f of seed.promotedFindings ?? []) {
    const finding = {
      promotedFindingId: f.promotedFindingId,
      routeId: f.routeId,
      claimText: f.claimText,
      approvedEvidenceRefs: [],
    } as unknown as PromotedFinding;
    promotedFindings.set(f.promotedFindingId, finding);
    routes.add(f.routeId);
    const arr = promotedFindingsByRoute.get(f.routeId) ?? [];
    arr.push(finding);
    promotedFindingsByRoute.set(f.routeId, arr);
  }

  const briefs = new Map<string, StudioBrief>();
  const briefsByRouteSlug = new Map<string, StudioBrief[]>();
  for (const b of seed.briefs ?? []) {
    const brief = b as unknown as StudioBrief;
    briefs.set(b.id, brief);
    const arr = briefsByRouteSlug.get(b.routeSlug) ?? [];
    arr.push(brief);
    briefsByRouteSlug.set(b.routeSlug, arr);
  }

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
    routes: routes as never,
    reviewPackets,
    reviewPacketsByRoute: new Map() as never,
    evidenceLinks,
    promotionQueue: null,
    promotedFindings,
    promotedFindingsByRoute: promotedFindingsByRoute as never,
    signalFeaturesArtifact: null,
    signalFeaturesByRoute: new Map() as never,
    contextAppendixByRoute: new Map() as never,
    interventionRecords: new Map(),
    interventionRecordsByRoute: new Map() as never,
    documentCandidates: new Map(),
    publishableInterventions: [],
    publishableInterventionsByRoute: new Map() as never,
    briefs,
    briefsByRouteSlug,
  };
}

function buildBriefDraft(overrides: Partial<AgentBriefDraft> = {}): AgentBriefDraft {
  return {
    routeSlug: "b44",
    title: "B44 reliability draft",
    status: "Draft",
    version: "draft-v1",
    summary: "B44 has observed long-gap share elevated relative to peer routes.",
    dek: "Draft brief on B44 reliability.",
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
    ...overrides,
  };
}

function buildBriefProposal(
  overrides: Omit<Partial<AgentBriefProposal>, "brief" | "evidenceProvenance"> & {
    brief?: Partial<AgentBriefDraft>;
    evidenceProvenance?: AgentBriefProposalEvidenceProvenance[];
  } = {},
): AgentBriefProposal {
  const { brief: briefOverride, ...restOverrides } = overrides;
  const brief = buildBriefDraft(briefOverride ?? {});
  return {
    proposalId: "bp-1",
    runId: "run-1",
    brief,
    evidenceProvenance: overrides.evidenceProvenance ?? [],
    selectedFindingIds: ["pf-1"],
    selectedInterventionRecordIds: [],
    curationRationale: "pf-1 anchors the draft; no overlapping briefs found.",
    caveats: [],
    missingEvidence: [],
    duplicateCheck: { matchedBriefId: null, reason: "no peers" },
    validationState: "pending" as never,
    validationErrors: [],
    ...restOverrides,
  } as AgentBriefProposal;
}

// ---------------------------------------------------------------------------
// 1. brief_reference_integrity

describe("validateBriefReferenceIntegrity", () => {
  test("passes when claims reference existing evidence + caveat ids", () => {
    const proposal = buildBriefProposal();
    expect(
      validateBriefReferenceIntegrity({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(true);
  });

  test("fails when a claim references a missing evidence id", () => {
    const proposal = buildBriefProposal({
      brief: {
        claims: [
          {
            n: 1,
            title: "Bad claim",
            strength: 50,
            evidenceIds: ["ev-missing"],
            caveatIds: ["cv-1"],
          },
        ],
      },
    });
    const result = validateBriefReferenceIntegrity({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("ev-missing");
  });

  test("fails on duplicate evidence ids", () => {
    const proposal = buildBriefProposal({
      brief: {
        evidence: [
          { id: "ev-1", kind: "source", title: "A", detail: "First." },
          { id: "ev-1", kind: "source", title: "B", detail: "Second." },
        ],
      },
    });
    expect(
      validateBriefReferenceIntegrity({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. evidence_provenance_resolves

describe("validateEvidenceProvenanceResolves", () => {
  test("passes when every provenance evidenceId + ref resolves", () => {
    const corpus = buildBriefCorpus({
      promotedFindings: [{ promotedFindingId: "pf-1", routeId: "B44", claimText: "..." }],
    });
    const proposal = buildBriefProposal({
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [{ kind: "promoted_finding", promotedFindingId: "pf-1" }],
          metricClaims: [],
        },
      ],
    });
    expect(validateEvidenceProvenanceResolves({ corpus, proposal }).passed).toBe(true);
  });

  test("fails when a provenance evidenceId is not in brief.evidence", () => {
    const corpus = buildBriefCorpus({
      promotedFindings: [{ promotedFindingId: "pf-1", routeId: "B44", claimText: "..." }],
    });
    const proposal = buildBriefProposal({
      evidenceProvenance: [
        {
          evidenceId: "ev-not-here",
          citedRefs: [{ kind: "promoted_finding", promotedFindingId: "pf-1" }],
          metricClaims: [],
        },
      ],
    });
    const result = validateEvidenceProvenanceResolves({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("ev-not-here");
  });

  test("fails when a cited ref doesn't resolve in the corpus", () => {
    const proposal = buildBriefProposal({
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [{ kind: "promoted_finding", promotedFindingId: "pf-missing" }],
          metricClaims: [],
        },
      ],
    });
    const result = validateEvidenceProvenanceResolves({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("pf-missing");
  });
});

// ---------------------------------------------------------------------------
// 3. prose_number_coverage (Q65 pattern at brief scope)

describe("validateBriefProseNumberCoverage", () => {
  test("passes when every prose number has a backing metricClaim", () => {
    const corpus = buildBriefCorpus({
      reviewPackets: [
        {
          packetId: "pkt-1",
          routeId: "B44",
          linkIds: [
            {
              linkId: "link-1",
              payload: { observedLongGapShare: 0.7209 },
            },
          ],
        },
      ],
    });
    const proposal = buildBriefProposal({
      brief: {
        summary: "B44 long-gap share is 72.1%.",
      },
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [],
          metricClaims: [
            {
              variable: "observedLongGapShare",
              value: 0.7209,
              units: "proportion",
              evidenceRef: { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
            },
          ],
        },
      ],
    });
    expect(validateBriefProseNumberCoverage({ corpus, proposal }).passed).toBe(true);
  });

  test("fails when a prose number has no backing metricClaim", () => {
    const proposal = buildBriefProposal({
      brief: { summary: "B44 saw 480 high-confidence touches." },
      evidenceProvenance: [],
    });
    const result = validateBriefProseNumberCoverage({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("480");
    expect(result.errors[0]).toContain("summary");
  });
});

// ---------------------------------------------------------------------------
// 4. metric_consistency — the Q65 "wrong variable name" case at brief scope

describe("validateBriefMetricConsistency", () => {
  test("fails when a provenance metricClaim variable maps to a different value", () => {
    const corpus = buildBriefCorpus({
      reviewPackets: [
        {
          packetId: "pkt-1",
          routeId: "Q65",
          linkIds: [
            {
              linkId: "link-1",
              payload: {
                serviceRequestContext: {
                  touchedEventCount: 480,
                  highConfidenceTouchCount: 101,
                },
              },
            },
          ],
        },
      ],
    });
    const proposal = buildBriefProposal({
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [],
          metricClaims: [
            {
              variable: "highConfidenceTouchCount",
              value: 480, // wrong — actual is 101
              units: null,
              evidenceRef: { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
            },
          ],
        },
      ],
    });
    const result = validateBriefMetricConsistency({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("declared 480");
    expect(result.errors[0]).toContain("101");
  });
});

// ---------------------------------------------------------------------------
// 5. language

describe("validateBriefLanguage", () => {
  test("fails on causal verbs anywhere in prose", () => {
    const proposal = buildBriefProposal({
      brief: {
        sections: [
          { title: "Frame", body: ["The intervention caused speed gains."] },
          { title: "Evidence", body: ["Body."] },
        ],
      },
    });
    const result = validateBriefLanguage({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("caused");
  });
});

// ---------------------------------------------------------------------------
// 6. scope_blocked_claims

describe("validateBriefScopeBlockedClaims", () => {
  test("fails when prose claims publish readiness", () => {
    const proposal = buildBriefProposal({
      brief: { summary: "Ready to publish brief on B44." },
    });
    const result = validateBriefScopeBlockedClaims({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("publish");
  });
});

// ---------------------------------------------------------------------------
// 7. duplicate

describe("validateBriefDuplicate", () => {
  test("flags a peer brief with high jaccard on title+summary", () => {
    const corpus = buildBriefCorpus({
      briefs: [
        {
          id: "existing-1",
          routeSlug: "b44",
          title: "B44 reliability draft",
          summary: "B44 has observed long-gap share elevated relative to peer routes.",
        },
      ],
    });
    const proposal = buildBriefProposal();
    const result = validateBriefDuplicate({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("existing-1");
  });

  test("passes when no peer brief shares the routeSlug", () => {
    const proposal = buildBriefProposal();
    expect(validateBriefDuplicate({ corpus: buildBriefCorpus({}), proposal }).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. section_coverage

describe("validateBriefSectionCoverage", () => {
  test("fails when there's only one section", () => {
    const proposal = buildBriefProposal({
      brief: {
        sections: [{ title: "One", body: ["Body."] }],
      },
    });
    expect(
      validateBriefSectionCoverage({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(false);
  });

  test("fails when claims array is empty", () => {
    const proposal = buildBriefProposal({
      brief: { claims: [] },
    });
    expect(
      validateBriefSectionCoverage({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. kpi_grounding

describe("validateBriefKpiGrounding", () => {
  test("passes when each numeric KPI value has a matching metricClaim", () => {
    const proposal = buildBriefProposal({
      brief: {
        kpis: [
          {
            label: "Speed",
            value: "6.6",
            unit: "mph",
            sub: "Observed",
            tone: "warn",
          },
        ],
      },
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [],
          metricClaims: [
            {
              variable: "routeWeightedAverageSpeedMph",
              value: 6.6,
              units: "mph",
              evidenceRef: { kind: "review_packet_link", packetId: "x", linkId: "y" },
            },
          ],
        },
      ],
    });
    expect(
      validateBriefKpiGrounding({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(true);
  });

  test("fails when a numeric KPI has no backing metricClaim", () => {
    const proposal = buildBriefProposal({
      brief: {
        kpis: [
          {
            label: "Speed",
            value: "6.6",
            unit: "mph",
            sub: "Observed",
            tone: "warn",
          },
        ],
      },
      evidenceProvenance: [],
    });
    const result = validateBriefKpiGrounding({
      corpus: buildBriefCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("Speed");
  });

  test("matches percentage KPI against a proportion-form metricClaim", () => {
    const proposal = buildBriefProposal({
      brief: {
        kpis: [
          {
            label: "Long-gap share",
            value: "72.1",
            unit: "%",
            sub: "Observed",
            tone: "warn",
          },
        ],
      },
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [],
          metricClaims: [
            {
              variable: "observedLongGapShare",
              value: 0.7209,
              units: "proportion",
              evidenceRef: { kind: "review_packet_link", packetId: "x", linkId: "y" },
            },
          ],
        },
      ],
    });
    expect(
      validateBriefKpiGrounding({
        corpus: buildBriefCorpus({}),
        proposal,
      }).passed,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregator

describe("validateBriefProposal", () => {
  test("returns valid state when every check passes", () => {
    const corpus = buildBriefCorpus({
      promotedFindings: [{ promotedFindingId: "pf-1", routeId: "B44", claimText: "..." }],
    });
    const proposal = buildBriefProposal({
      evidenceProvenance: [
        {
          evidenceId: "ev-1",
          citedRefs: [{ kind: "promoted_finding", promotedFindingId: "pf-1" }],
          metricClaims: [],
        },
      ],
    });
    const record = validateBriefProposal(corpus, proposal);
    expect(record.validationState).toBe("valid");
    expect(record.errors).toEqual([]);
    expect(record.checks.length).toBe(9);
  });

  test("returns rejected with prefixed error names", () => {
    const proposal = buildBriefProposal({
      brief: {
        sections: [{ title: "Only", body: ["The bus lane caused speed gains."] }],
      },
    });
    const record = validateBriefProposal(buildBriefCorpus({}), proposal);
    expect(record.validationState).toBe("rejected");
    expect(record.errors.some((e) => e.startsWith("[language]"))).toBe(true);
    expect(record.errors.some((e) => e.startsWith("[section_coverage]"))).toBe(true);
  });
});
