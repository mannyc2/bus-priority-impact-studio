import { Schema } from "effect";

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const GitCommitSchema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const StringCountSchema = Schema.Record(Schema.String, NonNegativeIntegerSchema);

export const OperationalOccurrenceEvidenceRoleV1Schema = Schema.Literals([
  "bundle_analysis_family",
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);
export const OperationalOccurrenceEvidenceRoleSchema = OperationalOccurrenceEvidenceRoleV1Schema;
export type OperationalOccurrenceEvidenceRole = typeof OperationalOccurrenceEvidenceRoleSchema.Type;

export const OperationalOccurrenceEvidenceRoleV2Schema = Schema.Literals([
  "bundle_analysis_family",
  "event_date",
  "phase_relation",
  "physical_scope",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);
export type OperationalOccurrenceEvidenceRoleV2 =
  typeof OperationalOccurrenceEvidenceRoleV2Schema.Type;

export const OperationalOccurrenceEvidenceBindingV1Schema = Schema.Struct({
  role: OperationalOccurrenceEvidenceRoleV1Schema,
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.String,
});
export const OperationalOccurrenceEvidenceBindingSchema =
  OperationalOccurrenceEvidenceBindingV1Schema;
export type OperationalOccurrenceEvidenceBinding =
  typeof OperationalOccurrenceEvidenceBindingSchema.Type;

export const OperationalOccurrenceEvidenceBindingV2Schema = Schema.Struct({
  role: OperationalOccurrenceEvidenceRoleV2Schema,
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.String,
});
export type OperationalOccurrenceEvidenceBindingV2 =
  typeof OperationalOccurrenceEvidenceBindingV2Schema.Type;

export const OperationalOccurrenceObservationDateSchema = Schema.Struct({
  raw: Schema.String,
  normalized: Schema.String,
  precision: Schema.String,
  source_field: Schema.String,
});

export const OperationalOccurrenceObservationSchema = Schema.Struct({
  event_record_id: Schema.String,
  relation_record_ids: Schema.Array(Schema.String),
  document_time_statuses: Schema.Array(Schema.String),
  document_time_dates: Schema.Array(OperationalOccurrenceObservationDateSchema),
  status_as_of_dates: Schema.Array(Schema.String),
});
export type OperationalOccurrenceObservation = typeof OperationalOccurrenceObservationSchema.Type;

export const OperationalOccurrenceResolvedOnsetSchema = Schema.Struct({
  date: Schema.String,
  precision: Schema.Literals(["day", "month"]),
  resolver_ids: Schema.Array(Schema.String),
  publication_dates: Schema.Array(Schema.String),
  retrieval_dates: Schema.Array(Schema.String),
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
});

export const OperationalOccurrenceRouteSchema = Schema.Struct({
  route_record_id: Schema.String,
  gtfs_route_id: Schema.String,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
});
export type OperationalOccurrenceRoute = typeof OperationalOccurrenceRouteSchema.Type;

export const OperationalOccurrenceTreatmentMemberSchema = Schema.Struct({
  treatment_record_id: Schema.String,
  treatment_family: Schema.String,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
});
export type OperationalOccurrenceTreatmentMember =
  typeof OperationalOccurrenceTreatmentMemberSchema.Type;

export const OperationalOccurrenceAtomicTreatmentSchema = Schema.Struct({
  kind: Schema.Literal("atomic"),
  member: OperationalOccurrenceTreatmentMemberSchema,
});

export const OperationalOccurrenceBundleTreatmentSchema = Schema.Struct({
  kind: Schema.Literal("bundle"),
  bundle_family: Schema.NullOr(Schema.String),
  bundle_family_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
  members: Schema.Array(OperationalOccurrenceTreatmentMemberSchema),
});

export const OperationalOccurrenceTreatmentSchema = Schema.Union([
  OperationalOccurrenceAtomicTreatmentSchema,
  OperationalOccurrenceBundleTreatmentSchema,
]);
export type OperationalOccurrenceTreatment = typeof OperationalOccurrenceTreatmentSchema.Type;

export const OperationalOccurrenceResolvedOnsetV2Schema = Schema.Struct({
  date: Schema.String,
  precision: Schema.Literals(["day", "month"]),
  resolver_ids: Schema.Array(Schema.String),
  publication_dates: Schema.Array(Schema.String),
  retrieval_dates: Schema.Array(Schema.String),
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
});

export const OperationalOccurrenceRouteV2Schema = Schema.Struct({
  route_record_id: Schema.String,
  gtfs_route_id: Schema.String,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
});
export type OperationalOccurrenceRouteV2 = typeof OperationalOccurrenceRouteV2Schema.Type;

export const OperationalOccurrenceTreatmentMemberV2Schema = Schema.Struct({
  treatment_record_id: Schema.String,
  treatment_family: Schema.String,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
});
export type OperationalOccurrenceTreatmentMemberV2 =
  typeof OperationalOccurrenceTreatmentMemberV2Schema.Type;

export const OperationalOccurrenceAtomicTreatmentV2Schema = Schema.Struct({
  kind: Schema.Literal("atomic"),
  member: OperationalOccurrenceTreatmentMemberV2Schema,
});

export const OperationalOccurrenceBundleTreatmentV2Schema = Schema.Struct({
  kind: Schema.Literal("bundle"),
  bundle_family: Schema.NullOr(Schema.String),
  bundle_family_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  members: Schema.Array(OperationalOccurrenceTreatmentMemberV2Schema),
});

export const OperationalOccurrenceTreatmentV2Schema = Schema.Union([
  OperationalOccurrenceAtomicTreatmentV2Schema,
  OperationalOccurrenceBundleTreatmentV2Schema,
]);
export type OperationalOccurrenceTreatmentV2 = typeof OperationalOccurrenceTreatmentV2Schema.Type;

export const OperationalOccurrenceExclusionReasonSchema = Schema.Literal(
  "unsupported_bundle_analysis_family",
);
export type OperationalOccurrenceExclusionReason =
  typeof OperationalOccurrenceExclusionReasonSchema.Type;

export const OperationalOccurrenceRowV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  occurrence_id: Schema.String,
  occurrence_aliases: Schema.Array(Schema.String),
  occurrence_review_decision_id: Schema.String,
  founding_key: Schema.String,
  resolution_cluster_id: Schema.NullOr(Schema.String),
  observations: Schema.Array(OperationalOccurrenceObservationSchema),
  resolved_status: Schema.Literal("realized"),
  resolved_onset: OperationalOccurrenceResolvedOnsetSchema,
  routes: Schema.Array(OperationalOccurrenceRouteSchema),
  treatment: OperationalOccurrenceTreatmentSchema,
  source_ids: Schema.Array(Schema.String),
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
  exclusion_reasons: Schema.Array(OperationalOccurrenceExclusionReasonSchema),
  review_state: Schema.Literal("approved"),
  study_projection_eligible: Schema.Boolean,
  provenance: Schema.Struct({
    anchor_review_decision_ids: Schema.Array(Schema.String),
    event_record_ids: Schema.Array(Schema.String),
    relation_record_ids: Schema.Array(Schema.String),
    route_record_ids: Schema.Array(Schema.String),
    treatment_record_ids: Schema.Array(Schema.String),
  }),
});
export const OperationalOccurrenceRowSchema = OperationalOccurrenceRowV1Schema;
export type OperationalOccurrenceRow = typeof OperationalOccurrenceRowSchema.Type;

