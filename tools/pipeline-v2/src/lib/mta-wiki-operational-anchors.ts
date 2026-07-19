import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  computeCausalAnchorEligibility,
  isRealizedOperationalLifecyclePhase,
  OperationalAnchorConflictStateSchema,
  OperationalAnchorExclusionReasonSchema,
  OperationalAnchorScopeResolutionSchema,
  OperationalAnchorSourceAuthoritySchema,
  type OperationalDateBasis,
  type OperationalDateValidationState,
  operationalDateConfidence,
  parseOperationalDate,
  type SourceStatedStatus,
  type WikiOperationalDateAssertion,
  WikiOperationalDateAssertionSchema,
} from "@bp/domain/documents/operational-date";
import { Effect, Schema } from "effect";
import { PipelineFileSystemLayer, PipelineFileSystemService } from "../effect/file-system.ts";
import { runPipelineEffect } from "../effect/runtime.ts";
import {
  readMtaWikiReleaseQuarantineStatus,
  verifyMtaWikiReleaseFile as verifySharedMtaWikiReleaseFile,
} from "./mta-wiki-release.ts";
import {
  assertMtaWikiRouteIdentitySnapshotSelfIntegrity,
  type MtaWikiRouteIdentitySnapshot,
  MtaWikiRouteIdentitySnapshotSchema,
  projectableGtfsRouteIdForRecord,
} from "./mta-wiki-route-identities.ts";

const COMMAND = "studio.import-mta-wiki-operational-anchors";
const MANIFEST_VERSION = 2;
const MANIFEST_VERSION_V5 = 5;
const OPERATIONAL_ANCHOR_CONTRACT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2 = 2;
const OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION = 1;

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const StringCountSchema = Schema.Record(Schema.String, NonNegativeIntegerSchema);

const ReleaseFileSchema = Schema.Struct({
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const ReleaseManifestV2Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    route_anchors: Schema.NullOr(Schema.String),
    taxonomy: Schema.NullOr(Schema.String),
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifestV2 = typeof ReleaseManifestV2Schema.Type;

const ReleaseManifestV5Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION_V5),
  release_id: NonEmptyStringSchema,
  generator_commit: NonEmptyStringSchema,
  contract_versions: Schema.Struct({
    operational_anchor_review_decisions: Schema.Literal(
      OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2,
    ),
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_occurrence_review_decisions: Schema.Literals([1, 2]),
    operational_occurrences: Schema.Literal(2),
    relationship_integrity_bundle: Schema.Literal(1),
    route_anchors: Schema.Literal(1),
    route_identity_snapshot: Schema.Literal(1),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchor_review_decisions: NonEmptyStringSchema,
    operational_anchor_summary: NonEmptyStringSchema,
    operational_anchors: NonEmptyStringSchema,
    operational_occurrence_review_decisions: NonEmptyStringSchema,
    operational_occurrence_summary: NonEmptyStringSchema,
    operational_occurrences: NonEmptyStringSchema,
    quality_report: Schema.NullOr(NonEmptyStringSchema),
    relationship_integrity_bundle: NonEmptyStringSchema,
    route_anchors: Schema.Literal("route_anchors.jsonl"),
    route_identity_snapshot: Schema.Literal("route_identity_snapshot.json"),
    taxonomy: NonEmptyStringSchema,
  }),
});
type ReleaseManifestV5 = typeof ReleaseManifestV5Schema.Type;
type ReleaseManifest = ReleaseManifestV2 | ReleaseManifestV5;
type ReleaseFile = typeof ReleaseFileSchema.Type;

const OperationalAnchorDateCandidateSchema = Schema.Struct({
  source_field: Schema.String,
  raw: Schema.String,
  normalized: Schema.String,
  precision: Schema.String,
  origin: Schema.Literals([
    "canonical_scalar",
    "merged_field",
    "normalized_companion",
    "payload_field",
  ]),
});

const OperationalAnchorEvidenceRefSchema = Schema.Struct({
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.NullOr(Schema.String),
  block_id: Schema.NullOr(Schema.String),
  page_number: Schema.NullOr(PositiveIntegerSchema),
  text_sha256: Schema.NullOr(Sha256Schema),
  role: Schema.Literals(["event", "route_scope", "timeline_relation", "treatment_scope"]),
});

const OperationalAnchorEvidenceCoverageSchema = Schema.Struct({
  event: Schema.Boolean,
  timeline: Schema.Boolean,
  route_scope: Schema.Boolean,
  treatment_scope: Schema.Boolean,
});

const OperationalAnchorRowSchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
  anchor_id: Schema.String,
  operational_change_id: Schema.String,
  event_record_id: Schema.String,
  timeline_relation_record_ids: Schema.Array(Schema.String),
  project_record_ids: Schema.Array(Schema.String),
  subject_record_ids: Schema.Array(Schema.String),
  subject_record_kinds: Schema.Array(Schema.String),
  route_record_ids: Schema.Array(Schema.String),
  unmatched_route_record_ids: Schema.Array(Schema.String),
  gtfs_route_ids: Schema.Array(Schema.String),
  treatment_record_ids: Schema.Array(Schema.String),
  treatment_families: Schema.Array(Schema.String),
  route_scope_direct: Schema.Boolean,
  treatment_scope_direct: Schema.Boolean,
  temporal_role: Schema.Literals(["status_as_of", "planned_operational", "realized_operational"]),
  raw_date: Schema.NullOr(Schema.String),
  normalized_date: Schema.NullOr(Schema.String),
  date_precision: Schema.String,
  candidate_operational_date_raw: Schema.NullOr(Schema.String),
  candidate_operational_date_normalized: Schema.NullOr(Schema.String),
  candidate_operational_date_precision: Schema.String,
  candidate_operational_date_source_field: Schema.NullOr(Schema.String),
  candidate_operational_date_candidates: Schema.Array(OperationalAnchorDateCandidateSchema),
  candidate_operational_dates_normalized: Schema.Array(Schema.String),
  status_as_of_dates: Schema.Array(Schema.String),
  event_family: Schema.String,
  lifecycle_phase: Schema.NullOr(Schema.String),
  assertion_statuses: Schema.Array(Schema.String),
  truth_status: Schema.String,
  truth_statuses: Schema.Array(Schema.String),
  review_state: Schema.String,
  source_id: Schema.String,
  source_ids: Schema.Array(Schema.String),
  source_authority: OperationalAnchorSourceAuthoritySchema,
  source_publishers: Schema.Array(Schema.String),
  route_scope_resolution: OperationalAnchorScopeResolutionSchema,
  treatment_scope_resolution: OperationalAnchorScopeResolutionSchema,
  scope_resolution: OperationalAnchorScopeResolutionSchema,
  conflict_states: Schema.Array(OperationalAnchorConflictStateSchema),
  evidence_coverage: OperationalAnchorEvidenceCoverageSchema,
  evidence_refs: Schema.Array(OperationalAnchorEvidenceRefSchema),
  exclusion_reasons: Schema.Array(OperationalAnchorExclusionReasonSchema),
  study_eligible: Schema.Boolean,
});
type OperationalAnchorRow = typeof OperationalAnchorRowSchema.Type;

function assertActiveAnchorRouteProjections(
  rows: readonly OperationalAnchorRow[],
  snapshot: MtaWikiRouteIdentitySnapshot,
): void {
  for (const row of rows) {
    const routeRecordIds = new Set(row.route_record_ids);
    if (row.unmatched_route_record_ids.some((recordId) => !routeRecordIds.has(recordId))) {
      throw new Error(
        `operational anchor ${row.anchor_id}: unmatched route record is absent from route_record_ids`,
      );
    }
    const unmatched = new Set(row.unmatched_route_record_ids);
    const expectedGtfsRouteIds = [
      ...new Set(
        row.route_record_ids
          .filter((recordId) => !unmatched.has(recordId))
          .map((recordId) => projectableGtfsRouteIdForRecord(snapshot, recordId)),
      ),
    ].toSorted();
    const actualGtfsRouteIds = [...row.gtfs_route_ids].toSorted();
    if (canonicalJson(actualGtfsRouteIds) !== canonicalJson(expectedGtfsRouteIds)) {
      throw new Error(
        `operational anchor ${row.anchor_id}: exact GTFS routes disagree with projectable route bindings`,
      );
    }
  }
}

const OperationalAnchorFunnelSchema = Schema.Struct({
  canonical_events: NonNegativeIntegerSchema,
  timeline_linked_operational_events: NonNegativeIntegerSchema,
  candidate_operational_date_present: NonNegativeIntegerSchema,
  realized_operational: NonNegativeIntegerSchema,
  realized_day_or_month: NonNegativeIntegerSchema,
  resolved_route_scope: NonNegativeIntegerSchema,
  resolved_treatment_scope: NonNegativeIntegerSchema,
  evidence_complete: NonNegativeIntegerSchema,
  conflict_free: NonNegativeIntegerSchema,
  study_eligible: NonNegativeIntegerSchema,
});

const OperationalAnchorLegacySummarySchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
  row_count: NonNegativeIntegerSchema,
  study_eligible_count: NonNegativeIntegerSchema,
  counts_by_temporal_role: StringCountSchema,
  counts_by_scope_resolution: StringCountSchema,
  counts_by_exclusion_reason: StringCountSchema,
  funnel: OperationalAnchorFunnelSchema,
});

const OperationalAnchorBroadFunnelSchema = Schema.Struct({
  operational_family_events_total: NonNegativeIntegerSchema,
  timeline_linked_distinct_events: NonNegativeIntegerSchema,
  unlinked_operational_events: NonNegativeIntegerSchema,
  candidate_operational_date_present: NonNegativeIntegerSchema,
  realized_operational: NonNegativeIntegerSchema,
  realized_day_or_month: NonNegativeIntegerSchema,
  resolved_route_scope: NonNegativeIntegerSchema,
  resolved_treatment_scope: NonNegativeIntegerSchema,
  evidence_complete: NonNegativeIntegerSchema,
  conflict_free: NonNegativeIntegerSchema,
  study_eligible: NonNegativeIntegerSchema,
});

const OperationalAnchorExpandedSummarySchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
  row_count: NonNegativeIntegerSchema,
  broad_row_count: NonNegativeIntegerSchema,
  reviewed_row_count: NonNegativeIntegerSchema,
  distinct_operational_event_count: NonNegativeIntegerSchema,
  study_eligible_count: NonNegativeIntegerSchema,
  study_eligible_reviewed_count: NonNegativeIntegerSchema,
  counts_by_temporal_role: StringCountSchema,
  counts_by_scope_resolution: StringCountSchema,
  counts_by_exclusion_reason: StringCountSchema,
  entry_gate: Schema.Struct({
    relations_examined: NonNegativeIntegerSchema,
    non_event_timeline_objects: NonNegativeIntegerSchema,
    non_operational_event_objects: NonNegativeIntegerSchema,
  }),
  broad_funnel: OperationalAnchorBroadFunnelSchema,
  funnel: Schema.Struct({
    canonical_events: NonNegativeIntegerSchema,
    operational_family_events_total: NonNegativeIntegerSchema,
    timeline_linked_operational_events: NonNegativeIntegerSchema,
    timeline_linked_distinct_events: NonNegativeIntegerSchema,
    unlinked_operational_events: NonNegativeIntegerSchema,
    candidate_operational_date_present: NonNegativeIntegerSchema,
    realized_operational: NonNegativeIntegerSchema,
    realized_day_or_month: NonNegativeIntegerSchema,
    resolved_route_scope: NonNegativeIntegerSchema,
    resolved_treatment_scope: NonNegativeIntegerSchema,
    evidence_complete: NonNegativeIntegerSchema,
    conflict_free: NonNegativeIntegerSchema,
    study_eligible: NonNegativeIntegerSchema,
  }),
});
const OperationalAnchorSummarySchema = Schema.Union([
  OperationalAnchorExpandedSummarySchema,
  OperationalAnchorLegacySummarySchema,
]);
type OperationalAnchorSummary = typeof OperationalAnchorSummarySchema.Type;

