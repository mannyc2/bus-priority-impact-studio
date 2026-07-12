import { Schema } from "effect";

export const StudyTreatmentFamilySchema = Schema.Literals([
  "all_door_boarding",
  "automated_bus_lane_enforcement",
  "bus_lane",
  "busway",
  "off_board_fare_collection",
  "queue_jump",
  "route_redesign",
  "select_bus_service",
  "stop_change",
  "transit_signal_priority",
]);
export type StudyTreatmentFamily = typeof StudyTreatmentFamilySchema.Type;

export const StudyEventSourceKindSchema = Schema.Literals(["registry", "mta_wiki"]);
export type StudyEventSourceKind = typeof StudyEventSourceKindSchema.Type;

export const StudyEventProvenanceSchema = Schema.Struct({
  sourceKind: StudyEventSourceKindSchema,
  sourceId: Schema.String,
  sourceEventId: Schema.String,
  releaseId: Schema.NullOr(Schema.String),
  anchorIds: Schema.Array(Schema.String),
});
export type StudyEventProvenance = typeof StudyEventProvenanceSchema.Type;

export const StudyEventCandidateSchema = Schema.Struct({
  candidateId: Schema.String,
  routeId: Schema.String,
  treatmentFamily: StudyTreatmentFamilySchema,
  implementationDate: Schema.String,
  implementationMonth: Schema.String,
  datePrecision: Schema.Literals(["day", "month"]),
  conflictState: Schema.Literals(["none", "same_month_review_required"]),
  provenance: Schema.Array(StudyEventProvenanceSchema),
});
export type StudyEventCandidate = typeof StudyEventCandidateSchema.Type;

export const StudyEventRejectionSchema = Schema.Struct({
  sourceKind: StudyEventSourceKindSchema,
  sourceId: Schema.String,
  sourceEventId: Schema.String,
  reasons: Schema.Array(Schema.String),
});
export type StudyEventRejection = typeof StudyEventRejectionSchema.Type;

export const StudyEventConflictSchema = Schema.Struct({
  kind: Schema.Literals(["cross_source_same_month", "wiki_date_conflict"]),
  conflictKey: Schema.String,
  candidateIds: Schema.Array(Schema.String),
  sourceEventIds: Schema.Array(Schema.String),
  dates: Schema.Array(Schema.String),
});
export type StudyEventConflict = typeof StudyEventConflictSchema.Type;

export const StudyEventApprovalDecisionSchema = Schema.Struct({
  candidateId: Schema.String,
  decision: Schema.Literals(["approved", "rejected"]),
  reviewer: Schema.String,
  rationale: Schema.String,
});
export type StudyEventApprovalDecision = typeof StudyEventApprovalDecisionSchema.Type;

export const StudyEventApprovalArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_event_approvals.v1"),
  schemaVersion: Schema.Literal(1),
  candidateSetId: Schema.String,
  decisions: Schema.Array(StudyEventApprovalDecisionSchema),
});
export type StudyEventApprovalArtifact = typeof StudyEventApprovalArtifactSchema.Type;

export const StudyEventMergeArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_events.v1"),
  schemaVersion: Schema.Literal(1),
  candidateSetId: Schema.String,
  wikiInput: Schema.Struct({
    mode: Schema.Literals(["pinned_release", "explicit_opt_out"]),
    releaseId: Schema.NullOr(Schema.String),
    manifestSha256: Schema.NullOr(Schema.String),
    artifactSha256: Schema.NullOr(Schema.String),
  }),
  summary: Schema.Struct({
    registryInputCount: Schema.Number,
    wikiInputCount: Schema.Number,
    candidateCount: Schema.Number,
    approvedCount: Schema.Number,
    rejectedByOperatorCount: Schema.Number,
    sourceRejectionCount: Schema.Number,
    conflictCount: Schema.Number,
    exactDeduplicationCount: Schema.Number,
  }),
  approvalState: Schema.Literals(["awaiting_approval", "approved"]),
  candidates: Schema.Array(StudyEventCandidateSchema),
  approvedEvents: Schema.Array(StudyEventCandidateSchema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
  approval: Schema.NullOr(StudyEventApprovalArtifactSchema),
});
export type StudyEventMergeArtifact = typeof StudyEventMergeArtifactSchema.Type;

const StudyMonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

export { routeStudiesKey, studyArtifactKey, studyIndexKey } from "./study-key.js";

export const StudyGateSchema = Schema.Struct({
  status: Schema.Literals(["pass", "fail", "not_applicable"]),
  reason: Schema.String.check(Schema.isMinLength(1)),
});
export type StudyGate = typeof StudyGateSchema.Type;

export const StudyConfidenceIntervalSchema = Schema.Struct({
  lowerMph: Schema.Number,
  upperMph: Schema.Number,
  iterationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  seed: NonNegativeIntegerSchema,
});
export type StudyConfidenceInterval = typeof StudyConfidenceIntervalSchema.Type;

export const StudyWindowMeansSchema = Schema.Struct({
  treatedPreMeanMph: Schema.Number,
  treatedPostMeanMph: Schema.Number,
  controlPreMeanMph: Schema.Number,
  controlPostMeanMph: Schema.Number,
});
export type StudyWindowMeans = typeof StudyWindowMeansSchema.Type;

export const StudyMonthlySeriesPointSchema = Schema.Struct({
  month: StudyMonthSchema,
  treatedMeanMph: Schema.Number,
  controlMeanMph: Schema.Number,
  differenceMph: Schema.Number,
});
export type StudyMonthlySeriesPoint = typeof StudyMonthlySeriesPointSchema.Type;