export const OperationalOccurrencePhaseRelationDispositionSchema = Schema.Literals([
  "single_phase",
  "related_phases",
]);
export type OperationalOccurrencePhaseRelationDisposition =
  typeof OperationalOccurrencePhaseRelationDispositionSchema.Type;

export const OperationalOccurrenceRowV2Schema = Schema.Struct({
  schema_version: Schema.Literal(2),
  occurrence_id: Schema.String,
  occurrence_aliases: Schema.Array(Schema.String),
  occurrence_review_decision_id: Schema.String,
  founding_key: Schema.String,
  resolution_cluster_id: Schema.NullOr(Schema.String),
  observations: Schema.Array(OperationalOccurrenceObservationSchema),
  resolved_status: Schema.Literal("realized"),
  resolved_onset: OperationalOccurrenceResolvedOnsetV2Schema,
  routes: Schema.Array(OperationalOccurrenceRouteV2Schema),
  treatment: OperationalOccurrenceTreatmentV2Schema,
  source_ids: Schema.Array(Schema.String),
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  exclusion_reasons: Schema.Array(OperationalOccurrenceExclusionReasonSchema),
  review_state: Schema.Literal("approved"),
  study_projection_eligible: Schema.Boolean,
  phase_record_ids: Schema.Array(Schema.String),
  phase_relation_record_ids: Schema.Array(Schema.String),
  phase_relation_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  phase_relation_disposition: OperationalOccurrencePhaseRelationDispositionSchema,
  physical_scope_record_ids: Schema.Array(Schema.String),
  physical_scope_relation_record_ids: Schema.Array(Schema.String),
  physical_scope_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  provenance: Schema.Struct({
    anchor_review_decision_ids: Schema.Array(Schema.String),
    event_record_ids: Schema.Array(Schema.String),
    relation_record_ids: Schema.Array(Schema.String),
    route_record_ids: Schema.Array(Schema.String),
    treatment_record_ids: Schema.Array(Schema.String),
  }),
});
export type OperationalOccurrenceRowV2 = typeof OperationalOccurrenceRowV2Schema.Type;
export const OperationalOccurrenceRowAnySchema = Schema.Union([
  OperationalOccurrenceRowV1Schema,
  OperationalOccurrenceRowV2Schema,
]);
export type OperationalOccurrenceRowAny = typeof OperationalOccurrenceRowAnySchema.Type;