const OperationalAnchorReviewEvidenceBindingSchema = Schema.Struct({
  role: Schema.Literals([
    "event_date",
    "route_identity",
    "route_scope",
    "route_treatment_event_bridge",
    "timeline_relation",
    "treatment_definition",
    "treatment_scope",
  ]),
  record_id: Schema.String,
  source_id: Schema.String,
  evidence_id: Schema.String,
});

const OperationalAnchorReviewDecisionSchema = Schema.Struct({
  schema_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION),
  decision_id: Schema.String,
  review_state: Schema.Literal("accepted"),
  accepted_at: NonEmptyStringSchema,
  reviewer: NonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
  source_id: Schema.String,
  event_record_id: Schema.String,
  timeline_relation_record_id: Schema.String,
  route_record_id: Schema.String,
  route_scope_relation_record_id: Schema.String,
  treatment_record_id: Schema.String,
  treatment_scope_relation_record_id: Schema.String,
  treatment_family: Schema.String,
  expected_operational_date: Schema.String,
  expected_date_precision: Schema.Literals(["day", "month"]),
  evidence_bindings: Schema.Array(OperationalAnchorReviewEvidenceBindingSchema),
});

const OperationalAnchorReviewSnapshotV1Schema = Schema.Struct({
  snapshot_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION),
  decision_schema_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION),
  decision_count: NonNegativeIntegerSchema,
  decisions: Schema.Array(OperationalAnchorReviewDecisionSchema),
});
type OperationalAnchorReviewSnapshotV1 = typeof OperationalAnchorReviewSnapshotV1Schema.Type;

const SafeIdSchema = NonEmptyStringSchema.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u));
const RetirementSourceArtifactSchema = Schema.Struct({
  artifact_path: NonEmptyStringSchema,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});
const RetirementReleaseArtifactSchema = Schema.Struct({
  release_path: NonEmptyStringSchema,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});
const RetirementBindingSchema = Schema.Struct({
  route_record_id: SafeIdSchema,
  route_binding_decision_id: SafeIdSchema,
  route_binding_sha256: Sha256Schema,
  dataset_id: Schema.Literals(["mta-nyct-bus", "mta-bus-company"]),
  source_route_id: NonEmptyStringSchema,
  gtfs_route_id: NonEmptyStringSchema,
  projectable: Schema.Literal(false),
  ineligibility_reasons: Schema.Array(
    Schema.Literals([
      "identity_not_exact",
      "service_class_not_regular_mta_bus",
      "record_not_current",
      "raw_route_type_not_3",
      "catalog_not_in_effect",
      "reliability_not_proven",
      "not_scheduled_in_window",
    ]),
  ),
});
const RetirementAnchorSourceTargetSchema = Schema.Struct({
  review_contract: Schema.Literal("operational-anchor-review-v1"),
  decision_id: SafeIdSchema,
  projection_state: Schema.Literal("retired"),
  reason_code: Schema.Literal("route_binding_nonprojectable"),
  original_artifact: RetirementSourceArtifactSchema,
});
const RetirementOccurrenceSourceTargetSchema = Schema.Struct({
  review_contract: Schema.Literal("operational-occurrence-review-v1"),
  decision_id: SafeIdSchema,
  occurrence_id: SafeIdSchema,
  founding_key: NonEmptyStringSchema,
  pinned_gtfs_route_ids: Schema.Array(NonEmptyStringSchema),
  projection_state: Schema.Literal("retired"),
  reason_code: Schema.Literal("route_binding_nonprojectable"),
  original_artifact: RetirementSourceArtifactSchema,
});
const OperationalProjectionRetirementSourceSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("operational-review-projection-retirement-v1"),
  retirement_id: SafeIdSchema,
  state: Schema.Literal("accepted"),
  accepted_by: NonEmptyStringSchema,
  accepted_at: NonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
  route_identity_snapshot_id: SafeIdSchema,
  route_identity_snapshot_sha256: Sha256Schema,
  binding: RetirementBindingSchema,
  anchor_review_decisions: Schema.Array(RetirementAnchorSourceTargetSchema),
  occurrence_review_decisions: Schema.Array(RetirementOccurrenceSourceTargetSchema),
});
type OperationalProjectionRetirementSource =
  typeof OperationalProjectionRetirementSourceSchema.Type;

const OperationalAnchorReviewRetirementProjectionSchema = Schema.Struct({
  retirement_id: SafeIdSchema,
  retirement_source: RetirementReleaseArtifactSchema,
  accepted_by: NonEmptyStringSchema,
  accepted_at: NonEmptyStringSchema,
  rationale: NonEmptyStringSchema,
  route_identity_snapshot_id: SafeIdSchema,
  route_identity_snapshot_sha256: Sha256Schema,
  binding: RetirementBindingSchema,
  target: Schema.Struct({
    review_contract: Schema.Literal("operational-anchor-review-v1"),
    decision_id: SafeIdSchema,
    projection_state: Schema.Literal("retired"),
    reason_code: Schema.Literal("route_binding_nonprojectable"),
    original_artifact: RetirementReleaseArtifactSchema,
  }),
});
type OperationalAnchorReviewRetirementProjection =
  typeof OperationalAnchorReviewRetirementProjectionSchema.Type;

const OperationalAnchorReviewSnapshotV2Schema = Schema.Struct({
  snapshot_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2),
  decision_schema_version: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_DECISION_VERSION),
  source_decision_count: NonNegativeIntegerSchema,
  decision_count: NonNegativeIntegerSchema,
  decisions: Schema.Array(OperationalAnchorReviewDecisionSchema),
  retirement_schema_version: Schema.Literal(1),
  retirement_count: NonNegativeIntegerSchema,
  retirements: Schema.Array(OperationalAnchorReviewRetirementProjectionSchema),
});
type OperationalAnchorReviewSnapshotV2 = typeof OperationalAnchorReviewSnapshotV2Schema.Type;
type OperationalAnchorReviewSnapshot =
  | OperationalAnchorReviewSnapshotV1
  | OperationalAnchorReviewSnapshotV2;

const ImportedReleaseFileSchema = Schema.Struct({
  pointer: Schema.String,
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const OperationalAnchorRejectionSchema = Schema.Struct({
  operationalChangeId: Schema.String,
  anchorIds: Schema.Array(Schema.String),
  reasonCodes: Schema.Array(Schema.String),
});

const OperationalAnchorConflictSchema = Schema.Struct({
  operationalChangeId: Schema.String,
  anchorIds: Schema.Array(Schema.String),
  candidateOperationalDates: Schema.Array(Schema.NullOr(Schema.String)),
  reason: Schema.Literal("cross_anchor_date_conflict"),
});

export const MtaWikiOperationalAnchorImportArtifactV2Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_operational_date_assertions.v2"),
  schemaVersion: Schema.Literal(2),
  sourceRelease: Schema.Struct({
    manifestVersion: Schema.Literal(MANIFEST_VERSION),
    releaseId: Schema.String,
    generatorCommit: Schema.String,
    manifestPath: Schema.String,
    manifestSha256: Sha256Schema,
    operationalAnchorContractVersion: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operationalAnchorReviewDecisionContractVersion: Schema.Literal(
      OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
    ),
    anchors: ImportedReleaseFileSchema,
    summary: ImportedReleaseFileSchema,
    reviewDecisions: ImportedReleaseFileSchema,
    reviewDecisionCount: NonNegativeIntegerSchema,
  }),
  producerSummary: OperationalAnchorSummarySchema,
  summary: Schema.Struct({
    sourceRowCount: NonNegativeIntegerSchema,
    assertionCount: NonNegativeIntegerSchema,
    eligibleAssertionCount: NonNegativeIntegerSchema,
    rejectedAssertionCount: NonNegativeIntegerSchema,
    rejectedAnchorCount: NonNegativeIntegerSchema,
    exactDuplicateGroupCount: NonNegativeIntegerSchema,
    exactDuplicateRowCount: NonNegativeIntegerSchema,
    crossDateConflictGroupCount: NonNegativeIntegerSchema,
    countsByRejectionReason: StringCountSchema,
  }),
  assertions: Schema.Array(WikiOperationalDateAssertionSchema),
  rejections: Schema.Array(OperationalAnchorRejectionSchema),
  conflicts: Schema.Array(OperationalAnchorConflictSchema),
});
export const MtaWikiOperationalAnchorImportArtifactV3Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_operational_date_assertions.v3"),
  schemaVersion: Schema.Literal(3),
  sourceRelease: Schema.Struct({
    manifestVersion: Schema.Literal(MANIFEST_VERSION_V5),
    releaseId: Schema.String,
    generatorCommit: Schema.String,
    manifestPath: Schema.String,
    manifestSha256: Sha256Schema,
    operationalAnchorContractVersion: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operationalAnchorReviewDecisionContractVersion: Schema.Literal(
      OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2,
    ),
    routeIdentitySnapshotContractVersion: Schema.Literal(1),
    routeIdentitySnapshotId: Schema.String,
    anchors: ImportedReleaseFileSchema,
    summary: ImportedReleaseFileSchema,
    reviewDecisions: ImportedReleaseFileSchema,
    routeIdentitySnapshot: ImportedReleaseFileSchema,
    sourceReviewDecisionCount: NonNegativeIntegerSchema,
    reviewDecisionCount: NonNegativeIntegerSchema,
    retirementCount: NonNegativeIntegerSchema,
    retiredDecisionIds: Schema.Array(Schema.String),
    retirementSources: Schema.Array(ImportedReleaseFileSchema),
    retiredReviewDecisions: Schema.Array(ImportedReleaseFileSchema),
  }),
  producerSummary: OperationalAnchorSummarySchema,
  summary: Schema.Struct({
    sourceRowCount: NonNegativeIntegerSchema,
    assertionCount: NonNegativeIntegerSchema,
    eligibleAssertionCount: NonNegativeIntegerSchema,
    rejectedAssertionCount: NonNegativeIntegerSchema,
    rejectedAnchorCount: NonNegativeIntegerSchema,
    exactDuplicateGroupCount: NonNegativeIntegerSchema,
    exactDuplicateRowCount: NonNegativeIntegerSchema,
    crossDateConflictGroupCount: NonNegativeIntegerSchema,
    countsByRejectionReason: StringCountSchema,
  }),
  assertions: Schema.Array(WikiOperationalDateAssertionSchema),
  rejections: Schema.Array(OperationalAnchorRejectionSchema),
  conflicts: Schema.Array(OperationalAnchorConflictSchema),
});
export const MtaWikiOperationalAnchorImportArtifactSchema = Schema.Union([
  MtaWikiOperationalAnchorImportArtifactV2Schema,
  MtaWikiOperationalAnchorImportArtifactV3Schema,
]);
export type MtaWikiOperationalAnchorImportArtifact =
  typeof MtaWikiOperationalAnchorImportArtifactSchema.Type;

const ImportErrorCodeSchema = Schema.Literals([
  "invalid_input",
  "unsafe_path",
  "read_failed",
  "hash_mismatch",
  "byte_count_mismatch",
  "invalid_utf8",
  "invalid_json",
  "schema_mismatch",
  "release_mismatch",
  "missing_manifest_file",
  "summary_mismatch",
  "duplicate_anchor_id",
  "semantic_mismatch",
  "contract_incompatible",
  "write_failed",
]);

export class MtaWikiOperationalAnchorImportError extends Schema.TaggedErrorClass<MtaWikiOperationalAnchorImportError>()(
  "MtaWikiOperationalAnchorImportError",
  {
    code: ImportErrorCodeSchema,
    operation: Schema.String,
    path: Schema.String,
    line: Schema.NullOr(PositiveIntegerSchema),
    detail: Schema.String,
  },
) {}

export type ImportMtaWikiOperationalAnchorsInput = {
  readonly mtaWikiRoot: string;
  readonly wikiRelease: string;
  readonly wikiManifestSha256: string;
  readonly output: string;
};

type VerifiedReleaseFile = {
  readonly pointer: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly metadata: ReleaseFile;
};

type AdaptedAssertion = {
  readonly assertion: WikiOperationalDateAssertion;
  readonly candidateDate: string | null;
  readonly dedupeKey: string;
};

