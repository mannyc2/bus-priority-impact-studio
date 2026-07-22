import { Schema } from "effect";
import {
  OperationalOccurrenceEvidenceBindingSchema,
  OperationalOccurrenceEvidenceBindingV2Schema,
  OperationalOccurrenceMemberExtentRowV1Schema,
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

export const StudyEventProvenanceAnySchema = Schema.Union([
  StudyEventProvenanceSchema,
  StudyEventProvenanceV2Schema,
  StudyEventProvenanceV3Schema,
]);
export type StudyEventProvenanceAny = typeof StudyEventProvenanceAnySchema.Type;

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

export const StudyEventCandidateV4Schema = Schema.Struct({
  ...StudyEventCandidateV3Schema.fields,
  memberExtents: Schema.Array(OperationalOccurrenceMemberExtentRowV1Schema),
});
export type StudyEventCandidateV4 = typeof StudyEventCandidateV4Schema.Type;

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

const StudyMonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])$/u));
const StudySha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const NonEmptyStudyStringArraySchema = Schema.Array(
  Schema.String.check(Schema.isMinLength(1)),
).check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

export const StudyReviewFileReceiptSchema = Schema.Struct({
  sha256: StudySha256Schema,
  byteCount: NonNegativeIntegerSchema,
});
export type StudyReviewFileReceipt = typeof StudyReviewFileReceiptSchema.Type;

export const StudyReviewOutcomeMonthSchema = Schema.Struct({
  month: StudyMonthSchema,
  rowCount: NonNegativeIntegerSchema,
  routeCount: NonNegativeIntegerSchema,
  busTripCount: NonNegativeIntegerSchema,
});
export type StudyReviewOutcomeMonth = typeof StudyReviewOutcomeMonthSchema.Type;

export const StudyReviewSpeedSpineRouteSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  readiness: Schema.Literals([
    "series_ready",
    "series_ready_with_gaps",
    "needs_pattern_review",
    "failed",
  ]),
  artifactKey: Schema.String.check(Schema.isMinLength(1)),
  artifact: StudyReviewFileReceiptSchema,
});
export type StudyReviewSpeedSpineRoute = typeof StudyReviewSpeedSpineRouteSchema.Type;

export const StudyReviewInputsArtifactV1Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_review_inputs.v1"),
  schemaVersion: Schema.Literal(1),
  analysisMonth: StudyMonthSchema,
  outcomeSnapshot: Schema.Struct({
    sourceId: Schema.Literal("bus_segment_speeds_2025"),
    sourceTable: Schema.Literal("local_route_segment_speed"),
    projectionVersion: Schema.Literal("study-outcome-projection-v1"),
    coverageStartMonth: StudyMonthSchema,
    coverageEndMonth: StudyMonthSchema,
    rowCount: NonNegativeIntegerSchema,
    routeCount: NonNegativeIntegerSchema,
    busTripCount: NonNegativeIntegerSchema,
    months: Schema.Array(StudyReviewOutcomeMonthSchema).check(Schema.isMinLength(1)),
    logicalSha256: StudySha256Schema,
    availability: Schema.Struct({
      latestCompleteMonth: StudyMonthSchema,
      artifact: StudyReviewFileReceiptSchema,
    }),
  }),
  speedSpineSnapshot: Schema.Struct({
    startMonth: StudyMonthSchema,
    endMonth: StudyMonthSchema,
    toleranceMeters: Schema.Number.check(Schema.isGreaterThan(0)),
    routeCount: NonNegativeIntegerSchema,
    logicalSha256: StudySha256Schema,
    manifest: StudyReviewFileReceiptSchema,
    routes: Schema.Array(StudyReviewSpeedSpineRouteSchema).check(Schema.isMinLength(1)),
  }),
  physicalScopeSnapshot: Schema.Struct({
    bindings: StudyReviewFileReceiptSchema,
    candidateSetId: Schema.String.check(Schema.isMinLength(1)),
    analysisMonth: StudyMonthSchema,
    localBusLaneSha256: StudySha256Schema,
    localBusLaneCoordinateSha256: StudySha256Schema,
  }),
  engineVersion: Schema.Literal("segment-matched-did-v2"),
  reviewPolicyVersion: Schema.Literal("plan074-admission-v1"),
});
export type StudyReviewInputsArtifactV1 = typeof StudyReviewInputsArtifactV1Schema.Type;