export const OperationalOccurrenceSummaryV1Schema = Schema.Struct({
  schema_version: Schema.Literal(1),
  occurrence_count: NonNegativeIntegerSchema,
  study_projection_eligible_count: NonNegativeIntegerSchema,
  atomic_count: NonNegativeIntegerSchema,
  bundle_count: NonNegativeIntegerSchema,
  multi_route_count: NonNegativeIntegerSchema,
  candidate_projection_count: NonNegativeIntegerSchema,
  counts_by_exclusion_reason: StringCountSchema,
});
export const OperationalOccurrenceSummarySchema = OperationalOccurrenceSummaryV1Schema;
export type OperationalOccurrenceSummary = typeof OperationalOccurrenceSummarySchema.Type;

export const OperationalOccurrenceSummaryV2Schema = Schema.Struct({
  schema_version: Schema.Literal(2),
  occurrence_count: NonNegativeIntegerSchema,
  study_projection_eligible_count: NonNegativeIntegerSchema,
  atomic_count: NonNegativeIntegerSchema,
  bundle_count: NonNegativeIntegerSchema,
  multi_route_count: NonNegativeIntegerSchema,
  candidate_projection_count: NonNegativeIntegerSchema,
  counts_by_exclusion_reason: StringCountSchema,
});
export type OperationalOccurrenceSummaryV2 = typeof OperationalOccurrenceSummaryV2Schema.Type;

export const OperationalOccurrenceReviewTreatmentSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("atomic"),
    member: Schema.Struct({
      treatment_record_id: Schema.String,
      treatment_family: Schema.String,
      evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
    }),
  }),
  Schema.Struct({
    kind: Schema.Literal("bundle"),
    bundle_family: Schema.NullOr(Schema.String),
    bundle_family_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
    members: Schema.Array(
      Schema.Struct({
        treatment_record_id: Schema.String,
        treatment_family: Schema.String,
        evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
      }),
    ),
  }),
]);

export const OperationalOccurrenceReviewDecisionSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  decision_id: Schema.String,
  review_state: Schema.Literal("approved"),
  occurrence_id: Schema.String,
  founding_key: Schema.String,
  anchor_review_decision_ids: Schema.Array(Schema.String),
  resolved_onset: Schema.Struct({
    date: Schema.String,
    precision: Schema.Literals(["day", "month"]),
    evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
  }),
  routes: Schema.Array(
    Schema.Struct({
      route_record_id: Schema.String,
      gtfs_route_id: Schema.String,
      evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
    }),
  ),
  treatment: OperationalOccurrenceReviewTreatmentSchema,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
  reviewers: Schema.Array(Schema.String),
  accepted_at: Schema.String,
  rationale: Schema.String,
});
export type OperationalOccurrenceReviewDecision =
  typeof OperationalOccurrenceReviewDecisionSchema.Type;

export const OperationalOccurrenceReviewSnapshotSchema = Schema.Struct({
  snapshot_version: Schema.Literal(1),
  decision_schema_version: Schema.Literal(1),
  decision_count: NonNegativeIntegerSchema,
  decisions: Schema.Array(OperationalOccurrenceReviewDecisionSchema),
});
export type OperationalOccurrenceReviewSnapshot =
  typeof OperationalOccurrenceReviewSnapshotSchema.Type;

/**
 * Strict inspection-only shape for the fingerprinted rc22 producer defect.
 * The declared review contract remains v1; this schema is never used for the
 * legacy v3/v1 profile or as general permission to extend review-v1 roles.
 */
export const OperationalOccurrenceReviewTreatmentV1Rc22InspectionSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("atomic"),
    member: Schema.Struct({
      treatment_record_id: Schema.String,
      treatment_family: Schema.String,
      evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
    }),
  }),
  Schema.Struct({
    kind: Schema.Literal("bundle"),
    bundle_family: Schema.NullOr(Schema.String),
    bundle_family_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
    members: Schema.Array(
      Schema.Struct({
        treatment_record_id: Schema.String,
        treatment_family: Schema.String,
        evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
      }),
    ),
  }),
]);

export const OperationalOccurrenceReviewDecisionV1Rc22InspectionSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  decision_id: Schema.String,
  review_state: Schema.Literal("approved"),
  occurrence_id: Schema.String,
  founding_key: Schema.String,
  anchor_review_decision_ids: Schema.Array(Schema.String),
  resolved_onset: Schema.Struct({
    date: Schema.String,
    precision: Schema.Literals(["day", "month"]),
    evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  }),
  routes: Schema.Array(
    Schema.Struct({
      route_record_id: Schema.String,
      gtfs_route_id: Schema.String,
      evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
    }),
  ),
  treatment: OperationalOccurrenceReviewTreatmentV1Rc22InspectionSchema,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
  reviewers: Schema.Array(Schema.String),
  accepted_at: Schema.String,
  rationale: Schema.String,
});
export type OperationalOccurrenceReviewDecisionV1Rc22Inspection =
  typeof OperationalOccurrenceReviewDecisionV1Rc22InspectionSchema.Type;