type DedupeResult = {
  readonly assertions: AdaptedAssertion[];
  readonly duplicateGroupCount: number;
  readonly duplicateRowCount: number;
};

function importError(input: {
  code: typeof ImportErrorCodeSchema.Type;
  operation: string;
  path: string;
  detail: string;
  line?: number | null | undefined;
}): MtaWikiOperationalAnchorImportError {
  return MtaWikiOperationalAnchorImportError.make({
    code: input.code,
    operation: input.operation,
    path: input.path,
    line: input.line ?? null,
    detail: input.detail,
  });
}

function serviceFreeSchema<S extends Schema.Constraint>(
  schema: S,
): Schema.Codec<S["Type"], S["Encoded"], never, unknown> {
  return Schema.make<Schema.Codec<S["Type"], S["Encoded"], never, unknown>>(schema.ast);
}

function decodeStrict<S extends Schema.Constraint>(input: {
  schema: S;
  value: unknown;
  operation: string;
  path: string;
  line?: number | null | undefined;
}): Effect.Effect<S["Type"], MtaWikiOperationalAnchorImportError> {
  return Schema.decodeUnknownEffect(serviceFreeSchema(input.schema), {
    onExcessProperty: "error",
  })(input.value).pipe(
    Effect.mapError((error) =>
      importError({
        code: "schema_mismatch",
        operation: input.operation,
        path: input.path,
        line: input.line,
        detail: String(error),
      }),
    ),
  );
}

function parseJsonUnknown(text: string): unknown {
  return JSON.parse(text);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function canonicalJsonl(values: readonly unknown[]): string {
  return values.length === 0 ? "" : `${values.map(canonicalJson).join("\n")}\n`;
}

function artifactJson(artifact: MtaWikiOperationalAnchorImportArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function releaseArtifactPath(releaseId: string, pointer: string): string {
  return `data/exports/releases/${releaseId}/${pointer}`;
}

function importedReleaseFile(file: VerifiedReleaseFile, releaseId: string) {
  return {
    pointer: file.pointer,
    path: releaseArtifactPath(releaseId, file.pointer),
    bytes: file.metadata.bytes,
    sha256: file.metadata.sha256,
  };
}

function isInside(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

const readBytes = Effect.fn("MtaWikiOperationalAnchors.readBytes")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => readFile(path),
    catch: (cause) =>
      importError({
        code: "read_failed",
        operation,
        path,
        detail: String(cause),
      }),
  });
});

const canonicalPath = Effect.fn("MtaWikiOperationalAnchors.canonicalPath")(function* (
  path: string,
  operation: string,
) {
  return yield* Effect.tryPromise({
    try: () => realpath(path),
    catch: (cause) =>
      importError({
        code: "read_failed",
        operation,
        path,
        detail: String(cause),
      }),
  });
});

function isMissingPathError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

/**
 * Resolve an output path through its nearest existing ancestor. This catches
 * both an existing output symlink and a symlinked parent before a write can
 * escape into the immutable producer release.
 */
const canonicalProspectivePath = Effect.fn("MtaWikiOperationalAnchors.canonicalProspectivePath")(
  function* (path: string, operation: string) {
    return yield* Effect.tryPromise({
      try: async () => {
        const target = resolve(path);
        let ancestor = target;
        while (true) {
          try {
            const canonicalAncestor = await realpath(ancestor);
            return resolve(canonicalAncestor, relative(ancestor, target));
          } catch (cause) {
            if (!isMissingPathError(cause)) throw cause;
            const parent = dirname(ancestor);
            if (parent === ancestor) throw cause;
            ancestor = parent;
          }
        }
      },
      catch: (cause) =>
        importError({
          code: "read_failed",
          operation,
          path,
          detail: String(cause),
        }),
    });
  },
);

function decodeUtf8(
  bytes: Uint8Array,
  input: { operation: string; path: string },
): Effect.Effect<string, MtaWikiOperationalAnchorImportError> {
  return Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: (cause) =>
      importError({
        code: "invalid_utf8",
        operation: input.operation,
        path: input.path,
        detail: String(cause),
      }),
  });
}

function parseJson(
  text: string,
  input: { operation: string; path: string; line?: number | null | undefined },
): Effect.Effect<unknown, MtaWikiOperationalAnchorImportError> {
  return Effect.try({
    try: () => parseJsonUnknown(text),
    catch: (cause) =>
      importError({
        code: "invalid_json",
        operation: input.operation,
        path: input.path,
        line: input.line,
        detail: String(cause),
      }),
  });
}

type NormalizedLiteralPrecision = "day" | "month" | "year" | "season";

function normalizedLiteralPrecision(value: string): NormalizedLiteralPrecision | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (day !== null) {
    const yearPart = day[1];
    const monthPart = day[2];
    const dayPart = day[3];
    if (yearPart === undefined || monthPart === undefined || dayPart === undefined) return null;
    const year = Number(yearPart);
    const month = Number(monthPart);
    const dayOfMonth = Number(dayPart);
    const parsed = new Date(Date.UTC(year, month - 1, dayOfMonth));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === dayOfMonth
      ? "day"
      : null;
  }
  const month = /^(\d{4})-(\d{2})$/u.exec(value);
  if (month !== null) {
    const monthPart = month[2];
    if (monthPart === undefined) return null;
    const monthNumber = Number(monthPart);
    return monthNumber >= 1 && monthNumber <= 12 ? "month" : null;
  }
  if (/^\d{4}$/u.test(value)) return "year";
  if (/^\d{4}-(?:winter|spring|summer|fall)$/u.test(value)) return "season";
  return null;
}

function precisionDisagrees(normalized: string, declared: string): boolean {
  const detected = normalizedLiteralPrecision(normalized);
  if (detected !== null) return detected !== declared;
  return declared === "day" || declared === "month" || declared === "year";
}

function validateRowSemantics(
  row: OperationalAnchorRow,
  input: { path: string; line: number },
): Effect.Effect<void, MtaWikiOperationalAnchorImportError> {
  const selectedDate = row.candidate_operational_date_normalized;
  if (
    selectedDate !== null &&
    precisionDisagrees(selectedDate, row.candidate_operational_date_precision)
  ) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `candidate date ${selectedDate} disagrees with precision ${row.candidate_operational_date_precision}`,
      }),
    );
  }
  for (const candidate of row.candidate_operational_date_candidates) {
    if (precisionDisagrees(candidate.normalized, candidate.precision)) {
      return Effect.fail(
        importError({
          code: "semantic_mismatch",
          operation: "validateOperationalAnchor",
          path: input.path,
          line: input.line,
          detail: `candidate ${candidate.source_field} date ${candidate.normalized} disagrees with precision ${candidate.precision}`,
        }),
      );
    }
  }
  const candidateDates = uniqueSorted(
    row.candidate_operational_date_candidates.map((candidate) => candidate.normalized),
  );
  if (canonicalJson(candidateDates) !== canonicalJson(row.candidate_operational_dates_normalized)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "candidate_operational_dates_normalized does not match the structured candidates",
      }),
    );
  }
  if (selectedDate !== null && !candidateDates.includes(selectedDate)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `selected candidate date ${selectedDate} is absent from the structured candidates`,
      }),
    );
  }
  if (selectedDate === null && candidateDates.length > 0) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "structured candidate dates exist but no operational date was selected",
      }),
    );
  }
  if (
    row.temporal_role !== "status_as_of" &&
    (selectedDate === null ||
      row.normalized_date !== selectedDate ||
      row.date_precision !== row.candidate_operational_date_precision)
  ) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "operational temporal fields disagree with the selected candidate date",
      }),
    );
  }
  const combinedScopeResolution =
    row.route_scope_resolution === "missing" || row.treatment_scope_resolution === "missing"
      ? "missing"
      : row.route_scope_resolution === "ambiguous" || row.treatment_scope_resolution === "ambiguous"
        ? "ambiguous"
        : row.route_scope_resolution === "unreviewed_inherited" ||
            row.treatment_scope_resolution === "unreviewed_inherited"
          ? "unreviewed_inherited"
          : row.route_scope_resolution === "reviewed_inherited" ||
              row.treatment_scope_resolution === "reviewed_inherited"
            ? "reviewed_inherited"
            : "direct";
  if (row.scope_resolution !== combinedScopeResolution) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `combined scope resolution should be ${combinedScopeResolution}, received ${row.scope_resolution}`,
      }),
    );
  }
  if (row.study_eligible !== (row.exclusion_reasons.length === 0)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: "study_eligible disagrees with exclusion_reasons",
      }),
    );
  }
  if (!row.source_ids.includes(row.source_id)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `source_ids does not include primary source_id ${row.source_id}`,
      }),
    );
  }
  if (!row.truth_statuses.includes(row.truth_status)) {
    return Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchor",
        path: input.path,
        line: input.line,
        detail: `truth_statuses does not include event truth_status ${row.truth_status}`,
      }),
    );
  }
  return Effect.void;
}

const resolveReleaseDirectory = Effect.fn("MtaWikiOperationalAnchors.resolveReleaseDirectory")(
  function* (input: ImportMtaWikiOperationalAnchorsInput) {
    if (
      input.mtaWikiRoot.trim().length === 0 ||
      input.wikiRelease.trim().length === 0 ||
      input.output.trim().length === 0
    ) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "resolveReleaseDirectory",
          path: input.mtaWikiRoot,
          detail: "mtaWikiRoot, wikiRelease, and output must be non-empty",
        }),
      );
    }
    if (!/^[a-f0-9]{64}$/u.test(input.wikiManifestSha256)) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "resolveReleaseDirectory",
          path: input.mtaWikiRoot,
          detail: "wikiManifestSha256 must be a lowercase 64-character SHA-256 digest",
        }),
      );
    }

    const releasesRoot = resolve(input.mtaWikiRoot, "data", "exports", "releases");
    const releaseDirectory = resolve(releasesRoot, input.wikiRelease);
    if (!isInside(releasesRoot, releaseDirectory)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: releaseDirectory,
          detail: "wikiRelease escapes the MTA Wiki releases directory",
        }),
      );
    }
    const canonicalReleasesRoot = yield* canonicalPath(releasesRoot, "resolveReleaseDirectory");
    const canonicalReleaseDirectory = yield* canonicalPath(
      releaseDirectory,
      "resolveReleaseDirectory",
    );
    if (!isInside(canonicalReleasesRoot, canonicalReleaseDirectory)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: canonicalReleaseDirectory,
          detail: "wikiRelease resolves outside the MTA Wiki releases directory",
        }),
      );
    }
    const outputPath = resolve(input.output);
    if (outputPath === releaseDirectory || isInside(releaseDirectory, outputPath)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: outputPath,
          detail: "output must not overwrite files in the pinned MTA Wiki release",
        }),
      );
    }
    const canonicalOutputPath = yield* canonicalProspectivePath(
      outputPath,
      "resolveReleaseDirectory",
    );
    if (
      canonicalOutputPath === canonicalReleaseDirectory ||
      isInside(canonicalReleaseDirectory, canonicalOutputPath)
    ) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: "resolveReleaseDirectory",
          path: canonicalOutputPath,
          detail: "output resolves inside the pinned MTA Wiki release",
        }),
      );
    }
    return { releaseDirectory, canonicalReleaseDirectory };
  },
);

const safeReleaseFilePath = Effect.fn("MtaWikiOperationalAnchors.safeReleaseFilePath")(
  function* (input: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
    pointer: string;
    operation: string;
  }) {
    const target = resolve(input.releaseDirectory, input.pointer);
    if (!isInside(input.releaseDirectory, target)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: input.operation,
          path: target,
          detail: `release pointer escapes its release directory: ${input.pointer}`,
        }),
      );
    }
    const canonicalTarget = yield* canonicalPath(target, input.operation);
    if (!isInside(input.canonicalReleaseDirectory, canonicalTarget)) {
      return yield* Effect.fail(
        importError({
          code: "unsafe_path",
          operation: input.operation,
          path: canonicalTarget,
          detail: `release pointer resolves outside its release directory: ${input.pointer}`,
        }),
      );
    }
    return canonicalTarget;
  },
);

