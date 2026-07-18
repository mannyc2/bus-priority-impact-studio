import { Schema } from "effect";
import {
  OperationalOccurrenceEvidenceBindingSchema,
  OperationalOccurrenceEvidenceBindingV2Schema,
  OperationalOccurrencePhaseRelationDispositionSchema,
  OperationalOccurrenceProducerReviewCompatibilitySchema,
} from "../documents/operational-occurrence/index.js";

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

export const StudyEventProvenanceV2Schema = Schema.Struct({
  sourceKind: StudyEventSourceKindSchema,
  sourceId: Schema.String,
  sourceEventId: Schema.String,
  releaseId: Schema.NullOr(Schema.String),
  anchorIds: Schema.Array(Schema.String),
  occurrenceId: Schema.NullOr(Schema.String),
  occurrenceAliases: Schema.Array(Schema.String),
  manifestSha256: Schema.NullOr(Schema.String),
  artifactSha256: Schema.NullOr(Schema.String),
  occurrenceReviewDecisionId: Schema.NullOr(Schema.String),
  gtfsRouteId: Schema.NullOr(Schema.String),
  analysisRouteId: Schema.String,
  routeEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
  treatmentEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
});
export type StudyEventProvenanceV2 = typeof StudyEventProvenanceV2Schema.Type;

export const StudyEventCandidateV2Schema = Schema.Struct({
  candidateId: Schema.String,
  routeId: Schema.String,
  treatmentFamily: StudyTreatmentFamilySchema,
  implementationDate: Schema.String,
  implementationMonth: Schema.String,
  datePrecision: Schema.Literals(["day", "month"]),
  conflictState: Schema.Literals(["none", "same_month_review_required"]),
  occurrenceId: Schema.NullOr(Schema.String),
  confounderGroupId: Schema.NullOr(Schema.String),
  treatmentScopeKind: Schema.Literals(["atomic", "bundle"]),
  // Component ontology is descriptive and can be broader than the supported
  // analysis-family enum (for example, route-redesign service_pattern members).
  componentTreatmentFamilies: Schema.Array(Schema.String),
  provenance: Schema.Array(StudyEventProvenanceV2Schema),
});
export type StudyEventCandidateV2 = typeof StudyEventCandidateV2Schema.Type;

export const StudyEventApprovalArtifactV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_event_approvals.v2"),
  schemaVersion: Schema.Literal(2),
  candidateSetId: Schema.String,
  decisions: Schema.Array(StudyEventApprovalDecisionSchema),
});
export type StudyEventApprovalArtifactV2 = typeof StudyEventApprovalArtifactV2Schema.Type;

export const StudyEventMergeArtifactV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_events.v2"),
  schemaVersion: Schema.Literal(2),
  candidateSetId: Schema.String,
  wikiInput: Schema.Struct({
    mode: Schema.Literals(["pinned_occurrence_release", "explicit_opt_out"]),
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
  candidates: Schema.Array(StudyEventCandidateV2Schema),
  approvedEvents: Schema.Array(StudyEventCandidateV2Schema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
  approval: Schema.NullOr(StudyEventApprovalArtifactV2Schema),
});
export type StudyEventMergeArtifactV2 = typeof StudyEventMergeArtifactV2Schema.Type;

export const StudyEventProvenanceV3Schema = Schema.Struct({
  sourceKind: StudyEventSourceKindSchema,
  sourceId: Schema.String,
  sourceEventId: Schema.String,
  releaseId: Schema.NullOr(Schema.String),
  anchorIds: Schema.Array(Schema.String),
  occurrenceId: Schema.NullOr(Schema.String),
  occurrenceAliases: Schema.Array(Schema.String),
  manifestSha256: Schema.NullOr(Schema.String),
  artifactSha256: Schema.NullOr(Schema.String),
  occurrenceReviewDecisionId: Schema.NullOr(Schema.String),
  wikiRouteRecordId: Schema.NullOr(Schema.String),
  gtfsRouteId: Schema.NullOr(Schema.String),
  analysisRouteId: Schema.String,
  routeEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  treatmentEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  phaseRecordIds: Schema.Array(Schema.String),
  phaseRelationRecordIds: Schema.Array(Schema.String),
  phaseRelationEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  phaseRelationDisposition: Schema.NullOr(OperationalOccurrencePhaseRelationDispositionSchema),
  physicalScopeRecordIds: Schema.Array(Schema.String),
  physicalScopeRelationRecordIds: Schema.Array(Schema.String),
  physicalScopeEvidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  relationshipBundleSha256: Schema.NullOr(Schema.String),
  relationshipEnforcementProofCanonicalSha256: Schema.NullOr(Schema.String),
  producerReviewCompatibility: Schema.NullOr(
    OperationalOccurrenceProducerReviewCompatibilitySchema,
  ),
});
export type StudyEventProvenanceV3 = typeof StudyEventProvenanceV3Schema.Type;

export const StudyEventCandidateV3Schema = Schema.Struct({
  candidateId: Schema.String,
  routeId: Schema.String,
  treatmentFamily: StudyTreatmentFamilySchema,
  implementationDate: Schema.String,
  implementationMonth: Schema.String,
  datePrecision: Schema.Literals(["day", "month"]),
  conflictState: Schema.Literals(["none", "same_month_review_required"]),
  occurrenceId: Schema.NullOr(Schema.String),
  confounderGroupId: Schema.NullOr(Schema.String),
  treatmentScopeKind: Schema.Literals(["atomic", "bundle"]),
  componentTreatmentFamilies: Schema.Array(Schema.String),
  provenance: Schema.Array(StudyEventProvenanceV3Schema),
});
export type StudyEventCandidateV3 = typeof StudyEventCandidateV3Schema.Type;

export const StudyEventApprovalArtifactV3Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_event_approvals.v3"),
  schemaVersion: Schema.Literal(3),
  candidateSetId: Schema.String,
  decisions: Schema.Array(StudyEventApprovalDecisionSchema),
});
export type StudyEventApprovalArtifactV3 = typeof StudyEventApprovalArtifactV3Schema.Type;