export const OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema = Schema.Struct({
  snapshot_version: Schema.Literal(1),
  decision_schema_version: Schema.Literal(1),
  decision_count: NonNegativeIntegerSchema,
  decisions: Schema.Array(OperationalOccurrenceReviewDecisionV1Rc22InspectionSchema),
});
export type OperationalOccurrenceReviewSnapshotV1Rc22Inspection =
  typeof OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema.Type;

export const OperationalOccurrenceImportedReleaseFileSchema = Schema.Struct({
  pointer: Schema.String,
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

export const OperationalOccurrenceProjectionRejectionSchema = Schema.Struct({
  occurrenceId: Schema.String,
  reasonCodes: Schema.Array(Schema.String),
});
export type OperationalOccurrenceProjectionRejection =
  typeof OperationalOccurrenceProjectionRejectionSchema.Type;

export const MtaWikiOperationalOccurrenceImportArtifactV3Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_operational_occurrences.v3"),
  schemaVersion: Schema.Literal(3),
  sourceRelease: Schema.Struct({
    manifestVersion: Schema.Literal(3),
    releaseId: Schema.String,
    generatorCommit: Schema.String,
    manifestPath: Schema.String,
    manifestSha256: Sha256Schema,
    operationalOccurrenceContractVersion: Schema.Literal(1),
    operationalOccurrenceReviewDecisionContractVersion: Schema.Literal(1),
    occurrences: OperationalOccurrenceImportedReleaseFileSchema,
    summary: OperationalOccurrenceImportedReleaseFileSchema,
    reviewDecisions: OperationalOccurrenceImportedReleaseFileSchema,
    reviewDecisionCount: NonNegativeIntegerSchema,
  }),
  producerSummary: OperationalOccurrenceSummarySchema,
  summary: Schema.Struct({
    sourceOccurrenceCount: NonNegativeIntegerSchema,
    eligibleOccurrenceCount: NonNegativeIntegerSchema,
    routeProjectionCount: NonNegativeIntegerSchema,
    rejectedOccurrenceCount: NonNegativeIntegerSchema,
    countsByRejectionReason: StringCountSchema,
  }),
  occurrences: Schema.Array(OperationalOccurrenceRowSchema),
  projectionRejections: Schema.Array(OperationalOccurrenceProjectionRejectionSchema),
});
export type MtaWikiOperationalOccurrenceImportArtifactV3 =
  typeof MtaWikiOperationalOccurrenceImportArtifactV3Schema.Type;

export const OperationalOccurrenceProducerReviewCompatibilitySchema = Schema.Literals([
  "compatible",
  "known_rc22_review_v1_physical_scope_incompatibility",
]);
export type OperationalOccurrenceProducerReviewCompatibility =
  typeof OperationalOccurrenceProducerReviewCompatibilitySchema.Type;

export const OperationalOccurrenceProducerReviewStatusSchema = Schema.Union([
  Schema.Struct({
    compatibility: Schema.Literal("compatible"),
    promotionEligible: Schema.Literal(true),
  }),
  Schema.Struct({
    compatibility: Schema.Literal("known_rc22_review_v1_physical_scope_incompatibility"),
    promotionEligible: Schema.Literal(false),
  }),
]);
export type OperationalOccurrenceProducerReviewStatus =
  typeof OperationalOccurrenceProducerReviewStatusSchema.Type;