const verifyReleaseFile = Effect.fn("MtaWikiOperationalAnchors.verifyReleaseFile")(
  function* (input: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
    pointer: string;
    metadata: ReleaseFile;
    operation: string;
  }): Generator<
    Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>,
    VerifiedReleaseFile,
    never
  > {
    return yield* verifySharedMtaWikiReleaseFile(input).pipe(
      Effect.mapError((error) =>
        importError({
          code: error.code,
          operation: error.operation,
          path: error.path,
          line: error.line,
          detail: error.detail,
        }),
      ),
    );
  },
);

const decodeOperationalAnchorRows = Effect.fn("MtaWikiOperationalAnchors.decodeRows")(function* (
  file: VerifiedReleaseFile,
) {
  const text = yield* decodeUtf8(file.bytes, {
    operation: "decodeOperationalAnchors",
    path: file.path,
  });
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: OperationalAnchorRow[] = [];
  const anchorLines = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return yield* Effect.fail(
        importError({
          code: "invalid_json",
          operation: "decodeOperationalAnchors",
          path: file.path,
          line: lineNumber,
          detail: "blank JSONL records are not allowed",
        }),
      );
    }
    const value = yield* parseJson(line, {
      operation: "decodeOperationalAnchors",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: OperationalAnchorRowSchema,
      value,
      operation: "decodeOperationalAnchors",
      path: file.path,
      line: lineNumber,
    });
    yield* validateRowSemantics(row, { path: file.path, line: lineNumber });
    const previousLine = anchorLines.get(row.anchor_id);
    if (previousLine !== undefined) {
      return yield* Effect.fail(
        importError({
          code: "duplicate_anchor_id",
          operation: "decodeOperationalAnchors",
          path: file.path,
          line: lineNumber,
          detail: `anchor_id ${row.anchor_id} already appeared on line ${previousLine}`,
        }),
      );
    }
    anchorLines.set(row.anchor_id, lineNumber);
    rows.push(row);
  }
  return rows.toSorted((left, right) => left.anchor_id.localeCompare(right.anchor_id));
});

const decodeOperationalAnchorSummary = Effect.fn("MtaWikiOperationalAnchors.decodeSummary")(
  function* (file: VerifiedReleaseFile) {
    const text = yield* decodeUtf8(file.bytes, {
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
    const value = yield* parseJson(text, {
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
    return yield* decodeStrict({
      schema: OperationalAnchorSummarySchema,
      value,
      operation: "decodeOperationalAnchorSummary",
      path: file.path,
    });
  },
);

const decodeOperationalAnchorReviewSnapshot = Effect.fn(
  "MtaWikiOperationalAnchors.decodeReviewSnapshot",
)(function* (
  file: VerifiedReleaseFile,
  version: 1 | 2,
): Generator<
  Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>,
  OperationalAnchorReviewSnapshot,
  never
> {
  const text = yield* decodeUtf8(file.bytes, {
    operation: "decodeOperationalAnchorReviewSnapshot",
    path: file.path,
  });
  const value = yield* parseJson(text, {
    operation: "decodeOperationalAnchorReviewSnapshot",
    path: file.path,
  });
  if (version === OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION) {
    return yield* decodeStrict({
      schema: OperationalAnchorReviewSnapshotV1Schema,
      value,
      operation: "decodeOperationalAnchorReviewSnapshotV1",
      path: file.path,
    });
  }
  return yield* decodeStrict({
    schema: OperationalAnchorReviewSnapshotV2Schema,
    value,
    operation: "decodeOperationalAnchorReviewSnapshotV2",
    path: file.path,
  });
});

const decodeRouteIdentitySnapshot = Effect.fn(
  "MtaWikiOperationalAnchors.decodeRouteIdentitySnapshot",
)(function* (file: VerifiedReleaseFile) {
  const text = yield* decodeUtf8(file.bytes, {
    operation: "decodeRouteIdentitySnapshot",
    path: file.path,
  });
  const value = yield* parseJson(text, {
    operation: "decodeRouteIdentitySnapshot",
    path: file.path,
  });
  const snapshot = yield* decodeStrict({
    schema: MtaWikiRouteIdentitySnapshotSchema,
    value,
    operation: "decodeRouteIdentitySnapshot",
    path: file.path,
  });
  if (text !== `${canonicalJson(snapshot)}\n`) {
    return yield* Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "decodeRouteIdentitySnapshot",
        path: file.path,
        detail: "route identity snapshot must use canonical stable JSON bytes followed by LF",
      }),
    );
  }
  yield* Effect.try({
    try: () => assertMtaWikiRouteIdentitySnapshotSelfIntegrity(snapshot),
    catch: (cause) =>
      importError({
        code: "semantic_mismatch",
        operation: "decodeRouteIdentitySnapshot",
        path: file.path,
        detail: String(cause),
      }),
  });
  return snapshot;
});

const requiredReviewEvidenceRoles = [
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
] as const;

function rowMatchesReviewDecision(
  row: OperationalAnchorRow,
  decision: OperationalAnchorReviewSnapshot["decisions"][number],
): boolean {
  return (
    row.scope_resolution === "reviewed_inherited" &&
    row.event_record_id === decision.event_record_id &&
    row.route_record_ids.includes(decision.route_record_id) &&
    row.treatment_record_ids.includes(decision.treatment_record_id) &&
    row.candidate_operational_date_normalized === decision.expected_operational_date &&
    row.candidate_operational_date_precision === decision.expected_date_precision
  );
}

const validateOperationalAnchorReviewSnapshot = Effect.fn(
  "MtaWikiOperationalAnchors.validateReviewSnapshot",
)(function* (input: {
  snapshot: OperationalAnchorReviewSnapshot;
  rows: readonly OperationalAnchorRow[];
  path: string;
}) {
  const fail = (detail: string) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchorReviewSnapshot",
        path: input.path,
        detail,
      }),
    );
  if (input.snapshot.decision_count !== input.snapshot.decisions.length) {
    return yield* fail(
      `decision_count ${input.snapshot.decision_count} does not match ${input.snapshot.decisions.length} decisions`,
    );
  }
  const decisionIds = input.snapshot.decisions.map((decision) => decision.decision_id);
  if (new Set(decisionIds).size !== decisionIds.length) {
    return yield* fail("review snapshot contains duplicate decision_id values");
  }
  if (decisionIds.join("\n") !== decisionIds.toSorted().join("\n")) {
    return yield* fail("review snapshot decisions must be sorted by decision_id");
  }

  for (const decision of input.snapshot.decisions) {
    const datePattern =
      decision.expected_date_precision === "day" ? /^\d{4}-\d{2}-\d{2}$/u : /^\d{4}-\d{2}$/u;
    if (!datePattern.test(decision.expected_operational_date)) {
      return yield* fail(
        `${decision.decision_id} expected_operational_date disagrees with expected_date_precision`,
      );
    }
    if (!isUtcInstant(decision.accepted_at)) {
      return yield* fail(`${decision.decision_id} accepted_at is not an ISO-8601 UTC instant`);
    }
    const roles = new Set(decision.evidence_bindings.map((binding) => binding.role));
    for (const role of requiredReviewEvidenceRoles) {
      if (!roles.has(role)) {
        return yield* fail(`${decision.decision_id} is missing evidence role ${role}`);
      }
    }
    if (decision.evidence_bindings.some((binding) => binding.source_id !== decision.source_id)) {
      return yield* fail(`${decision.decision_id} contains a cross-source evidence binding`);
    }
    const matchingRows = input.rows.filter((row) => rowMatchesReviewDecision(row, decision));
    if (matchingRows.length !== 1) {
      return yield* fail(
        `${decision.decision_id} must bind exactly one exported anchor row; matched ${matchingRows.length}`,
      );
    }
  }

  for (const row of input.rows) {
    const usesReviewedScope =
      row.route_scope_resolution === "reviewed_inherited" ||
      row.treatment_scope_resolution === "reviewed_inherited" ||
      row.scope_resolution === "reviewed_inherited";
    if (
      usesReviewedScope &&
      !input.snapshot.decisions.some((decision) => rowMatchesReviewDecision(row, decision))
    ) {
      return yield* fail(
        `reviewed-inherited anchor ${row.anchor_id} has no matching accepted review decision`,
      );
    }
  }
  return undefined;
});

type OperationalAnchorRetirementClosure = {
  readonly routeIdentitySnapshotId: string;
  readonly routeIdentitySnapshotFile: VerifiedReleaseFile;
  readonly retirementSourceFiles: VerifiedReleaseFile[];
  readonly retiredReviewDecisionFiles: VerifiedReleaseFile[];
  readonly retiredDecisionIds: string[];
};

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || (values[index - 1] ?? "") < value)
  );
}

function isUtcInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function sameFileMetadata(
  left: { bytes: number; sha256: string },
  right: { bytes: number; sha256: string },
): boolean {
  return left.bytes === right.bytes && left.sha256 === right.sha256;
}

function sourceProjection(
  source: OperationalProjectionRetirementSource,
  target: OperationalProjectionRetirementSource["anchor_review_decisions"][number],
  sourceFile: VerifiedReleaseFile,
): OperationalAnchorReviewRetirementProjection {
  return {
    retirement_id: source.retirement_id,
    retirement_source: {
      release_path: sourceFile.pointer,
      bytes: sourceFile.metadata.bytes,
      sha256: sourceFile.metadata.sha256,
    },
    accepted_by: source.accepted_by,
    accepted_at: source.accepted_at,
    rationale: source.rationale,
    route_identity_snapshot_id: source.route_identity_snapshot_id,
    route_identity_snapshot_sha256: source.route_identity_snapshot_sha256,
    binding: source.binding,
    target: {
      review_contract: target.review_contract,
      decision_id: target.decision_id,
      projection_state: target.projection_state,
      reason_code: target.reason_code,
      original_artifact: {
        release_path: `review-retirements/operational-anchor/${target.decision_id}.json`,
        bytes: target.original_artifact.bytes,
        sha256: target.original_artifact.sha256,
      },
    },
  };
}