export const StudyEventCandidateUniverseV4Schema = Schema.Struct({
  identityVersion: Schema.Literal("tracker-study-candidate-universe-v1"),
  candidateSetId: Schema.String.check(
    Schema.isPattern(/^candidate-set-v[3-9][0-9]*:[a-f0-9]{24}$/u),
  ),
  logicalSha256: StudySha256Schema,
  registryInputCount: NonNegativeIntegerSchema,
  registryInputSha256: StudySha256Schema,
  availableAnalysisRouteCount: NonNegativeIntegerSchema,
  availableAnalysisRouteIdsSha256: StudySha256Schema,
  memberExtentLineage: Schema.NullOr(
    Schema.Struct({
      identityGrain: Schema.Literal("occurrence_route_member"),
      manifestSha256: StudySha256Schema,
      projectionSha256: StudySha256Schema,
      rowCount: NonNegativeIntegerSchema,
      eligibleRowCount: NonNegativeIntegerSchema,
    }),
  ),
});
export type StudyEventCandidateUniverseV4 = typeof StudyEventCandidateUniverseV4Schema.Type;

export const StudyEventApprovalArtifactV4Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_event_approvals.v4"),
  schemaVersion: Schema.Literal(4),
  candidateSetId: StudyEventCandidateUniverseV4Schema.fields.candidateSetId,
  reviewCutId: Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  decisions: Schema.Array(StudyEventApprovalDecisionSchema),
});
export type StudyEventApprovalArtifactV4 = typeof StudyEventApprovalArtifactV4Schema.Type;

const StudyEventMergeArtifactV4BaseFields = {
  artifactKind: Schema.Literal("bp.studio.study_events.v4"),
  schemaVersion: Schema.Literal(4),
  candidateSetId: StudyEventCandidateUniverseV4Schema.fields.candidateSetId,
  reviewCutId: Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  candidateUniverse: StudyEventCandidateUniverseV4Schema,
  reviewInputs: StudyReviewInputsArtifactV1Schema,
  wikiInput: StudyEventMergeArtifactV3AwaitingSchema.fields.wikiInput,
  summary: StudyEventMergeArtifactV3AwaitingSchema.fields.summary,
  candidates: Schema.Array(StudyEventCandidateV3Schema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
} as const;

export const StudyEventMergeArtifactV4AwaitingSchema = Schema.Struct({
  ...StudyEventMergeArtifactV4BaseFields,
  approvalState: Schema.Literal("awaiting_approval"),
  approvedEvents: Schema.Array(StudyEventCandidateV3Schema).check(Schema.isMaxLength(0)),
  approval: Schema.Null,
});

export const StudyEventMergeArtifactV4ApprovedSchema = Schema.Struct({
  ...StudyEventMergeArtifactV4BaseFields,
  approvalState: Schema.Literal("approved"),
  approvedEvents: Schema.Array(StudyEventCandidateV3Schema),
  approval: StudyEventApprovalArtifactV4Schema,
});

export const StudyEventMergeArtifactV4Schema = Schema.Union([
  StudyEventMergeArtifactV4AwaitingSchema,
  StudyEventMergeArtifactV4ApprovedSchema,
]);
export type StudyEventMergeArtifactV4 = typeof StudyEventMergeArtifactV4Schema.Type;

export const StudyEventCandidateUniverseV5Schema = Schema.Struct({
  identityVersion: Schema.Literal("tracker-study-candidate-universe-v2"),
  candidateSetId: Schema.String.check(Schema.isPattern(/^candidate-set-v4:[a-f0-9]{24}$/u)),
  logicalSha256: StudySha256Schema,
  registryInputCount: NonNegativeIntegerSchema,
  registryInputSha256: StudySha256Schema,
  availableAnalysisRouteCount: NonNegativeIntegerSchema,
  availableAnalysisRouteIdsSha256: StudySha256Schema,
  memberExtentLineage: Schema.Struct({
    identityGrain: Schema.Literal("occurrence_route_member"),
    sourceOccurrenceReleaseId: Schema.String.check(Schema.isMinLength(1)),
    manifestSha256: StudySha256Schema,
    projectionSha256: StudySha256Schema,
    rowCount: NonNegativeIntegerSchema,
    eligibleRowCount: NonNegativeIntegerSchema,
  }),
});
export type StudyEventCandidateUniverseV5 = typeof StudyEventCandidateUniverseV5Schema.Type;

export const StudyEventWikiInputV5Schema = Schema.Struct({
  mode: Schema.Literal("pinned_occurrence_release_with_member_extents_v1"),
  releaseId: Schema.String.check(Schema.isMinLength(1)),
  generatorCommit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
  manifestSha256: StudySha256Schema,
  artifactSha256: StudySha256Schema,
  relationshipBundleSha256: StudySha256Schema,
  relationshipEnforcementProofCanonicalSha256: StudySha256Schema,
  producerReviewCompatibility: Schema.Literal("compatible"),
  memberExtent: Schema.Struct({
    contractId: Schema.Literal("operational-occurrence-member-extent-v1"),
    sourceOccurrenceReleaseId: Schema.String.check(Schema.isMinLength(1)),
    manifestSha256: StudySha256Schema,
    projectionSha256: StudySha256Schema,
    rowCount: NonNegativeIntegerSchema,
    eligibleRowCount: NonNegativeIntegerSchema,
  }),
});
export type StudyEventWikiInputV5 = typeof StudyEventWikiInputV5Schema.Type;

const StudyEventCandidateSetArtifactV4Fields = {
  artifactKind: Schema.Literal("bp.studio.study_event_candidates.v4"),
  schemaVersion: Schema.Literal(4),
  candidateSetId: StudyEventCandidateUniverseV5Schema.fields.candidateSetId,
  candidateUniverse: StudyEventCandidateUniverseV5Schema,
  wikiInput: StudyEventWikiInputV5Schema,
  summary: StudyEventMergeArtifactV3AwaitingSchema.fields.summary,
  candidates: Schema.Array(StudyEventCandidateV4Schema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
} as const;

export const StudyEventCandidateSetArtifactV4Schema = Schema.Struct({
  ...StudyEventCandidateSetArtifactV4Fields,
  approvalState: Schema.Literal("awaiting_review_cut"),
  approvedEvents: Schema.Array(StudyEventCandidateV4Schema).check(Schema.isMaxLength(0)),
  approval: Schema.Null,
});
export type StudyEventCandidateSetArtifactV4 = typeof StudyEventCandidateSetArtifactV4Schema.Type;

export const StudyEventApprovalArtifactV5Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_event_approvals.v5"),
  schemaVersion: Schema.Literal(5),
  candidateSetId: StudyEventCandidateUniverseV5Schema.fields.candidateSetId,
  reviewCutId: Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  decisions: Schema.Array(StudyEventApprovalDecisionSchema),
});
export type StudyEventApprovalArtifactV5 = typeof StudyEventApprovalArtifactV5Schema.Type;