export const OperationalOccurrenceRelationshipIntegritySchema = Schema.Struct({
  bundle: OperationalOccurrenceImportedReleaseFileSchema,
  bundleId: Schema.Literal("relationship-integrity-v1"),
  contractId: Schema.Literal("relationship-contract-v1"),
  validationMode: Schema.Literal("enforce"),
  artifactCount: NonNegativeIntegerSchema,
  verifiedArtifactCount: NonNegativeIntegerSchema,
  descriptor: Schema.Struct({
    sourcePath: Schema.String,
    bytes: NonNegativeIntegerSchema,
    sha256: Sha256Schema,
  }),
  contract: Schema.Struct({
    file: OperationalOccurrenceImportedReleaseFileSchema,
    contractStatus: Schema.Literal("enforced"),
    enforcementState: Schema.Literal("enforced_ready"),
    reviewedAt: Schema.String,
    reviewedBy: Schema.String,
  }),
  enforcementProof: Schema.Struct({
    file: OperationalOccurrenceImportedReleaseFileSchema,
    canonicalSha256: Sha256Schema,
    proofId: Schema.Literal("relationship-contract-v1-enforcement-proof"),
    proofStage: Schema.Literal("post_promotion_enforced"),
    proofStatus: Schema.Literal("ready"),
    gateCount: NonNegativeIntegerSchema,
    totalViolationCount: NonNegativeIntegerSchema,
  }),
  transitionReceipt: Schema.Struct({
    file: OperationalOccurrenceImportedReleaseFileSchema,
    canonicalSha256: Sha256Schema,
  }),
  endpointMatrix: Schema.Struct({
    file: OperationalOccurrenceImportedReleaseFileSchema,
    canonicalSha256: Sha256Schema,
    relationCount: NonNegativeIntegerSchema,
    tupleCount: NonNegativeIntegerSchema,
  }),
  graphAudit: Schema.Struct({
    file: OperationalOccurrenceImportedReleaseFileSchema,
    canonicalRecordCount: NonNegativeIntegerSchema,
    canonicalRelationCount: NonNegativeIntegerSchema,
    enforceableViolationCount: NonNegativeIntegerSchema,
    reviewedNonEnforceableAdvisoryCount: NonNegativeIntegerSchema,
    informationalOrphanRecordCount: NonNegativeIntegerSchema,
  }),
});
export type OperationalOccurrenceRelationshipIntegrity =
  typeof OperationalOccurrenceRelationshipIntegritySchema.Type;

export const MtaWikiOperationalOccurrenceImportArtifactV4Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_operational_occurrences.v4"),
  schemaVersion: Schema.Literal(4),
  sourceRelease: Schema.Struct({
    manifestVersion: Schema.Literal(4),
    releaseId: Schema.String,
    generatorCommit: Schema.String,
    manifestPath: Schema.String,
    manifestSha256: Sha256Schema,
    operationalOccurrenceContractVersion: Schema.Literal(2),
    operationalOccurrenceReviewDecisionContractVersion: Schema.Literal(1),
    relationshipIntegrityBundleContractVersion: Schema.Literal(1),
    producerReviewStatus: OperationalOccurrenceProducerReviewStatusSchema,
    occurrences: OperationalOccurrenceImportedReleaseFileSchema,
    summary: OperationalOccurrenceImportedReleaseFileSchema,
    reviewDecisions: OperationalOccurrenceImportedReleaseFileSchema,
    reviewDecisionCount: NonNegativeIntegerSchema,
    relationshipIntegrity: OperationalOccurrenceRelationshipIntegritySchema,
  }),
  producerSummary: OperationalOccurrenceSummaryV2Schema,
  summary: Schema.Struct({
    sourceOccurrenceCount: NonNegativeIntegerSchema,
    eligibleOccurrenceCount: NonNegativeIntegerSchema,
    routeProjectionCount: NonNegativeIntegerSchema,
    rejectedOccurrenceCount: NonNegativeIntegerSchema,
    countsByRejectionReason: StringCountSchema,
    singlePhaseOccurrenceCount: NonNegativeIntegerSchema,
    relatedPhaseOccurrenceCount: NonNegativeIntegerSchema,
    exactPhysicalScopeOccurrenceCount: NonNegativeIntegerSchema,
  }),
  occurrences: Schema.Array(OperationalOccurrenceRowV2Schema),
  projectionRejections: Schema.Array(OperationalOccurrenceProjectionRejectionSchema),
});
export type MtaWikiOperationalOccurrenceImportArtifactV4 =
  typeof MtaWikiOperationalOccurrenceImportArtifactV4Schema.Type;

export const MtaWikiOperationalOccurrenceImportArtifactSchema = Schema.Union([
  MtaWikiOperationalOccurrenceImportArtifactV3Schema,
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
]);
export type MtaWikiOperationalOccurrenceImportArtifact =
  typeof MtaWikiOperationalOccurrenceImportArtifactSchema.Type;

export const OperationalOccurrenceEvidenceLineageCategorySchema = Schema.Literals([
  "structured_primary",
  "wiki_primary_structured_validated",
  "wiki_only",
  "unresolved_physical_link",
  "historical_version_missing",
]);
export type OperationalOccurrenceEvidenceLineageCategory =
  typeof OperationalOccurrenceEvidenceLineageCategorySchema.Type;

export const OperationalOccurrenceEvidenceLineageDimensionSchema = Schema.Struct({
  category: OperationalOccurrenceEvidenceLineageCategorySchema,
  authority: Schema.String,
  disposition: Schema.String,
  evidenceBindings: Schema.Array(OperationalOccurrenceEvidenceBindingV2Schema),
});
export type OperationalOccurrenceEvidenceLineageDimension =
  typeof OperationalOccurrenceEvidenceLineageDimensionSchema.Type;