const validateOperationalAnchorRetirementClosure = Effect.fn(
  "MtaWikiOperationalAnchors.validateRetirementClosure",
)(function* (input: {
  manifest: ReleaseManifestV5;
  snapshot: OperationalAnchorReviewSnapshotV2;
  rows: readonly OperationalAnchorRow[];
  routeIdentitySnapshot: MtaWikiRouteIdentitySnapshot;
  routeIdentitySnapshotFile: VerifiedReleaseFile;
  releaseDirectory: string;
  canonicalReleaseDirectory: string;
}): Generator<
  Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>,
  OperationalAnchorRetirementClosure,
  never
> {
  const fail = (detail: string, path = input.routeIdentitySnapshotFile.path) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalAnchorRetirementClosure",
        path,
        detail,
      }),
    );
  if (
    input.snapshot.decision_count !== input.snapshot.decisions.length ||
    input.snapshot.retirement_count !== input.snapshot.retirements.length ||
    input.snapshot.source_decision_count !==
      input.snapshot.decision_count + input.snapshot.retirement_count
  ) {
    return yield* fail(
      "review-v2 active, retired, and source decision denominators do not reconcile",
    );
  }
  if (input.snapshot.retirement_count === 0) {
    return yield* fail("review-v2 requires at least one manifest-addressed retirement");
  }
  const activeDecisionIds = input.snapshot.decisions.map((decision) => decision.decision_id);
  const retiredDecisionIds = input.snapshot.retirements.map(
    (retirement) => retirement.target.decision_id,
  );
  if (!isSortedUnique(retiredDecisionIds)) {
    return yield* fail("retirements must be sorted and unique by target decision_id");
  }
  if (retiredDecisionIds.some((decisionId) => activeDecisionIds.includes(decisionId))) {
    return yield* fail("active and retired anchor review decision ids must be disjoint");
  }
  const expectedArchivePaths = retiredDecisionIds.map(
    (decisionId) => `review-retirements/operational-anchor/${decisionId}.json`,
  );
  const declaredArchivePaths = Object.keys(input.manifest.files)
    .filter((path) => path.startsWith("review-retirements/operational-anchor/"))
    .toSorted();
  if (canonicalJson(declaredArchivePaths) !== canonicalJson(expectedArchivePaths)) {
    return yield* fail(
      "manifest anchor retirement archives must exactly equal the review-v2 retirement targets",
    );
  }

  const routeSnapshotSha256 = input.routeIdentitySnapshotFile.metadata.sha256;
  if (
    input.routeIdentitySnapshot.record_binding_count !==
      input.routeIdentitySnapshot.record_bindings.length ||
    input.routeIdentitySnapshot.record_bindings_sha256 !==
      sha256(new TextEncoder().encode(canonicalJsonl(input.routeIdentitySnapshot.record_bindings)))
  ) {
    return yield* fail("route identity snapshot record binding count or digest is stale");
  }
  const routeBindingIds = input.routeIdentitySnapshot.record_bindings.map(
    (binding) => binding.route_record_id,
  );
  if (!isSortedUnique(routeBindingIds)) {
    return yield* fail("route identity snapshot bindings must be sorted and unique");
  }

  const sourceFiles = new Map<string, VerifiedReleaseFile>();
  const sourceReceipts = new Map<string, OperationalProjectionRetirementSource>();
  const seenSourceAnchorTargets = new Map<string, Set<string>>();
  const archivedFiles: VerifiedReleaseFile[] = [];
  for (const projection of input.snapshot.retirements) {
    const decisionId = projection.target.decision_id;
    if (!isUtcInstant(projection.accepted_at)) {
      return yield* fail(`${decisionId}: accepted_at must be an ISO-8601 UTC instant`);
    }
    if (
      projection.binding.source_route_id !== projection.binding.gtfs_route_id ||
      !isSortedUnique(projection.binding.ineligibility_reasons) ||
      !projection.binding.ineligibility_reasons.includes("catalog_not_in_effect")
    ) {
      return yield* fail(
        `${decisionId}: retirement binding must preserve an exact nonprojectable catalog identity`,
      );
    }
    const expectedSourcePath = `review-retirements/source/${projection.retirement_id}.json`;
    const expectedArchivePath = `review-retirements/operational-anchor/${decisionId}.json`;
    if (
      projection.retirement_source.release_path !== expectedSourcePath ||
      projection.target.original_artifact.release_path !== expectedArchivePath
    ) {
      return yield* fail(`${decisionId}: retirement archive paths do not match their exact ids`);
    }
    const sourceMetadata = input.manifest.files[expectedSourcePath];
    const archiveMetadata = input.manifest.files[expectedArchivePath];
    if (
      sourceMetadata === undefined ||
      archiveMetadata === undefined ||
      !sameFileMetadata(sourceMetadata, projection.retirement_source) ||
      !sameFileMetadata(archiveMetadata, projection.target.original_artifact)
    ) {
      return yield* fail(
        `${decisionId}: retirement bytes and hashes are not exactly manifest-pinned`,
      );
    }

    let sourceFile = sourceFiles.get(expectedSourcePath);
    let source = sourceReceipts.get(expectedSourcePath);
    if (sourceFile === undefined || source === undefined) {
      sourceFile = yield* verifyReleaseFile({
        releaseDirectory: input.releaseDirectory,
        canonicalReleaseDirectory: input.canonicalReleaseDirectory,
        pointer: expectedSourcePath,
        metadata: sourceMetadata,
        operation: "verifyOperationalAnchorRetirementSource",
      });
      const sourceText = yield* decodeUtf8(sourceFile.bytes, {
        operation: "decodeOperationalAnchorRetirementSource",
        path: sourceFile.path,
      });
      const sourceValue = yield* parseJson(sourceText, {
        operation: "decodeOperationalAnchorRetirementSource",
        path: sourceFile.path,
      });
      source = yield* decodeStrict({
        schema: OperationalProjectionRetirementSourceSchema,
        value: sourceValue,
        operation: "decodeOperationalAnchorRetirementSource",
        path: sourceFile.path,
      });
      if (sourceText !== `${canonicalJson(source)}\n`) {
        return yield* fail(
          `${source.retirement_id}: retirement source must use canonical stable JSON bytes followed by LF`,
          sourceFile.path,
        );
      }
      const sourceAnchorIds = source.anchor_review_decisions.map((target) => target.decision_id);
      const sourceOccurrenceIds = source.occurrence_review_decisions.map(
        (target) => target.decision_id,
      );
      if (
        source.retirement_id !== projection.retirement_id ||
        !isUtcInstant(source.accepted_at) ||
        source.anchor_review_decisions.length + source.occurrence_review_decisions.length === 0 ||
        !isSortedUnique(sourceAnchorIds) ||
        !isSortedUnique(sourceOccurrenceIds)
      ) {
        return yield* fail(
          `${source.retirement_id}: invalid or incomplete retirement source`,
          sourceFile.path,
        );
      }
      for (const target of source.anchor_review_decisions) {
        if (
          target.original_artifact.artifact_path !==
          `data/operational-anchor-review/accepted/decisions/${target.decision_id}.json`
        ) {
          return yield* fail(
            `${target.decision_id}: source anchor decision path is not exact`,
            sourceFile.path,
          );
        }
      }
      for (const target of source.occurrence_review_decisions) {
        if (
          target.original_artifact.artifact_path !==
            `data/operational-occurrence-review/accepted/decisions/${target.decision_id}.json` ||
          !isSortedUnique(target.pinned_gtfs_route_ids)
        ) {
          return yield* fail(
            `${target.decision_id}: source occurrence retirement identity is not exact`,
            sourceFile.path,
          );
        }
      }
      sourceFiles.set(expectedSourcePath, sourceFile);
      sourceReceipts.set(expectedSourcePath, source);
    }
    const sourceTarget = source.anchor_review_decisions.find(
      (target) => target.decision_id === decisionId,
    );
    if (
      sourceTarget === undefined ||
      canonicalJson(sourceProjection(source, sourceTarget, sourceFile)) !==
        canonicalJson(projection)
    ) {
      return yield* fail(
        `${decisionId}: review-v2 retirement projection differs from its source receipt`,
        sourceFile.path,
      );
    }
    const seen = seenSourceAnchorTargets.get(expectedSourcePath) ?? new Set<string>();
    seen.add(decisionId);
    seenSourceAnchorTargets.set(expectedSourcePath, seen);

    const archivedFile = yield* verifyReleaseFile({
      releaseDirectory: input.releaseDirectory,
      canonicalReleaseDirectory: input.canonicalReleaseDirectory,
      pointer: expectedArchivePath,
      metadata: archiveMetadata,
      operation: "verifyRetiredOperationalAnchorReviewDecision",
    });
    const archivedText = yield* decodeUtf8(archivedFile.bytes, {
      operation: "decodeRetiredOperationalAnchorReviewDecision",
      path: archivedFile.path,
    });
    const archivedValue = yield* parseJson(archivedText, {
      operation: "decodeRetiredOperationalAnchorReviewDecision",
      path: archivedFile.path,
    });
    const archivedDecision = yield* decodeStrict({
      schema: OperationalAnchorReviewDecisionSchema,
      value: archivedValue,
      operation: "decodeRetiredOperationalAnchorReviewDecision",
      path: archivedFile.path,
    });
    if (
      archivedDecision.decision_id !== decisionId ||
      archivedDecision.route_record_id !== projection.binding.route_record_id ||
      input.rows.some((row) => row.anchor_id === `operational-reviewed:${decisionId}`)
    ) {
      return yield* fail(
        `${decisionId}: retired decision identity disagrees with its archive or remains active`,
        archivedFile.path,
      );
    }
    archivedFiles.push(archivedFile);

    if (
      projection.route_identity_snapshot_id !== input.routeIdentitySnapshot.gtfs_snapshot_id ||
      projection.route_identity_snapshot_sha256 !== routeSnapshotSha256
    ) {
      return yield* fail(`${decisionId}: retirement addresses another route identity snapshot`);
    }
    const routeBinding = input.routeIdentitySnapshot.record_bindings.find(
      (binding) => binding.route_record_id === projection.binding.route_record_id,
    );
    // route_binding_sha256 commits the accepted decision JSONL row. The release snapshot contains
    // its typed projection, not those source bytes, so compare every projected identity field here
    // while preserving the already schema-validated decision receipt verbatim.
    if (
      routeBinding === undefined ||
      !("decision_id" in routeBinding) ||
      routeBinding.decision_id !== projection.binding.route_binding_decision_id ||
      routeBinding.dataset_id !== projection.binding.dataset_id ||
      routeBinding.source_route_id !== projection.binding.source_route_id ||
      routeBinding.gtfs_route_id !== projection.binding.gtfs_route_id ||
      routeBinding.projectable !== false ||
      routeBinding.decision_kind !== "current_ineligible" ||
      canonicalJson(routeBinding.ineligibility_reasons) !==
        canonicalJson(projection.binding.ineligibility_reasons)
    ) {
      return yield* fail(`${decisionId}: retirement binding differs from the route snapshot`);
    }
  }

  for (const [sourcePath, source] of sourceReceipts) {
    const expected = source.anchor_review_decisions.map((target) => target.decision_id);
    const actual = [...(seenSourceAnchorTargets.get(sourcePath) ?? [])].toSorted();
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      return yield* fail(
        `${source.retirement_id}: anchor review snapshot does not close every source anchor target`,
        sourceFiles.get(sourcePath)?.path,
      );
    }
  }
  return {
    routeIdentitySnapshotId: input.routeIdentitySnapshot.gtfs_snapshot_id,
    routeIdentitySnapshotFile: input.routeIdentitySnapshotFile,
    retirementSourceFiles: [...sourceFiles.values()].toSorted((left, right) =>
      left.pointer.localeCompare(right.pointer),
    ),
    retiredReviewDecisionFiles: archivedFiles.toSorted((left, right) =>
      left.pointer.localeCompare(right.pointer),
    ),
    retiredDecisionIds,
  };
});

function recomputedProducerSummary(
  rows: readonly OperationalAnchorRow[],
  source: OperationalAnchorSummary,
): OperationalAnchorSummary {
  const expanded = "broad_funnel" in source;
  const broadRows = expanded
    ? rows.filter((row) => row.anchor_id.startsWith("operational:"))
    : rows;
  const reviewedRows = expanded
    ? rows.filter((row) => row.anchor_id.startsWith("operational-reviewed:"))
    : [];
  const dated = broadRows.filter((row) => row.candidate_operational_date_normalized !== null);
  const realized = dated.filter((row) => row.temporal_role === "realized_operational");
  const precise = realized.filter(
    (row) =>
      row.candidate_operational_date_precision === "day" ||
      row.candidate_operational_date_precision === "month",
  );
  const routeResolved = precise.filter(
    (row) =>
      row.gtfs_route_ids.length === 1 &&
      (row.route_scope_resolution === "direct" ||
        row.route_scope_resolution === "reviewed_inherited"),
  );
  const treatmentResolved = routeResolved.filter(
    (row) =>
      row.treatment_record_ids.length === 1 &&
      (row.treatment_scope_resolution === "direct" ||
        row.treatment_scope_resolution === "reviewed_inherited"),
  );
  const evidenceComplete = treatmentResolved.filter((row) =>
    Object.values(row.evidence_coverage).every(Boolean),
  );
  const conflictFree = evidenceComplete.filter((row) => row.conflict_states.length === 0);
  const base = {
    schema_version: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
    row_count: rows.length,
    study_eligible_count: rows.filter((row) => row.study_eligible).length,
    counts_by_temporal_role: countBy(rows.map((row) => row.temporal_role)),
    counts_by_scope_resolution: countBy(rows.map((row) => row.scope_resolution)),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
  } as const;
  if (!expanded) {
    return {
      ...base,
      funnel: {
        canonical_events: source.funnel.canonical_events,
        timeline_linked_operational_events: rows.length,
        candidate_operational_date_present: dated.length,
        realized_operational: realized.length,
        realized_day_or_month: precise.length,
        resolved_route_scope: routeResolved.length,
        resolved_treatment_scope: treatmentResolved.length,
        evidence_complete: evidenceComplete.length,
        conflict_free: conflictFree.length,
        study_eligible: rows.filter((row) => row.study_eligible).length,
      },
    };
  }

  const distinctOperationalEventCount = new Set(broadRows.map((row) => row.event_record_id)).size;
  const operationalFamilyEventCount = source.funnel.operational_family_events_total;
  const broadFunnel = {
    operational_family_events_total: operationalFamilyEventCount,
    timeline_linked_distinct_events: distinctOperationalEventCount,
    unlinked_operational_events: operationalFamilyEventCount - distinctOperationalEventCount,
    candidate_operational_date_present: dated.length,
    realized_operational: realized.length,
    realized_day_or_month: precise.length,
    resolved_route_scope: routeResolved.length,
    resolved_treatment_scope: treatmentResolved.length,
    evidence_complete: evidenceComplete.length,
    conflict_free: conflictFree.length,
    study_eligible: broadRows.filter((row) => row.study_eligible).length,
  } as const;
  return {
    ...base,
    broad_row_count: broadRows.length,
    reviewed_row_count: reviewedRows.length,
    distinct_operational_event_count: distinctOperationalEventCount,
    study_eligible_reviewed_count: reviewedRows.filter((row) => row.study_eligible).length,
    entry_gate: source.entry_gate,
    broad_funnel: broadFunnel,
    funnel: {
      canonical_events: source.funnel.canonical_events,
      ...broadFunnel,
      timeline_linked_operational_events: broadRows.length,
    },
  };
}