export const StudyEstimateVariantSchema = Schema.Struct({
  effectMph: Schema.NullOr(Schema.Number),
  effectPercent: Schema.NullOr(Schema.Number),
  confidenceInterval: Schema.NullOr(StudyConfidenceIntervalSchema),
  windowMeans: Schema.NullOr(StudyWindowMeansSchema),
  matchedSegmentCount: NonNegativeIntegerSchema,
  eligibleControlSegmentCount: NonNegativeIntegerSchema,
  dropped: Schema.Struct({
    insufficientWindow: NonNegativeIntegerSchema,
    insufficientControls: NonNegativeIntegerSchema,
    unmatchedSourceRows: NonNegativeIntegerSchema,
  }),
  monthlySeries: Schema.Array(StudyMonthlySeriesPointSchema).check(Schema.isMaxLength(12)),
});
export type StudyEstimateVariant = typeof StudyEstimateVariantSchema.Type;

export const StudySensitivityEstimateSchema = Schema.Struct({
  reason: Schema.String.check(Schema.isMinLength(1)),
  excludedMonths: Schema.Array(StudyMonthSchema).check(Schema.isMaxLength(12)),
  effectMph: Schema.NullOr(Schema.Number),
  effectPercent: Schema.NullOr(Schema.Number),
  confidenceInterval: Schema.NullOr(StudyConfidenceIntervalSchema),
});
export type StudySensitivityEstimate = typeof StudySensitivityEstimateSchema.Type;

export const StudyArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.segment_study.v1"),
  schemaVersion: Schema.Literal(1),
  eventKey: Schema.String.check(Schema.isMinLength(1)),
  candidateId: Schema.String.check(Schema.isMinLength(1)),
  candidateSetId: Schema.String.check(Schema.isMinLength(1)),
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  treatmentFamily: StudyTreatmentFamilySchema,
  implementationDate: Schema.String.check(Schema.isMinLength(1)),
  implementationMonth: StudyMonthSchema,
  treatedSegmentScope: Schema.Literals([
    "all_route_spines",
    "lane_overlap_spines",
    "all_route_spines_lane_fallback",
  ]),
  treatedSpineSegmentIds: Schema.Array(Schema.String).check(Schema.isMaxLength(1_000)),
  evaluationLevel: Schema.Literals(["segment_matched_did", "descriptive_before_after"]),
  claimTier: Schema.Literals(["gated_estimate", "descriptive"]),
  direction: Schema.Literals(["improved", "worsened", "no_detectable_change", "not_estimable"]),
  gates: Schema.Struct({
    preTrend: StudyGateSchema,
    placeboInTime: StudyGateSchema,
    minSample: StudyGateSchema,
    controlEligibility: StudyGateSchema,
    congestionPricingOverlap: StudyGateSchema,
    redesignOverlap: StudyGateSchema,
  }),
  variants: Schema.Struct({
    allDay: StudyEstimateVariantSchema,
    peakHours: StudyEstimateVariantSchema,
  }),
  placeboEffectMph: Schema.NullOr(Schema.Number),
  sensitivityEstimates: Schema.Struct({
    congestionPricing: Schema.NullOr(StudySensitivityEstimateSchema),
    queensRedesign: Schema.NullOr(StudySensitivityEstimateSchema),
  }),
  provenance: Schema.Struct({
    engineVersion: Schema.Literal("segment-matched-did-v1"),
    event: Schema.Array(StudyEventProvenanceSchema).check(Schema.isMinLength(1)),
    sourceTable: Schema.Literal("local_route_segment_speed"),
    analysisMonth: StudyMonthSchema,
    dataWindow: Schema.Struct({
      startMonth: StudyMonthSchema,
      endMonth: StudyMonthSchema,
    }),
    speedSpineArtifactPaths: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
    excludedControlRouteIds: Schema.Array(Schema.String),
  }),
});
export type StudyArtifact = typeof StudyArtifactSchema.Type;

export const StudyIndexRowSchema = Schema.Struct({
  eventKey: Schema.String.check(Schema.isMinLength(1)),
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  treatmentFamily: StudyTreatmentFamilySchema,
  implementationMonth: StudyMonthSchema,
  effectMph: Schema.NullOr(Schema.Number),
  confidenceInterval: Schema.NullOr(StudyConfidenceIntervalSchema),
  evaluationLevel: Schema.Literals(["segment_matched_did", "descriptive_before_after"]),
  claimTier: Schema.Literals(["gated_estimate", "descriptive"]),
  direction: Schema.Literals(["improved", "worsened", "no_detectable_change", "not_estimable"]),
});
export type StudyIndexRow = typeof StudyIndexRowSchema.Type;

export const StudyIndexArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.segment_study_index.v1"),
  schemaVersion: Schema.Literal(1),
  analysisMonth: StudyMonthSchema,
  studies: Schema.Array(StudyIndexRowSchema).check(Schema.isMaxLength(500)),
});
export type StudyIndexArtifact = typeof StudyIndexArtifactSchema.Type;

export const RouteStudiesArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.route_studies.v1"),
  schemaVersion: Schema.Literal(1),
  analysisMonth: StudyMonthSchema,
  routeId: Schema.String.check(Schema.isMinLength(1)),
  routeSlug: Schema.String.check(Schema.isMinLength(1)),
  studies: Schema.Array(StudyArtifactSchema).check(Schema.isMaxLength(20)),
});
export type RouteStudiesArtifact = typeof RouteStudiesArtifactSchema.Type;