const OperationalOccurrenceLineageCategoryCountsSchema = Schema.Struct({
  structured_primary: NonNegativeIntegerSchema,
  wiki_primary_structured_validated: NonNegativeIntegerSchema,
  wiki_only: NonNegativeIntegerSchema,
  unresolved_physical_link: NonNegativeIntegerSchema,
  historical_version_missing: NonNegativeIntegerSchema,
});

export const OperationalOccurrenceRouteLineageRowSchema = Schema.Struct({
  occurrenceId: Schema.String,
  occurrenceReviewDecisionId: Schema.String,
  studyProjectionEligible: Schema.Boolean,
  routeRecordId: Schema.String,
  gtfsRouteId: Schema.String,
  trackerRouteId: Schema.NullOr(Schema.String),
  implementationDate: Schema.String,
  datePrecision: Schema.Literals(["day", "month"]),
  treatmentKind: Schema.Literals(["atomic", "bundle"]),
  treatmentFamilies: Schema.Array(Schema.String),
  candidateIds: Schema.Array(Schema.String),
  phaseRecordIds: Schema.Array(Schema.String),
  phaseRelationRecordIds: Schema.Array(Schema.String),
  physicalScopeRecordIds: Schema.Array(Schema.String),
  physicalScopeRelationRecordIds: Schema.Array(Schema.String),
  canonicalLinks: Schema.Struct({
    trackerRoute: Schema.Struct({
      disposition: Schema.Literals(["resolved_current_route", "unresolved_current_route"]),
      routeId: Schema.NullOr(Schema.String),
    }),
    historicalRouteVersion: Schema.Struct({
      disposition: Schema.Literal("historical_version_missing"),
      routeVersionId: Schema.Null,
    }),
    treatedSegment: Schema.Struct({
      disposition: Schema.Literals(["source_scope_not_exact", "unresolved_physical_link"]),
      trackerSegmentIds: Schema.Array(Schema.String).check(Schema.isMaxLength(0)),
      sourceRecordIds: Schema.Array(Schema.String),
      sourceRelationIds: Schema.Array(Schema.String),
    }),
  }),
  spineReadiness: Schema.NullOr(
    Schema.Literals(["series_ready", "series_ready_with_gaps", "needs_pattern_review"]),
  ),
  dimensions: Schema.Struct({
    routeIdentity: OperationalOccurrenceEvidenceLineageDimensionSchema,
    routeVersionIdentity: OperationalOccurrenceEvidenceLineageDimensionSchema,
    treatmentOccurrenceDate: OperationalOccurrenceEvidenceLineageDimensionSchema,
    treatmentFamily: OperationalOccurrenceEvidenceLineageDimensionSchema,
    routeScope: OperationalOccurrenceEvidenceLineageDimensionSchema,
    physicalTreatedSegmentScope: OperationalOccurrenceEvidenceLineageDimensionSchema,
    phaseIdentity: OperationalOccurrenceEvidenceLineageDimensionSchema,
    outcomeData: OperationalOccurrenceEvidenceLineageDimensionSchema,
    causalInterpretation: OperationalOccurrenceEvidenceLineageDimensionSchema,
  }),
});
export type OperationalOccurrenceRouteLineageRow =
  typeof OperationalOccurrenceRouteLineageRowSchema.Type;