function validateProducerSummary(
  rows: readonly OperationalAnchorRow[],
  summary: OperationalAnchorSummary,
  manifest: ReleaseManifest,
  path: string,
): Effect.Effect<void, MtaWikiOperationalAnchorImportError> {
  // biome-ignore lint/complexity/useLiteralKeys: record_counts is a string-indexed manifest map.
  const manifestEventCount = manifest.record_counts["event"];
  if (manifestEventCount === undefined) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: "manifest record_counts is missing event",
      }),
    );
  }
  if (manifestEventCount !== summary.funnel.canonical_events) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: `manifest event count ${manifestEventCount} disagrees with summary canonical event count ${summary.funnel.canonical_events}`,
      }),
    );
  }
  if (summary.funnel.canonical_events < rows.length) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: "funnel.canonical_events is smaller than the operational anchor row count",
      }),
    );
  }
  if (
    "broad_funnel" in summary &&
    (summary.broad_row_count + summary.reviewed_row_count !== summary.row_count ||
      summary.funnel.operational_family_events_total <
        summary.funnel.timeline_linked_distinct_events)
  ) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: "expanded producer summary row partition or operational-event funnel is invalid",
      }),
    );
  }
  const expected = recomputedProducerSummary(rows, summary);
  if (canonicalJson(expected) !== canonicalJson(summary)) {
    return Effect.fail(
      importError({
        code: "summary_mismatch",
        operation: "validateOperationalAnchorSummary",
        path,
        detail: `producer summary does not match its rows; expected ${canonicalJson(expected)}`,
      }),
    );
  }
  return Effect.void;
}

function normalizedPrecision(
  value: string,
): "day" | "month" | "year" | "range" | "season" | "unknown" {
  if (
    value === "day" ||
    value === "month" ||
    value === "year" ||
    value === "range" ||
    value === "season"
  ) {
    return value;
  }
  return "unknown";
}

function sourceStatedStatus(row: OperationalAnchorRow): SourceStatedStatus {
  if (row.temporal_role === "realized_operational") return "done";
  if (row.temporal_role === "planned_operational") return "committed_future";
  return "unknown";
}

function dateBasis(row: OperationalAnchorRow): OperationalDateBasis {
  if (row.temporal_role === "realized_operational") return "source_stated_complete";
  if (row.temporal_role === "planned_operational") return "source_stated_plan";
  return "not_operational";
}

function validationState(row: OperationalAnchorRow): OperationalDateValidationState {
  if (row.candidate_operational_date_normalized === null) return "operational_without_date";
  if (row.temporal_role === "realized_operational") {
    return "source_stated_operational_date";
  }
  if (row.temporal_role === "planned_operational") {
    return "source_stated_planned_date";
  }
  return "non_operational_milestone";
}

function routeResolutionTier(row: OperationalAnchorRow): string | null {
  if (row.route_scope_resolution === "direct") return "direct_event_text";
  if (row.route_scope_resolution === "reviewed_inherited") {
    return "source_single_route_context";
  }
  return null;
}

function evidenceRef(ref: OperationalAnchorRow["evidence_refs"][number]): unknown {
  return {
    recordId: ref.record_id,
    sourceId: ref.source_id,
    ...(ref.evidence_id === null ? {} : { evidenceId: ref.evidence_id }),
    ...(ref.block_id === null ? {} : { blockId: ref.block_id }),
    ...(ref.page_number === null ? {} : { pageNumber: ref.page_number }),
    ...(ref.text_sha256 === null ? {} : { blockHash: ref.text_sha256 }),
    roleRaw: ref.role,
  };
}

function evidenceComplete(assertion: WikiOperationalDateAssertion): boolean {
  return (
    assertion.evidenceCoverage.event &&
    assertion.evidenceCoverage.timeline &&
    assertion.evidenceCoverage.routeScope &&
    assertion.evidenceCoverage.treatmentScope
  );
}

function locallyEligible(assertion: WikiOperationalDateAssertion): boolean {
  return computeCausalAnchorEligibility({
    producerStudyEligible: assertion.producerStudyEligible,
    trustedOperationalDate: assertion.trustedOperationalDate,
    isRealizedOnset: assertion.isRealizedOnset,
    eventFamily: assertion.familyRaw,
    dateRole: assertion.dateRole,
    lifecyclePhase: assertion.lifecyclePhase,
    normalizedPrecision: assertion.normalizedPrecision,
    routeCount: assertion.routeIds.length,
    treatmentCount: assertion.treatmentRecordIds.length,
    treatmentFamilyCount: assertion.treatmentFamilies.length,
    routeScopeResolution: assertion.routeScopeResolution,
    treatmentScopeResolution: assertion.treatmentScopeResolution,
    scopeResolution: assertion.scopeResolution,
    evidenceComplete: evidenceComplete(assertion),
    conflictCount: assertion.conflictStates.length,
    exclusionCount: assertion.exclusionReasons.length,
    reviewState: assertion.reviewState,
    truthStatuses: assertion.truthStatuses,
    sourceAuthority: assertion.sourceAuthority,
  });
}

function localRejectionReasons(assertion: WikiOperationalDateAssertion): string[] {
  const reasons: string[] = [];
  const resolved = (value: WikiOperationalDateAssertion["scopeResolution"]): boolean =>
    value === "direct" || value === "reviewed_inherited";
  if (!assertion.producerStudyEligible) reasons.push("producer_ineligible");
  if (!assertion.trustedOperationalDate) reasons.push("untrusted_operational_date");
  if (!assertion.isRealizedOnset || assertion.dateRole !== "realized_operational") {
    reasons.push("non_realized_operational_date");
  }
  if (assertion.familyRaw !== "implementation" && assertion.familyRaw !== "launch") {
    reasons.push("unsupported_operational_event_family");
  }
  if (!isRealizedOperationalLifecyclePhase(assertion.lifecyclePhase)) {
    reasons.push("ambiguous_lifecycle_phase");
  }
  if (assertion.normalizedPrecision !== "day" && assertion.normalizedPrecision !== "month") {
    reasons.push("imprecise_operational_date");
  }
  if (assertion.routeIds.length !== 1) reasons.push("route_count_not_one");
  if (assertion.treatmentRecordIds.length !== 1) reasons.push("treatment_count_not_one");
  if (assertion.treatmentFamilies.length !== 1) reasons.push("treatment_family_count_not_one");
  if (!resolved(assertion.routeScopeResolution)) reasons.push("unresolved_route_scope");
  if (!resolved(assertion.treatmentScopeResolution)) reasons.push("unresolved_treatment_scope");
  if (!resolved(assertion.scopeResolution)) reasons.push("unresolved_combined_scope");
  if (!evidenceComplete(assertion)) reasons.push("incomplete_evidence");
  if (assertion.conflictStates.length > 0) reasons.push("conflict_present");
  if (assertion.exclusionReasons.length > 0) reasons.push("exclusion_present");
  if (assertion.reviewState === "quarantined") reasons.push("quarantined_record");
  if (
    assertion.truthStatuses.length === 0 ||
    assertion.truthStatuses.some((status) => status !== "source_stated")
  ) {
    reasons.push("non_source_stated_evidence");
  }
  if (assertion.sourceAuthority !== "official_public_agency") {
    reasons.push("untrusted_source_authority");
  }
  reasons.push(...assertion.exclusionReasons.map((reason) => `producer:${reason}`));
  return uniqueSorted(reasons);
}

function assertionDedupeKey(row: OperationalAnchorRow): string {
  return canonicalJson({
    operationalChangeId: row.operational_change_id,
    candidateDate: row.candidate_operational_date_normalized,
    candidatePrecision: row.candidate_operational_date_precision,
    candidateDates: uniqueSorted(row.candidate_operational_dates_normalized),
    statusAsOfDates: uniqueSorted(row.status_as_of_dates),
    routeRecordIds: uniqueSorted(row.route_record_ids),
    unmatchedRouteRecordIds: uniqueSorted(row.unmatched_route_record_ids),
    gtfsRouteIds: uniqueSorted(row.gtfs_route_ids),
    treatmentRecordIds: uniqueSorted(row.treatment_record_ids),
    treatmentFamilies: uniqueSorted(row.treatment_families),
    projectRecordIds: uniqueSorted(row.project_record_ids),
    subjectRecordIds: uniqueSorted(row.subject_record_ids),
    temporalRole: row.temporal_role,
    eventFamily: row.event_family,
    lifecyclePhase: row.lifecycle_phase,
    assertionStatuses: uniqueSorted(row.assertion_statuses),
    truthStatus: row.truth_status,
    truthStatuses: uniqueSorted(row.truth_statuses),
    reviewState: row.review_state,
    sourceAuthority: row.source_authority,
    routeScopeResolution: row.route_scope_resolution,
    treatmentScopeResolution: row.treatment_scope_resolution,
    scopeResolution: row.scope_resolution,
    conflictStates: uniqueSorted(row.conflict_states),
    evidenceCoverage: row.evidence_coverage,
    exclusionReasons: uniqueSorted(row.exclusion_reasons),
    producerStudyEligible: row.study_eligible,
  });
}