const StudyEventMergeArtifactV5BaseFields = {
  artifactKind: Schema.Literal("bp.studio.study_events.v5"),
  schemaVersion: Schema.Literal(5),
  candidateSetId: StudyEventCandidateUniverseV5Schema.fields.candidateSetId,
  reviewCutId: Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  candidateUniverse: StudyEventCandidateUniverseV5Schema,
  reviewInputs: StudyReviewInputsArtifactV1Schema,
  wikiInput: StudyEventWikiInputV5Schema,
  summary: StudyEventMergeArtifactV3AwaitingSchema.fields.summary,
  candidates: Schema.Array(StudyEventCandidateV4Schema),
  rejections: Schema.Array(StudyEventRejectionSchema),
  conflicts: Schema.Array(StudyEventConflictSchema),
} as const;

export const StudyEventMergeArtifactV5AwaitingSchema = Schema.Struct({
  ...StudyEventMergeArtifactV5BaseFields,
  approvalState: Schema.Literal("awaiting_approval"),
  approvedEvents: Schema.Array(StudyEventCandidateV4Schema).check(Schema.isMaxLength(0)),
  approval: Schema.Null,
});

export const StudyEventMergeArtifactV5ApprovedSchema = Schema.Struct({
  ...StudyEventMergeArtifactV5BaseFields,
  approvalState: Schema.Literal("approved"),
  approvedEvents: Schema.Array(StudyEventCandidateV4Schema),
  approval: StudyEventApprovalArtifactV5Schema,
});

export const StudyEventMergeArtifactV5Schema = Schema.Union([
  StudyEventMergeArtifactV5AwaitingSchema,
  StudyEventMergeArtifactV5ApprovedSchema,
]);
export type StudyEventMergeArtifactV5 = typeof StudyEventMergeArtifactV5Schema.Type;

export const StudyEventApprovalArtifactAnySchema = Schema.Union([
  StudyEventApprovalArtifactSchema,
  StudyEventApprovalArtifactV2Schema,
  StudyEventApprovalArtifactV3Schema,
  StudyEventApprovalArtifactV4Schema,
  StudyEventApprovalArtifactV5Schema,
]);
export type StudyEventApprovalArtifactAny = typeof StudyEventApprovalArtifactAnySchema.Type;

export const StudyEventMergeArtifactAnySchema = Schema.Union([
  StudyEventMergeArtifactSchema,
  StudyEventMergeArtifactV2Schema,
  StudyEventMergeArtifactV3Schema,
  StudyEventMergeArtifactV4Schema,
  StudyEventMergeArtifactV5Schema,
]);
export type StudyEventMergeArtifactAny = typeof StudyEventMergeArtifactAnySchema.Type;