const StudyEventMergeArtifactV3BaseFields = {
  artifactKind: Schema.Literal("bp.studio.study_events.v3"),
  schemaVersion: Schema.Literal(3),
  candidateSetId: Schema.String,
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
  candidates: Schema.Array(StudyEventCandidateV3Schema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
} as const;

const StudyEventMergeArtifactV3WikiInputBaseFields = {
  mode: Schema.Literal("pinned_occurrence_release_v4"),
  releaseId: Schema.String,
  manifestSha256: Schema.String,
  artifactSha256: Schema.String,
  relationshipBundleSha256: Schema.String,
  relationshipEnforcementProofCanonicalSha256: Schema.String,
} as const;

const StudyEventMergeArtifactV3CompatibleFields = {
  ...StudyEventMergeArtifactV3BaseFields,
  wikiInput: Schema.Struct({
    ...StudyEventMergeArtifactV3WikiInputBaseFields,
    producerReviewCompatibility: Schema.Literal("compatible"),
  }),
} as const;

export const StudyEventMergeArtifactV3AwaitingSchema = Schema.Struct({
  ...StudyEventMergeArtifactV3CompatibleFields,
  approvalState: Schema.Literal("awaiting_approval"),
  approvedEvents: Schema.Array(StudyEventCandidateV3Schema).check(Schema.isMaxLength(0)),
  approval: Schema.Null,
});

export const StudyEventMergeArtifactV3ApprovedSchema = Schema.Struct({
  ...StudyEventMergeArtifactV3CompatibleFields,
  approvalState: Schema.Literal("approved"),
  approvedEvents: Schema.Array(StudyEventCandidateV3Schema),
  approval: StudyEventApprovalArtifactV3Schema,
});

export const StudyEventMergeArtifactV3AuthorizableSchema = Schema.Union([
  StudyEventMergeArtifactV3AwaitingSchema,
  StudyEventMergeArtifactV3ApprovedSchema,
]);

export const StudyEventMergeArtifactV3BlockedSchema = Schema.Struct({
  ...StudyEventMergeArtifactV3BaseFields,
  wikiInput: Schema.Struct({
    ...StudyEventMergeArtifactV3WikiInputBaseFields,
    producerReviewCompatibility: Schema.Literal(
      "known_rc22_review_v1_physical_scope_incompatibility",
    ),
  }),
  approvalState: Schema.Literal("blocked_contract_incompatible"),
  approvedEvents: Schema.Array(StudyEventCandidateV3Schema).check(Schema.isMaxLength(0)),
  approval: Schema.Null,
});

export const StudyEventMergeArtifactV3Schema = Schema.Union([
  StudyEventMergeArtifactV3AuthorizableSchema,
  StudyEventMergeArtifactV3BlockedSchema,
]);
export type StudyEventMergeArtifactV3 = typeof StudyEventMergeArtifactV3Schema.Type;

export const StudyEventApprovalArtifactAnySchema = Schema.Union([
  StudyEventApprovalArtifactSchema,
  StudyEventApprovalArtifactV2Schema,
  StudyEventApprovalArtifactV3Schema,
]);
export type StudyEventApprovalArtifactAny = typeof StudyEventApprovalArtifactAnySchema.Type;

export const StudyEventMergeArtifactAnySchema = Schema.Union([
  StudyEventMergeArtifactSchema,
  StudyEventMergeArtifactV2Schema,
  StudyEventMergeArtifactV3Schema,
]);
export type StudyEventMergeArtifactAny = typeof StudyEventMergeArtifactAnySchema.Type;

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