const adaptRow = Effect.fn("MtaWikiOperationalAnchors.adaptRow")(function* (input: {
  row: OperationalAnchorRow;
  release: ReleaseManifest;
  manifestSha256: string;
  anchorFile: VerifiedReleaseFile;
}) {
  const row = input.row;
  const precision = normalizedPrecision(row.candidate_operational_date_precision);
  const parsed = parseOperationalDate(
    row.candidate_operational_date_normalized ?? row.candidate_operational_date_raw,
  );
  const routeTier = routeResolutionTier(row);
  const trustedOperationalDate =
    row.candidate_operational_date_normalized !== null &&
    row.source_authority === "official_public_agency" &&
    row.truth_statuses.length > 0 &&
    row.truth_statuses.every((status) => status === "source_stated");
  const classificationReasons = uniqueSorted([
    `producer temporal role: ${row.temporal_role}`,
    ...(row.study_eligible ? [] : ["producer marked this anchor ineligible"]),
    ...row.exclusion_reasons.map((reason) => `producer exclusion: ${reason}`),
  ]);

  const assertionValue: unknown = {
    surfaceId: row.anchor_id,
    sourceId: row.source_id,
    sourceTitle: null,
    sourceGroup: null,
    displayLabel: null,
    eventName: null,
    treatmentText: row.treatment_families.length === 0 ? null : row.treatment_families.join(", "),
    locationText: null,
    operationalDate:
      row.candidate_operational_date_raw ?? row.candidate_operational_date_normalized,
    datePrecision: row.candidate_operational_date_precision,
    statusRaw: row.assertion_statuses.length === 0 ? null : row.assertion_statuses.join(","),
    familyRaw: row.event_family,
    subtypeRaw: row.lifecycle_phase,
    eventKind: row.event_family,
    interventionFamily: row.treatment_families[0] ?? "unknown",
    sourceStatedStatus: sourceStatedStatus(row),
    dateBasis: dateBasis(row),
    validationState: validationState(row),
    trustedOperationalDate,
    classificationReasons,
    evidenceRefs: row.evidence_refs.map(evidenceRef),
    effectiveDateStart: parsed.effectiveDateStart,
    effectiveDateEnd: parsed.effectiveDateEnd,
    implementationMonth:
      precision === "day" || precision === "month" ? parsed.implementationMonth : null,
    normalizedPrecision: precision,
    isRealizedOnset: row.temporal_role === "realized_operational",
    routeIds: uniqueSorted(row.gtfs_route_ids),
    routeIdentityValidationState:
      row.gtfs_route_ids.length === 1 && row.unmatched_route_record_ids.length === 0
        ? "confirmed_in_current_gtfs"
        : row.gtfs_route_ids.length === 0
          ? "unresolved"
          : "ambiguous",
    routeResolutionTier: routeTier,
    interventionId: row.operational_change_id,
    evidenceSourceIds: uniqueSorted(row.source_ids),
    sourceCount: uniqueSorted(row.source_ids).length,
    confidence: operationalDateConfidence({
      dateBasis: dateBasis(row),
      normalizedPrecision: precision,
      routeResolutionTier: routeTier,
    }),
    causalAnchorEligible: false,
    producer: "mta-wiki",
    producerSchemaVersion: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
    producerStudyEligible: row.study_eligible,
    operationalChangeId: row.operational_change_id,
    dateRole: row.temporal_role,
    lifecyclePhase: row.lifecycle_phase,
    routeScopeResolution: row.route_scope_resolution,
    treatmentScopeResolution: row.treatment_scope_resolution,
    scopeResolution: row.scope_resolution,
    treatmentRecordIds: uniqueSorted(row.treatment_record_ids),
    treatmentFamilies: uniqueSorted(row.treatment_families),
    conflictStates: uniqueSorted(row.conflict_states),
    exclusionReasons: uniqueSorted(row.exclusion_reasons),
    evidenceCoverage: {
      event: row.evidence_coverage.event,
      timeline: row.evidence_coverage.timeline,
      routeScope: row.evidence_coverage.route_scope,
      treatmentScope: row.evidence_coverage.treatment_scope,
    },
    candidateOperationalDatesNormalized: uniqueSorted(row.candidate_operational_dates_normalized),
    statusAsOfDates: uniqueSorted(row.status_as_of_dates),
    assertionStatuses: uniqueSorted(row.assertion_statuses),
    truthStatus: row.truth_status,
    truthStatuses: uniqueSorted(row.truth_statuses),
    reviewState: row.review_state,
    sourceAuthority: row.source_authority,
    sourcePublishers: uniqueSorted(row.source_publishers),
    wikiReleaseId: input.release.release_id,
    wikiGeneratorCommit: input.release.generator_commit,
    wikiManifestSha256: input.manifestSha256,
    wikiAnchorArtifactPath: input.anchorFile.pointer,
    wikiAnchorArtifactSha256: input.anchorFile.metadata.sha256,
    wikiAnchorId: row.anchor_id,
    wikiAnchorIds: [row.anchor_id],
    wikiEventRecordId: row.event_record_id,
    wikiTimelineRelationRecordIds: uniqueSorted(row.timeline_relation_record_ids),
    wikiProjectRecordIds: uniqueSorted(row.project_record_ids),
    wikiSubjectRecordIds: uniqueSorted(row.subject_record_ids),
    wikiRouteRecordIds: uniqueSorted(row.route_record_ids),
    wikiUnmatchedRouteRecordIds: uniqueSorted(row.unmatched_route_record_ids),
    wikiSourceIds: uniqueSorted(row.source_ids),
  };
  const provisional = yield* decodeStrict({
    schema: WikiOperationalDateAssertionSchema,
    value: assertionValue,
    operation: "adaptOperationalAnchor",
    path: input.anchorFile.path,
  });
  const assertion = yield* decodeStrict({
    schema: WikiOperationalDateAssertionSchema,
    value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
    operation: "adaptOperationalAnchor",
    path: input.anchorFile.path,
  });
  return {
    assertion,
    candidateDate: row.candidate_operational_date_normalized,
    dedupeKey: assertionDedupeKey(row),
  } satisfies AdaptedAssertion;
});

function evidenceRefKey(ref: WikiOperationalDateAssertion["evidenceRefs"][number]): string {
  return canonicalJson(ref);
}

const mergeExactDuplicates = Effect.fn("MtaWikiOperationalAnchors.mergeExactDuplicates")(function* (
  entries: readonly AdaptedAssertion[],
): Generator<Effect.Effect<unknown, MtaWikiOperationalAnchorImportError>, DedupeResult, never> {
  const groups = new Map<string, AdaptedAssertion[]>();
  for (const entry of entries) {
    const group = groups.get(entry.dedupeKey) ?? [];
    group.push(entry);
    groups.set(entry.dedupeKey, group);
  }

  const assertions: AdaptedAssertion[] = [];
  let duplicateGroupCount = 0;
  let duplicateRowCount = 0;
  for (const [dedupeKey, unsortedGroup] of [...groups.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const group = unsortedGroup.toSorted((left, right) =>
      left.assertion.wikiAnchorId.localeCompare(right.assertion.wikiAnchorId),
    );
    const first = group[0];
    if (first === undefined) continue;
    if (group.length > 1) {
      duplicateGroupCount += 1;
      duplicateRowCount += group.length - 1;
    }
    const base = first.assertion;
    const anchorIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiAnchorIds));
    const sourceIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiSourceIds));
    const primarySourceIds = uniqueSorted(group.map((entry) => entry.assertion.sourceId));
    const refsByKey = new Map<string, WikiOperationalDateAssertion["evidenceRefs"][number]>();
    for (const ref of group.flatMap((entry) => entry.assertion.evidenceRefs)) {
      refsByKey.set(evidenceRefKey(ref), ref);
    }
    const mergedValue: unknown = {
      ...base,
      surfaceId: anchorIds[0] ?? base.surfaceId,
      sourceId: primarySourceIds[0] ?? base.sourceId,
      classificationReasons: uniqueSorted(
        group.flatMap((entry) => entry.assertion.classificationReasons),
      ),
      evidenceRefs: [...refsByKey.entries()]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([, ref]) => ref),
      evidenceSourceIds: sourceIds,
      sourceCount: sourceIds.length,
      sourcePublishers: uniqueSorted(group.flatMap((entry) => entry.assertion.sourcePublishers)),
      wikiAnchorId: anchorIds[0] ?? base.wikiAnchorId,
      wikiAnchorIds: anchorIds,
      wikiTimelineRelationRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiTimelineRelationRecordIds),
      ),
      wikiProjectRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiProjectRecordIds),
      ),
      wikiSubjectRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiSubjectRecordIds),
      ),
      wikiRouteRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiRouteRecordIds),
      ),
      wikiUnmatchedRouteRecordIds: uniqueSorted(
        group.flatMap((entry) => entry.assertion.wikiUnmatchedRouteRecordIds),
      ),
      wikiSourceIds: sourceIds,
    };
    const provisional = yield* decodeStrict({
      schema: WikiOperationalDateAssertionSchema,
      value: mergedValue,
      operation: "mergeExactOperationalAnchors",
      path: base.wikiAnchorArtifactPath,
    });
    const assertion = yield* decodeStrict({
      schema: WikiOperationalDateAssertionSchema,
      value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
      operation: "mergeExactOperationalAnchors",
      path: base.wikiAnchorArtifactPath,
    });
    assertions.push({ assertion, candidateDate: first.candidateDate, dedupeKey });
  }
  return {
    assertions: assertions.toSorted((left, right) =>
      left.assertion.surfaceId.localeCompare(right.assertion.surfaceId),
    ),
    duplicateGroupCount,
    duplicateRowCount,
  };
});

