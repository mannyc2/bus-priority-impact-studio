import { describe, expect, test } from "bun:test";
import {
  AgentFindingProposalEvidenceRefSchema,
  FindingEvidenceLinkSchema,
  FindingPromotionQueueArtifactSchema,
  FindingReviewDecisionsArtifactSchema,
  FindingReviewPacketsArtifactSchema,
  PromotedFindingsArtifactSchema,
} from "@bp/domain/findings";
import { healthResponseJsonSchema, studioReleasePayloadJsonSchema } from "@bp/domain/json-schema";
import { RouteIdCodec } from "@bp/domain/primitives";
import { HealthResponseSchema, RouteScorecardSchema } from "@bp/domain/routes";
import { StudioMethodsResponseSchema } from "@bp/domain/studio/docs";
import { buildStudioRouteProjection } from "@bp/domain/studio/projections";
import { StudioReleasePayloadSchema } from "@bp/domain/studio/release";
import { StudioRouteDetailResponseSchema } from "@bp/domain/studio/routes";
import * as z from "../src/schema-compat.js";

describe("domain schemas", () => {
  test("normalizes route IDs at the boundary with the domain codec", () => {
    const normalizedRouteId: string = z.decode(RouteIdCodec, " m1 ");

    expect(normalizedRouteId).toBe("M1");
  });

  test("rejects scorecards without citations", () => {
    expect(() =>
      RouteScorecardSchema.parse({
        schemaVersion: 1,
        routeId: "M1",
        month: "2026-01",
        routeScore: 82,
        coverageStatus: "full",
        averageSpeedMph: 7.5,
        hotspotCount: 3,
        citations: [],
      }),
    ).toThrow();
  });

  test("exports JSON Schema for generated docs and contracts", () => {
    expect(healthResponseJsonSchema).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    );
    expect(studioReleasePayloadJsonSchema).toEqual(
      expect.objectContaining({
        $schema: "https://json-schema.org/draft/2020-12/schema",
      }),
    );
  });

  test("keeps Studio release payloads strict", () => {
    expect(() =>
      StudioReleasePayloadSchema.parse({
        schemaVersion: 1,
        generatedAt: "2026-05-18T00:00:00.000Z",
        quality: {
          releaseLayer: "baseline_release",
          completenessStatus: "complete",
          confidence: "medium",
          caveats: [],
        },
        routes: [],
        segments: [],
        methods: [],
        docsSections: [],
        docsEndpoints: [],
        extra: "not allowed",
      }),
    ).toThrow();
  });

  test("parses generated Studio method projection dataset metadata", () => {
    const methods = StudioMethodsResponseSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-05-25T20:11:06.387Z",
      datasets: [
        {
          sourceId: "route_month_trends",
          name: "MTA route speed and ridership summaries",
          publisher: "MTA",
          grain: "Route/month",
          cadence: "Monthly",
          description:
            "Route/month speed, ridership, and transfer trend rows generated from MTA public source data.",
          rowCount: 12_075,
          rowLabel: "route-month rows",
          period: "2023-04 through 2026-03",
          schemaKeys: ["route_id", "month", "average_speed_mph", "ridership", "has_speed_trend"],
          method: "route-month-trends",
          sourceRefCount: 4,
        },
      ],
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "medium",
        caveats: [],
      },
    });

    expect(methods.datasets[0]?.sourceId).toBe("route_month_trends");
  });

  test("parses review packets with explicit counter-evidence", () => {
    const candidate = {
      candidateId: "candidate-1",
      detectorId: "persistent_speed_hotspot",
      detectorRunId: "detector-run-1",
      month: "2026-03",
      scopeKind: "segment",
      scopeId: "M15:0:1",
      routeId: "M15",
      physicalId: null,
      category: "speed",
      severity: "medium",
      confidence: "high",
      detectorScore: 88,
      reasonCode: "persistent_low_speed",
      claimSafeLabel: "issue_needs_review",
      claimText: "Route M15 has a persistent low-speed segment.",
      status: "open",
      reviewState: "needs_review",
      windowStart: null,
      windowEnd: null,
      createdAt: "2026-05-23T00:00:00.000Z",
    };
    const primary = FindingEvidenceLinkSchema.parse({
      linkId: "primary-1",
      candidateId: "candidate-1",
      evidenceKind: "metric",
      evidenceRole: "primary",
      evidenceRef: "{}",
      evidenceWeight: 1,
      note: null,
    });
    const counter = FindingEvidenceLinkSchema.parse({
      linkId: "counter-1",
      candidateId: "candidate-1",
      evidenceKind: "metric",
      evidenceRole: "counter_evidence",
      evidenceRef: "{}",
      evidenceWeight: 0.4,
      note: "Segment scope caveat.",
    });

    const artifact = FindingReviewPacketsArtifactSchema.parse({
      artifactKind: "finding_review_packets",
      schemaVersion: 1,
      month: "2026-03",
      generatedAt: "2026-05-23T00:00:00.000Z",
      detectorSpecsArtifactPath: "/tmp/detector-specs.json",
      packetCount: 1,
      summary: {
        packetCount: 1,
        candidatesWithoutCounterEvidence: 0,
        candidatesWithoutCoverage: 0,
        detectorCounts: { persistent_speed_hotspot: 1 },
      },
      packets: [
        {
          packetId: "packet-1",
          reviewRank: 1,
          candidate,
          detectorSpec: {
            detectorId: "persistent_speed_hotspot",
            name: "Persistent speed hotspot",
            question: "Which segments are slow?",
            claimTemplate: "A segment is slow.",
            allowedClaimStrength: 3,
            primaryEvidenceRequired: ["Speed metric."],
            supportingEvidenceExpected: ["Context."],
            counterEvidenceRequired: ["Scope caveat."],
            promotionChecklist: ["Keep segment-scoped."],
            knownFailureModes: ["Route-wide overclaim."],
          },
          priority: { score: 98, band: "high", signals: ["persistent_speed_hotspot"] },
          evidence: {
            primary: [primary],
            context: [],
            officialContext: [],
            counterEvidence: [counter],
            caveats: [],
            missingData: [],
            coverageAudit: [],
          },
          evidenceObjects: {
            primary: [{}],
            context: [],
            officialContext: [],
            counterEvidence: [{}],
            caveats: [],
            missingData: [],
            coverageAudit: [],
          },
          coverage: [
            {
              auditId: "audit-1",
              detectorRunId: "detector-run-1",
              detectorId: "persistent_speed_hotspot",
              month: "2026-03",
              scopeKind: "route",
              scopeId: "M15",
              outcome: "hit",
              reasonCode: null,
              reason: null,
              inputsSeenJson: "{}",
              inputsExpectedJson: "{}",
              createdAt: "2026-05-23T00:00:00.000Z",
            },
          ],
          derivedMetricWarnings: [],
          promotionBlockers: [],
          reviewChecklist: ["Keep segment-scoped."],
          allowedClaimStrength: 3,
          packetCompleteness: {
            hasPrimaryEvidence: true,
            hasCounterEvidence: true,
            hasCoverageAudit: true,
            hasDetectorSpec: true,
            hasReviewChecklist: true,
          },
        },
      ],
    });

    expect(artifact.packets[0]?.evidence.counterEvidence).toHaveLength(1);
  });

  test("parses reviewer promotion queues with explicit decisions", () => {
    const artifact = FindingPromotionQueueArtifactSchema.parse({
      artifactKind: "finding_promotion_queue",
      schemaVersion: 1,
      month: "2026-03",
      generatedAt: "2026-05-23T00:00:00.000Z",
      reviewPacketsArtifactPath: "/tmp/review-packets.json",
      candidateCount: 1,
      summary: {
        candidateCount: 1,
        readinessCounts: { ready_for_review: 1, needs_enrichment: 0, blocked: 0 },
        recommendedNextActionCounts: {
          review_for_promotion: 1,
          revise_claim_before_promotion: 0,
          keep_as_data_quality: 0,
          enrich_before_promotion: 0,
          do_not_promote: 0,
        },
        detectorCounts: { persistent_speed_hotspot: 1 },
        readyForReviewCount: 1,
        blockedCount: 0,
      },
      reviewerDecisionOptions: [
        {
          decision: "approve",
          meaning: "Promote within the allowed claim strength.",
        },
      ],
      outputSchema: {
        candidateId: "string",
        decision: "approve | approve_with_revisions | defer | reject | downgrade_to_context",
        revisedClaimText: "string | null",
        rationale: "string",
        evidenceRefsApproved: "string[]",
        reviewer: "string",
        reviewedAt: "ISO datetime",
      },
      candidates: [
        {
          packetId: "packet-1",
          reviewRank: 1,
          candidate: {
            candidateId: "candidate-1",
            detectorId: "persistent_speed_hotspot",
            detectorRunId: "detector-run-1",
            month: "2026-03",
            scopeKind: "segment",
            scopeId: "M15:0:1",
            routeId: "M15",
            physicalId: null,
            category: "speed",
            severity: "medium",
            confidence: "high",
            detectorScore: 88,
            reasonCode: "persistent_low_speed",
            claimSafeLabel: "issue_needs_review",
            claimText: "Route M15 has a persistent low-speed segment.",
            status: "open",
            reviewState: "needs_review",
            windowStart: null,
            windowEnd: null,
            createdAt: "2026-05-23T00:00:00.000Z",
          },
          readiness: "ready_for_review",
          recommendedNextAction: "review_for_promotion",
          promotionPriority: 113,
          promotionPriorityBand: "critical",
          allowedClaimStrength: 3,
          maxPromotableClaimStrength: 3,
          promotionBlockers: [],
          requiredReviewerActions: ["Confirm evidence supports the claim."],
          evidenceSummary: {
            primaryCount: 1,
            contextCount: 1,
            counterEvidenceCount: 1,
            caveatCount: 0,
            missingDataCount: 0,
            coverageAuditCount: 1,
          },
          reviewChecklist: ["Keep segment-scoped."],
        },
      ],
    });

    expect(artifact.summary.readyForReviewCount).toBe(1);
    expect(String(artifact.reviewerDecisionOptions[0]?.decision)).toBe("approve");
  });

  test("parses review decision and immutable promoted finding artifacts", () => {
    const sourceCandidate = {
      candidateId: "candidate-1",
      detectorId: "persistent_speed_hotspot",
      detectorRunId: "detector-run-1",
      month: "2026-03",
      scopeKind: "segment",
      scopeId: "M15:0:1",
      routeId: "M15",
      physicalId: null,
      category: "speed",
      severity: "medium",
      confidence: "high",
      detectorScore: 88,
      reasonCode: "persistent_low_speed",
      claimSafeLabel: "issue_needs_review",
      claimText: "Route M15 has a persistent low-speed segment.",
      status: "open",
      reviewState: "needs_review",
      windowStart: null,
      windowEnd: null,
      createdAt: "2026-05-23T00:00:00.000Z",
    };
    const decisionHash = "a".repeat(64);
    const candidateSnapshotHash = "b".repeat(64);
    const promotedFindingHash = "c".repeat(64);

    const decisions = FindingReviewDecisionsArtifactSchema.parse({
      artifactKind: "finding_review_decisions",
      schemaVersion: 1,
      month: "2026-03",
      generatedAt: "2026-05-24T00:00:00.000Z",
      promotionQueueArtifactPath: "/tmp/promotion-queue.json",
      reviewPacketsArtifactPath: "/tmp/review-packets.json",
      decisionCount: 1,
      summary: {
        decisionCount: 1,
        decisionCounts: {
          approve: 1,
          approve_with_revisions: 0,
          defer: 0,
          reject: 0,
          downgrade_to_context: 0,
        },
        promotedDecisionCount: 1,
        nonPromotedDecisionCount: 0,
      },
      decisions: [
        {
          decisionId: "review_decision_1",
          decisionHash,
          packetId: "packet-1",
          candidateId: "candidate-1",
          detectorId: "persistent_speed_hotspot",
          routeId: "M15",
          decision: "approve",
          revisedClaimText: null,
          rationale: "Primary speed evidence supports a segment-scoped descriptive claim.",
          evidenceRefsApproved: ["evidence-1"],
          reviewer: "tester",
          reviewedAt: "2026-05-24T00:00:00.000Z",
          promoted: true,
        },
      ],
    });
    const promoted = PromotedFindingsArtifactSchema.parse({
      artifactKind: "promoted_findings",
      schemaVersion: 1,
      month: "2026-03",
      generatedAt: "2026-05-24T00:00:00.000Z",
      promotionQueueArtifactPath: "/tmp/promotion-queue.json",
      reviewDecisionsArtifactPath: "/tmp/review-decisions.json",
      promotedFindingCount: 1,
      summary: {
        promotedFindingCount: 1,
        detectorCounts: { persistent_speed_hotspot: 1 },
        routeCount: 1,
      },
      findings: [
        {
          promotedFindingId: "promoted_finding_1",
          sourceCandidateId: "candidate-1",
          sourceDecisionId: "review_decision_1",
          sourcePacketId: "packet-1",
          detectorId: "persistent_speed_hotspot",
          month: "2026-03",
          scopeKind: "segment",
          scopeId: "M15:0:1",
          routeId: "M15",
          category: "speed",
          severity: "medium",
          confidence: "high",
          reasonCode: "persistent_low_speed",
          claimText: "Route M15 has a persistent low-speed segment.",
          approvedClaimStrength: 3,
          approvedEvidenceRefs: ["evidence-1"],
          reviewer: "tester",
          reviewedAt: "2026-05-24T00:00:00.000Z",
          reviewRationale: "Primary speed evidence supports a segment-scoped descriptive claim.",
          sourceCandidate,
          decisionHash,
          candidateSnapshotHash,
          promotedFindingHash,
        },
      ],
    });

    expect(decisions.summary.promotedDecisionCount).toBe(1);
    expect(promoted.findings[0]?.sourceCandidate.candidateId).toBe("candidate-1");
  });

  test("projects route artifact refs into Studio route detail contracts", () => {
    const release = StudioReleasePayloadSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-05-18T00:00:00.000Z",
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "medium",
        caveats: [],
      },
      routes: [
        {
          slug: "m15-sbs",
          routeId: "M15+",
          label: "M15",
          corridor: "1 Av / 2 Av",
          corridorFull: "1st Avenue / 2nd Avenue Select Bus Service",
          borough: "Manhattan",
          sbs: true,
          speedMph: 6.4,
          scheduledMph: 7.1,
          weightedAvgSpeed: 6.4,
          speedPercentile: 12,
          dailyRiders: 37_200,
          ridersYoyPct: -4.1,
          riderHoursLost: 4_310,
          laneCoverage: 72,
          aceStatus: "active",
          aceSince: "2019-11",
          tspCoverage: "partial",
          reliability: "Observed reliability available",
          observedReliability: null,
          diagnosis: "Fixture route for contract projection.",
          spark: [6.8, 6.4],
          termini: { north: "E 125 St", south: "South Ferry" },
          miles: 8.4,
          stops: 33,
          flags: ["ACE active"],
          peerSlug: null,
          interventions: [],
        },
      ],
      segments: [],
      routeArtifacts: [
        {
          routeId: "M15+",
          month: "2026-03",
          name: "brief.json",
          key: "briefs/routes/m15-sbs/2026-03/brief.json",
          contentType: "application/json",
          byteLength: 42,
          sha256: "a".repeat(64),
        },
      ],
      methods: [],
      docsSections: [],
      docsEndpoints: [],
    });

    const route = release.routes[0];
    expect(route).toBeDefined();
    if (route === undefined) {
      throw new Error("expected route fixture");
    }

    const detail = StudioRouteDetailResponseSchema.parse(
      buildStudioRouteProjection(release, route),
    );

    expect(detail.artifactRefs).toEqual([
      expect.objectContaining({
        routeId: "M15+",
        key: "briefs/routes/m15-sbs/2026-03/brief.json",
      }),
    ]);
  });

  test("keeps health responses strict", () => {
    expect(() =>
      HealthResponseSchema.parse({
        ok: true,
        service: "bus-priority-impact-studio",
        checkedAt: "2026-04-27T12:00:00Z",
        extra: "not allowed",
      }),
    ).toThrow();
  });

  test("AgentFindingProposalEvidenceRefSchema accepts a code_execution ref", () => {
    const parsed = AgentFindingProposalEvidenceRefSchema.parse({
      kind: "code_execution",
      language: "typescript",
      code: "import { listAnalyticsDetectors } from '@bp/analytics/registry';\nconsole.log(listAnalyticsDetectors().length)",
      stdoutHash: "a".repeat(64),
      citedValuePath: "/lines/0",
    });
    expect(parsed.kind).toBe("code_execution");
    if (parsed.kind === "code_execution") {
      expect(parsed.language).toBe("typescript");
    }
  });

  test("AgentFindingProposalEvidenceRefSchema rejects code_execution refs with bad stdoutHash", () => {
    expect(() =>
      AgentFindingProposalEvidenceRefSchema.parse({
        kind: "code_execution",
        language: "typescript",
        code: "console.log(1)",
        stdoutHash: "not-a-sha256",
      }),
    ).toThrow();
  });

  test("AgentFindingProposalEvidenceRefSchema still accepts existing review_packet_link kind", () => {
    const parsed = AgentFindingProposalEvidenceRefSchema.parse({
      kind: "review_packet_link",
      packetId: "pkt-1",
      linkId: "link-1",
    });
    expect(parsed.kind).toBe("review_packet_link");
  });
});
