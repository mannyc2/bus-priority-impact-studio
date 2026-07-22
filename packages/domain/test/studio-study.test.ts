import { describe, expect, test } from "bun:test";
import { decodeEitherStrict } from "@bp/domain/decode";
import { OperationalOccurrenceProducerReviewStatusSchema } from "@bp/domain/documents/operational-occurrence";
import {
  RouteStudiesArtifactSchema,
  routeStudiesKey,
  StudyArtifactSchema,
  StudyEventApprovalArtifactSchema,
  StudyEventCandidateSchema,
  StudyEventMergeArtifactSchema,
  StudyIndexArtifactSchema,
  StudyPhysicalScopeBindingsArtifactSchema,
  studyArtifactKey,
  studyIndexKey,
} from "@bp/domain/studio/study";
import { Result } from "effect";

const candidate = {
  candidateId: "study-event:abc123",
  routeId: "M15",
  treatmentFamily: "bus_lane" as const,
  implementationDate: "2010-10-10",
  implementationMonth: "2010-10",
  datePrecision: "day" as const,
  conflictState: "none" as const,
  provenance: [
    {
      sourceKind: "mta_wiki" as const,
      sourceId: "mta_wiki_operational_anchors",
      sourceEventId: "change:abc123",
      releaseId: "v2-temporal-canary",
      anchorIds: ["operational:event_m15"],
    },
  ],
};

describe("study event contracts", () => {
  test("accepts a strict source-backed candidate and rejects unsupported treatment families", () => {
    expect(Result.isSuccess(decodeEitherStrict(StudyEventCandidateSchema)(candidate))).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(StudyEventCandidateSchema)({
          ...candidate,
          treatmentFamily: "custom_treatment",
        }),
      ),
    ).toBe(true);
  });

  test("binds approvals to one candidate-set identity", () => {
    const approval = {
      artifactKind: "bp.studio.study_event_approvals.v1" as const,
      schemaVersion: 1 as const,
      candidateSetId: "candidate-set:def456",
      decisions: [
        {
          candidateId: candidate.candidateId,
          decision: "approved" as const,
          reviewer: "operator@example.test",
          rationale: "Evidence and intervention identity reviewed.",
        },
      ],
    };
    expect(Result.isSuccess(decodeEitherStrict(StudyEventApprovalArtifactSchema)(approval))).toBe(
      true,
    );
    expect(
      Result.isSuccess(
        decodeEitherStrict(StudyEventMergeArtifactSchema)({
          artifactKind: "bp.studio.study_events.v1",
          schemaVersion: 1,
          candidateSetId: approval.candidateSetId,
          wikiInput: {
            mode: "pinned_release",
            releaseId: "v2-temporal-canary",
            manifestSha256: "a".repeat(64),
            artifactSha256: "b".repeat(64),
          },
          summary: {
            registryInputCount: 1,
            wikiInputCount: 1,
            candidateCount: 1,
            approvedCount: 1,
            rejectedByOperatorCount: 0,
            sourceRejectionCount: 0,
            conflictCount: 0,
            exactDeduplicationCount: 1,
          },
          approvalState: "approved",
          candidates: [candidate],
          approvedEvents: [candidate],
          rejections: [],
          conflicts: [],
          approval,
        }),
      ),
    ).toBe(true);
  });

  test("binds the producer review compatibility to its promotion disposition", () => {
    expect(
      Result.isSuccess(
        decodeEitherStrict(OperationalOccurrenceProducerReviewStatusSchema)({
          compatibility: "compatible",
          promotionEligible: true,
        }),
      ),
    ).toBe(true);
    expect(
      Result.isSuccess(
        decodeEitherStrict(OperationalOccurrenceProducerReviewStatusSchema)({
          compatibility: "known_rc22_review_v1_physical_scope_incompatibility",
          promotionEligible: false,
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(OperationalOccurrenceProducerReviewStatusSchema)({
          compatibility: "known_rc22_review_v1_physical_scope_incompatibility",
          promotionEligible: true,
        }),
      ),
    ).toBe(true);
  });
});

describe("study physical-scope binding contracts", () => {
  test("binds one exact occurrence and geometry set to current segments and stable spines", () => {
    const artifact = {
      artifactKind: "bp.studio.study_physical_scope_bindings.v1" as const,
      schemaVersion: 1 as const,
      candidateSetId: "candidate-set-v3:fixture",
      analysisMonth: "2026-03",
      sourceRelease: {
        releaseId: "v1-rc25",
        manifestSha256: "a".repeat(64),
        occurrencesSha256: "b".repeat(64),
      },
      inputs: {
        busLaneSnapshotSha256: "c".repeat(64),
        routeShapeSnapshotSha256: "d".repeat(64),
        stopSnapshotSha256: "e".repeat(64),
      },
      bindings: [
        {
          candidateId: "study-event-v2:flatbush-b41",
          routeId: "B41",
          occurrenceId: "occurrence:flatbush-phase1",
          physicalScopeRecordIds: ["corridor:flatbush-livingston-state"],
          geometrySourceId: "nyc_dot_bus_lanes",
          geometryFeatureIds: ["0022938", "0022942"],
          selectedGeometryRowsSha256: "f".repeat(64),
          speedSpineSha256: "1".repeat(64),
          segmentBindings: [
            {
              sourceSegmentId: "B41:2026-03:N:48:303254:901007",
              spineSegmentId: "b41-n-node-012-node-013",
            },
          ],
        },
      ],
    };

    expect(
      Result.isSuccess(decodeEitherStrict(StudyPhysicalScopeBindingsArtifactSchema)(artifact)),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(StudyPhysicalScopeBindingsArtifactSchema)({
          ...artifact,
          bindings: [{ ...artifact.bindings[0], geometryFeatureIds: [] }],
        }),
      ),
    ).toBe(true);
  });
});

