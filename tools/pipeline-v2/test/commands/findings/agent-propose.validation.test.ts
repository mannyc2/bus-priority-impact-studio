import { describe, expect, test } from "bun:test";

import type {
  AgentFindingProposal,
  AgentFindingProposalEvidenceRef,
  DocumentEvidenceCandidate,
  DocumentInterventionRecord,
  FindingEvidenceLink,
  FindingReviewPacket,
  PromotedFinding,
  RouteMonthSignalFeature,
} from "@bp/domain";

import type { LoadedCorpus } from "../../../src/commands/findings/_corpus.ts";
import {
  extractProseNumbers,
  validateDuplicate,
  validateEvidenceRefsResolve,
  validateInterventionSupport,
  validateLanguage,
  validateMetricConsistency,
  validateProposal,
  validateProseNumberCoverage,
  validateRouteRefs,
  validateScopeBlockedClaims,
} from "../../../src/commands/findings/_validation.ts";

// ---------------------------------------------------------------------------
// Test corpus builder
//
// The validators only read a handful of fields off each corpus record. We
// build a minimal LoadedCorpus directly with type assertions so the tests do
// not have to satisfy every required field on the strict domain schemas.
// Adding real Zod-shaped fixtures would dwarf the test logic and add nothing
// the corpus.test.ts file does not already cover end-to-end.

type CorpusSeed = {
  routes?: string[];
  signalRows?: Array<{
    routeId: string;
    window: string;
    fields?: Record<string, unknown>;
  }>;
  reviewPackets?: Array<{
    packetId: string;
    routeId: string | null;
    linkIds: ReadonlyArray<
      string | { linkId: string; payload?: Record<string, unknown> }
    >;
  }>;
  promotedFindings?: Array<{
    promotedFindingId: string;
    routeId: string;
    claimText: string;
    approvedEvidenceRefs?: string[];
  }>;
  interventionRecords?: Array<{
    recordId: string;
    routes: string[];
    recordKind: "implemented" | "in_progress" | "proposed";
  }>;
  documentCandidates?: Array<{ candidateId: string }>;
  contextAppendixRoutes?: string[];
};

function buildCorpus(seed: CorpusSeed): LoadedCorpus {
  const routes = new Set<string>(seed.routes ?? []);
  const reviewPackets = new Map<string, FindingReviewPacket>();
  const reviewPacketsByRoute = new Map<string, FindingReviewPacket[]>();
  const evidenceLinks = new Map<string, FindingEvidenceLink>();
  for (const pkt of seed.reviewPackets ?? []) {
    const packet = {
      packetId: pkt.packetId,
      candidate: { routeId: pkt.routeId },
    } as unknown as FindingReviewPacket;
    reviewPackets.set(pkt.packetId, packet);
    if (pkt.routeId) {
      routes.add(pkt.routeId);
      const arr = reviewPacketsByRoute.get(pkt.routeId) ?? [];
      arr.push(packet);
      reviewPacketsByRoute.set(pkt.routeId, arr);
    }
    for (const entry of pkt.linkIds) {
      const linkId = typeof entry === "string" ? entry : entry.linkId;
      const payload = typeof entry === "string" ? undefined : entry.payload;
      const evidenceRef =
        payload === undefined ? "" : JSON.stringify(payload);
      evidenceLinks.set(linkId, {
        linkId,
        evidenceRef,
      } as unknown as FindingEvidenceLink);
    }
  }

  const signalFeaturesByRoute = new Map<string, RouteMonthSignalFeature[]>();
  for (const row of seed.signalRows ?? []) {
    const feature = {
      routeId: row.routeId,
      window: row.window,
      ...(row.fields ?? {}),
    } as unknown as RouteMonthSignalFeature;
    routes.add(row.routeId);
    const arr = signalFeaturesByRoute.get(row.routeId) ?? [];
    arr.push(feature);
    signalFeaturesByRoute.set(row.routeId, arr);
  }

  const promotedFindings = new Map<string, PromotedFinding>();
  const promotedFindingsByRoute = new Map<string, PromotedFinding[]>();
  for (const f of seed.promotedFindings ?? []) {
    const finding = {
      promotedFindingId: f.promotedFindingId,
      routeId: f.routeId,
      claimText: f.claimText,
      approvedEvidenceRefs: f.approvedEvidenceRefs ?? [],
    } as unknown as PromotedFinding;
    promotedFindings.set(f.promotedFindingId, finding);
    routes.add(f.routeId);
    const arr = promotedFindingsByRoute.get(f.routeId) ?? [];
    arr.push(finding);
    promotedFindingsByRoute.set(f.routeId, arr);
  }

  const interventionRecords = new Map<string, DocumentInterventionRecord>();
  const interventionRecordsByRoute = new Map<string, DocumentInterventionRecord[]>();
  for (const r of seed.interventionRecords ?? []) {
    const record = {
      recordId: r.recordId,
      routes: r.routes,
      recordKind: r.recordKind,
    } as unknown as DocumentInterventionRecord;
    interventionRecords.set(r.recordId, record);
    for (const routeId of r.routes) {
      routes.add(routeId);
      const arr = interventionRecordsByRoute.get(routeId) ?? [];
      arr.push(record);
      interventionRecordsByRoute.set(routeId, arr);
    }
  }

  const documentCandidates = new Map<string, DocumentEvidenceCandidate>();
  for (const c of seed.documentCandidates ?? []) {
    documentCandidates.set(
      c.candidateId,
      { candidateId: c.candidateId } as unknown as DocumentEvidenceCandidate,
    );
  }

  const contextAppendixByRoute = new Map<string, { routeId: string }>();
  for (const routeId of seed.contextAppendixRoutes ?? []) {
    routes.add(routeId);
    contextAppendixByRoute.set(routeId, { routeId });
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
    reviewPacketsByRoute: reviewPacketsByRoute as never,
    evidenceLinks,
    promotionQueue: null,
    promotedFindings,
    promotedFindingsByRoute: promotedFindingsByRoute as never,
    signalFeaturesArtifact: null,
    signalFeaturesByRoute: signalFeaturesByRoute as never,
    contextAppendixByRoute: contextAppendixByRoute as never,
    interventionRecords,
    interventionRecordsByRoute: interventionRecordsByRoute as never,
    documentCandidates,
    publishableInterventions: [],
    publishableInterventionsByRoute: new Map() as never,
  };
}