export { routeStudiesKey, studyArtifactKey, studyIndexKey } from "./study-key.js";

export const StudyPhysicalScopeSegmentBindingSchema = Schema.Struct({
  sourceSegmentId: Schema.String.check(Schema.isMinLength(1)),
  spineSegmentId: Schema.String.check(Schema.isMinLength(1)),
});
export type StudyPhysicalScopeSegmentBinding = typeof StudyPhysicalScopeSegmentBindingSchema.Type;

export const StudyPhysicalScopeBindingSchema = Schema.Struct({
  candidateId: Schema.String.check(Schema.isMinLength(1)),
  routeId: Schema.String.check(Schema.isMinLength(1)),
  occurrenceId: Schema.String.check(Schema.isMinLength(1)),
  physicalScopeRecordIds: NonEmptyStudyStringArraySchema,
  geometrySourceId: Schema.Literal("nyc_dot_bus_lanes"),
  geometryFeatureIds: NonEmptyStudyStringArraySchema,
  selectedGeometryRowsSha256: StudySha256Schema,
  speedSpineSha256: StudySha256Schema,
  segmentBindings: Schema.Array(StudyPhysicalScopeSegmentBindingSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(1_000),
  ),
});
export type StudyPhysicalScopeBinding = typeof StudyPhysicalScopeBindingSchema.Type;

export const StudyPhysicalScopeBindingsArtifactSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_physical_scope_bindings.v1"),
  schemaVersion: Schema.Literal(1),
  candidateSetId: Schema.String.check(Schema.isMinLength(1)),
  analysisMonth: StudyMonthSchema,
  sourceRelease: Schema.Struct({
    releaseId: Schema.String.check(Schema.isMinLength(1)),
    manifestSha256: StudySha256Schema,
    occurrencesSha256: StudySha256Schema,
  }),
  inputs: Schema.Struct({
    busLaneSnapshotSha256: StudySha256Schema,
    routeShapeSnapshotSha256: StudySha256Schema,
    stopSnapshotSha256: StudySha256Schema,
  }),
  bindings: Schema.Array(StudyPhysicalScopeBindingSchema).check(Schema.isMaxLength(100)),
});
export type StudyPhysicalScopeBindingsArtifact =
  typeof StudyPhysicalScopeBindingsArtifactSchema.Type;

export const StudyMemberPhysicalScopeBindingV2Schema = Schema.Struct({
  ...StudyPhysicalScopeBindingSchema.fields,
  routeRecordId: Schema.String.check(Schema.isMinLength(1)),
  treatmentRecordId: Schema.String.check(Schema.isMinLength(1)),
  memberExtentId: Schema.String.check(Schema.isMinLength(1)),
  memberExtentKind: Schema.Literal("bounded_segment"),
  memberExtentProjectionSha256: StudySha256Schema,
  producerComponentIds: NonEmptyStudyStringArraySchema,
});
export type StudyMemberPhysicalScopeBindingV2 = typeof StudyMemberPhysicalScopeBindingV2Schema.Type;

export const StudyPhysicalScopeBindingsArtifactV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.study_physical_scope_bindings.v2"),
  schemaVersion: Schema.Literal(2),
  candidateSetId: StudyEventCandidateUniverseV5Schema.fields.candidateSetId,
  analysisMonth: StudyMonthSchema,
  sourceRelease: Schema.Struct({
    releaseId: Schema.String.check(Schema.isMinLength(1)),
    manifestSha256: StudySha256Schema,
    occurrencesSha256: StudySha256Schema,
    memberExtentManifestSha256: StudySha256Schema,
    memberExtentProjectionSha256: StudySha256Schema,
  }),
  inputs: StudyPhysicalScopeBindingsArtifactSchema.fields.inputs,
  bindings: Schema.Array(StudyMemberPhysicalScopeBindingV2Schema).check(Schema.isMaxLength(1_000)),
});
export type StudyPhysicalScopeBindingsArtifactV2 =
  typeof StudyPhysicalScopeBindingsArtifactV2Schema.Type;

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
  excludedMonths: Schema.Array(StudyMonthSchema).check(Schema.isMaxLength(13)),
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
  reviewCutId: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  ),
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
    engineVersion: Schema.Literals(["segment-matched-did-v1", "segment-matched-did-v2"]),
    event: Schema.Array(StudyEventProvenanceAnySchema).check(Schema.isMinLength(1)),
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
  reviewCutId: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^study-review-cut-v1:[a-f0-9]{24}$/u)),
  ),
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