const quarantineCrossDateGroups = Effect.fn("MtaWikiOperationalAnchors.quarantineCrossDateGroups")(
  function* (entries: readonly AdaptedAssertion[]) {
    const byChange = new Map<string, AdaptedAssertion[]>();
    for (const entry of entries) {
      const group = byChange.get(entry.assertion.operationalChangeId) ?? [];
      group.push(entry);
      byChange.set(entry.assertion.operationalChangeId, group);
    }
    const output: AdaptedAssertion[] = [];
    const conflicts: Array<typeof OperationalAnchorConflictSchema.Type> = [];
    for (const [operationalChangeId, group] of [...byChange.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const dates = [...new Set(group.map((entry) => entry.candidateDate))].toSorted(
        (left, right) => (left ?? "").localeCompare(right ?? ""),
      );
      if (dates.length <= 1) {
        output.push(...group);
        continue;
      }
      const anchorIds = uniqueSorted(group.flatMap((entry) => entry.assertion.wikiAnchorIds));
      conflicts.push({
        operationalChangeId,
        anchorIds,
        candidateOperationalDates: dates,
        reason: "cross_anchor_date_conflict",
      });
      for (const entry of group) {
        const provisional = yield* decodeStrict({
          schema: WikiOperationalDateAssertionSchema,
          value: {
            ...entry.assertion,
            causalAnchorEligible: false,
            conflictStates: uniqueSorted([...entry.assertion.conflictStates, "date_conflict"]),
            exclusionReasons: uniqueSorted([
              ...entry.assertion.exclusionReasons,
              "conflicting_date_evidence",
            ]),
            classificationReasons: uniqueSorted([
              ...entry.assertion.classificationReasons,
              "local quarantine: operational change has conflicting dates across anchors",
            ]),
          },
          operation: "quarantineCrossDateOperationalAnchors",
          path: entry.assertion.wikiAnchorArtifactPath,
        });
        const assertion = yield* decodeStrict({
          schema: WikiOperationalDateAssertionSchema,
          value: { ...provisional, causalAnchorEligible: locallyEligible(provisional) },
          operation: "quarantineCrossDateOperationalAnchors",
          path: entry.assertion.wikiAnchorArtifactPath,
        });
        output.push({ ...entry, assertion });
      }
    }
    return {
      assertions: output.toSorted((left, right) =>
        left.assertion.surfaceId.localeCompare(right.assertion.surfaceId),
      ),
      conflicts,
    };
  },
);

const buildImportArtifact = Effect.fn("MtaWikiOperationalAnchors.buildImportArtifact")(
  function* (input: {
    manifest: ReleaseManifest;
    manifestSha256: string;
    anchorFile: VerifiedReleaseFile;
    summaryFile: VerifiedReleaseFile;
    reviewDecisionFile: VerifiedReleaseFile;
    reviewSnapshot: OperationalAnchorReviewSnapshot;
    retirementClosure: OperationalAnchorRetirementClosure | null;
    producerSummary: OperationalAnchorSummary;
    rows: readonly OperationalAnchorRow[];
  }) {
    const adapted: AdaptedAssertion[] = [];
    for (const row of input.rows) {
      adapted.push(
        yield* adaptRow({
          row,
          release: input.manifest,
          manifestSha256: input.manifestSha256,
          anchorFile: input.anchorFile,
        }),
      );
    }
    const deduped = yield* mergeExactDuplicates(adapted);
    const quarantined = yield* quarantineCrossDateGroups(deduped.assertions);
    const assertions = quarantined.assertions.map((entry) => entry.assertion);
    const rejections = assertions
      .filter((assertion) => !assertion.causalAnchorEligible)
      .map((assertion) => ({
        operationalChangeId: assertion.operationalChangeId,
        anchorIds: assertion.wikiAnchorIds,
        reasonCodes: localRejectionReasons(assertion),
      }))
      .toSorted(
        (left, right) =>
          left.operationalChangeId.localeCompare(right.operationalChangeId) ||
          (left.anchorIds[0] ?? "").localeCompare(right.anchorIds[0] ?? ""),
      );
    const countsByRejectionReason = countBy(rejections.flatMap((entry) => entry.reasonCodes));
    const resultBody = {
      producerSummary: input.producerSummary,
      summary: {
        sourceRowCount: input.rows.length,
        assertionCount: assertions.length,
        eligibleAssertionCount: assertions.filter((assertion) => assertion.causalAnchorEligible)
          .length,
        rejectedAssertionCount: rejections.length,
        rejectedAnchorCount: rejections.reduce((sum, entry) => sum + entry.anchorIds.length, 0),
        exactDuplicateGroupCount: deduped.duplicateGroupCount,
        exactDuplicateRowCount: deduped.duplicateRowCount,
        crossDateConflictGroupCount: quarantined.conflicts.length,
        countsByRejectionReason,
      },
      assertions,
      rejections,
      conflicts: quarantined.conflicts,
    };
    const commonSourceRelease = {
      releaseId: input.manifest.release_id,
      generatorCommit: input.manifest.generator_commit,
      manifestPath: releaseArtifactPath(input.manifest.release_id, "manifest.json"),
      manifestSha256: input.manifestSha256,
      operationalAnchorContractVersion: OPERATIONAL_ANCHOR_CONTRACT_VERSION,
      anchors: importedReleaseFile(input.anchorFile, input.manifest.release_id),
      summary: importedReleaseFile(input.summaryFile, input.manifest.release_id),
      reviewDecisions: importedReleaseFile(input.reviewDecisionFile, input.manifest.release_id),
      reviewDecisionCount: input.reviewSnapshot.decision_count,
    };
    const artifactValue: unknown =
      input.manifest.manifest_version === MANIFEST_VERSION
        ? {
            artifactKind: "bp.studio.mta_wiki_operational_date_assertions.v2",
            schemaVersion: 2,
            sourceRelease: {
              ...commonSourceRelease,
              manifestVersion: MANIFEST_VERSION,
              operationalAnchorReviewDecisionContractVersion:
                OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION,
            },
            ...resultBody,
          }
        : input.retirementClosure === null || input.reviewSnapshot.snapshot_version !== 2
          ? yield* Effect.fail(
              importError({
                code: "semantic_mismatch",
                operation: "buildImportArtifact",
                path: input.reviewDecisionFile.path,
                detail: "manifest-v5 requires a verified review-v2 retirement closure",
              }),
            )
          : {
              artifactKind: "bp.studio.mta_wiki_operational_date_assertions.v3",
              schemaVersion: 3,
              sourceRelease: {
                ...commonSourceRelease,
                manifestVersion: MANIFEST_VERSION_V5,
                operationalAnchorReviewDecisionContractVersion:
                  OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2,
                routeIdentitySnapshotContractVersion: 1,
                routeIdentitySnapshotId: input.retirementClosure.routeIdentitySnapshotId,
                routeIdentitySnapshot: importedReleaseFile(
                  input.retirementClosure.routeIdentitySnapshotFile,
                  input.manifest.release_id,
                ),
                sourceReviewDecisionCount: input.reviewSnapshot.source_decision_count,
                retirementCount: input.reviewSnapshot.retirement_count,
                retiredDecisionIds: input.retirementClosure.retiredDecisionIds,
                retirementSources: input.retirementClosure.retirementSourceFiles.map((file) =>
                  importedReleaseFile(file, input.manifest.release_id),
                ),
                retiredReviewDecisions: input.retirementClosure.retiredReviewDecisionFiles.map(
                  (file) => importedReleaseFile(file, input.manifest.release_id),
                ),
              },
              ...resultBody,
            };
    return yield* decodeStrict({
      schema: MtaWikiOperationalAnchorImportArtifactSchema,
      value: artifactValue,
      operation: "buildImportArtifact",
      path: input.anchorFile.path,
    });
  },
);

export const importMtaWikiOperationalAnchors = Effect.fn("importMtaWikiOperationalAnchors")(
  function* (input: ImportMtaWikiOperationalAnchorsInput) {
    const { releaseDirectory, canonicalReleaseDirectory } = yield* resolveReleaseDirectory(input);
    const manifestPath = yield* safeReleaseFilePath({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: "manifest.json",
      operation: "readManifest",
    });
    const manifestBytes = yield* readBytes(manifestPath, "readManifest");
    const actualManifestSha256 = sha256(manifestBytes);
    if (actualManifestSha256 !== input.wikiManifestSha256) {
      return yield* Effect.fail(
        importError({
          code: "hash_mismatch",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `expected ${input.wikiManifestSha256}, received ${actualManifestSha256}`,
        }),
      );
    }
    const quarantineStatus = yield* readMtaWikiReleaseQuarantineStatus({
      mtaWikiRoot: input.mtaWikiRoot,
      wikiRelease: input.wikiRelease,
      wikiManifestSha256: actualManifestSha256,
    }).pipe(
      Effect.mapError((error) =>
        importError({
          code: error.code,
          operation: error.operation,
          path: error.path,
          line: error.line,
          detail: error.detail,
        }),
      ),
    );
    if (quarantineStatus !== null) {
      return yield* Effect.fail(
        importError({
          code: "contract_incompatible",
          operation: "verifyReleaseStatus",
          path: manifestPath,
          detail: `MTA Wiki release ${input.wikiRelease} is quarantined (${quarantineStatus.reasonCode}): ${quarantineStatus.reason}`,
        }),
      );
    }
    const manifestText = yield* decodeUtf8(manifestBytes, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifestValue = yield* parseJson(manifestText, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifestVersion =
      typeof manifestValue === "object" && manifestValue !== null && !Array.isArray(manifestValue)
        ? (manifestValue as { manifest_version?: unknown }).manifest_version
        : undefined;
    let manifest: ReleaseManifest;
    if (manifestVersion === MANIFEST_VERSION) {
      manifest = yield* decodeStrict({
        schema: ReleaseManifestV2Schema,
        value: manifestValue,
        operation: "decodeManifest",
        path: manifestPath,
      });
    } else if (manifestVersion === MANIFEST_VERSION_V5) {
      manifest = yield* decodeStrict({
        schema: ReleaseManifestV5Schema,
        value: manifestValue,
        operation: "decodeManifestV5",
        path: manifestPath,
      });
    } else {
      return yield* Effect.fail(
        importError({
          code: "schema_mismatch",
          operation: "decodeManifest",
          path: manifestPath,
          detail: `unsupported manifest_version ${String(manifestVersion)}; expected 2 or 5`,
        }),
      );
    }
    if (manifest.release_id !== input.wikiRelease) {
      return yield* Effect.fail(
        importError({
          code: "release_mismatch",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `expected release_id ${input.wikiRelease}, received ${manifest.release_id}`,
        }),
      );
    }
    const operationalPointers = [
      manifest.pointers.operational_anchors,
      manifest.pointers.operational_anchor_summary,
      manifest.pointers.operational_anchor_review_decisions,
    ];
    if (new Set(operationalPointers).size !== operationalPointers.length) {
      return yield* Effect.fail(
        importError({
          code: "invalid_input",
          operation: "verifyManifest",
          path: manifestPath,
          detail:
            "operational anchor, summary, and review-decision pointers must be different files",
        }),
      );
    }

    const anchorMetadata = manifest.files[manifest.pointers.operational_anchors];
    if (anchorMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchors}`,
        }),
      );
    }
    const summaryMetadata = manifest.files[manifest.pointers.operational_anchor_summary];
    if (summaryMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchor_summary}`,
        }),
      );
    }
    const reviewDecisionMetadata =
      manifest.files[manifest.pointers.operational_anchor_review_decisions];
    if (reviewDecisionMetadata === undefined) {
      return yield* Effect.fail(
        importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${manifest.pointers.operational_anchor_review_decisions}`,
        }),
      );
    }
    const anchorFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchors,
      metadata: anchorMetadata,
      operation: "verifyOperationalAnchors",
    });
    const summaryFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchor_summary,
      metadata: summaryMetadata,
      operation: "verifyOperationalAnchorSummary",
    });
    const reviewDecisionFile = yield* verifyReleaseFile({
      releaseDirectory,
      canonicalReleaseDirectory,
      pointer: manifest.pointers.operational_anchor_review_decisions,
      metadata: reviewDecisionMetadata,
      operation: "verifyOperationalAnchorReviewDecisions",
    });
    let routeIdentitySnapshotFile: VerifiedReleaseFile | null = null;
    let routeIdentitySnapshot: MtaWikiRouteIdentitySnapshot | null = null;
    if (manifest.manifest_version === MANIFEST_VERSION_V5) {
      const routeIdentityMetadata = manifest.files[manifest.pointers.route_identity_snapshot];
      if (routeIdentityMetadata === undefined) {
        return yield* Effect.fail(
          importError({
            code: "missing_manifest_file",
            operation: "verifyManifest",
            path: manifestPath,
            detail: `files is missing ${manifest.pointers.route_identity_snapshot}`,
          }),
        );
      }
      routeIdentitySnapshotFile = yield* verifyReleaseFile({
        releaseDirectory,
        canonicalReleaseDirectory,
        pointer: manifest.pointers.route_identity_snapshot,
        metadata: routeIdentityMetadata,
        operation: "verifyRouteIdentitySnapshot",
      });
      routeIdentitySnapshot = yield* decodeRouteIdentitySnapshot(routeIdentitySnapshotFile);
    }
    const rows = yield* decodeOperationalAnchorRows(anchorFile);
    if (routeIdentitySnapshot !== null) {
      try {
        assertActiveAnchorRouteProjections(rows, routeIdentitySnapshot);
      } catch (cause) {
        return yield* Effect.fail(
          importError({
            code: "semantic_mismatch",
            operation: "validateActiveAnchorRouteProjections",
            path: routeIdentitySnapshotFile?.path ?? anchorFile.path,
            detail: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      }
    }
    const producerSummary = yield* decodeOperationalAnchorSummary(summaryFile);
    const reviewSnapshot = yield* decodeOperationalAnchorReviewSnapshot(
      reviewDecisionFile,
      manifest.manifest_version === MANIFEST_VERSION
        ? OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION
        : OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2,
    );
    yield* validateProducerSummary(rows, producerSummary, manifest, summaryFile.path);
    yield* validateOperationalAnchorReviewSnapshot({
      snapshot: reviewSnapshot,
      rows,
      path: reviewDecisionFile.path,
    });
    const retirementClosure =
      manifest.manifest_version === MANIFEST_VERSION_V5 &&
      reviewSnapshot.snapshot_version === OPERATIONAL_ANCHOR_REVIEW_SNAPSHOT_VERSION_V2 &&
      routeIdentitySnapshotFile !== null &&
      routeIdentitySnapshot !== null
        ? yield* validateOperationalAnchorRetirementClosure({
            manifest,
            snapshot: reviewSnapshot,
            rows,
            routeIdentitySnapshot,
            routeIdentitySnapshotFile,
            releaseDirectory,
            canonicalReleaseDirectory,
          })
        : null;
    const artifact = yield* buildImportArtifact({
      manifest,
      manifestSha256: actualManifestSha256,
      anchorFile,
      summaryFile,
      reviewDecisionFile,
      reviewSnapshot,
      retirementClosure,
      producerSummary,
      rows,
    });

    const files = yield* PipelineFileSystemService;
    yield* files
      .writeText({
        command: COMMAND,
        operation: "writeImportArtifact",
        path: input.output,
        contents: artifactJson(artifact),
      })
      .pipe(
        Effect.mapError((cause) =>
          importError({
            code: "write_failed",
            operation: "writeImportArtifact",
            path: input.output,
            detail: String(cause),
          }),
        ),
      );
    return artifact;
  },
);

export function runMtaWikiOperationalAnchorImport(
  input: ImportMtaWikiOperationalAnchorsInput,
): Promise<MtaWikiOperationalAnchorImportArtifact> {
  return runPipelineEffect(importMtaWikiOperationalAnchors(input), PipelineFileSystemLayer);
}
