import { Schema } from "effect";

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const StringCountSchema = Schema.Record(Schema.String, NonNegativeIntegerSchema);

export const OperationalOccurrenceEvidenceRoleSchema = Schema.Literals([
  "bundle_analysis_family",
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);
export type OperationalOccurrenceEvidenceRole = typeof OperationalOccurrenceEvidenceRoleSchema.Type;

export const OperationalOccurrenceEvidenceBindingSchema = Schema.Struct({
  role: OperationalOccurrenceEvidenceRoleSchema,
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.String,
});
export type OperationalOccurrenceEvidenceBinding =
  typeof OperationalOccurrenceEvidenceBindingSchema.Type;

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

export const OperationalOccurrenceExclusionReasonSchema = Schema.Literal(
  "unsupported_bundle_analysis_family",
);
export type OperationalOccurrenceExclusionReason =
  typeof OperationalOccurrenceExclusionReasonSchema.Type;

export const OperationalOccurrenceRowSchema = Schema.Struct({
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
export type OperationalOccurrenceRow = typeof OperationalOccurrenceRowSchema.Type;

export const OperationalOccurrenceSummarySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  occurrence_count: NonNegativeIntegerSchema,
  study_projection_eligible_count: NonNegativeIntegerSchema,
  atomic_count: NonNegativeIntegerSchema,
  bundle_count: NonNegativeIntegerSchema,
  multi_route_count: NonNegativeIntegerSchema,
  candidate_projection_count: NonNegativeIntegerSchema,
  counts_by_exclusion_reason: StringCountSchema,
});
export type OperationalOccurrenceSummary = typeof OperationalOccurrenceSummarySchema.Type;

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

export const MtaWikiOperationalOccurrenceImportArtifactSchema = Schema.Struct({
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
export type MtaWikiOperationalOccurrenceImportArtifact =
  typeof MtaWikiOperationalOccurrenceImportArtifactSchema.Type;

export const OperationalOccurrenceContractVersion = 1 as const;
export const OperationalOccurrenceReviewDecisionContractVersion = 1 as const;
export const OperationalOccurrenceManifestVersion = 3 as const;

export type OperationalOccurrencePositiveInteger = typeof PositiveIntegerSchema.Type;