export const MtaWikiRc22LineageAuditSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_rc22_lineage_audit.v1"),
  schemaVersion: Schema.Literal(1),
  authorization: Schema.Literal("non_authorizing_migration_audit_only"),
  generatedAt: Schema.Literal("2026-07-17"),
  inputs: Schema.Struct({
    trackerBaselineCommit: GitCommitSchema,
    rc19Import: OperationalOccurrenceImportedReleaseFileSchema,
    rc19CandidateSet: OperationalOccurrenceImportedReleaseFileSchema,
    rc22Import: OperationalOccurrenceImportedReleaseFileSchema,
    rc22CandidateSet: OperationalOccurrenceImportedReleaseFileSchema,
    rc22Manifest: OperationalOccurrenceImportedReleaseFileSchema,
    logicalMergeInputs: OperationalOccurrenceImportedReleaseFileSchema,
    spineManifest: OperationalOccurrenceImportedReleaseFileSchema,
    busLaneAcquisitionSummary: OperationalOccurrenceImportedReleaseFileSchema,
    busLaneAcquisitionCampaign: OperationalOccurrenceImportedReleaseFileSchema,
    latestPointer: OperationalOccurrenceImportedReleaseFileSchema,
  }),
  sourceRelease: Schema.Struct({
    releaseId: Schema.Literal("v1-rc22"),
    manifestSha256: Sha256Schema,
    generatorCommit: GitCommitSchema,
    selectedByExplicitManifestPath: Schema.Literal(true),
    selectedViaLatest: Schema.Literal(false),
    latestObserved: Schema.Literal("v1-rc5"),
    producerReviewCompatibility: Schema.Literal(
      "known_rc22_review_v1_physical_scope_incompatibility",
    ),
    promotionEligible: Schema.Literal(false),
  }),
  summary: Schema.Struct({
    occurrenceCount: NonNegativeIntegerSchema,
    eligibleOccurrenceCount: NonNegativeIntegerSchema,
    rejectedOccurrenceCount: NonNegativeIntegerSchema,
    sourceRouteProjectionCount: NonNegativeIntegerSchema,
    eligibleRouteProjectionCount: NonNegativeIntegerSchema,
    rejectedRouteProjectionCount: NonNegativeIntegerSchema,
    routeLineageRowCount: NonNegativeIntegerSchema,
    resolvedCurrentRouteCount: NonNegativeIntegerSchema,
    unresolvedCurrentRouteCount: NonNegativeIntegerSchema,
    historicalRouteVersionMissingCount: NonNegativeIntegerSchema,
    exactPhysicalScopeOccurrenceCount: NonNegativeIntegerSchema,
    exactPhysicalScopeRouteProjectionCount: NonNegativeIntegerSchema,
    unresolvedPhysicalLinkCount: NonNegativeIntegerSchema,
    trackerSegmentLinkCount: NonNegativeIntegerSchema,
    singlePhaseOccurrenceCount: NonNegativeIntegerSchema,
    relatedPhaseOccurrenceCount: NonNegativeIntegerSchema,
  }),
  trackerCandidateFunnel: Schema.Struct({
    acceptedOccurrenceCount: NonNegativeIntegerSchema,
    rejectedOccurrenceCount: NonNegativeIntegerSchema,
    acceptedRouteProjectionCount: NonNegativeIntegerSchema,
    rejectedRouteProjectionCount: NonNegativeIntegerSchema,
    producerEligibleLocallyRejectedOccurrenceCount: NonNegativeIntegerSchema,
    producerEligibleLocallyRejectedRouteProjectionCount: NonNegativeIntegerSchema,
    rejectionReasonCounts: StringCountSchema,
    locallyRejectedTreatmentFamilyOccurrenceCounts: StringCountSchema,
    locallyRejectedTreatmentFamilyRouteProjectionCounts: StringCountSchema,
    exactCrossSourceDeduplicationCount: NonNegativeIntegerSchema,
  }),
  categoryCountsByDimension: Schema.Struct({
    routeIdentity: OperationalOccurrenceLineageCategoryCountsSchema,
    routeVersionIdentity: OperationalOccurrenceLineageCategoryCountsSchema,
    treatmentOccurrenceDate: OperationalOccurrenceLineageCategoryCountsSchema,
    treatmentFamily: OperationalOccurrenceLineageCategoryCountsSchema,
    routeScope: OperationalOccurrenceLineageCategoryCountsSchema,
    physicalTreatedSegmentScope: OperationalOccurrenceLineageCategoryCountsSchema,
    phaseIdentity: OperationalOccurrenceLineageCategoryCountsSchema,
    outcomeData: OperationalOccurrenceLineageCategoryCountsSchema,
    causalInterpretation: OperationalOccurrenceLineageCategoryCountsSchema,
  }),
  rc19ToRc22: Schema.Struct({
    rc19OccurrenceCount: NonNegativeIntegerSchema,
    rc22OccurrenceCount: NonNegativeIntegerSchema,
    occurrenceCountDelta: Schema.Number.check(Schema.isInt()),
    rc19EligibleOccurrenceCount: NonNegativeIntegerSchema,
    rc22EligibleOccurrenceCount: NonNegativeIntegerSchema,
    eligibleOccurrenceCountDelta: Schema.Number.check(Schema.isInt()),
    rc19RejectedOccurrenceCount: NonNegativeIntegerSchema,
    rc22RejectedOccurrenceCount: NonNegativeIntegerSchema,
    rejectedOccurrenceCountDelta: Schema.Number.check(Schema.isInt()),
    rc19RouteProjectionCount: NonNegativeIntegerSchema,
    rc22RouteProjectionCount: NonNegativeIntegerSchema,
    routeProjectionCountDelta: Schema.Number.check(Schema.isInt()),
    rc19EligibleRouteProjectionCount: NonNegativeIntegerSchema,
    rc22EligibleRouteProjectionCount: NonNegativeIntegerSchema,
    eligibleRouteProjectionCountDelta: Schema.Number.check(Schema.isInt()),
    rc19RejectedRouteProjectionCount: NonNegativeIntegerSchema,
    rc22RejectedRouteProjectionCount: NonNegativeIntegerSchema,
    rejectedRouteProjectionCountDelta: Schema.Number.check(Schema.isInt()),
    rc19CandidateSetId: Schema.String,
    rc22CandidateSetId: Schema.String,
    rc19CandidateCount: NonNegativeIntegerSchema,
    rc22CandidateCount: NonNegativeIntegerSchema,
    addedCandidateIdentityCount: NonNegativeIntegerSchema,
    removedCandidateIdentityCount: NonNegativeIntegerSchema,
    changedCandidateIdentityCount: NonNegativeIntegerSchema,
    unchangedCandidateIdentityCount: NonNegativeIntegerSchema,
    wikiBoundProvenanceRebindingCount: NonNegativeIntegerSchema,
    registryOnlyCandidateCount: NonNegativeIntegerSchema,
    approvalRebindingRequired: Schema.Literal(true),
    rc19ApprovalReceiptApplies: Schema.Literal(false),
    rc19ReviewRecommendationApplies: Schema.Literal(false),
    datePrecisionCounts: StringCountSchema,
    treatmentFamilyCounts: StringCountSchema,
    sourceCombinationCounts: StringCountSchema,
    spineReadinessCounts: StringCountSchema,
    outcomeWindowCounts: StringCountSchema,
    confounderGroupCounts: StringCountSchema,
    occurrenceDatePrecisionCounts: StringCountSchema,
    eligibleOccurrenceRouteDatePrecisionCounts: StringCountSchema,
  }),
  excludedBusLaneQueue: Schema.Struct({
    candidateCount: Schema.Literal(321),
    stillUnresolvedCount: Schema.Literal(321),
    genericAuthoritativeRouteTreatmentLinkCount: Schema.Literal(54),
    exactCandidateSegmentProofCount: Schema.Literal(1),
    exactCandidateDateAndPhaseCount: Schema.Literal(0),
    newOrUpdatedOccurrenceCount: Schema.Literal(0),
    completedSearchRouteLinkageUnresolvedCount: Schema.Literal(267),
    linkageSupportedPhaseUnresolvedCount: Schema.Literal(54),
    canonicalWikiOccurrenceProjectionCount: Schema.Literal(0),
    presentInTrackerCandidateSetCount: Schema.Literal(321),
    wikiBoundCandidateCount: Schema.Literal(0),
    approvedCandidateCount: Schema.Literal(0),
    candidates: Schema.Array(
      Schema.Struct({
        candidateId: Schema.String,
        identity: Schema.String,
        routeId: Schema.String,
        implementationDate: Schema.String,
        disposition: Schema.Literals([
          "completed_search_route_linkage_unresolved",
          "linkage_supported_phase_unresolved",
        ]),
        authoritativeRouteTreatmentBindingProved: Schema.Boolean,
        exactCandidateSegmentBindingProved: Schema.Boolean,
        exactSegmentIds: Schema.Array(Schema.String),
        candidateDateAndPhaseProved: Schema.Literal(false),
        explicitPhaseIdentityProved: Schema.Literal(false),
        canonicalOperationalOccurrenceIdentityProved: Schema.Literal(false),
        operationalOccurrenceAddedOrUpdated: Schema.Literal(false),
        stillUnresolved: Schema.Literal(true),
        registryProjectionExcluded: Schema.Literal(true),
        studyProjectionEligible: Schema.Literal(false),
        receiptId: Schema.String,
        receiptPath: Schema.String,
        receiptRowSha256: Sha256Schema,
        exclusionPath: Schema.String,
        exclusionRowSha256: Sha256Schema,
        reconciliationLedgerPath: Schema.String,
        reconciliationLedgerRowSha256: Sha256Schema,
      }),
    ),
  }),
  boundaries: Schema.Struct({
    candidateApprovalState: Schema.Literal("blocked_contract_incompatible"),
    approvedCandidateCount: Schema.Literal(0),
    studyRunAuthorized: Schema.Literal(false),
    publicationAuthorized: Schema.Literal(false),
    publicD1OrR2MutationAuthorized: Schema.Literal(false),
    latestMutationAuthorized: Schema.Literal(false),
  }),
  promotionRecommendation: Schema.Struct({
    decision: Schema.Literal("hold"),
    operatorReadyToPromoteRc22: Schema.Literal(false),
    requiredProducerAction: Schema.String,
    requiredTrackerActionsBeforeStudyRun: Schema.Array(Schema.String),
  }),
  routeLineage: Schema.Array(OperationalOccurrenceRouteLineageRowSchema),
});
export type MtaWikiRc22LineageAudit = typeof MtaWikiRc22LineageAuditSchema.Type;

export const OperationalOccurrenceContractVersion = 1 as const;
export const OperationalOccurrenceReviewDecisionContractVersion = 1 as const;
export const OperationalOccurrenceManifestVersion = 3 as const;
export const OperationalOccurrenceContractVersionV2 = 2 as const;
export const OperationalOccurrenceManifestVersionV4 = 4 as const;
export const RelationshipIntegrityBundleContractVersion = 1 as const;

export type OperationalOccurrencePositiveInteger = typeof PositiveIntegerSchema.Type;