const passGate = { status: "pass" as const, reason: "Fixture gate passed." };
const variant = {
  effectMph: 1,
  effectPercent: 12.5,
  confidenceInterval: { lowerMph: 0.4, upperMph: 1.6, iterationCount: 1_000, seed: 42 },
  windowMeans: {
    treatedPreMeanMph: 8,
    treatedPostMeanMph: 9.2,
    controlPreMeanMph: 8.1,
    controlPostMeanMph: 8.3,
  },
  matchedSegmentCount: 8,
  eligibleControlSegmentCount: 40,
  dropped: { insufficientWindow: 1, insufficientControls: 2, unmatchedSourceRows: 0 },
  monthlySeries: [
    { month: "2025-01", treatedMeanMph: 8, controlMeanMph: 8.1, differenceMph: -0.1 },
  ],
};
const study = {
  artifactKind: "bp.studio.segment_study.v1" as const,
  schemaVersion: 1 as const,
  eventKey: "study-event-abc123-m15",
  candidateId: candidate.candidateId,
  candidateSetId: "candidate-set:def456",
  routeId: "M15",
  routeSlug: "m15",
  treatmentFamily: "bus_lane" as const,
  implementationDate: "2025-01-05",
  implementationMonth: "2025-01",
  treatedSegmentScope: "lane_overlap_spines" as const,
  treatedSpineSegmentIds: ["m15-n-a-b"],
  evaluationLevel: "segment_matched_did" as const,
  claimTier: "gated_estimate" as const,
  direction: "improved" as const,
  gates: {
    preTrend: passGate,
    placeboInTime: passGate,
    minSample: passGate,
    controlEligibility: passGate,
    congestionPricingOverlap: passGate,
    redesignOverlap: passGate,
  },
  variants: { allDay: variant, peakHours: variant },
  placeboEffectMph: 0.1,
  sensitivityEstimates: { congestionPricing: null, queensRedesign: null },
  provenance: {
    engineVersion: "segment-matched-did-v1" as const,
    event: candidate.provenance,
    sourceTable: "local_route_segment_speed" as const,
    analysisMonth: "2026-03",
    dataWindow: { startMonth: "2024-07", endMonth: "2025-07" },
    speedSpineArtifactPaths: ["studio/v2/routes/m15/speed-spine.json"],
    excludedControlRouteIds: ["M14A"],
  },
};

describe("segment study artifact contracts", () => {
  test("validates one source-backed study and deterministic artifact keys", () => {
    expect(Result.isSuccess(decodeEitherStrict(StudyArtifactSchema)(study))).toBe(true);
    expect(studyArtifactKey(study.eventKey)).toBe("studio/v2/studies/study-event-abc123-m15.json");
    expect(studyIndexKey()).toBe("studio/v2/studies/index.json");
    expect(routeStudiesKey("m15")).toBe("studio/v2/routes/m15/studies.json");
  });

  test("allows the complete 6+event+6 month sensitivity exclusion audit", () => {
    const excludedMonths = Array.from({ length: 13 }, (_, index) => {
      const absolute = 2025 * 12 + 3 + index;
      return `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, "0")}`;
    });
    const sensitivity = {
      reason: "Fixture sensitivity exclusion.",
      excludedMonths,
      effectMph: null,
      effectPercent: null,
      confidenceInterval: null,
    };
    expect(
      Result.isSuccess(
        decodeEitherStrict(StudyArtifactSchema)({
          ...study,
          sensitivityEstimates: { congestionPricing: sensitivity, queensRedesign: null },
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(StudyArtifactSchema)({
          ...study,
          sensitivityEstimates: {
            congestionPricing: {
              ...sensitivity,
              excludedMonths: [...excludedMonths, "2026-05"],
            },
            queensRedesign: null,
          },
        }),
      ),
    ).toBe(true);
  });

  test("caps the study index at 500 rows", () => {
    const row = {
      eventKey: study.eventKey,
      routeId: study.routeId,
      routeSlug: study.routeSlug,
      treatmentFamily: study.treatmentFamily,
      implementationMonth: study.implementationMonth,
      effectMph: variant.effectMph,
      confidenceInterval: variant.confidenceInterval,
      evaluationLevel: study.evaluationLevel,
      claimTier: study.claimTier,
      direction: study.direction,
    };
    expect(
      Result.isSuccess(
        decodeEitherStrict(StudyIndexArtifactSchema)({
          artifactKind: "bp.studio.segment_study_index.v1",
          schemaVersion: 1,
          analysisMonth: "2026-03",
          studies: Array.from({ length: 500 }, () => row),
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(StudyIndexArtifactSchema)({
          artifactKind: "bp.studio.segment_study_index.v1",
          schemaVersion: 1,
          analysisMonth: "2026-03",
          studies: Array.from({ length: 501 }, () => row),
        }),
      ),
    ).toBe(true);
  });

  test("caps each route rollup at 20 full study payloads", () => {
    const artifact = {
      artifactKind: "bp.studio.route_studies.v1",
      schemaVersion: 1,
      analysisMonth: "2026-03",
      routeId: "M15",
      routeSlug: "m15",
    };
    expect(
      Result.isSuccess(
        decodeEitherStrict(RouteStudiesArtifactSchema)({
          ...artifact,
          studies: Array.from({ length: 20 }, () => study),
        }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        decodeEitherStrict(RouteStudiesArtifactSchema)({
          ...artifact,
          studies: Array.from({ length: 21 }, () => study),
        }),
      ),
    ).toBe(true);
  });
});