function buildProposal(
  overrides: Partial<AgentFindingProposal> & {
    claimText?: string;
    evidenceRefs?: AgentFindingProposalEvidenceRef[];
  } = {},
): AgentFindingProposal {
  return {
    proposalId: "proposal-1",
    runId: "run-1",
    routeId: ("B44" as unknown) as AgentFindingProposal["routeId"],
    scopeKind: "route" as never,
    category: "reliability" as never,
    severity: "moderate" as never,
    confidence: "moderate" as never,
    claimText: "Observed long-gap share elevated relative to peer routes.",
    claimStrength: "observation" as never,
    evidenceRefs: [],
    counterEvidenceRefs: [],
    interventionRecordIds: [],
    documentCandidateIds: [],
    metricClaims: [],
    caveats: [],
    missingEvidence: [],
    duplicateCheck: { matchedPromotedFindingId: null, reason: "no peers" },
    validationState: "pending" as never,
    validationErrors: [],
    ...overrides,
  } as AgentFindingProposal;
}

// ---------------------------------------------------------------------------
// 1. evidence_refs_resolve

describe("validateEvidenceRefsResolve", () => {
  test("passes when every ref resolves", () => {
    const corpus = buildCorpus({
      routes: ["B44"],
      reviewPackets: [{ packetId: "pkt-1", routeId: "B44", linkIds: ["link-1"] }],
      promotedFindings: [
        { promotedFindingId: "pf-1", routeId: "B44", claimText: "" },
      ],
      interventionRecords: [
        { recordId: "ir-1", routes: ["B44"], recordKind: "implemented" },
      ],
      documentCandidates: [{ candidateId: "dc-1" }],
      contextAppendixRoutes: ["B44"],
      signalRows: [
        { routeId: "B44", window: "weekday_peak", fields: { speedMph: 7.5 } },
      ],
    });
    const proposal = buildProposal({
      evidenceRefs: [
        { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
        { kind: "promoted_finding", promotedFindingId: "pf-1" },
        { kind: "intervention_record", recordId: "ir-1" },
        { kind: "document_candidate", candidateId: "dc-1" },
        {
          kind: "context_appendix",
          routeId: "B44" as never,
          month: "2026-03" as never,
          section: "weather",
        },
        {
          kind: "signal_feature",
          routeId: "B44" as never,
          month: "2026-03" as never,
          window: "weekday_peak" as never,
          feature: "speedMph",
        },
      ],
    });
    const result = validateEvidenceRefsResolve({ corpus, proposal });
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("fails on unknown packetId, linkId, signal column, and intervention", () => {
    const corpus = buildCorpus({});
    const proposal = buildProposal({
      evidenceRefs: [
        { kind: "review_packet_link", packetId: "missing", linkId: "x" },
        {
          kind: "signal_feature",
          routeId: "B44" as never,
          month: "2026-03" as never,
          window: "weekday_peak" as never,
          feature: "speedMph",
        },
      ],
      interventionRecordIds: ["unknown-record"],
    });
    const result = validateEvidenceRefsResolve({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test("fails when there are zero evidence refs at all", () => {
    const corpus = buildCorpus({});
    const proposal = buildProposal({});
    const result = validateEvidenceRefsResolve({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("no evidenceRefs");
  });
});

// ---------------------------------------------------------------------------
// 2. metric_consistency

describe("validateMetricConsistency", () => {
  test("passes when the cited signal column matches", () => {
    const corpus = buildCorpus({
      signalRows: [
        { routeId: "B44", window: "weekday_peak", fields: { speedMph: 7.5 } },
      ],
    });
    const proposal = buildProposal({
      metricClaims: [
        {
          variable: "speedMph",
          value: 7.5,
          units: "mph",
          evidenceRef: {
            kind: "signal_feature",
            routeId: "B44" as never,
            month: "2026-03" as never,
            window: "weekday_peak" as never,
            feature: "speedMph",
          },
        },
      ],
    });
    expect(validateMetricConsistency({ corpus, proposal }).passed).toBe(true);
  });

  test("fails when the cited signal column disagrees", () => {
    const corpus = buildCorpus({
      signalRows: [
        { routeId: "B44", window: "weekday_peak", fields: { speedMph: 7.5 } },
      ],
    });
    const proposal = buildProposal({
      metricClaims: [
        {
          variable: "speedMph",
          value: 12.0,
          units: "mph",
          evidenceRef: {
            kind: "signal_feature",
            routeId: "B44" as never,
            month: "2026-03" as never,
            window: "weekday_peak" as never,
            feature: "speedMph",
          },
        },
      ],
    });
    const result = validateMetricConsistency({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("12");
  });

  test("passes when a review_packet_link payload contains the cited variable + value", () => {
    const corpus = buildCorpus({
      reviewPackets: [
        {
          packetId: "pkt-1",
          routeId: "Q65",
          linkIds: [
            {
              linkId: "link-1",
              payload: {
                routeId: "Q65",
                month: "2026-03",
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
    const proposal = buildProposal({
      metricClaims: [
        {
          variable: "highConfidenceTouchCount",
          value: 101,
          units: null,
          evidenceRef: { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
        },
      ],
    });
    expect(validateMetricConsistency({ corpus, proposal }).passed).toBe(true);
  });

  // The Q65 dogfood failure mode: claimText said "480 high-confidence touches"
  // and a metricClaim with variable="highConfidenceTouchCount", value=480 would
  // have escaped the old (signal_feature-only) validator. The payload-aware
  // validator now resolves the cited packet's parsed JSON and sees that
  // highConfidenceTouchCount is actually 101.
  test("fails when a review_packet_link variable name maps to a different value", () => {
    const corpus = buildCorpus({
      reviewPackets: [
        {
          packetId: "pkt-1",
          routeId: "Q65",
          linkIds: [
            {
              linkId: "link-1",
              payload: {
                routeId: "Q65",
                month: "2026-03",
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
    const proposal = buildProposal({
      metricClaims: [
        {
          variable: "highConfidenceTouchCount",
          value: 480,
          units: null,
          evidenceRef: { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
        },
      ],
    });
    const result = validateMetricConsistency({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("declared 480");
    expect(result.errors[0]).toContain("101");
  });

  test("fails when the cited review_packet_link payload lacks the named variable", () => {
    const corpus = buildCorpus({
      reviewPackets: [
        {
          packetId: "pkt-1",
          routeId: "B44",
          linkIds: [
            {
              linkId: "link-1",
              payload: { routeId: "B44", speedMph: 7.5 },
            },
          ],
        },
      ],
    });
    const proposal = buildProposal({
      metricClaims: [
        {
          variable: "headway",
          value: 11.3,
          units: "min",
          evidenceRef: { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
        },
      ],
    });
    const result = validateMetricConsistency({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// 2b. prose_number_coverage

describe("validateProseNumberCoverage", () => {
  test("passes when claimText has no numbers", () => {
    const proposal = buildProposal({
      claimText: "Observed long-gap share elevated relative to peer routes.",
    });
    expect(
      validateProseNumberCoverage({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("passes when every prose number has a backing metricClaim", () => {
    const proposal = buildProposal({
      claimText: "Route saw 480 service-request touches with 6.6 mph speeds.",
      metricClaims: [
        {
          variable: "touchedEventCount",
          value: 480,
          units: null,
          evidenceRef: { kind: "review_packet_link", packetId: "x", linkId: "y" },
        },
        {
          variable: "routeWeightedAverageSpeedMph",
          value: 6.6,
          units: "mph",
          evidenceRef: { kind: "review_packet_link", packetId: "x", linkId: "y" },
        },
      ],
    });
    expect(
      validateProseNumberCoverage({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("fails when a prose number has no backing metricClaim", () => {
    const proposal = buildProposal({
      claimText: "Route saw 480 high-confidence touches.",
      metricClaims: [],
    });
    const result = validateProseNumberCoverage({
      corpus: buildCorpus({}),
      proposal,
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("480");
  });

  test("ignores street numbers like '138 ST/37 AV'", () => {
    const proposal = buildProposal({
      claimText:
        "Hotspot between 138 ST/37 AV and 3 AV with no quantitative figures.",
      metricClaims: [],
    });
    expect(
      validateProseNumberCoverage({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("ignores NYC service codes (311, 911) standalone", () => {
    const proposal = buildProposal({
      claimText: "Month had substantial 311 service-request context.",
      metricClaims: [],
    });
    expect(
      validateProseNumberCoverage({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("matches a prose percentage against a proportion-form metricClaim", () => {
    const proposal = buildProposal({
      claimText: "72.09% of headways were long gaps.",
      metricClaims: [
        {
          variable: "observedLongGapShare",
          value: 0.7209,
          units: "proportion",
          evidenceRef: { kind: "review_packet_link", packetId: "x", linkId: "y" },
        },
      ],
    });
    expect(
      validateProseNumberCoverage({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("ignores year-month, year, 32-hex IDs, route IDs, and time strings", () => {
    const corpus = buildCorpus({ routes: ["Q65", "BX12"] });
    const proposal = buildProposal({
      claimText:
        "Route Q65 in 2026-03 (ACS 2024) cited packet 67e81dc484251ab0113f3089425a2a7e at 06:30 with no metric figures, see BX12 ladder.",
      metricClaims: [],
    });
    expect(extractProseNumbers(proposal.claimText, corpus.routes as never)).toEqual([]);
    expect(validateProseNumberCoverage({ corpus, proposal }).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. route_refs

describe("validateRouteRefs", () => {
  test("passes when proposal.routeId is in the corpus", () => {
    const corpus = buildCorpus({ routes: ["B44"] });
    const proposal = buildProposal({});
    expect(validateRouteRefs({ corpus, proposal }).passed).toBe(true);
  });

  test("fails when proposal.routeId is missing from the corpus", () => {
    const corpus = buildCorpus({});
    const proposal = buildProposal({});
    expect(validateRouteRefs({ corpus, proposal }).passed).toBe(false);
  });

  test("fails when an intervention record does not list the proposal route", () => {
    const corpus = buildCorpus({
      routes: ["B44"],
      interventionRecords: [
        { recordId: "ir-1", routes: ["Q65"], recordKind: "implemented" },
      ],
    });
    const proposal = buildProposal({ interventionRecordIds: ["ir-1"] });
    const result = validateRouteRefs({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("B44");
  });
});

// ---------------------------------------------------------------------------
// 4. intervention_support

describe("validateInterventionSupport", () => {
  test("passes when no status word is in the claim", () => {
    const corpus = buildCorpus({
      interventionRecords: [
        { recordId: "ir-1", routes: ["B44"], recordKind: "proposed" },
      ],
    });
    const proposal = buildProposal({
      claimText: "Long-gap share remains elevated peak hours.",
      interventionRecordIds: ["ir-1"],
    });
    expect(validateInterventionSupport({ corpus, proposal }).passed).toBe(true);
  });

  test("fails when claim says 'implemented' but record is proposed-only", () => {
    const corpus = buildCorpus({
      interventionRecords: [
        { recordId: "ir-1", routes: ["B44"], recordKind: "proposed" },
      ],
    });
    const proposal = buildProposal({
      claimText: "Bus lane on Main implemented but speeds unchanged.",
      interventionRecordIds: ["ir-1"],
    });
    const result = validateInterventionSupport({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("proposed");
  });

  test("passes when claim says 'planned' and record is in_progress", () => {
    const corpus = buildCorpus({
      interventionRecords: [
        { recordId: "ir-1", routes: ["B44"], recordKind: "in_progress" },
      ],
    });
    const proposal = buildProposal({
      claimText: "Planned bus lane intersects elevated permit activity.",
      interventionRecordIds: ["ir-1"],
    });
    expect(validateInterventionSupport({ corpus, proposal }).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. language

describe("validateLanguage", () => {
  test("passes on observational, hedged language", () => {
    const proposal = buildProposal({
      claimText: "Observed weekday peak speeds remain in the bottom decile of peers.",
    });
    expect(validateLanguage({ corpus: buildCorpus({}), proposal }).passed).toBe(true);
  });

  test("fails on causal verbs", () => {
    const proposal = buildProposal({
      claimText: "The bus lane installation caused speed gains on Main Street.",
    });
    const result = validateLanguage({ corpus: buildCorpus({}), proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("caused");
  });

  test("fails on recommendations", () => {
    const proposal = buildProposal({
      claimText: "MTA should expand TSP on this route to improve reliability.",
    });
    const result = validateLanguage({ corpus: buildCorpus({}), proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("should");
  });

  test("fails on marketing tone", () => {
    const proposal = buildProposal({
      claimText: "Transformative results expected following the intervention.",
    });
    const result = validateLanguage({ corpus: buildCorpus({}), proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("transformative");
  });
});

// ---------------------------------------------------------------------------
// 6. duplicate — also covered in agent-propose.duplicate.test.ts

describe("validateDuplicate", () => {
  test("passes when route has no promoted findings", () => {
    const corpus = buildCorpus({ routes: ["B44"] });
    const proposal = buildProposal({});
    expect(validateDuplicate({ corpus, proposal }).passed).toBe(true);
  });

  test("fails on high jaccard with existing promoted finding", () => {
    const corpus = buildCorpus({
      promotedFindings: [
        {
          promotedFindingId: "pf-1",
          routeId: "B44",
          claimText: "Observed long-gap share elevated relative to peer routes.",
        },
      ],
    });
    const proposal = buildProposal({
      claimText: "Observed long-gap share elevated relative to peer routes.",
    });
    const result = validateDuplicate({ corpus, proposal });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("pf-1");
  });
});

// ---------------------------------------------------------------------------
// 7. scope_blocked_claims

describe("validateScopeBlockedClaims", () => {
  test("passes a clean observation", () => {
    const proposal = buildProposal({
      claimText: "Long-gap share elevated; no intervention claim asserted.",
    });
    expect(
      validateScopeBlockedClaims({ corpus: buildCorpus({}), proposal }).passed,
    ).toBe(true);
  });

  test("fails when claiming 'promoted finding' status", () => {
    const proposal = buildProposal({
      claimText: "This is a promoted finding documenting the lane gap.",
    });
    const result = validateScopeBlockedClaims({ corpus: buildCorpus({}), proposal });
    expect(result.passed).toBe(false);
  });

  test("fails on 'implemented' with proposed-only intervention support", () => {
    const corpus = buildCorpus({
      routes: ["B44"],
      interventionRecords: [
        { recordId: "ir-1", routes: ["B44"], recordKind: "proposed" },
      ],
    });
    const proposal = buildProposal({
      claimText: "Bus lane implemented but speeds unchanged.",
      interventionRecordIds: ["ir-1"],
    });
    expect(validateScopeBlockedClaims({ corpus, proposal }).passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Aggregator

describe("validateProposal", () => {
  test("returns valid state when every check passes", () => {
    const corpus = buildCorpus({
      routes: ["B44"],
      reviewPackets: [{ packetId: "pkt-1", routeId: "B44", linkIds: ["link-1"] }],
    });
    const proposal = buildProposal({
      evidenceRefs: [
        { kind: "review_packet_link", packetId: "pkt-1", linkId: "link-1" },
      ],
    });
    const record = validateProposal(corpus, proposal);
    expect(record.validationState).toBe("valid");
    expect(record.errors).toEqual([]);
    expect(record.checks.length).toBe(8);
  });

  test("returns rejected with prefixed error names", () => {
    const corpus = buildCorpus({});
    const proposal = buildProposal({
      claimText: "Bus lane caused speed gains on Main Street.",
    });
    const record = validateProposal(corpus, proposal);
    expect(record.validationState).toBe("rejected");
    expect(record.errors.some((e) => e.startsWith("[language]"))).toBe(true);
    expect(record.errors.some((e) => e.startsWith("[evidence_refs_resolve]"))).toBe(
      true,
    );
  });
});
