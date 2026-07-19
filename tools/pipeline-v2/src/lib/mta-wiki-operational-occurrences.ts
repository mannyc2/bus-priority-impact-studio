import {
  type MtaWikiOperationalOccurrenceImportArtifact,
  MtaWikiOperationalOccurrenceImportArtifactV3Schema,
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
  MtaWikiOperationalOccurrenceImportArtifactV5Schema,
  type OperationalOccurrenceEvidenceBinding,
  OperationalOccurrenceEvidenceBindingSchema,
  type OperationalOccurrenceEvidenceBindingV2,
  type OperationalOccurrenceReviewDecision,
  type OperationalOccurrenceReviewDecisionV1Rc22Inspection,
  type OperationalOccurrenceReviewRetirementProjection,
  type OperationalOccurrenceReviewSnapshot,
  OperationalOccurrenceReviewSnapshotSchema,
  type OperationalOccurrenceReviewSnapshotV1Rc22Inspection,
  OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema,
  OperationalOccurrenceReviewSnapshotV1Schema,
  type OperationalOccurrenceRow,
  type OperationalOccurrenceRowAny,
  OperationalOccurrenceRowSchema,
  type OperationalOccurrenceRowV2,
  OperationalOccurrenceRowV2Schema,
  type OperationalOccurrenceSummary,
  OperationalOccurrenceSummarySchema,
  type OperationalOccurrenceSummaryV2,
  OperationalOccurrenceSummaryV2Schema,
} from "@bp/domain/documents/operational-occurrence";
import { Effect, Schema } from "effect";
import { PipelineFileSystemLayer, PipelineFileSystemService } from "../effect/file-system.ts";
import { runPipelineEffect } from "../effect/runtime.ts";
import {
  decodeMtaWikiReleaseUtf8,
  isSafeMtaWikiReleaseRelativePath,
  type MtaWikiReleaseVerificationError,
  type ResolvedMtaWikiRelease,
  readMtaWikiReleaseBytes,
  readMtaWikiReleaseQuarantineStatus,
  resolveMtaWikiRelease,
  safeMtaWikiReleaseFilePath,
  sha256Bytes,
  type VerifiedMtaWikiReleaseFile,
  verifyMtaWikiReleaseFile,
} from "./mta-wiki-release.ts";
import {
  assertMtaWikiRouteIdentitySnapshotSelfIntegrity,
  type MtaWikiRouteAnchorV1,
  MtaWikiRouteAnchorV1Schema,
  type MtaWikiRouteIdentitySnapshot,
  MtaWikiRouteIdentitySnapshotSchema,
  projectableGtfsRouteIdForRecord,
  reconstructedRouteAnchors,
} from "./mta-wiki-route-identities.ts";

export type { MtaWikiOperationalOccurrenceImportArtifact } from "@bp/domain/documents/operational-occurrence";

const COMMAND = "studio.import-mta-wiki-operational-occurrences";
const MANIFEST_VERSION_V3 = 3;
const MANIFEST_VERSION_V4 = 4;
const MANIFEST_VERSION_V5 = 5;
const OPERATIONAL_ANCHOR_CONTRACT_VERSION = 1;
const OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION = 1;
const OPERATIONAL_OCCURRENCE_CONTRACT_VERSION_V1 = 1;
const OPERATIONAL_OCCURRENCE_CONTRACT_VERSION_V2 = 2;
const OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION = 1;
const OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION_V2 = 2;
const RELATIONSHIP_INTEGRITY_BUNDLE_CONTRACT_VERSION = 1;
const ROUTE_ANCHOR_CONTRACT_VERSION = 1;
const ROUTE_IDENTITY_CONTRACT_VERSION = 1;

function assertActiveOccurrenceRouteProjections(
  rows: readonly OperationalOccurrenceRowV2[],
  snapshot: MtaWikiRouteIdentitySnapshot,
): void {
  for (const row of rows) {
    for (const route of row.routes) {
      const expectedGtfsRouteId = projectableGtfsRouteIdForRecord(snapshot, route.route_record_id);
      if (route.gtfs_route_id !== expectedGtfsRouteId) {
        throw new Error(
          `operational occurrence ${row.occurrence_id}: route ${route.route_record_id} ` +
            `uses ${route.gtfs_route_id}, expected ${expectedGtfsRouteId}`,
        );
      }
    }
  }
}
const REVIEW_V1_EVIDENCE_ROLES = new Set([
  "bundle_analysis_family",
  "event_date",
  "route_identity",
  "route_scope",
  "route_treatment_event_bridge",
  "timeline_relation",
  "treatment_definition",
  "treatment_scope",
]);
const REVIEW_V2_ONLY_LINEAGE_EVIDENCE_ROLES = new Set(["phase_relation", "physical_scope"]);
const REQUIRED_RELATIONSHIP_GATE_IDS = [
  "bus_lane_acquisition_linkage",
  "determinism_and_consumer_proof",
  "occurrence_treatment_physicality",
  "payload_reference_integrity",
  "referential_type_evidence_integrity",
  "relationship_completeness",
  "semantic_remediation",
] as const;
const RELATIONSHIP_INVARIANT_ROLE_PATHS = [
  { role: "canonical_relations", path: "data/canonical/relations.jsonl" },
  {
    role: "determinism_consumer_summary",
    path: "data/quality/relationship-integrity/determinism-consumer/summary.json",
  },
  {
    role: "final_endpoint_matrix",
    path: "data/contracts/relationships/v1/post-remediation-endpoint-matrix.json",
  },
  { role: "reviewed_release_manifest", path: "data/exports/releases/v1-rc21/manifest.json" },
] as const;
const RELATIONSHIP_REFRESH_ROLE_PATHS = [
  { role: "canonical_db", path: "data/canonical.db" },
  {
    role: "graph_audit_findings",
    path: "data/quality/relationship-integrity/graph-audit/findings.jsonl",
  },
  {
    role: "graph_audit_manifest",
    path: "data/quality/relationship-integrity/graph-audit/manifest.json",
  },
  {
    role: "graph_audit_summary",
    path: "data/quality/relationship-integrity/graph-audit/summary.json",
  },
  {
    role: "linkage_materialization_summary",
    path: "data/quality/relationship-integrity/bus-lane-acquisition/linkage-materialization/summary.json",
  },
  {
    role: "sql_integrity_summary",
    path: "data/quality/relationship-integrity/sql-integrity/summary.json",
  },
] as const;
const RELATIONSHIP_GATE_SOURCE_PATHS: Readonly<
  Record<(typeof REQUIRED_RELATIONSHIP_GATE_IDS)[number], readonly { role: string; path: string }[]>
> = {
  bus_lane_acquisition_linkage: [
    {
      role: "acquisition_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/summary.json",
    },
    {
      role: "linkage_materialization_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/linkage-materialization/summary.json",
    },
    {
      role: "linkage_reconciliation_summary",
      path: "data/quality/relationship-integrity/bus-lane-acquisition/linkage-reconciliation/summary.json",
    },
  ],
  determinism_and_consumer_proof: [
    {
      role: "determinism_consumer_summary",
      path: "data/quality/relationship-integrity/determinism-consumer/summary.json",
    },
  ],
  occurrence_treatment_physicality: [
    {
      role: "occurrence_treatment_physicality_summary",
      path: "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json",
    },
    {
      role: "phase_review_summary",
      path: "data/quality/relationship-integrity/operational-occurrence-phases/summary.json",
    },
  ],
  payload_reference_integrity: [
    {
      role: "payload_reference_summary",
      path: "data/quality/relationship-integrity/payload-references/summary.json",
    },
  ],
  referential_type_evidence_integrity: [
    {
      role: "graph_audit_findings",
      path: "data/quality/relationship-integrity/graph-audit/findings.jsonl",
    },
    {
      role: "graph_audit_manifest",
      path: "data/quality/relationship-integrity/graph-audit/manifest.json",
    },
    {
      role: "graph_audit_summary",
      path: "data/quality/relationship-integrity/graph-audit/summary.json",
    },
    {
      role: "sql_integrity_summary",
      path: "data/quality/relationship-integrity/sql-integrity/summary.json",
    },
  ],
  relationship_completeness: [
    {
      role: "relationship_completeness_summary",
      path: "data/quality/relationship-integrity/completeness/summary.json",
    },
  ],
  semantic_remediation: [
    {
      role: "semantic_remediation_summary",
      path: "data/quality/relationship-integrity/semantic-remediation/summary.json",
    },
  ],
};

export const RELATIONSHIP_CONTRACT_POLICY_V1 = {
  identity_policy: {
    canonical_endpoint_required: true,
    ambiguous_alias_resolution: "reject",
    superseded_endpoint_resolution: "rewrite_to_survivor",
    local_id_scope: "source",
  },
  evidence_policy: {
    minimum_refs_per_relation: 1,
    block_identity_required: true,
    hash_required: true,
    broad_same_page_block_threshold: 5,
  },
  finding_codes: {
    REL_ENDPOINT_DANGLING: { default_severity: "error", enforcement_eligible: true },
    REL_ENDPOINT_LOCAL_ONLY: { default_severity: "error", enforcement_eligible: true },
    REL_ENDPOINT_LOCAL_MISMATCH: { default_severity: "warning", enforcement_eligible: true },
    REL_ENDPOINT_SUPERSEDED: { default_severity: "error", enforcement_eligible: true },
    REL_ALIAS_AMBIGUOUS: { default_severity: "warning", enforcement_eligible: true },
    REL_CONTRACT_RULE_MISSING: { default_severity: "error", enforcement_eligible: true },
    REL_ENDPOINT_TYPE_INVALID: { default_severity: "error", enforcement_eligible: true },
    REL_FAMILY_TYPE_SUSPECT: { default_severity: "warning", enforcement_eligible: true },
    REL_FAMILY_TYPE_SUSPECT_REVIEWED: {
      default_severity: "warning",
      enforcement_eligible: false,
    },
    REL_DERIVATION_DANGLING: { default_severity: "error", enforcement_eligible: true },
    REL_EVIDENCE_MISSING: { default_severity: "error", enforcement_eligible: true },
    REL_EVIDENCE_UNRESOLVED: { default_severity: "error", enforcement_eligible: true },
    REL_EVIDENCE_OVERBROAD: { default_severity: "warning", enforcement_eligible: true },
    REL_DUPLICATE_IDENTITY: { default_severity: "warning", enforcement_eligible: true },
    REL_CONFLICTING_EDGE: { default_severity: "warning", enforcement_eligible: true },
    REL_MERGED_EDGE_CONFLICT: { default_severity: "warning", enforcement_eligible: true },
    REL_SOURCE_ID_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_SOURCE_ID_AMBIGUOUS: { default_severity: "warning", enforcement_eligible: true },
    REL_ORPHAN_RECORD: { default_severity: "info", enforcement_eligible: false },
    REL_REQUIRED_ROUTE_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_REQUIRED_TREATMENT_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_REQUIRED_SEGMENT_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_REQUIRED_ONSET_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_REQUIRED_PHASE_MISSING: { default_severity: "warning", enforcement_eligible: true },
    REL_REQUIRED_DISPOSITION_MISSING: {
      default_severity: "warning",
      enforcement_eligible: true,
    },
  },
  completeness_roles: {
    study_projectable_operational_occurrence: {
      required_roles: [
        "occurrence_identity",
        "treatment_scope",
        "route_scope",
        "operational_onset",
        "phase_identity",
        "physical_scope_when_supported",
      ],
      disposition_allowed: true,
    },
    physical_bus_lane_treatment: {
      required_roles: [
        "corridor_or_bounded_segment",
        "official_extent_when_available",
        "authoritative_route_scope_only",
      ],
      disposition_allowed: true,
    },
    non_projectable_route_identity_selector: {
      required_roles: ["typed_route_identity_disposition", "evidence_binding"],
      disposition_allowed: true,
    },
    non_projectable_operational_event_selector: {
      required_roles: ["typed_operational_event_disposition", "evidence_binding"],
      disposition_allowed: true,
    },
    non_projectable_bus_lane_treatment_selector: {
      required_roles: ["typed_bus_lane_treatment_disposition", "evidence_binding"],
      disposition_allowed: true,
    },
  },
  migration_criteria: {
    referential_and_evidence: [
      "endpoint, canonical-identity, exact-matrix type, and evidence violations are zero",
      "every observed relation kind has a frozen exact endpoint rule",
      "repository and SQLite finding identities reconcile exactly",
      "no contract rule was relaxed to reduce a finding count",
      "every frozen-observed baseline endpoint tuple has an explicit semantic review decision before endpoint-type enforcement is declared complete",
    ],
    completeness: [
      "every in-scope record satisfies every required role or has an immutable evidence-bound reviewed non-projectable disposition",
      "a disposition always sets study_projection_eligible=false",
      "required-route, treatment, segment, onset, and phase warning counts reconcile to the disposition ledger",
    ],
    candidate_acquisition: [
      "all 321 pinned registry-only bus-lane candidates have completed acquisition receipts",
      "every evidence-supported canonical link is materialized",
      "unsupported registry projections have explicit exclusion artifacts",
      "unresolved candidates are not labeled permanently nonfixable solely because prior evidence was absent",
    ],
    determinism: [
      "warning and enforcement modes emit the same ordered finding identities",
      "two clean authoritative materializations and two public-clone SQLite rebuilds reproduce hashes",
      "all repository, schema, architecture, quality, validation, and export tests pass",
    ],
  },
} as const;

const RC22_MANIFEST_SHA256 = "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4";
const RC22_REVIEW_SHA256 = "f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed";
const RC22_REVIEW_PHYSICAL_SCOPE_DECISION_ID = "flatbush-phase1-center-running-bus-lanes-2025-09";
const RC22_REVIEW_PHYSICAL_SCOPE_RELATION_ID =
  "relation_flatbush-phase1-treatment-on-bounded-corridor-livingston-state-20260715";
const RC22_REVIEW_PHYSICAL_SCOPE_OCCURRENCE_ID = "occurrence:8c987704152b459014217d44";
const RC22_REVIEW_PHYSICAL_SCOPE_SOURCE_ID = "flatbush_ave_bus_priority_mtp_briefing_apr2026";
const RC22_REVIEW_PHYSICAL_SCOPE_EVIDENCE_ID =
  "flatbush_ave_bus_priority_mtp_briefing_apr2026#p004_c0002";

const SUPPORTED_BUNDLE_ANALYSIS_FAMILIES = new Set([
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

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const SafeIdSchema = NonEmptyStringSchema.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u));
const StringCountSchema = Schema.Record(Schema.String, NonNegativeIntegerSchema);

function isUtcInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

const ReleaseFileSchema = Schema.Struct({
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const ReleaseManifestV3Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION_V3),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION),
    operational_occurrences: Schema.Literal(OPERATIONAL_OCCURRENCE_CONTRACT_VERSION_V1),
    operational_occurrence_review_decisions: Schema.Literal(
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION,
    ),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    operational_occurrences: Schema.String,
    operational_occurrence_summary: Schema.String,
    operational_occurrence_review_decisions: Schema.String,
    route_anchors: Schema.NullOr(Schema.String),
    taxonomy: Schema.NullOr(Schema.String),
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifestV3 = typeof ReleaseManifestV3Schema.Type;

const ReleaseManifestV4Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION_V4),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literal(OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION),
    operational_occurrences: Schema.Literal(OPERATIONAL_OCCURRENCE_CONTRACT_VERSION_V2),
    operational_occurrence_review_decisions: Schema.Literal(
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION,
    ),
    relationship_integrity_bundle: Schema.Literal(RELATIONSHIP_INTEGRITY_BUNDLE_CONTRACT_VERSION),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    operational_occurrences: Schema.String,
    operational_occurrence_summary: Schema.String,
    operational_occurrence_review_decisions: Schema.String,
    relationship_integrity_bundle: Schema.String,
    route_anchors: Schema.NullOr(Schema.String),
    taxonomy: Schema.NullOr(Schema.String),
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifestV4 = typeof ReleaseManifestV4Schema.Type;

const ReleaseManifestV5Schema = Schema.Struct({
  manifest_version: Schema.Literal(MANIFEST_VERSION_V5),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(OPERATIONAL_ANCHOR_CONTRACT_VERSION),
    operational_anchor_review_decisions: Schema.Literals([
      OPERATIONAL_ANCHOR_REVIEW_CONTRACT_VERSION,
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION_V2,
    ]),
    operational_occurrences: Schema.Literal(OPERATIONAL_OCCURRENCE_CONTRACT_VERSION_V2),
    operational_occurrence_review_decisions: Schema.Literals([
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION,
      OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION_V2,
    ]),
    relationship_integrity_bundle: Schema.Literal(RELATIONSHIP_INTEGRITY_BUNDLE_CONTRACT_VERSION),
    route_anchors: Schema.Literal(ROUTE_ANCHOR_CONTRACT_VERSION),
    route_identity_snapshot: Schema.Literal(ROUTE_IDENTITY_CONTRACT_VERSION),
  }),
  record_counts: StringCountSchema,
  files: Schema.Record(Schema.String, ReleaseFileSchema),
  pointers: Schema.Struct({
    operational_anchors: Schema.String,
    operational_anchor_summary: Schema.String,
    operational_anchor_review_decisions: Schema.String,
    operational_occurrences: Schema.String,
    operational_occurrence_summary: Schema.String,
    operational_occurrence_review_decisions: Schema.String,
    relationship_integrity_bundle: Schema.String,
    route_anchors: Schema.Literal("route_anchors.jsonl"),
    route_identity_snapshot: Schema.Literal("route_identity_snapshot.json"),
    taxonomy: Schema.String,
    quality_report: Schema.NullOr(Schema.String),
  }),
});
type ReleaseManifestV5 = typeof ReleaseManifestV5Schema.Type;
type ReleaseManifest = ReleaseManifestV3 | ReleaseManifestV4 | ReleaseManifestV5;

const RetirementSourceArtifactSchema = Schema.Struct({
  artifact_path: NonEmptyStringSchema,
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
  ineligibility_reasons: Schema.Array(NonEmptyStringSchema),
});

const RetirementAnchorTargetSchema = Schema.Struct({
  review_contract: Schema.Literal("operational-anchor-review-v1"),
  decision_id: SafeIdSchema,
  projection_state: Schema.Literal("retired"),
  reason_code: Schema.Literal("route_binding_nonprojectable"),
  original_artifact: RetirementSourceArtifactSchema,
});

const RetirementOccurrenceTargetSchema = Schema.Struct({
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
  anchor_review_decisions: Schema.Array(RetirementAnchorTargetSchema),
  occurrence_review_decisions: Schema.Array(RetirementOccurrenceTargetSchema),
});
type OperationalProjectionRetirementSource =
  typeof OperationalProjectionRetirementSourceSchema.Type;

const OperationalOccurrenceAcceptedTreatmentMemberSchema = Schema.Struct({
  treatment_record_id: Schema.String,
  treatment_family: Schema.String,
  evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
});

const OperationalOccurrenceAcceptedTreatmentSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("atomic"),
    member: OperationalOccurrenceAcceptedTreatmentMemberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("bundle"),
    analysis_family: Schema.String,
    analysis_family_evidence_bindings: Schema.Array(OperationalOccurrenceEvidenceBindingSchema),
    members: Schema.Array(OperationalOccurrenceAcceptedTreatmentMemberSchema),
  }),
]);

const OperationalOccurrenceAcceptedDecisionSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  decision_id: Schema.String,
  review_state: Schema.Literal("approved"),
  accepted_at: Schema.String,
  reviewer: Schema.String,
  rationale: Schema.String,
  occurrence_id: Schema.String,
  founding_key: Schema.String,
  observation_event_record_ids: Schema.Array(Schema.String),
  observation_relation_record_ids: Schema.Array(Schema.String),
  resolved_status: Schema.Literal("realized"),
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
  treatment_scope_kind: Schema.Literals(["atomic", "bundle"]),
  treatment: OperationalOccurrenceAcceptedTreatmentSchema,
});

const RelationshipBundleArtifactSchema = Schema.Struct({
  role: Schema.String,
  source_path: Schema.String,
  release_path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});

const RelationshipIntegrityBundleSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  bundle_id: Schema.Literal("relationship-integrity-v1"),
  contract_id: Schema.Literal("relationship-contract-v1"),
  validation_mode: Schema.Literal("enforce"),
  artifact_count: NonNegativeIntegerSchema,
  descriptor: Schema.Struct({
    source_path: Schema.Literal("data/contracts/relationships/v1/release-bundle-sources.json"),
    bytes: NonNegativeIntegerSchema,
    sha256: Sha256Schema,
  }),
  artifacts: Schema.Array(RelationshipBundleArtifactSchema),
});
type RelationshipBundleArtifact = typeof RelationshipBundleArtifactSchema.Type;

const RelationshipContractSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("relationship-contract-v1"),
  contract_status: Schema.Literal("enforced"),
  enforcement_state: Schema.Literal("enforced_ready"),
  reviewed_at: Schema.String,
  reviewed_by: Schema.String,
  completeness_roles: Schema.Record(
    Schema.String,
    Schema.Struct({
      disposition_allowed: Schema.Boolean,
      required_roles: Schema.Array(Schema.String),
    }),
  ),
  endpoint_matrix: Schema.Struct({
    matrix_kind: Schema.Literal("post_remediation_reviewed"),
    new_shape_policy: Schema.Literal("error"),
    obsolete_baseline_tuple_policy: Schema.Literal("reject"),
    path: Schema.String,
    relation_count: NonNegativeIntegerSchema,
    relation_ids_sha256: Sha256Schema,
    sha256: Sha256Schema,
    tuple_count: NonNegativeIntegerSchema,
    tuple_set_sha256: Sha256Schema,
    unlisted_relation_policy: Schema.Literal("error"),
  }),
  enforcement_proof: Schema.Struct({
    path: Schema.String,
    required_gate_ids: Schema.Array(Schema.String),
    sha256: Sha256Schema,
    transition_receipt: Schema.Struct({
      path: Schema.String,
      sha256: Sha256Schema,
    }),
  }),
  evidence_policy: Schema.Struct({
    block_identity_required: Schema.Boolean,
    broad_same_page_block_threshold: NonNegativeIntegerSchema,
    hash_required: Schema.Boolean,
    minimum_refs_per_relation: NonNegativeIntegerSchema,
  }),
  finding_codes: Schema.Record(
    Schema.String,
    Schema.Struct({
      default_severity: Schema.Literals(["error", "warning", "info"]),
      enforcement_eligible: Schema.Boolean,
    }),
  ),
  identity_policy: Schema.Struct({
    ambiguous_alias_resolution: Schema.Literal("reject"),
    canonical_endpoint_required: Schema.Boolean,
    local_id_scope: Schema.Literal("source"),
    superseded_endpoint_resolution: Schema.Literal("rewrite_to_survivor"),
  }),
  migration_criteria: Schema.Record(Schema.String, Schema.Array(Schema.String)),
});
type RelationshipContract = typeof RelationshipContractSchema.Type;

const RelationshipEnforcementProofSchema = Schema.Struct({
  schema_version: Schema.Literal(2),
  proof_id: Schema.Literal("relationship-contract-v1-enforcement-proof"),
  contract_id: Schema.Literal("relationship-contract-v1"),
  proof_stage: Schema.Literal("post_promotion_enforced"),
  validation_mode: Schema.Literal("enforce"),
  proof_status: Schema.Literal("ready"),
  reviewed_at: Schema.String,
  reviewed_by: Schema.String,
  all_gates_ready: Schema.Literal(true),
  gate_count: NonNegativeIntegerSchema,
  total_violation_count: Schema.Literal(0),
  final_matrix: Schema.Struct({
    path: Schema.String,
    relation_count: NonNegativeIntegerSchema,
    relation_ids_sha256: Sha256Schema,
    sha256: Sha256Schema,
    tuple_count: NonNegativeIntegerSchema,
    tuple_set_sha256: Sha256Schema,
  }),
  gates: Schema.Array(
    Schema.Struct({
      gate_id: Schema.String,
      artifact_path: Schema.String,
      artifact_sha256: Sha256Schema,
      criteria: Schema.Array(Schema.String),
      status: Schema.Literal("ready"),
      violation_count: Schema.Literal(0),
    }),
  ),
  previous_proof: Schema.Struct({
    path: Schema.String,
    proof_stage: Schema.Literal("pre_promotion_warning"),
    sha256: Sha256Schema,
  }),
  transition_receipt: Schema.Struct({
    path: Schema.String,
    sha256: Sha256Schema,
  }),
});
type RelationshipEnforcementProof = typeof RelationshipEnforcementProofSchema.Type;

const RelationshipGraphAuditSummarySchema = Schema.Struct({
  canonical_record_count: NonNegativeIntegerSchema,
  canonical_relation_count: NonNegativeIntegerSchema,
  distinct_relation_kind_count: NonNegativeIntegerSchema,
  contract_rule_count: NonNegativeIntegerSchema,
  contract_covered_relation_count: NonNegativeIntegerSchema,
  finding_count: NonNegativeIntegerSchema,
  findings_by_code: StringCountSchema,
  findings_by_severity: StringCountSchema,
  primary_dispositions: StringCountSchema,
  orphan_records_by_kind: StringCountSchema,
  duplicate_triple_groups: NonNegativeIntegerSchema,
  duplicate_triple_records: NonNegativeIntegerSchema,
  exact_duplicate_groups: NonNegativeIntegerSchema,
  exact_duplicate_records: NonNegativeIntegerSchema,
  ambiguous_aliases: NonNegativeIntegerSchema,
  semantic_supersessions: NonNegativeIntegerSchema,
});
type RelationshipGraphAuditSummary = typeof RelationshipGraphAuditSummarySchema.Type;

const RelationshipTransitionReceiptSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  receipt_id: Schema.Literal("relationship-contract-v1-enforcement-transition"),
  contract_id: Schema.Literal("relationship-contract-v1"),
  transition: Schema.Struct({
    from_state: Schema.Literal("warning_ready"),
    to_state: Schema.Literal("enforced_refresh_required"),
  }),
  promoted_at: Schema.String,
  promoted_by: Schema.String,
  previous_proof: Schema.Struct({
    path: Schema.String,
    sha256: Sha256Schema,
    proof_stage: Schema.Literal("pre_promotion_warning"),
  }),
  previous_gates: Schema.Array(
    Schema.Struct({ gate_id: Schema.String, path: Schema.String, sha256: Sha256Schema }),
  ),
  pre_promotion_sources: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      role: Schema.String,
      sha256: Sha256Schema,
      archive_path: Schema.String,
      transition_fingerprint: Schema.optionalKey(Sha256Schema),
    }),
  ),
  refresh_artifacts: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      role: Schema.String,
      sha256: Sha256Schema,
      archive_path: Schema.optionalKey(Schema.String),
      transition_fingerprint: Schema.optionalKey(Sha256Schema),
    }),
  ),
  invariant_artifacts: Schema.Array(
    Schema.Struct({ role: Schema.String, path: Schema.String, sha256: Sha256Schema }),
  ),
  final_matrix: Schema.Struct({
    path: Schema.String,
    relation_count: NonNegativeIntegerSchema,
    relation_ids_sha256: Sha256Schema,
    sha256: Sha256Schema,
    tuple_count: NonNegativeIntegerSchema,
    tuple_set_sha256: Sha256Schema,
  }),
});

const RelationshipEndpointShapeSchema = Schema.Struct({
  subject_kind: Schema.String,
  object_kind: Schema.String,
});
const RelationshipEndpointFamilyShapeSchema = Schema.Struct({
  relation_family: Schema.String,
  subject_kind: Schema.String,
  object_kind: Schema.String,
  provenance: Schema.Literal("reviewed_post_remediation"),
  review_decision_ids: Schema.Array(Schema.String),
  relation_count: PositiveIntegerSchema,
  relation_ids_sha256: Sha256Schema,
});
const RelationshipEndpointRuleSchema = Schema.Struct({
  relation_kind: Schema.String,
  relation_families: Schema.Array(Schema.String),
  allowed_shapes: Schema.Array(RelationshipEndpointShapeSchema),
  allowed_family_shapes: Schema.Array(RelationshipEndpointFamilyShapeSchema),
  review_basis: Schema.Literal("reviewed_post_remediation"),
});
const RelationshipEndpointMatrixSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  matrix_id: Schema.Literal("relationship-contract-v1-post-remediation-final"),
  contract_id: Schema.Literal("relationship-contract-v1"),
  review_status: Schema.Literal("reviewed_post_remediation"),
  generated_from: Schema.Struct({
    projected_relations_path: Schema.Literal(
      "data/quality/relationship-integrity/semantic-remediation/projected-relations.jsonl",
    ),
    projected_relations_sha256: Sha256Schema,
    projected_relations_logical_sha256: Sha256Schema,
    projected_tuples_path: Schema.Literal(
      "data/quality/relationship-integrity/semantic-remediation/projected-tuples.json",
    ),
    projected_tuples_sha256: Sha256Schema,
    projected_tuples_logical_sha256: Sha256Schema,
    semantic_remediation_summary_path: Schema.Literal(
      "data/quality/relationship-integrity/semantic-remediation/summary.json",
    ),
    semantic_remediation_summary_sha256: Sha256Schema,
    campaign_id: Schema.Literal("relationship-semantic-remediation-v1"),
    skipped_correction_count: Schema.Literal(0),
    unmapped_relation_count: Schema.Literal(0),
  }),
  obsolete_baseline_tuple_policy: Schema.Literal("reject"),
  relation_kind_rule_count: NonNegativeIntegerSchema,
  allowed_family_shape_count: NonNegativeIntegerSchema,
  covered_relation_count: NonNegativeIntegerSchema,
  relation_ids_sha256: Sha256Schema,
  tuple_set_sha256: Sha256Schema,
  rules: Schema.Array(RelationshipEndpointRuleSchema),
});
type RelationshipEndpointMatrix = typeof RelationshipEndpointMatrixSchema.Type;

const RelationshipGraphAuditManifestSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("relationship-contract-v1"),
  contract_sha256: Sha256Schema,
  endpoint_matrix_sha256: Sha256Schema,
  canonical_relations_sha256: Sha256Schema,
  input_fingerprint: Sha256Schema,
  mode: Schema.Literal("enforce"),
  artifacts: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      sha256: Sha256Schema,
      rows: Schema.optionalKey(NonNegativeIntegerSchema),
    }),
  ),
  reproduction_commands: Schema.Array(Schema.String),
});
type RelationshipGraphAuditManifest = typeof RelationshipGraphAuditManifestSchema.Type;

const RelationshipEnforcementGateSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  artifact_id: Schema.String,
  contract_id: Schema.Literal("relationship-contract-v1"),
  gate_id: Schema.String,
  reviewed_at: Schema.String,
  reviewed_by: Schema.String,
  source_count: NonNegativeIntegerSchema,
  source_artifacts: Schema.Array(
    Schema.Struct({ role: Schema.String, path: Schema.String, sha256: Sha256Schema }),
  ),
  derived_violation_count: NonNegativeIntegerSchema,
});

const RelationshipAuditFilePinSchema = Schema.Struct({
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
  row_count: Schema.optionalKey(NonNegativeIntegerSchema),
});
type RelationshipAuditFilePin = typeof RelationshipAuditFilePinSchema.Type;

const RelationshipAuditRetirementPinSchema = Schema.Struct({
  retirement_id: SafeIdSchema,
  accepted_by: NonEmptyStringSchema,
  accepted_at: NonEmptyStringSchema,
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
  row_count: Schema.optionalKey(NonNegativeIntegerSchema),
});
type RelationshipAuditRetirementPin = typeof RelationshipAuditRetirementPinSchema.Type;
const RelationshipAuditInputPinSchema = Schema.Union([
  RelationshipAuditRetirementPinSchema,
  RelationshipAuditFilePinSchema,
]);

const OccurrenceTreatmentPhysicalityManifestSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("occurrence-treatment-physicality-v1"),
  release_id: Schema.String,
  review_stage: Schema.Literal("final_post_semantic_release"),
  input_pins: Schema.Array(RelationshipAuditInputPinSchema),
  files: Schema.Record(Schema.String, RelationshipAuditFilePinSchema),
  audit_fingerprint: Sha256Schema,
});

const OccurrenceTreatmentPhysicalitySummarySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  eligible_occurrence_count: NonNegativeIntegerSchema,
  unique_treatment_count: NonNegativeIntegerSchema,
  treatment_membership_count: NonNegativeIntegerSchema,
  classification_counts: Schema.Struct({
    physical_corridor_or_segment_intervention: NonNegativeIntegerSchema,
    nonphysical_service_operations_policy_control: NonNegativeIntegerSchema,
    point_or_stop_physical_intervention: NonNegativeIntegerSchema,
    review_required: Schema.Literal(0),
  }),
  scope_requirement_counts: Schema.Struct({
    corridor_or_segment_required: NonNegativeIntegerSchema,
    not_applicable: NonNegativeIntegerSchema,
    point_or_stop_required: NonNegativeIntegerSchema,
    review_required: Schema.Literal(0),
  }),
  occurrence_disposition_counts: Schema.Struct({
    physical_scope_satisfied: NonNegativeIntegerSchema,
    physical_scope_missing: Schema.Literal(0),
    physical_scope_relation_missing: Schema.Literal(0),
    physical_scope_evidence_missing: Schema.Literal(0),
    physical_scope_relation_invalid: Schema.Literal(0),
    physicality_review_required: Schema.Literal(0),
    physical_scope_not_applicable: NonNegativeIntegerSchema,
  }),
  finding_counts: StringCountSchema,
  review_ledger_complete: Schema.Literal(true),
  physical_scope_complete: Schema.Literal(true),
  hard_mode_ready: Schema.Literal(true),
  release_id: Schema.String,
  review_stage: Schema.Literal("final_post_semantic_release"),
  release_manifest_sha256: Schema.optionalKey(Sha256Schema),
  release_input_fingerprint: Schema.optionalKey(Sha256Schema),
  review_ledger_sha256: Sha256Schema,
  policy_sha256: Sha256Schema,
  contract_sha256: Sha256Schema,
  by_treatment_family: Schema.Record(
    Schema.String,
    Schema.Struct({
      unique_treatment_count: NonNegativeIntegerSchema,
      occurrence_membership_count: NonNegativeIntegerSchema,
      classifications: StringCountSchema,
    }),
  ),
  final_post_semantic_release_guard_ready: Schema.Literal(true),
});

const OperationalOccurrencePhaseAuditManifestSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("operational-occurrence-phase-review-v1"),
  generated_at: Schema.String,
  generated_by: Schema.String,
  route_anchor_release: Schema.Struct({
    release_id: Schema.String,
    manifest: Schema.optionalKey(RelationshipAuditFilePinSchema),
    route_anchors: RelationshipAuditFilePinSchema,
    operational_occurrences: RelationshipAuditFilePinSchema,
  }),
  input_aggregates: Schema.Record(
    Schema.String,
    Schema.Struct({
      file_count: NonNegativeIntegerSchema,
      bytes: NonNegativeIntegerSchema,
      sha256: Sha256Schema,
      path_roots: Schema.Array(Schema.String),
    }),
  ),
  derived_inputs: Schema.Struct({
    canonical_record_count: NonNegativeIntegerSchema,
    operational_occurrence_count: NonNegativeIntegerSchema,
    operational_occurrences_sha256: Sha256Schema,
    relevant_canonical_record_count: NonNegativeIntegerSchema,
    canonical_phase_projection_sha256: Sha256Schema,
  }),
  outputs: Schema.Record(Schema.String, RelationshipAuditFilePinSchema),
  reproduction_command: Schema.String,
});

const OperationalOccurrencePhaseAuditSummarySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("operational-occurrence-phase-review-v1"),
  occurrence_count: NonNegativeIntegerSchema,
  eligible_occurrence_count: NonNegativeIntegerSchema,
  ineligible_occurrence_count: NonNegativeIntegerSchema,
  phase_identity_membership_count: NonNegativeIntegerSchema,
  unique_phase_event_count: NonNegativeIntegerSchema,
  projected_phase_relation_count: NonNegativeIntegerSchema,
  checked_event_event_candidate_count: NonNegativeIntegerSchema,
  counts_by_primary_disposition: Schema.Struct({
    single_observed_phase_no_related_phase_asserted: NonNegativeIntegerSchema,
    evidence_bound_related_phases: NonNegativeIntegerSchema,
    review_required: Schema.Literal(0),
  }),
  counts_by_candidate_disposition: Schema.Struct({
    projected_reviewed_phase_relation: NonNegativeIntegerSchema,
    not_projected_external_event_not_selected: NonNegativeIntegerSchema,
    not_projected_non_phase_semantics: NonNegativeIntegerSchema,
    review_required_unprojected_same_occurrence_temporal_relation: Schema.Literal(0),
  }),
  finding_counts: StringCountSchema,
  phase_identity_complete: Schema.Literal(true),
  phase_relation_or_disposition_complete: Schema.Literal(true),
  exact_evidence_complete: Schema.Literal(true),
  hard_mode_ready: Schema.Literal(true),
  ledger_id: Schema.Literal("operational-occurrence-phase-review-ledger-v1"),
  release_id: Schema.String,
  reviewed_occurrence_count: NonNegativeIntegerSchema,
  single_observed_phase_count: NonNegativeIntegerSchema,
  related_phase_count: NonNegativeIntegerSchema,
  unresolved_phase_count: Schema.Literal(0),
  missing_evidence_count: Schema.Literal(0),
  ambiguous_phase_count: Schema.Literal(0),
  review_complete: Schema.Literal(true),
  violation_count: Schema.Literal(0),
  content_hashes: Schema.Struct({
    review_ledger_sha256: Sha256Schema,
    event_event_candidates_sha256: Sha256Schema,
    findings_sha256: Sha256Schema,
    operational_occurrences_sha256: Sha256Schema,
    canonical_phase_projection_sha256: Sha256Schema,
  }),
});

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
  "duplicate_occurrence_id",
  "semantic_mismatch",
  "contract_incompatible",
  "write_failed",
]);

export class MtaWikiOperationalOccurrenceImportError extends Schema.TaggedErrorClass<MtaWikiOperationalOccurrenceImportError>()(
  "MtaWikiOperationalOccurrenceImportError",
  {
    code: ImportErrorCodeSchema,
    operation: Schema.String,
    path: Schema.String,
    line: Schema.NullOr(PositiveIntegerSchema),
    detail: Schema.String,
  },
) {}

export type ImportMtaWikiOperationalOccurrencesInput = {
  readonly mtaWikiRoot: string;
  readonly wikiRelease: string;
  readonly wikiManifestSha256: string;
  readonly output: string;
};

function importError(input: {
  code: typeof ImportErrorCodeSchema.Type;
  operation: string;
  path: string;
  detail: string;
  line?: number | null | undefined;
}): MtaWikiOperationalOccurrenceImportError {
  return MtaWikiOperationalOccurrenceImportError.make({ ...input, line: input.line ?? null });
}

function fromReleaseError(
  error: MtaWikiReleaseVerificationError,
): MtaWikiOperationalOccurrenceImportError {
  return importError({
    code: error.code,
    operation: error.operation,
    path: error.path,
    line: error.line,
    detail: error.detail,
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
}): Effect.Effect<S["Type"], MtaWikiOperationalOccurrenceImportError> {
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function canonicalJsonl(rows: readonly unknown[]): string {
  return rows.length === 0 ? "" : `${rows.map(canonicalJson).join("\n")}\n`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function isSortedUnique(values: readonly string[]): boolean {
  return (
    values.length === new Set(values).size &&
    values.join("\n") === [...values].toSorted().join("\n")
  );
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function sameRolePaths(
  actual: readonly { readonly role: string; readonly path: string }[],
  expected: readonly { readonly role: string; readonly path: string }[],
): boolean {
  return (
    canonicalJson(actual.map(({ role, path }) => ({ role, path }))) === canonicalJson(expected)
  );
}

function relationshipTransitionFingerprint(role: string, text: string): string | null {
  try {
    if (role === "canonical_db") return null;
    if (role === "graph_audit_findings") {
      const rows = text
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const parsed = JSON.parse(line) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("graph finding is not an object");
          }
          const { severity: _severity, ...stable } = parsed as Record<string, unknown>;
          return stable;
        });
      return canonicalDigest(rows);
    }
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const value = { ...(parsed as Record<string, unknown>) };
    if (role === "graph_audit_manifest") {
      delete value["contract_sha256"];
      delete value["input_fingerprint"];
      delete value["mode"];
      delete value["reproduction_commands"];
      if (Array.isArray(value["artifacts"])) {
        value["artifacts"] = value["artifacts"].map((entry) => {
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error("graph manifest artifact is not an object");
          }
          const { sha256: _sha256, ...stable } = entry as Record<string, unknown>;
          return stable;
        });
      }
    } else if (role === "graph_audit_summary") {
      delete value["mode"];
      delete value["findings_by_severity"];
    } else if (role === "sql_integrity_summary") {
      delete value["canonical_db_sha256"];
      delete value["graph_findings_sha256"];
      delete value["graph_manifest_sha256"];
      delete value["graph_summary_sha256"];
      delete value["enforcement_mode"];
      // Producer v9 adds only the independently pinned Plan 035 route-reference tables. Retain
      // the reviewed v8 transition fingerprint while every raw v9 byte remains manifest-pinned.
      if (value["canonical_db_version"] === 9) value["canonical_db_version"] = 8;
    } else if (role === "linkage_materialization_summary") {
      delete value["canonical_db_sha256"];
    } else {
      return null;
    }
    return canonicalDigest(value);
  } catch {
    return null;
  }
}

function endpointTupleKey(
  relationKind: string,
  relationFamily: string,
  subjectKind: string,
  objectKind: string,
): string {
  return [relationKind, relationFamily, subjectKind, objectKind].join("\0");
}

function isValidFinalEndpointMatrix(matrix: RelationshipEndpointMatrix): boolean {
  if (
    matrix.relation_kind_rule_count !== matrix.rules.length ||
    !isSortedUnique(matrix.rules.map((rule) => rule.relation_kind))
  ) {
    return false;
  }
  const tuples = new Set<string>();
  let tupleCount = 0;
  let relationCount = 0;
  for (const rule of matrix.rules) {
    const shapeKeys = rule.allowed_shapes.map((shape) =>
      endpointTupleKey(rule.relation_kind, "", shape.subject_kind, shape.object_kind),
    );
    if (
      rule.relation_kind.trim() !== rule.relation_kind ||
      rule.relation_kind.length === 0 ||
      !isSortedUnique(rule.relation_families) ||
      rule.relation_families.some((family) => family.length === 0 || family.trim() !== family) ||
      rule.allowed_shapes.length === 0 ||
      new Set(shapeKeys).size !== shapeKeys.length ||
      rule.allowed_shapes.some(
        (shape) =>
          shape.subject_kind.length === 0 ||
          shape.subject_kind.trim() !== shape.subject_kind ||
          shape.object_kind.length === 0 ||
          shape.object_kind.trim() !== shape.object_kind,
      ) ||
      rule.allowed_family_shapes.length === 0
    ) {
      return false;
    }
    const tupleFamilies = new Set<string>();
    const tupleShapes = new Set<string>();
    for (const tuple of rule.allowed_family_shapes) {
      const key = endpointTupleKey(
        rule.relation_kind,
        tuple.relation_family,
        tuple.subject_kind,
        tuple.object_kind,
      );
      const shapeKey = endpointTupleKey(
        rule.relation_kind,
        "",
        tuple.subject_kind,
        tuple.object_kind,
      );
      if (
        tuples.has(key) ||
        tuple.relation_family.length === 0 ||
        tuple.relation_family.trim() !== tuple.relation_family ||
        !rule.relation_families.includes(tuple.relation_family) ||
        !shapeKeys.includes(shapeKey) ||
        tuple.review_decision_ids.length === 0 ||
        !isSortedUnique(tuple.review_decision_ids) ||
        tuple.review_decision_ids.some(
          (decisionId) => decisionId.length === 0 || decisionId.trim() !== decisionId,
        )
      ) {
        return false;
      }
      tuples.add(key);
      tupleFamilies.add(tuple.relation_family);
      tupleShapes.add(shapeKey);
      tupleCount += 1;
      relationCount += tuple.relation_count;
    }
    if (
      canonicalJson([...tupleFamilies].toSorted()) !== canonicalJson(rule.relation_families) ||
      canonicalJson([...tupleShapes].toSorted()) !== canonicalJson([...shapeKeys].toSorted())
    ) {
      return false;
    }
  }
  return (
    tupleCount === matrix.allowed_family_shape_count &&
    relationCount === matrix.covered_relation_count
  );
}

function parseJson(
  text: string,
  input: { operation: string; path: string; line?: number | null | undefined },
): Effect.Effect<unknown, MtaWikiOperationalOccurrenceImportError> {
  return Effect.try({
    try: () => JSON.parse(text),
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

function validOnset(date: string, precision: "day" | "month"): boolean {
  if (precision === "month") return /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

type AnyOccurrenceEvidenceBinding =
  | OperationalOccurrenceEvidenceBinding
  | OperationalOccurrenceEvidenceBindingV2;

function bindingKey(binding: AnyOccurrenceEvidenceBinding): string {
  return canonicalJson(binding);
}

function bindingsAreCanonicalUnique(bindings: readonly AnyOccurrenceEvidenceBinding[]): boolean {
  return new Set(bindings.map(bindingKey)).size === bindings.length;
}

function isReviewV2OnlyLineageBinding(binding: AnyOccurrenceEvidenceBinding): boolean {
  return REVIEW_V2_ONLY_LINEAGE_EVIDENCE_ROLES.has(binding.role);
}

function sortedBindingKeys(bindings: readonly AnyOccurrenceEvidenceBinding[]): string[] {
  return bindings.map(bindingKey).toSorted();
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function stringsAreNonEmptyUnique(values: readonly string[], nonempty = false): boolean {
  return (
    (!nonempty || values.length > 0) &&
    values.every(isNonEmptyString) &&
    values.length === new Set(values).size
  );
}

function treatmentReviewShape(row: OperationalOccurrenceRowAny) {
  if (row.treatment.kind === "atomic") {
    return {
      kind: "atomic",
      member: {
        treatment_record_id: row.treatment.member.treatment_record_id,
        treatment_family: row.treatment.member.treatment_family,
        evidence_bindings: row.treatment.member.evidence_bindings,
      },
    };
  }
  return {
    kind: "bundle",
    bundle_family: row.treatment.bundle_family,
    bundle_family_evidence_bindings: row.treatment.bundle_family_evidence_bindings,
    members: row.treatment.members.map((member) => ({
      treatment_record_id: member.treatment_record_id,
      treatment_family: member.treatment_family,
      evidence_bindings: member.evidence_bindings,
    })),
  };
}

function rowSemanticError(input: { path: string; line: number; detail: string }) {
  return importError({
    code: "semantic_mismatch",
    operation: "validateOperationalOccurrence",
    ...input,
  });
}

function validateOccurrenceRowBase(
  row: OperationalOccurrenceRowAny,
  input: { path: string; line: number },
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const fail = (detail: string) => Effect.fail(rowSemanticError({ ...input, detail }));
  const requiredScalars = [
    row.occurrence_id,
    row.occurrence_review_decision_id,
    row.founding_key,
    row.resolved_onset.date,
  ];
  if (
    requiredScalars.some((value) => !isNonEmptyString(value)) ||
    (row.resolution_cluster_id !== null && !isNonEmptyString(row.resolution_cluster_id))
  ) {
    return fail("occurrence identity and resolved-onset strings must be non-empty");
  }
  if (!validOnset(row.resolved_onset.date, row.resolved_onset.precision)) {
    return fail("resolved onset date disagrees with its day/month precision");
  }
  const sortedArrays: ReadonlyArray<readonly string[]> = [
    row.occurrence_aliases,
    row.resolved_onset.resolver_ids,
    row.resolved_onset.publication_dates,
    row.resolved_onset.retrieval_dates,
    row.source_ids,
    row.exclusion_reasons,
    row.provenance.anchor_review_decision_ids,
    row.provenance.event_record_ids,
    row.provenance.relation_record_ids,
    row.provenance.route_record_ids,
    row.provenance.treatment_record_ids,
  ];
  if (sortedArrays.some((values) => !isSortedUnique(values))) {
    return fail("identity, provenance, source, and exclusion arrays must be sorted and unique");
  }
  if (
    !stringsAreNonEmptyUnique(row.occurrence_aliases) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.resolver_ids, true) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.publication_dates) ||
    !stringsAreNonEmptyUnique(row.resolved_onset.retrieval_dates) ||
    !stringsAreNonEmptyUnique(row.source_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.anchor_review_decision_ids) ||
    !stringsAreNonEmptyUnique(row.provenance.event_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.relation_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.route_record_ids, true) ||
    !stringsAreNonEmptyUnique(row.provenance.treatment_record_ids, true)
  ) {
    return fail(
      "occurrence id, source, resolver, date, and provenance arrays contain empty or duplicate values",
    );
  }
  if (row.occurrence_aliases.includes(row.occurrence_id)) {
    return fail("occurrence_aliases must not contain occurrence_id");
  }
  if (row.observations.length === 0) return fail("an occurrence must contain observations");
  for (const observation of row.observations) {
    if (
      !isNonEmptyString(observation.event_record_id) ||
      !stringsAreNonEmptyUnique(observation.relation_record_ids, true) ||
      !stringsAreNonEmptyUnique(observation.document_time_statuses) ||
      !stringsAreNonEmptyUnique(observation.status_as_of_dates) ||
      observation.document_time_dates.some(
        (date) =>
          !isNonEmptyString(date.raw) ||
          !isNonEmptyString(date.normalized) ||
          !isNonEmptyString(date.precision) ||
          !isNonEmptyString(date.source_field),
      )
    ) {
      return fail(
        "observation ids, dates, statuses, and relation arrays must contain non-empty unique values",
      );
    }
  }
  if (row.routes.length === 0) return fail("an occurrence must bind at least one route");
  for (const route of row.routes) {
    if (
      !isNonEmptyString(route.route_record_id) ||
      !isNonEmptyString(route.gtfs_route_id) ||
      route.evidence_bindings.length === 0 ||
      !bindingsAreCanonicalUnique(route.evidence_bindings)
    ) {
      return fail("route identity strings must be non-empty and evidence bindings unique");
    }
  }
  const routeRecordIds = row.routes.map((route) => route.route_record_id);
  const gtfsRouteIds = row.routes.map((route) => route.gtfs_route_id);
  if (!isSortedUnique(routeRecordIds) || new Set(gtfsRouteIds).size !== gtfsRouteIds.length) {
    return fail("routes must be sorted by unique route_record_id and have unique GTFS ids");
  }
  if (canonicalJson(routeRecordIds) !== canonicalJson(row.provenance.route_record_ids)) {
    return fail("route rows disagree with provenance.route_record_ids");
  }

  const eventIds = row.observations.map((observation) => observation.event_record_id);
  if (!isSortedUnique(eventIds))
    return fail("observations must be sorted by unique event_record_id");
  if (canonicalJson(eventIds) !== canonicalJson(row.provenance.event_record_ids)) {
    return fail("observations disagree with provenance.event_record_ids");
  }
  const relationIds = uniqueSorted(
    row.observations.flatMap((observation) => observation.relation_record_ids),
  );
  if (canonicalJson(relationIds) !== canonicalJson(row.provenance.relation_record_ids)) {
    return fail("observation relations disagree with provenance.relation_record_ids");
  }

  const members = row.treatment.kind === "atomic" ? [row.treatment.member] : row.treatment.members;
  if (members.length === 0) return fail("treatment scope must contain at least one member");
  if (row.treatment.kind === "bundle" && members.length < 2) {
    return fail("bundle treatment must contain at least two members");
  }
  const treatmentIds = members.map((member) => member.treatment_record_id);
  if (
    members.some(
      (member) =>
        !isNonEmptyString(member.treatment_record_id) ||
        !isNonEmptyString(member.treatment_family) ||
        member.evidence_bindings.length === 0 ||
        !bindingsAreCanonicalUnique(member.evidence_bindings),
    )
  ) {
    return fail("treatment identity strings must be non-empty and evidence bindings unique");
  }
  if (!isSortedUnique(treatmentIds)) return fail("treatment members must be sorted and unique");
  if (canonicalJson(treatmentIds) !== canonicalJson(row.provenance.treatment_record_ids)) {
    return fail("treatment members disagree with provenance.treatment_record_ids");
  }

  const topLevelBindingKeys = new Set(row.evidence_bindings.map(bindingKey));
  if (row.evidence_bindings.length === 0 || row.resolved_onset.evidence_bindings.length === 0) {
    return fail("occurrence and resolved-onset evidence arrays must be non-empty");
  }
  if (!bindingsAreCanonicalUnique(row.resolved_onset.evidence_bindings)) {
    return fail("resolved-onset evidence bindings must be unique");
  }
  if (topLevelBindingKeys.size !== row.evidence_bindings.length) {
    return fail("top-level evidence bindings must be unique");
  }
  const nestedBindings = [
    ...row.resolved_onset.evidence_bindings,
    ...row.routes.flatMap((route) => route.evidence_bindings),
    ...members.flatMap((member) => member.evidence_bindings),
    ...(row.treatment.kind === "bundle" ? row.treatment.bundle_family_evidence_bindings : []),
  ];
  for (const binding of nestedBindings) {
    if (!topLevelBindingKeys.has(bindingKey(binding))) {
      return fail(
        `nested evidence binding is absent from the occurrence evidence ledger: ${binding.evidence_id}`,
      );
    }
  }
  for (const binding of row.evidence_bindings) {
    if (
      !isNonEmptyString(binding.role) ||
      !isNonEmptyString(binding.record_id) ||
      !isNonEmptyString(binding.source_id) ||
      !isNonEmptyString(binding.evidence_id)
    ) {
      return fail("evidence binding fields must be non-empty");
    }
    if (!row.source_ids.includes(binding.source_id)) {
      return fail(`evidence binding source is absent from source_ids: ${binding.source_id}`);
    }
  }
  if (!row.resolved_onset.evidence_bindings.some((binding) => binding.role === "event_date")) {
    return fail("resolved onset must carry event_date evidence");
  }
  for (const route of row.routes) {
    const roles = new Set(route.evidence_bindings.map((binding) => binding.role));
    if (!roles.has("route_identity") || !roles.has("route_scope")) {
      return fail(`route ${route.route_record_id} lacks route_identity or route_scope evidence`);
    }
  }
  for (const member of members) {
    const roles = new Set(member.evidence_bindings.map((binding) => binding.role));
    if (!roles.has("treatment_definition") || !roles.has("treatment_scope")) {
      return fail(`treatment ${member.treatment_record_id} lacks definition or scope evidence`);
    }
  }

  if (
    row.treatment.kind === "bundle" &&
    !bindingsAreCanonicalUnique(row.treatment.bundle_family_evidence_bindings)
  ) {
    return fail("bundle_family_evidence_bindings must be unique");
  }
  if (
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family_evidence_bindings.some(
      (binding) => binding.role !== "bundle_analysis_family",
    )
  ) {
    return fail("bundle_family_evidence_bindings must all use bundle_analysis_family");
  }
  if (
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family !== null &&
    !isNonEmptyString(row.treatment.bundle_family)
  ) {
    return fail("bundle_family must be null or a non-empty string");
  }
  const bundleSupported =
    row.treatment.kind === "bundle" &&
    row.treatment.bundle_family !== null &&
    SUPPORTED_BUNDLE_ANALYSIS_FAMILIES.has(row.treatment.bundle_family) &&
    row.treatment.bundle_family_evidence_bindings.length > 0;
  const unsupportedBundle = row.treatment.kind === "bundle" && !bundleSupported;
  if (unsupportedBundle !== row.exclusion_reasons.includes("unsupported_bundle_analysis_family")) {
    return fail("bundle umbrella evidence disagrees with unsupported_bundle_analysis_family");
  }
  if (row.study_projection_eligible !== (row.exclusion_reasons.length === 0)) {
    return fail("study_projection_eligible disagrees with exclusion_reasons");
  }
  return Effect.void;
}

function evidenceBindingsAreSorted(bindings: readonly AnyOccurrenceEvidenceBinding[]): boolean {
  const values = bindings.map(bindingKey);
  return values.join("\n") === [...values].toSorted().join("\n");
}

function validateOccurrenceRowV2(
  row: OperationalOccurrenceRowV2,
  input: { path: string; line: number },
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const fail = (detail: string) =>
    Effect.fail(rowSemanticError({ ...input, detail: `occurrence-v2: ${detail}` }));
  const phaseArrays = [row.phase_record_ids, row.phase_relation_record_ids];
  const physicalArrays = [row.physical_scope_record_ids, row.physical_scope_relation_record_ids];
  if (
    phaseArrays.some((values) => !isSortedUnique(values) || !stringsAreNonEmptyUnique(values)) ||
    physicalArrays.some((values) => !isSortedUnique(values) || !stringsAreNonEmptyUnique(values))
  ) {
    return fail("phase and physical-scope identities must be sorted, non-empty, and unique");
  }
  if (row.phase_record_ids.length === 0) return fail("phase_record_ids must not be empty");
  if (canonicalJson(row.phase_record_ids) !== canonicalJson(row.provenance.event_record_ids)) {
    return fail("phase_record_ids must exactly equal provenance.event_record_ids");
  }
  if (
    !bindingsAreCanonicalUnique(row.phase_relation_evidence_bindings) ||
    !evidenceBindingsAreSorted(row.phase_relation_evidence_bindings) ||
    row.phase_relation_evidence_bindings.some((binding) => binding.role !== "phase_relation")
  ) {
    return fail("phase relation evidence must be sorted, unique, and use phase_relation");
  }
  if (
    canonicalJson(row.phase_relation_evidence_bindings.map((binding) => binding.record_id)) !==
    canonicalJson(row.phase_relation_record_ids)
  ) {
    return fail("phase relation evidence must exactly cover phase_relation_record_ids");
  }
  if (
    row.phase_relation_record_ids.some(
      (relationId) => !row.provenance.relation_record_ids.includes(relationId),
    )
  ) {
    return fail("phase relation ids must be present in provenance.relation_record_ids");
  }
  if (
    row.phase_relation_disposition === "single_phase" &&
    (row.phase_record_ids.length !== 1 ||
      row.phase_relation_record_ids.length !== 0 ||
      row.phase_relation_evidence_bindings.length !== 0)
  ) {
    return fail("single_phase requires one phase and no phase relation or evidence");
  }
  if (
    row.phase_relation_disposition === "related_phases" &&
    (row.phase_record_ids.length < 2 ||
      row.phase_relation_record_ids.length === 0 ||
      row.phase_relation_evidence_bindings.length === 0)
  ) {
    return fail("related_phases requires multiple phases plus relation identities and evidence");
  }

  const physicalPresence = [
    row.physical_scope_record_ids.length > 0,
    row.physical_scope_relation_record_ids.length > 0,
    row.physical_scope_evidence_bindings.length > 0,
  ];
  if (new Set(physicalPresence).size !== 1) {
    return fail("physical scope record, relation, and evidence arrays must be present together");
  }
  if (
    !bindingsAreCanonicalUnique(row.physical_scope_evidence_bindings) ||
    !evidenceBindingsAreSorted(row.physical_scope_evidence_bindings) ||
    row.physical_scope_evidence_bindings.some((binding) => binding.role !== "physical_scope")
  ) {
    return fail("physical scope evidence must be sorted, unique, and use physical_scope");
  }
  if (
    canonicalJson(row.physical_scope_evidence_bindings.map((binding) => binding.record_id)) !==
    canonicalJson(row.physical_scope_relation_record_ids)
  ) {
    return fail("physical scope evidence must exactly cover physical_scope_relation_record_ids");
  }
  if (
    row.physical_scope_relation_record_ids.some(
      (relationId) =>
        !row.provenance.relation_record_ids.includes(relationId) ||
        !row.observations.some((observation) =>
          observation.relation_record_ids.includes(relationId),
        ),
    )
  ) {
    return fail("physical scope relations must be present in provenance and an observation");
  }
  const topLevelPhaseBindings = row.evidence_bindings.filter(
    (binding) => binding.role === "phase_relation",
  );
  if (
    canonicalJson(sortedBindingKeys(row.phase_relation_evidence_bindings)) !==
    canonicalJson(sortedBindingKeys(topLevelPhaseBindings))
  ) {
    return fail(
      "top-level phase_relation evidence must exactly equal phase_relation_evidence_bindings",
    );
  }
  const topLevelPhysicalBindings = row.evidence_bindings.filter(
    (binding) => binding.role === "physical_scope",
  );
  if (
    canonicalJson(sortedBindingKeys(row.physical_scope_evidence_bindings)) !==
    canonicalJson(sortedBindingKeys(topLevelPhysicalBindings))
  ) {
    return fail(
      "top-level physical_scope evidence must exactly equal physical_scope_evidence_bindings",
    );
  }
  const reviewV1NestedBindings = [
    ...row.resolved_onset.evidence_bindings,
    ...row.routes.flatMap((route) => route.evidence_bindings),
    ...(row.treatment.kind === "atomic"
      ? row.treatment.member.evidence_bindings
      : [
          ...row.treatment.bundle_family_evidence_bindings,
          ...row.treatment.members.flatMap((member) => member.evidence_bindings),
        ]),
  ];
  if (reviewV1NestedBindings.some(isReviewV2OnlyLineageBinding)) {
    return fail(
      "phase_relation/physical_scope evidence must stay in dedicated v2 lineage fields and the top-level ledger",
    );
  }
  return Effect.void;
}

const decodeOccurrenceRows = Effect.fn("MtaWikiOperationalOccurrences.decodeRows")(function* (
  file: VerifiedMtaWikiReleaseFile,
) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation: "decodeOperationalOccurrences",
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: OperationalOccurrenceRow[] = [];
  const ids = new Map<string, number>();
  const aliases = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return yield* importError({
        code: "invalid_json",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line: lineNumber,
        detail: "blank JSONL records are not allowed",
      });
    }
    const value = yield* parseJson(line, {
      operation: "decodeOperationalOccurrences",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: OperationalOccurrenceRowSchema,
      value,
      operation: "decodeOperationalOccurrences",
      path: file.path,
      line: lineNumber,
    });
    yield* validateOccurrenceRowBase(row, { path: file.path, line: lineNumber });
    const prior = ids.get(row.occurrence_id);
    if (prior !== undefined) {
      return yield* importError({
        code: "duplicate_occurrence_id",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line: lineNumber,
        detail: `occurrence_id ${row.occurrence_id} already appeared on line ${prior}`,
      });
    }
    ids.set(row.occurrence_id, lineNumber);
    for (const alias of row.occurrence_aliases) {
      const aliasOwner = aliases.get(alias);
      if (aliasOwner !== undefined) {
        return yield* importError({
          code: "semantic_mismatch",
          operation: "decodeOperationalOccurrences",
          path: file.path,
          line: lineNumber,
          detail: `occurrence alias ${alias} already appeared on line ${aliasOwner}`,
        });
      }
      aliases.set(alias, lineNumber);
    }
    rows.push(row);
  }
  for (const [alias, line] of aliases) {
    if (ids.has(alias)) {
      return yield* importError({
        code: "semantic_mismatch",
        operation: "decodeOperationalOccurrences",
        path: file.path,
        line,
        detail: `occurrence alias collides with an active occurrence_id: ${alias}`,
      });
    }
  }
  return rows.toSorted((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
});

const decodeRouteAnchors = Effect.fn("MtaWikiOperationalOccurrences.decodeRouteAnchors")(function* (
  file: VerifiedMtaWikiReleaseFile,
) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation: "decodeRouteAnchors",
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: MtaWikiRouteAnchorV1[] = [];
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.length === 0) {
      return yield* importError({
        code: "invalid_json",
        operation: "decodeRouteAnchors",
        path: file.path,
        line: lineNumber,
        detail: "blank JSONL records are not allowed",
      });
    }
    const value = yield* parseJson(line, {
      operation: "decodeRouteAnchors",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: MtaWikiRouteAnchorV1Schema,
      value,
      operation: "decodeRouteAnchors",
      path: file.path,
      line: lineNumber,
    });
    if (line !== canonicalJson(row)) {
      return yield* importError({
        code: "semantic_mismatch",
        operation: "decodeRouteAnchors",
        path: file.path,
        line: lineNumber,
        detail: "route anchors must use canonical stable JSONL bytes",
      });
    }
    rows.push(row);
  }
  return rows;
});

const decodeOccurrenceRowsV2 = Effect.fn("MtaWikiOperationalOccurrences.decodeRowsV2")(function* (
  file: VerifiedMtaWikiReleaseFile,
) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation: "decodeOperationalOccurrencesV2",
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows: OperationalOccurrenceRowV2[] = [];
  const ids = new Map<string, number>();
  const aliases = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim().length === 0) {
      return yield* importError({
        code: "invalid_json",
        operation: "decodeOperationalOccurrencesV2",
        path: file.path,
        line: lineNumber,
        detail: "blank JSONL records are not allowed",
      });
    }
    const value = yield* parseJson(line, {
      operation: "decodeOperationalOccurrencesV2",
      path: file.path,
      line: lineNumber,
    });
    const row = yield* decodeStrict({
      schema: OperationalOccurrenceRowV2Schema,
      value,
      operation: "decodeOperationalOccurrencesV2",
      path: file.path,
      line: lineNumber,
    });
    yield* validateOccurrenceRowBase(row, { path: file.path, line: lineNumber });
    yield* validateOccurrenceRowV2(row, { path: file.path, line: lineNumber });
    const prior = ids.get(row.occurrence_id);
    if (prior !== undefined) {
      return yield* importError({
        code: "duplicate_occurrence_id",
        operation: "decodeOperationalOccurrencesV2",
        path: file.path,
        line: lineNumber,
        detail: `occurrence_id ${row.occurrence_id} already appeared on line ${prior}`,
      });
    }
    ids.set(row.occurrence_id, lineNumber);
    for (const alias of row.occurrence_aliases) {
      const aliasOwner = aliases.get(alias);
      if (aliasOwner !== undefined) {
        return yield* importError({
          code: "semantic_mismatch",
          operation: "decodeOperationalOccurrencesV2",
          path: file.path,
          line: lineNumber,
          detail: `occurrence alias ${alias} already appeared on line ${aliasOwner}`,
        });
      }
      aliases.set(alias, lineNumber);
    }
    rows.push(row);
  }
  for (const [alias, line] of aliases) {
    if (ids.has(alias)) {
      return yield* importError({
        code: "semantic_mismatch",
        operation: "decodeOperationalOccurrencesV2",
        path: file.path,
        line,
        detail: `occurrence alias collides with an active occurrence_id: ${alias}`,
      });
    }
  }
  return rows.toSorted((left, right) => left.occurrence_id.localeCompare(right.occurrence_id));
});

const decodeJsonFile = Effect.fn("MtaWikiOperationalOccurrences.decodeJsonFile")(function* <
  S extends Schema.Constraint,
>(file: VerifiedMtaWikiReleaseFile, schema: S, operation: string) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation,
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  const value = yield* parseJson(text, { operation, path: file.path });
  return yield* decodeStrict({ schema, value, operation, path: file.path });
});

const decodeCanonicalJsonFile = Effect.fn("MtaWikiOperationalOccurrences.decodeCanonicalJsonFile")(
  function* <S extends Schema.Constraint>(
    file: VerifiedMtaWikiReleaseFile,
    schema: S,
    operation: string,
  ) {
    const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
      operation,
      path: file.path,
    }).pipe(Effect.mapError(fromReleaseError));
    const value = yield* parseJson(text, { operation, path: file.path });
    const decoded = yield* decodeStrict({ schema, value, operation, path: file.path });
    if (text !== `${canonicalJson(decoded)}\n`) {
      return yield* importError({
        code: "semantic_mismatch",
        operation,
        path: file.path,
        detail: "expected canonical stable JSON bytes followed by LF",
      });
    }
    return decoded;
  },
);

const verifyManifestV5File = Effect.fn("MtaWikiOperationalOccurrences.verifyManifestV5File")(
  function* (input: {
    manifest: ReleaseManifestV5;
    resolved: ResolvedMtaWikiRelease;
    pointer: string;
    operation: string;
    expected?: { bytes: number; sha256: string } | undefined;
  }) {
    if (!isSafeMtaWikiReleaseRelativePath(input.pointer)) {
      return yield* importError({
        code: "unsafe_path",
        operation: input.operation,
        path: input.pointer,
        detail: "retirement artifact path is not a safe release-relative path",
      });
    }
    const metadata = input.manifest.files[input.pointer];
    if (metadata === undefined) {
      return yield* importError({
        code: "missing_manifest_file",
        operation: input.operation,
        path: input.pointer,
        detail: "retirement artifact is not content-addressed by the release manifest",
      });
    }
    if (
      input.expected !== undefined &&
      (metadata.bytes !== input.expected.bytes || metadata.sha256 !== input.expected.sha256)
    ) {
      return yield* importError({
        code: "semantic_mismatch",
        operation: input.operation,
        path: input.pointer,
        detail: "retirement projection metadata disagrees with the release manifest",
      });
    }
    return yield* verifyMtaWikiReleaseFile({
      ...input.resolved,
      pointer: input.pointer,
      metadata,
      operation: input.operation,
    }).pipe(Effect.mapError(fromReleaseError));
  },
);

type VerifiedManifestV5OccurrenceRetirements = {
  routeIdentitySnapshot: MtaWikiRouteIdentitySnapshot;
  sourceDecisionCount: number;
  retirementCount: number;
  retirements: OperationalOccurrenceReviewRetirementProjection[];
};

const validateManifestV5OccurrenceRetirements = Effect.fn(
  "MtaWikiOperationalOccurrences.validateManifestV5OccurrenceRetirements",
)(function* (input: {
  manifest: ReleaseManifestV5;
  resolved: ResolvedMtaWikiRelease;
  routeIdentityFile: VerifiedMtaWikiReleaseFile;
  snapshot: OperationalOccurrenceReviewSnapshot;
  rows: readonly OperationalOccurrenceRowV2[];
}) {
  const fail = (detail: string, path = input.routeIdentityFile.path) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalOccurrenceReviewRetirements",
        path,
        detail,
      }),
    );
  const routeIdentitySnapshot = yield* decodeCanonicalJsonFile(
    input.routeIdentityFile,
    MtaWikiRouteIdentitySnapshotSchema,
    "decodeRouteIdentitySnapshotForOccurrenceRetirements",
  );
  yield* Effect.try({
    try: () => assertMtaWikiRouteIdentitySnapshotSelfIntegrity(routeIdentitySnapshot),
    catch: (cause) =>
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalOccurrenceReviewRetirements",
        path: input.routeIdentityFile.path,
        detail: String(cause),
      }),
  });
  const encoded = (value: string) => new TextEncoder().encode(value);
  const routeBindingIds = routeIdentitySnapshot.record_bindings.map(
    (binding) => binding.route_record_id,
  );
  if (
    routeIdentitySnapshot.gtfs_snapshot_id !== routeIdentitySnapshot.gtfs_snapshot.snapshot_id ||
    routeIdentitySnapshot.gtfs_snapshot_sha256 !==
      sha256Bytes(encoded(`${canonicalJson(routeIdentitySnapshot.gtfs_snapshot)}\n`)) ||
    canonicalJson(routeIdentitySnapshot.current_catalog) !==
      canonicalJson(routeIdentitySnapshot.gtfs_snapshot.current_catalog) ||
    routeIdentitySnapshot.service_identity_count !==
      routeIdentitySnapshot.service_identities.length ||
    routeIdentitySnapshot.service_identities_sha256 !==
      sha256Bytes(encoded(canonicalJsonl(routeIdentitySnapshot.service_identities))) ||
    routeIdentitySnapshot.record_binding_count !== routeIdentitySnapshot.record_bindings.length ||
    routeIdentitySnapshot.record_bindings_sha256 !==
      sha256Bytes(encoded(canonicalJsonl(routeIdentitySnapshot.record_bindings))) ||
    !isSortedUnique(routeBindingIds) ||
    routeIdentitySnapshot.service_identities.some(
      (identity) => identity.snapshot_id !== routeIdentitySnapshot.gtfs_snapshot_id,
    )
  ) {
    return yield* fail(
      "route identity snapshot ids, catalog, counts, ordering, or internal digests are stale",
    );
  }
  const reviewContract = input.manifest.contract_versions.operational_occurrence_review_decisions;
  if (input.manifest.contract_versions.operational_anchor_review_decisions !== reviewContract) {
    return yield* fail("manifest-v5 anchor and occurrence review contracts must advance together");
  }

  const retirementPaths = Object.keys(input.manifest.files).filter((path) =>
    path.startsWith("review-retirements/"),
  );
  if (reviewContract === OPERATIONAL_OCCURRENCE_REVIEW_CONTRACT_VERSION) {
    if (input.snapshot.snapshot_version !== 1 || retirementPaths.length > 0) {
      return yield* fail(
        "manifest-v5 review-v1 must contain a review-v1 snapshot and no retirement artifacts",
      );
    }
    return {
      routeIdentitySnapshot,
      sourceDecisionCount: input.snapshot.decision_count,
      retirementCount: 0,
      retirements: [],
    } satisfies VerifiedManifestV5OccurrenceRetirements;
  }

  if (input.snapshot.snapshot_version !== 2) {
    return yield* fail("manifest-v5 review-v2 contract requires a review-v2 snapshot");
  }
  if (
    input.snapshot.retirement_count !== input.snapshot.retirements.length ||
    input.snapshot.source_decision_count !==
      input.snapshot.decision_count + input.snapshot.retirement_count ||
    input.snapshot.retirement_count === 0
  ) {
    return yield* fail("review-v2 source, active-decision, and retirement counts do not reconcile");
  }
  const retirementDecisionIds = input.snapshot.retirements.map(
    (retirement) => retirement.target.decision_id,
  );
  if (!isSortedUnique(retirementDecisionIds)) {
    return yield* fail("review-v2 retirements must be sorted and unique by decision_id");
  }
  const activeDecisionIds = new Set(
    input.snapshot.decisions.map((decision) => decision.decision_id),
  );
  const activeOccurrenceIds = new Set(input.rows.map((row) => row.occurrence_id));
  const activeFoundingKeys = new Set(input.rows.map((row) => row.founding_key));
  if (
    input.snapshot.retirements.some(
      (retirement) =>
        activeDecisionIds.has(retirement.target.decision_id) ||
        activeOccurrenceIds.has(retirement.target.occurrence_id) ||
        activeFoundingKeys.has(retirement.target.founding_key),
    )
  ) {
    return yield* fail(
      "retired occurrence identities were reintroduced into the active projection",
    );
  }

  const routeBindings = new Map(
    routeIdentitySnapshot.record_bindings.map((binding) => [binding.route_record_id, binding]),
  );
  const projectionsByRetirementId = new Map<
    string,
    OperationalOccurrenceReviewRetirementProjection[]
  >();
  for (const projection of input.snapshot.retirements) {
    const target = projection.target;
    const expectedSourcePath = `review-retirements/source/${projection.retirement_id}.json`;
    const expectedArchivePath = `review-retirements/operational-occurrence/${target.decision_id}.json`;
    if (
      projection.retirement_source.release_path !== expectedSourcePath ||
      target.original_artifact.release_path !== expectedArchivePath ||
      projection.route_identity_snapshot_id !== routeIdentitySnapshot.gtfs_snapshot_id ||
      projection.route_identity_snapshot_sha256 !== input.routeIdentityFile.metadata.sha256
    ) {
      return yield* fail(
        `retirement ${projection.retirement_id} does not address the exact release route snapshot and archive paths`,
      );
    }
    if (
      !isSortedUnique(projection.binding.ineligibility_reasons) ||
      !projection.binding.ineligibility_reasons.includes("catalog_not_in_effect") ||
      !isSortedUnique(target.pinned_gtfs_route_ids) ||
      target.pinned_gtfs_route_ids.length === 0
    ) {
      return yield* fail(
        `retirement ${projection.retirement_id} has noncanonical route ineligibility or route pins`,
      );
    }
    const routeBinding = routeBindings.get(projection.binding.route_record_id);
    // route_binding_sha256 is the accepted decision-row receipt; the snapshot exposes only its
    // typed projection. Preserve that receipt and compare the complete projectable identity here.
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
      return yield* fail(
        `retirement ${projection.retirement_id} differs from its accepted nonprojectable route binding`,
      );
    }
    const current = projectionsByRetirementId.get(projection.retirement_id) ?? [];
    current.push(projection);
    projectionsByRetirementId.set(projection.retirement_id, current);
  }

  const sourcePaths = Object.keys(input.manifest.files)
    .filter((path) => path.startsWith("review-retirements/source/"))
    .toSorted();
  const sourceReceipts = new Map<string, OperationalProjectionRetirementSource>();
  for (const sourcePath of sourcePaths) {
    const sourceFile = yield* verifyManifestV5File({
      manifest: input.manifest,
      resolved: input.resolved,
      pointer: sourcePath,
      operation: "verifyOperationalProjectionRetirementSource",
    });
    const source = yield* decodeCanonicalJsonFile(
      sourceFile,
      OperationalProjectionRetirementSourceSchema,
      "decodeOperationalProjectionRetirementSource",
    );
    if (
      sourcePath !== `review-retirements/source/${source.retirement_id}.json` ||
      !isUtcInstant(source.accepted_at) ||
      source.anchor_review_decisions.length + source.occurrence_review_decisions.length === 0 ||
      !isSortedUnique(source.anchor_review_decisions.map((target) => target.decision_id)) ||
      !isSortedUnique(source.occurrence_review_decisions.map((target) => target.decision_id)) ||
      sourceReceipts.has(source.retirement_id)
    ) {
      return yield* fail(
        "retirement source receipts are incomplete, duplicated, or unsorted",
        sourceFile.path,
      );
    }
    sourceReceipts.set(source.retirement_id, source);
    if (
      source.occurrence_review_decisions.length > 0 &&
      !projectionsByRetirementId.has(source.retirement_id)
    ) {
      return yield* fail(
        `retirement source ${source.retirement_id} has an unrepresented occurrence target`,
        sourceFile.path,
      );
    }
  }

  const expectedOccurrenceArchivePaths = new Set<string>();
  for (const [retirementId, projections] of projectionsByRetirementId) {
    const source = sourceReceipts.get(retirementId);
    const first = projections[0];
    if (source === undefined || first === undefined) {
      return yield* fail(
        `retirement ${retirementId} is missing its manifest-addressed source receipt`,
      );
    }
    if (
      source.accepted_by !== first.accepted_by ||
      source.accepted_at !== first.accepted_at ||
      source.rationale !== first.rationale ||
      source.route_identity_snapshot_id !== first.route_identity_snapshot_id ||
      source.route_identity_snapshot_sha256 !== first.route_identity_snapshot_sha256 ||
      canonicalJson(source.binding) !== canonicalJson(first.binding) ||
      source.occurrence_review_decisions.length !== projections.length
    ) {
      return yield* fail(
        `retirement source ${retirementId} differs from its review-v2 projections`,
      );
    }
    const sourceMetadata = input.manifest.files[first.retirement_source.release_path];
    if (
      sourceMetadata === undefined ||
      sourceMetadata.bytes !== first.retirement_source.bytes ||
      sourceMetadata.sha256 !== first.retirement_source.sha256
    ) {
      return yield* fail(`retirement source ${retirementId} metadata is stale`);
    }
    const sourceTargets = new Map(
      source.occurrence_review_decisions.map((target) => [target.decision_id, target]),
    );
    for (const projection of projections) {
      const target = projection.target;
      const sourceTarget = sourceTargets.get(target.decision_id);
      const expectedSourceArtifactPath = `data/operational-occurrence-review/accepted/decisions/${target.decision_id}.json`;
      if (
        sourceTarget === undefined ||
        sourceTarget.occurrence_id !== target.occurrence_id ||
        sourceTarget.founding_key !== target.founding_key ||
        canonicalJson(sourceTarget.pinned_gtfs_route_ids) !==
          canonicalJson(target.pinned_gtfs_route_ids) ||
        sourceTarget.original_artifact.artifact_path !== expectedSourceArtifactPath ||
        sourceTarget.original_artifact.bytes !== target.original_artifact.bytes ||
        sourceTarget.original_artifact.sha256 !== target.original_artifact.sha256
      ) {
        return yield* fail(
          `retirement target ${target.decision_id} differs from its immutable source receipt`,
        );
      }
      expectedOccurrenceArchivePaths.add(target.original_artifact.release_path);
      const archiveFile = yield* verifyManifestV5File({
        manifest: input.manifest,
        resolved: input.resolved,
        pointer: target.original_artifact.release_path,
        operation: "verifyRetiredOperationalOccurrenceReview",
        expected: target.original_artifact,
      });
      // The archive preserves the accepted decision's original immutable bytes, including its
      // historical pretty-printing. Manifest bytes/hash plus strict schema decode are authoritative;
      // rewriting it to the producer's newer canonical serializer would violate that provenance.
      const archivedDecision = yield* decodeJsonFile(
        archiveFile,
        OperationalOccurrenceAcceptedDecisionSchema,
        "decodeRetiredOperationalOccurrenceReview",
      );
      const pinnedRouteIds = archivedDecision.routes
        .filter((route) => route.route_record_id === projection.binding.route_record_id)
        .map((route) => route.gtfs_route_id)
        .toSorted();
      if (
        archivedDecision.decision_id !== target.decision_id ||
        archivedDecision.occurrence_id !== target.occurrence_id ||
        archivedDecision.founding_key !== target.founding_key ||
        archivedDecision.treatment_scope_kind !== archivedDecision.treatment.kind ||
        canonicalJson(pinnedRouteIds) !== canonicalJson(target.pinned_gtfs_route_ids)
      ) {
        return yield* fail(
          `retired review archive ${target.decision_id} does not prove the declared occurrence and route identity`,
          archiveFile.path,
        );
      }
    }
  }

  const actualOccurrenceArchivePaths = Object.keys(input.manifest.files)
    .filter((path) => path.startsWith("review-retirements/operational-occurrence/"))
    .toSorted();
  if (
    canonicalJson(actualOccurrenceArchivePaths) !==
    canonicalJson([...expectedOccurrenceArchivePaths].toSorted())
  ) {
    return yield* fail(
      "manifest occurrence retirement archives are not represented exactly once by review-v2",
    );
  }
  return {
    routeIdentitySnapshot,
    sourceDecisionCount: input.snapshot.source_decision_count,
    retirementCount: input.snapshot.retirement_count,
    retirements: [...input.snapshot.retirements],
  } satisfies VerifiedManifestV5OccurrenceRetirements;
});

const validateRelationshipArtifactSyntax = Effect.fn(
  "MtaWikiOperationalOccurrences.validateRelationshipArtifactSyntax",
)(function* (entry: RelationshipBundleArtifact, file: VerifiedMtaWikiReleaseFile) {
  const text = yield* decodeMtaWikiReleaseUtf8(file.bytes, {
    operation: "validateRelationshipArtifactSyntax",
    path: file.path,
  }).pipe(Effect.mapError(fromReleaseError));
  if (entry.source_path.endsWith(".json")) {
    yield* parseJson(text, {
      operation: "validateRelationshipArtifactSyntax",
      path: file.path,
    });
    return;
  }
  if (entry.source_path.endsWith(".jsonl")) {
    if (text.length === 0) return;
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const [index, line] of lines.entries()) {
      if (line.trim().length === 0) {
        return yield* importError({
          code: "invalid_json",
          operation: "validateRelationshipArtifactSyntax",
          path: file.path,
          line: index + 1,
          detail: "blank JSONL records are not allowed",
        });
      }
      yield* parseJson(line, {
        operation: "validateRelationshipArtifactSyntax",
        path: file.path,
        line: index + 1,
      });
    }
    return;
  }
  if (!entry.source_path.endsWith(".md")) {
    return yield* importError({
      code: "semantic_mismatch",
      operation: "validateRelationshipArtifactSyntax",
      path: file.path,
      detail: `unsupported relationship artifact media type: ${entry.source_path}`,
    });
  }
});

export function recomputeOperationalOccurrenceSummary(
  rows: readonly OperationalOccurrenceRow[],
): OperationalOccurrenceSummary {
  return {
    schema_version: 1,
    occurrence_count: rows.length,
    study_projection_eligible_count: rows.filter((row) => row.study_projection_eligible).length,
    atomic_count: rows.filter((row) => row.treatment.kind === "atomic").length,
    bundle_count: rows.filter((row) => row.treatment.kind === "bundle").length,
    multi_route_count: rows.filter((row) => row.routes.length > 1).length,
    candidate_projection_count: rows
      .filter((row) => row.study_projection_eligible)
      .reduce((sum, row) => sum + row.routes.length, 0),
    counts_by_exclusion_reason: countBy(rows.flatMap((row) => row.exclusion_reasons)),
  };
}

export function recomputeOperationalOccurrenceSummaryV2(
  rows: readonly OperationalOccurrenceRowV2[],
): OperationalOccurrenceSummaryV2 {
  return {
    ...recomputeOperationalOccurrenceSummary(
      rows as unknown as readonly OperationalOccurrenceRow[],
    ),
    schema_version: 2,
  };
}

function validateSummary(
  rows: readonly OperationalOccurrenceRow[],
  summary: OperationalOccurrenceSummary,
  path: string,
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const expected = recomputeOperationalOccurrenceSummary(rows);
  return canonicalJson(expected) === canonicalJson(summary)
    ? Effect.void
    : Effect.fail(
        importError({
          code: "summary_mismatch",
          operation: "validateOperationalOccurrenceSummary",
          path,
          detail: `producer summary does not match rows; expected ${canonicalJson(expected)}`,
        }),
      );
}

function validateSummaryV2(
  rows: readonly OperationalOccurrenceRowV2[],
  summary: OperationalOccurrenceSummaryV2,
  path: string,
): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const expected = recomputeOperationalOccurrenceSummaryV2(rows);
  return canonicalJson(expected) === canonicalJson(summary)
    ? Effect.void
    : Effect.fail(
        importError({
          code: "summary_mismatch",
          operation: "validateOperationalOccurrenceSummaryV2",
          path,
          detail: `producer summary does not match v2 rows; expected ${canonicalJson(expected)}`,
        }),
      );
}

type ReviewDecisionForComparison =
  | OperationalOccurrenceReviewDecision
  | OperationalOccurrenceReviewDecisionV1Rc22Inspection;
type ReviewSnapshotComparisonMode = "declared_review_v1" | "fingerprinted_rc22_inspection";

function reviewDecisionParityProjection(decision: ReviewDecisionForComparison) {
  return {
    decision_id: decision.decision_id,
    occurrence_id: decision.occurrence_id,
    founding_key: decision.founding_key,
    anchor_review_decision_ids: decision.anchor_review_decision_ids,
    resolved_onset: decision.resolved_onset,
    routes: decision.routes,
    treatment: decision.treatment,
    evidence_bindings: decision.evidence_bindings,
  };
}

function occurrenceReviewParityProjection(
  row: OperationalOccurrenceRowAny,
  mode: ReviewSnapshotComparisonMode,
) {
  return {
    decision_id: row.occurrence_review_decision_id,
    occurrence_id: row.occurrence_id,
    founding_key: row.founding_key,
    anchor_review_decision_ids: row.provenance.anchor_review_decision_ids,
    resolved_onset: {
      date: row.resolved_onset.date,
      precision: row.resolved_onset.precision,
      evidence_bindings: row.resolved_onset.evidence_bindings,
    },
    routes: row.routes.map((route) => ({
      route_record_id: route.route_record_id,
      gtfs_route_id: route.gtfs_route_id,
      evidence_bindings: route.evidence_bindings,
    })),
    treatment: treatmentReviewShape(row),
    evidence_bindings:
      mode === "declared_review_v1" && row.schema_version === 2
        ? row.evidence_bindings.filter((binding) => !isReviewV2OnlyLineageBinding(binding))
        : row.evidence_bindings,
  };
}

function validateReviewSnapshot(input: {
  rows: readonly OperationalOccurrenceRowAny[];
  snapshot:
    | OperationalOccurrenceReviewSnapshot
    | OperationalOccurrenceReviewSnapshotV1Rc22Inspection;
  path: string;
  comparisonMode: ReviewSnapshotComparisonMode;
}): Effect.Effect<void, MtaWikiOperationalOccurrenceImportError> {
  const fail = (detail: string) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "validateOperationalOccurrenceReviewSnapshot",
        path: input.path,
        detail,
      }),
    );
  if (input.snapshot.decision_count !== input.snapshot.decisions.length) {
    return fail("decision_count does not match decisions length");
  }
  const decisionIds = input.snapshot.decisions.map((decision) => decision.decision_id);
  if (!isSortedUnique(decisionIds)) return fail("review decisions must be sorted and unique");
  const byOccurrence = new Map<
    string,
    OperationalOccurrenceReviewDecision | OperationalOccurrenceReviewDecisionV1Rc22Inspection
  >();
  const byDecisionId = new Map<
    string,
    OperationalOccurrenceReviewDecision | OperationalOccurrenceReviewDecisionV1Rc22Inspection
  >();
  for (const decision of input.snapshot.decisions) {
    if (
      !isNonEmptyString(decision.decision_id) ||
      !isNonEmptyString(decision.occurrence_id) ||
      !isNonEmptyString(decision.founding_key) ||
      !stringsAreNonEmptyUnique(decision.anchor_review_decision_ids) ||
      decision.routes.length === 0 ||
      decision.resolved_onset.evidence_bindings.length === 0 ||
      decision.evidence_bindings.length === 0 ||
      !stringsAreNonEmptyUnique(decision.reviewers, true) ||
      !isNonEmptyString(decision.rationale)
    ) {
      return fail(
        `${decision.decision_id || "unnamed decision"} contains empty identity, route, evidence, reviewer, or rationale fields`,
      );
    }
    if (
      !bindingsAreCanonicalUnique(decision.resolved_onset.evidence_bindings) ||
      !bindingsAreCanonicalUnique(decision.evidence_bindings)
    ) {
      return fail(
        `${decision.decision_id} occurrence and resolved-onset evidence bindings must be unique`,
      );
    }
    if (
      decision.routes.some(
        (route) =>
          !isNonEmptyString(route.route_record_id) ||
          !isNonEmptyString(route.gtfs_route_id) ||
          route.evidence_bindings.length === 0,
      ) ||
      new Set(decision.routes.map((route) => route.route_record_id)).size !== decision.routes.length
    ) {
      return fail(`${decision.decision_id} routes must have non-empty, unique route identities`);
    }
    if (decision.routes.some((route) => !bindingsAreCanonicalUnique(route.evidence_bindings))) {
      return fail(`${decision.decision_id} route evidence bindings must be unique`);
    }
    const reviewMembers =
      decision.treatment.kind === "atomic"
        ? [decision.treatment.member]
        : decision.treatment.members;
    if (
      reviewMembers.length === 0 ||
      (decision.treatment.kind === "bundle" && reviewMembers.length < 2) ||
      reviewMembers.some(
        (member) =>
          !isNonEmptyString(member.treatment_record_id) ||
          !isNonEmptyString(member.treatment_family) ||
          member.evidence_bindings.length === 0,
      ) ||
      new Set(reviewMembers.map((member) => member.treatment_record_id)).size !==
        reviewMembers.length ||
      (decision.treatment.kind === "bundle" &&
        decision.treatment.bundle_family !== null &&
        !isNonEmptyString(decision.treatment.bundle_family)) ||
      (decision.treatment.kind === "bundle" &&
        decision.treatment.bundle_family_evidence_bindings.some(
          (binding) => binding.role !== "bundle_analysis_family",
        ))
    ) {
      return fail(`${decision.decision_id} treatment identity and member fields are invalid`);
    }
    if (
      reviewMembers.some((member) => !bindingsAreCanonicalUnique(member.evidence_bindings)) ||
      (decision.treatment.kind === "bundle" &&
        !bindingsAreCanonicalUnique(decision.treatment.bundle_family_evidence_bindings))
    ) {
      return fail(`${decision.decision_id} treatment evidence bindings must be unique`);
    }
    if (!validOnset(decision.resolved_onset.date, decision.resolved_onset.precision)) {
      return fail(`${decision.decision_id} has an invalid resolved onset`);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(decision.accepted_at) ||
      Number.isNaN(Date.parse(decision.accepted_at))
    ) {
      return fail(`${decision.decision_id} accepted_at is not an ISO-8601 UTC timestamp`);
    }
    if (byOccurrence.has(decision.occurrence_id)) {
      return fail(`multiple review decisions bind occurrence ${decision.occurrence_id}`);
    }
    byOccurrence.set(decision.occurrence_id, decision);
    byDecisionId.set(decision.decision_id, decision);
  }
  for (const row of input.rows) {
    const decision = byOccurrence.get(row.occurrence_id);
    if (decision === undefined) {
      return fail(`approved occurrence ${row.occurrence_id} lacks a current review decision`);
    }
    if (byDecisionId.get(row.occurrence_review_decision_id) !== decision) {
      return fail(
        `occurrence ${row.occurrence_id} does not bind its approved review decision ${decision.decision_id}`,
      );
    }
    if (
      canonicalJson(reviewDecisionParityProjection(decision)) !==
      canonicalJson(occurrenceReviewParityProjection(row, input.comparisonMode))
    ) {
      return fail(`review decision ${decision.decision_id} is stale for ${row.occurrence_id}`);
    }
  }
  for (const occurrenceId of byOccurrence.keys()) {
    if (!input.rows.some((row) => row.occurrence_id === occurrenceId)) {
      return fail(`review decision points to missing occurrence ${occurrenceId}`);
    }
  }
  return Effect.void;
}

function decisionEvidenceBindings(
  decision: OperationalOccurrenceReviewDecisionV1Rc22Inspection,
): AnyOccurrenceEvidenceBinding[] {
  const treatmentBindings =
    decision.treatment.kind === "atomic"
      ? decision.treatment.member.evidence_bindings
      : [
          ...decision.treatment.bundle_family_evidence_bindings,
          ...decision.treatment.members.flatMap((member) => member.evidence_bindings),
        ];
  return [
    ...decision.resolved_onset.evidence_bindings,
    ...decision.routes.flatMap((route) => route.evidence_bindings),
    ...treatmentBindings,
    ...decision.evidence_bindings,
  ];
}

export function classifyOperationalOccurrenceReviewCompatibility(input: {
  manifestSha256: string;
  reviewSha256: string;
  snapshot: OperationalOccurrenceReviewSnapshotV1Rc22Inspection;
}):
  | "compatible"
  | "known_rc22_review_v1_physical_scope_incompatibility"
  | "unsupported_review_v1_occurrence_v2_roles" {
  const unsupported = input.snapshot.decisions.flatMap((decision) =>
    decisionEvidenceBindings(decision)
      .filter((binding) => !REVIEW_V1_EVIDENCE_ROLES.has(binding.role))
      .map((binding) => ({ decision, binding })),
  );
  if (unsupported.length === 0) return "compatible";

  const only = unsupported[0];
  const knownBinding =
    unsupported.length === 1 &&
    only !== undefined &&
    input.manifestSha256 === RC22_MANIFEST_SHA256 &&
    input.reviewSha256 === RC22_REVIEW_SHA256 &&
    only.decision.decision_id === RC22_REVIEW_PHYSICAL_SCOPE_DECISION_ID &&
    only.decision.occurrence_id === RC22_REVIEW_PHYSICAL_SCOPE_OCCURRENCE_ID &&
    only.binding.role === "physical_scope" &&
    only.binding.record_id === RC22_REVIEW_PHYSICAL_SCOPE_RELATION_ID &&
    only.binding.source_id === RC22_REVIEW_PHYSICAL_SCOPE_SOURCE_ID &&
    only.binding.evidence_id === RC22_REVIEW_PHYSICAL_SCOPE_EVIDENCE_ID &&
    only.decision.evidence_bindings.some(
      (binding) => bindingKey(binding) === bindingKey(only.binding),
    );
  return knownBinding
    ? "known_rc22_review_v1_physical_scope_incompatibility"
    : "unsupported_review_v1_occurrence_v2_roles";
}

function reviewCompatibilityStatus(input: {
  manifestSha256: string;
  reviewFile: VerifiedMtaWikiReleaseFile;
  snapshot: OperationalOccurrenceReviewSnapshotV1Rc22Inspection;
}): Effect.Effect<
  "compatible" | "known_rc22_review_v1_physical_scope_incompatibility",
  MtaWikiOperationalOccurrenceImportError
> {
  const classification = classifyOperationalOccurrenceReviewCompatibility({
    manifestSha256: input.manifestSha256,
    reviewSha256: input.reviewFile.metadata.sha256,
    snapshot: input.snapshot,
  });
  return classification !== "unsupported_review_v1_occurrence_v2_roles"
    ? Effect.succeed(classification)
    : Effect.fail(
        importError({
          code: "contract_incompatible",
          operation: "validateOperationalOccurrenceReviewContract",
          path: input.reviewFile.path,
          detail:
            "review-v1 contains occurrence-v2 evidence roles outside the one fingerprinted rc22 inspection exception",
        }),
      );
}

function importedFile(file: VerifiedMtaWikiReleaseFile, releaseId: string) {
  return {
    pointer: file.pointer,
    path: `data/exports/releases/${releaseId}/${file.pointer}`,
    bytes: file.metadata.bytes,
    sha256: file.metadata.sha256,
  };
}

function canonicalDigest(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

const verifyRelationshipIntegrity = Effect.fn(
  "MtaWikiOperationalOccurrences.verifyRelationshipIntegrity",
)(function* (input: {
  manifest: ReleaseManifestV4 | ReleaseManifestV5;
  manifestSha256: string;
  releaseId: string;
  manifestPath: string;
  resolved: {
    releaseDirectory: string;
    canonicalReleaseDirectory: string;
  };
  bundleFile: VerifiedMtaWikiReleaseFile;
  occurrenceFile: VerifiedMtaWikiReleaseFile;
  occurrenceRows: readonly OperationalOccurrenceRowV2[];
}) {
  const fail = (detail: string, path = input.bundleFile.path) =>
    Effect.fail(
      importError({
        code: "semantic_mismatch",
        operation: "verifyRelationshipIntegrity",
        path,
        detail,
      }),
    );
  const bundle = yield* decodeJsonFile(
    input.bundleFile,
    RelationshipIntegrityBundleSchema,
    "decodeRelationshipIntegrityBundle",
  );
  if (bundle.artifact_count !== bundle.artifacts.length) {
    return yield* fail("relationship bundle artifact_count does not match artifacts length");
  }
  const descriptorValue = {
    schema_version: bundle.schema_version,
    bundle_id: bundle.bundle_id,
    contract_id: bundle.contract_id,
    validation_mode: bundle.validation_mode,
    artifacts: bundle.artifacts.map(({ role, source_path, bytes, sha256 }) => ({
      role,
      source_path,
      bytes,
      sha256,
    })),
  };
  const descriptorBytes = new TextEncoder().encode(`${canonicalJson(descriptorValue)}\n`);
  if (
    descriptorBytes.length !== bundle.descriptor.bytes ||
    sha256Bytes(descriptorBytes) !== bundle.descriptor.sha256
  ) {
    return yield* fail("relationship bundle descriptor commitment does not match artifacts");
  }

  const roles = new Set<string>();
  const sourcePaths = new Set<string>();
  const releasePaths = new Set<string>();
  const canonicalTargets = new Set<string>();
  const verifiedByRole = new Map<
    string,
    { entry: RelationshipBundleArtifact; file: VerifiedMtaWikiReleaseFile }
  >();
  const verifiedBySourcePath = new Map<
    string,
    { entry: RelationshipBundleArtifact; file: VerifiedMtaWikiReleaseFile }
  >();
  for (const entry of bundle.artifacts) {
    if (
      !isNonEmptyString(entry.role) ||
      !isSafeMtaWikiReleaseRelativePath(entry.source_path) ||
      !isSafeMtaWikiReleaseRelativePath(entry.release_path) ||
      entry.release_path !== `relationship-integrity/${entry.source_path}`
    ) {
      return yield* fail(`unsafe or inconsistent relationship artifact path for ${entry.role}`);
    }
    if (
      roles.has(entry.role) ||
      sourcePaths.has(entry.source_path) ||
      releasePaths.has(entry.release_path)
    ) {
      return yield* fail(`duplicate relationship artifact identity for ${entry.role}`);
    }
    roles.add(entry.role);
    sourcePaths.add(entry.source_path);
    releasePaths.add(entry.release_path);
    const manifestMetadata = input.manifest.files[entry.release_path];
    if (
      manifestMetadata === undefined ||
      manifestMetadata.bytes !== entry.bytes ||
      manifestMetadata.sha256 !== entry.sha256
    ) {
      return yield* fail(
        `relationship artifact metadata disagrees with manifest: ${entry.release_path}`,
        input.manifestPath,
      );
    }
    const file = yield* verifyMtaWikiReleaseFile({
      ...input.resolved,
      pointer: entry.release_path,
      metadata: manifestMetadata,
      operation: `verifyRelationshipArtifact:${entry.role}`,
    }).pipe(Effect.mapError(fromReleaseError));
    if (canonicalTargets.has(file.path)) {
      return yield* fail(`multiple relationship pointers resolve to ${file.path}`, file.path);
    }
    yield* validateRelationshipArtifactSyntax(entry, file);
    canonicalTargets.add(file.path);
    verifiedByRole.set(entry.role, { entry, file });
    verifiedBySourcePath.set(entry.source_path, { entry, file });
  }

  const required = (role: string) => {
    const value = verifiedByRole.get(role);
    return value === undefined
      ? Effect.fail(
          importError({
            code: "missing_manifest_file",
            operation: "verifyRelationshipIntegrity",
            path: input.bundleFile.path,
            detail: `relationship bundle is missing required role ${role}`,
          }),
        )
      : Effect.succeed(value);
  };

  const requiredSource = (sourcePath: string) => {
    const value = verifiedBySourcePath.get(sourcePath);
    return value === undefined
      ? Effect.fail(
          importError({
            code: "missing_manifest_file",
            operation: "verifyRelationshipIntegrity",
            path: input.bundleFile.path,
            detail: `relationship bundle is missing required source ${sourcePath}`,
          }),
        )
      : Effect.succeed(value);
  };

  const contractArtifact = yield* required("relationship_contract");
  const proofArtifact = yield* required("enforcement_proof");
  const transitionArtifact = yield* required("enforcement_transition_receipt");
  const endpointArtifact = yield* required("endpoint_type_matrix");
  const graphAuditArtifact = yield* required("graph_audit_summary");
  const graphManifestArtifact = yield* required("graph_audit_manifest");
  const physicalManifestArtifact = yield* requiredSource(
    "data/quality/relationship-integrity/occurrence-treatment-physicality/manifest.json",
  );
  const physicalSummaryArtifact = yield* requiredSource(
    "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json",
  );
  const phaseManifestArtifact = yield* requiredSource(
    "data/quality/relationship-integrity/operational-occurrence-phases/manifest.json",
  );
  const phaseSummaryArtifact = yield* requiredSource(
    "data/quality/relationship-integrity/operational-occurrence-phases/summary.json",
  );
  const contract: RelationshipContract = yield* decodeJsonFile(
    contractArtifact.file,
    RelationshipContractSchema,
    "decodeRelationshipContract",
  );
  const proof: RelationshipEnforcementProof = yield* decodeJsonFile(
    proofArtifact.file,
    RelationshipEnforcementProofSchema,
    "decodeRelationshipEnforcementProof",
  );
  const transition = yield* decodeJsonFile(
    transitionArtifact.file,
    RelationshipTransitionReceiptSchema,
    "decodeRelationshipTransitionReceipt",
  );
  const endpointMatrix = yield* decodeJsonFile(
    endpointArtifact.file,
    RelationshipEndpointMatrixSchema,
    "decodeRelationshipEndpointMatrix",
  );
  const graphAudit: RelationshipGraphAuditSummary = yield* decodeJsonFile(
    graphAuditArtifact.file,
    RelationshipGraphAuditSummarySchema,
    "decodeRelationshipGraphAuditSummary",
  );
  const graphManifest: RelationshipGraphAuditManifest = yield* decodeJsonFile(
    graphManifestArtifact.file,
    RelationshipGraphAuditManifestSchema,
    "decodeRelationshipGraphAuditManifest",
  );
  const physicalManifest = yield* decodeJsonFile(
    physicalManifestArtifact.file,
    OccurrenceTreatmentPhysicalityManifestSchema,
    "decodeOccurrenceTreatmentPhysicalityManifest",
  );
  const physicalSummary = yield* decodeJsonFile(
    physicalSummaryArtifact.file,
    OccurrenceTreatmentPhysicalitySummarySchema,
    "decodeOccurrenceTreatmentPhysicalitySummary",
  );
  const phaseManifest = yield* decodeJsonFile(
    phaseManifestArtifact.file,
    OperationalOccurrencePhaseAuditManifestSchema,
    "decodeOperationalOccurrencePhaseAuditManifest",
  );
  const phaseSummary = yield* decodeJsonFile(
    phaseSummaryArtifact.file,
    OperationalOccurrencePhaseAuditSummarySchema,
    "decodeOperationalOccurrencePhaseAuditSummary",
  );

  const proofCanonicalSha256 = canonicalDigest(proof);
  const transitionCanonicalSha256 = canonicalDigest(transition);
  const endpointCanonicalSha256 = canonicalDigest(endpointMatrix);
  const contractPolicy = {
    identity_policy: contract.identity_policy,
    evidence_policy: contract.evidence_policy,
    finding_codes: contract.finding_codes,
    completeness_roles: contract.completeness_roles,
    migration_criteria: contract.migration_criteria,
  };
  if (
    contract.reviewed_at.trim() !== contract.reviewed_at ||
    contract.reviewed_at.length === 0 ||
    contract.reviewed_by.trim() !== contract.reviewed_by ||
    contract.reviewed_by.length === 0 ||
    canonicalJson(contractPolicy) !== canonicalJson(RELATIONSHIP_CONTRACT_POLICY_V1) ||
    !isValidFinalEndpointMatrix(endpointMatrix) ||
    contract.enforcement_proof.path !== proofArtifact.entry.source_path ||
    contract.enforcement_proof.sha256 !== proofCanonicalSha256 ||
    contract.enforcement_proof.transition_receipt.path !== transitionArtifact.entry.source_path ||
    contract.enforcement_proof.transition_receipt.sha256 !== transitionCanonicalSha256 ||
    proof.transition_receipt.path !== transitionArtifact.entry.source_path ||
    proof.transition_receipt.sha256 !== transitionCanonicalSha256 ||
    contract.endpoint_matrix.path !== endpointArtifact.entry.source_path ||
    contract.endpoint_matrix.sha256 !== endpointCanonicalSha256 ||
    proof.final_matrix.path !== endpointArtifact.entry.source_path ||
    proof.final_matrix.sha256 !== endpointCanonicalSha256
  ) {
    return yield* fail("relationship contract policy, final matrix, or canonical pointers drifted");
  }

  const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const physicalOutputRoot = "data/quality/relationship-integrity/occurrence-treatment-physicality";
  const phaseOutputRoot = "data/quality/relationship-integrity/operational-occurrence-phases";
  const expectedPhysicalOutputNames = [
    "findings.jsonl",
    "occurrence-audit.jsonl",
    "report.md",
    "summary.json",
    "treatment-audit.jsonl",
  ];
  const expectedPhaseOutputPaths = [
    "data/contracts/operational-occurrence-phases/v1/contract.json",
    "data/contracts/operational-occurrence-phases/v1/review-ledger.jsonl",
    `${phaseOutputRoot}/event-event-candidates.jsonl`,
    `${phaseOutputRoot}/findings.jsonl`,
    `${phaseOutputRoot}/report.md`,
    `${phaseOutputRoot}/summary.json`,
  ];
  if (
    canonicalJson(Object.keys(physicalManifest.files).toSorted()) !==
      canonicalJson(expectedPhysicalOutputNames) ||
    canonicalJson(Object.keys(phaseManifest.outputs).toSorted()) !==
      canonicalJson(expectedPhaseOutputPaths)
  ) {
    return yield* fail("phase or physical audit output set drifted");
  }

  const auditOutputRowCounts = new Map<string, number>();
  for (const [name, pin] of Object.entries(physicalManifest.files)) {
    const expectedPath = `${physicalOutputRoot}/${name}`;
    const bundled = verifiedBySourcePath.get(pin.path);
    if (
      pin.path !== expectedPath ||
      bundled === undefined ||
      bundled.file.metadata.bytes !== pin.bytes ||
      bundled.file.metadata.sha256 !== pin.sha256
    ) {
      return yield* fail(`physical audit output pin drifted: ${name}`);
    }
    if (pin.row_count !== undefined) {
      const text = yield* decodeMtaWikiReleaseUtf8(bundled.file.bytes, {
        operation: "countPhysicalAuditRows",
        path: bundled.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      const rows =
        text.length === 0 ? 0 : text.split("\n").filter((line) => line.length > 0).length;
      if (rows !== pin.row_count) {
        return yield* fail(`physical audit output row count drifted: ${name}`);
      }
      auditOutputRowCounts.set(pin.path, rows);
    }
  }
  for (const [path, pin] of Object.entries(phaseManifest.outputs)) {
    const bundled = verifiedBySourcePath.get(pin.path);
    if (
      pin.path !== path ||
      bundled === undefined ||
      bundled.file.metadata.bytes !== pin.bytes ||
      bundled.file.metadata.sha256 !== pin.sha256
    ) {
      return yield* fail(`phase audit output pin drifted: ${path}`);
    }
    if (pin.row_count !== undefined) {
      const text = yield* decodeMtaWikiReleaseUtf8(bundled.file.bytes, {
        operation: "countPhaseAuditRows",
        path: bundled.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      const rows =
        text.length === 0 ? 0 : text.split("\n").filter((line) => line.length > 0).length;
      if (rows !== pin.row_count) {
        return yield* fail(`phase audit output row count drifted: ${path}`);
      }
      auditOutputRowCounts.set(pin.path, rows);
    }
  }

  const physicalInputPaths = physicalManifest.input_pins.map((pin) => pin.path);
  if (
    new Set(physicalInputPaths).size !== physicalInputPaths.length ||
    physicalInputPaths.some((path) => !isSafeMtaWikiReleaseRelativePath(path)) ||
    physicalManifest.audit_fingerprint !==
      canonicalDigest({
        schema_version: physicalManifest.schema_version,
        release_id: physicalManifest.release_id,
        review_stage: physicalManifest.review_stage,
        input_pins: physicalManifest.input_pins,
        files: physicalManifest.files,
      })
  ) {
    return yield* fail("physical audit identity, fingerprint, or input paths drifted");
  }
  const usesLegacyManifestCommitment = physicalSummary.release_manifest_sha256 !== undefined;
  const usesReleaseInputFingerprint = physicalSummary.release_input_fingerprint !== undefined;
  if (usesLegacyManifestCommitment === usesReleaseInputFingerprint) {
    return yield* fail(
      "physical audit summary must declare exactly one supported release-input commitment",
    );
  }
  const uniquePhysicalInput = (predicate: (path: string) => boolean) => {
    const matches = physicalManifest.input_pins.filter((pin) => predicate(pin.path));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const physicalReleaseManifestPin = uniquePhysicalInput(
    (path) => path.startsWith("data/exports/releases/") && path.endsWith("/manifest.json"),
  );
  const physicalOccurrencePin = uniquePhysicalInput((path) =>
    path.endsWith("/operational_occurrences.jsonl"),
  );
  const physicalTreatmentPin = uniquePhysicalInput((path) =>
    path.endsWith("/treatment_components.jsonl"),
  );
  const physicalRelationPin = uniquePhysicalInput((path) => path.endsWith("/relations.jsonl"));
  const physicalCorridorPin = uniquePhysicalInput((path) => path.endsWith("/corridors.jsonl"));
  const physicalPolicyPin = uniquePhysicalInput((path) =>
    path.endsWith("/occurrence-treatment-physicality/v1/policy.json"),
  );
  const physicalLedgerPin = uniquePhysicalInput((path) =>
    path.endsWith("/occurrence-treatment-physicality/v1/review-ledger.jsonl"),
  );
  const physicalRetiredLedgerPin = uniquePhysicalInput((path) =>
    path.endsWith("/occurrence-treatment-physicality/v1/retired-review-ledger.jsonl"),
  );
  const physicalRetirementReceiptPin = uniquePhysicalInput((path) =>
    path.endsWith("/occurrence-treatment-physicality/v1/review-retirement-receipt.json"),
  );
  const physicalContractPin = uniquePhysicalInput((path) =>
    path.endsWith("/occurrence-treatment-physicality/v1/contract.json"),
  );
  const physicalCompletenessManifestPin = uniquePhysicalInput(
    (path) => path === "data/quality/relationship-integrity/completeness/manifest.json",
  );
  const physicalCompletenessRowsPin = uniquePhysicalInput(
    (path) =>
      path === "data/quality/relationship-integrity/completeness/occurrence-completeness.jsonl",
  );
  const physicalRetirementPins = physicalManifest.input_pins.filter(
    (pin): pin is RelationshipAuditRetirementPin => "retirement_id" in pin,
  );
  if (
    physicalOccurrencePin === undefined ||
    physicalTreatmentPin === undefined ||
    physicalRelationPin === undefined ||
    physicalCorridorPin === undefined ||
    physicalPolicyPin === undefined ||
    physicalLedgerPin === undefined ||
    physicalContractPin === undefined ||
    physicalCompletenessManifestPin === undefined ||
    physicalCompletenessRowsPin === undefined ||
    (usesLegacyManifestCommitment && physicalReleaseManifestPin === undefined) ||
    (!usesLegacyManifestCommitment && physicalReleaseManifestPin !== undefined) ||
    physicalRetirementPins.length > 0 !==
      (physicalRetiredLedgerPin !== undefined && physicalRetirementReceiptPin !== undefined)
  ) {
    return yield* fail("physical audit input pin set is incomplete or ambiguous");
  }
  const recognizedPhysicalInputPaths = new Set(
    [
      physicalReleaseManifestPin,
      physicalOccurrencePin,
      physicalTreatmentPin,
      physicalRelationPin,
      physicalCorridorPin,
      physicalPolicyPin,
      physicalLedgerPin,
      physicalRetiredLedgerPin,
      physicalRetirementReceiptPin,
      physicalContractPin,
      physicalCompletenessManifestPin,
      physicalCompletenessRowsPin,
      ...physicalRetirementPins,
    ]
      .filter((pin) => pin !== undefined)
      .map((pin) => pin.path),
  );
  if (recognizedPhysicalInputPaths.size !== physicalManifest.input_pins.length) {
    return yield* fail("physical audit input pin set contains an unsupported role");
  }
  if (
    physicalOccurrencePin.bytes !== input.occurrenceFile.metadata.bytes ||
    physicalOccurrencePin.sha256 !== input.occurrenceFile.metadata.sha256 ||
    physicalOccurrencePin.row_count !== input.occurrenceRows.length
  ) {
    return yield* fail("physical audit occurrence input is not the imported occurrence file");
  }
  const physicalRootPins: ReadonlyArray<readonly [RelationshipAuditFilePin, string, string]> = [
    [physicalTreatmentPin, "treatment_components.jsonl", "treatment_component"],
    [physicalRelationPin, "relations.jsonl", "relation"],
    [physicalCorridorPin, "corridors.jsonl", "corridor"],
  ];
  for (const [pin, rootPath, recordKind] of physicalRootPins) {
    const rootFile = input.manifest.files[rootPath];
    const rootCount = input.manifest.record_counts[recordKind];
    if (
      rootFile === undefined ||
      rootCount === undefined ||
      pin.bytes !== rootFile.bytes ||
      pin.sha256 !== rootFile.sha256 ||
      pin.row_count !== rootCount
    ) {
      return yield* fail(`physical audit root input drifted: ${rootPath}`);
    }
  }
  const physicalBundledInputPins: RelationshipAuditFilePin[] = [
    physicalCompletenessManifestPin,
    physicalCompletenessRowsPin,
    physicalPolicyPin,
    physicalLedgerPin,
    physicalContractPin,
    ...(physicalRetiredLedgerPin === undefined ? [] : [physicalRetiredLedgerPin]),
    ...(physicalRetirementReceiptPin === undefined ? [] : [physicalRetirementReceiptPin]),
  ];
  for (const pin of physicalBundledInputPins) {
    const bundled = verifiedBySourcePath.get(pin.path);
    if (
      bundled === undefined ||
      bundled.file.metadata.bytes !== pin.bytes ||
      bundled.file.metadata.sha256 !== pin.sha256
    ) {
      return yield* fail(`physical audit bundled input drifted: ${pin.path}`);
    }
    if (pin.row_count !== undefined) {
      const text = yield* decodeMtaWikiReleaseUtf8(bundled.file.bytes, {
        operation: "countPhysicalAuditInputRows",
        path: bundled.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      const rows =
        text.length === 0 ? 0 : text.split("\n").filter((line) => line.length > 0).length;
      if (rows !== pin.row_count) {
        return yield* fail(`physical audit bundled input row count drifted: ${pin.path}`);
      }
    }
  }

  const retirementIds = physicalRetirementPins.map((pin) => pin.retirement_id);
  if (
    new Set(retirementIds).size !== retirementIds.length ||
    retirementIds.join("\n") !== retirementIds.toSorted().join("\n")
  ) {
    return yield* fail("physical audit retirement pins must have sorted unique identities");
  }
  for (const pin of physicalRetirementPins) {
    const releasePointer = `review-retirements/source/${pin.retirement_id}.json`;
    const expectedPath = `data/exports/releases/${input.releaseId}/${releasePointer}`;
    const metadata = input.manifest.files[releasePointer];
    if (
      pin.path !== expectedPath ||
      pin.row_count !== undefined ||
      metadata === undefined ||
      metadata.bytes !== pin.bytes ||
      metadata.sha256 !== pin.sha256 ||
      !isUtcInstant(pin.accepted_at)
    ) {
      return yield* fail(`physical audit retirement input drifted: ${pin.retirement_id}`);
    }
    const retirementFile = yield* verifyMtaWikiReleaseFile({
      ...input.resolved,
      pointer: releasePointer,
      metadata,
      operation: "verifyPhysicalityOperationalRetirement",
    }).pipe(Effect.mapError(fromReleaseError));
    const retirement = yield* decodeJsonFile(
      retirementFile,
      OperationalProjectionRetirementSourceSchema,
      "decodePhysicalityOperationalRetirement",
    );
    if (
      retirement.retirement_id !== pin.retirement_id ||
      retirement.accepted_by !== pin.accepted_by ||
      retirement.accepted_at !== pin.accepted_at
    ) {
      return yield* fail(
        `physical audit retirement attribution drifted: ${pin.retirement_id}`,
        retirementFile.path,
      );
    }
  }

  const physicalReleasePins = [
    physicalOccurrencePin,
    physicalTreatmentPin,
    physicalRelationPin,
    physicalCorridorPin,
  ];
  const physicalReleaseCommitmentMatches = usesLegacyManifestCommitment
    ? physicalReleaseManifestPin !== undefined &&
      physicalReleaseManifestPin.path ===
        `data/exports/releases/${physicalManifest.release_id}/manifest.json` &&
      physicalSummary.release_manifest_sha256 === physicalReleaseManifestPin.sha256
    : physicalManifest.release_id === input.releaseId &&
      physicalSummary.release_input_fingerprint === canonicalDigest(physicalReleasePins);

  const physicalSummaryPin = physicalManifest.files["summary.json"];
  const physicalFindingsPin = physicalManifest.files["findings.jsonl"];
  if (
    physicalSummaryPin === undefined ||
    physicalFindingsPin === undefined ||
    physicalSummaryPin.sha256 !== physicalSummaryArtifact.file.metadata.sha256 ||
    physicalSummaryPin.bytes !== physicalSummaryArtifact.file.metadata.bytes ||
    physicalFindingsPin.bytes !== 0 ||
    physicalFindingsPin.sha256 !== emptySha256 ||
    physicalFindingsPin.row_count !== 0 ||
    physicalManifest.release_id !== physicalSummary.release_id ||
    !physicalReleaseCommitmentMatches ||
    physicalSummary.review_ledger_sha256 !== physicalLedgerPin.sha256 ||
    physicalSummary.policy_sha256 !== physicalPolicyPin.sha256 ||
    physicalSummary.contract_sha256 !== physicalContractPin.sha256 ||
    Object.keys(physicalSummary.finding_counts).length !== 0
  ) {
    return yield* fail("physical audit summary lineage or zero-finding proof drifted");
  }

  const eligibleRows = input.occurrenceRows.filter((row) => row.study_projection_eligible);
  const exactPhysicalRows = eligibleRows.filter((row) => row.physical_scope_record_ids.length > 0);
  const treatmentMembers = eligibleRows.flatMap((row) =>
    row.treatment.kind === "atomic" ? [row.treatment.member] : row.treatment.members,
  );
  const treatmentIds = treatmentMembers.map((member) => member.treatment_record_id);
  const physicalClassificationCount = Object.values(physicalSummary.classification_counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const physicalRequirementCount = Object.values(physicalSummary.scope_requirement_counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const physicalDispositionCount = Object.values(
    physicalSummary.occurrence_disposition_counts,
  ).reduce((sum, count) => sum + count, 0);
  const familyUniqueCount = Object.values(physicalSummary.by_treatment_family).reduce(
    (sum, value) => sum + value.unique_treatment_count,
    0,
  );
  const familyMembershipCount = Object.values(physicalSummary.by_treatment_family).reduce(
    (sum, value) => sum + value.occurrence_membership_count,
    0,
  );
  if (
    physicalSummary.eligible_occurrence_count !== eligibleRows.length ||
    physicalSummary.unique_treatment_count !== new Set(treatmentIds).size ||
    physicalSummary.treatment_membership_count !== treatmentIds.length ||
    physicalClassificationCount !== physicalSummary.unique_treatment_count ||
    physicalRequirementCount !== physicalSummary.unique_treatment_count ||
    familyUniqueCount !== physicalSummary.unique_treatment_count ||
    familyMembershipCount !== physicalSummary.treatment_membership_count ||
    Object.values(physicalSummary.by_treatment_family).some(
      (value) =>
        Object.values(value.classifications).reduce((sum, count) => sum + count, 0) !==
        value.unique_treatment_count,
    ) ||
    physicalDispositionCount !== eligibleRows.length ||
    physicalSummary.occurrence_disposition_counts.physical_scope_satisfied !==
      exactPhysicalRows.length ||
    physicalSummary.occurrence_disposition_counts.physical_scope_not_applicable !==
      eligibleRows.length - exactPhysicalRows.length
  ) {
    return yield* fail("physical audit denominators do not reconcile to imported occurrences");
  }

  const phaseOccurrencePin = phaseManifest.route_anchor_release.operational_occurrences;
  const phaseReleaseManifestPin = phaseManifest.route_anchor_release.manifest;
  const phaseSummaryPath = `${phaseOutputRoot}/summary.json`;
  const phaseFindingsPath = `${phaseOutputRoot}/findings.jsonl`;
  const phaseCandidatesPath = `${phaseOutputRoot}/event-event-candidates.jsonl`;
  const phaseLedgerPath = "data/contracts/operational-occurrence-phases/v1/review-ledger.jsonl";
  const phaseSummaryPin = phaseManifest.outputs[phaseSummaryPath];
  const phaseFindingsPin = phaseManifest.outputs[phaseFindingsPath];
  const phaseCandidatesPin = phaseManifest.outputs[phaseCandidatesPath];
  const phaseLedgerPin = phaseManifest.outputs[phaseLedgerPath];
  if (
    (phaseReleaseManifestPin === undefined &&
      phaseManifest.route_anchor_release.release_id !== input.releaseId) ||
    (phaseReleaseManifestPin !== undefined &&
      (phaseReleaseManifestPin.path !==
        `data/exports/releases/${phaseManifest.route_anchor_release.release_id}/manifest.json` ||
        phaseReleaseManifestPin.row_count !== undefined)) ||
    (input.manifest.manifest_version === 4 && phaseReleaseManifestPin === undefined) ||
    phaseOccurrencePin.bytes !== input.occurrenceFile.metadata.bytes ||
    phaseOccurrencePin.sha256 !== input.occurrenceFile.metadata.sha256 ||
    phaseOccurrencePin.row_count !== input.occurrenceRows.length ||
    phaseSummaryPin === undefined ||
    phaseFindingsPin === undefined ||
    phaseCandidatesPin === undefined ||
    phaseLedgerPin === undefined ||
    phaseSummaryPin.sha256 !== phaseSummaryArtifact.file.metadata.sha256 ||
    phaseSummaryPin.bytes !== phaseSummaryArtifact.file.metadata.bytes ||
    phaseFindingsPin.bytes !== 0 ||
    phaseFindingsPin.sha256 !== emptySha256 ||
    phaseFindingsPin.row_count !== 0 ||
    phaseManifest.route_anchor_release.release_id !== phaseSummary.release_id ||
    phaseManifest.derived_inputs.canonical_record_count !==
      Object.values(input.manifest.record_counts).reduce((sum, count) => sum + count, 0) ||
    phaseManifest.derived_inputs.operational_occurrence_count !== input.occurrenceRows.length ||
    phaseManifest.derived_inputs.relevant_canonical_record_count !== input.occurrenceRows.length ||
    phaseSummary.content_hashes.review_ledger_sha256 !== phaseLedgerPin.sha256 ||
    phaseSummary.content_hashes.event_event_candidates_sha256 !== phaseCandidatesPin.sha256 ||
    phaseSummary.content_hashes.findings_sha256 !== phaseFindingsPin.sha256 ||
    phaseSummary.content_hashes.operational_occurrences_sha256 !==
      phaseManifest.derived_inputs.operational_occurrences_sha256 ||
    phaseSummary.content_hashes.canonical_phase_projection_sha256 !==
      phaseManifest.derived_inputs.canonical_phase_projection_sha256 ||
    Object.keys(phaseSummary.finding_counts).length !== 0
  ) {
    return yield* fail("phase audit lineage or zero-finding proof drifted");
  }

  const phaseIdentityMembershipCount = input.occurrenceRows.reduce(
    (sum, row) => sum + row.phase_record_ids.length,
    0,
  );
  const uniquePhaseEventCount = new Set(input.occurrenceRows.flatMap((row) => row.phase_record_ids))
    .size;
  const projectedPhaseRelationCount = new Set(
    input.occurrenceRows.flatMap((row) => row.phase_relation_record_ids),
  ).size;
  const singlePhaseCount = input.occurrenceRows.filter(
    (row) => row.phase_relation_disposition === "single_phase",
  ).length;
  const relatedPhaseCount = input.occurrenceRows.length - singlePhaseCount;
  const phaseCandidateDispositionCount = Object.values(
    phaseSummary.counts_by_candidate_disposition,
  ).reduce((sum, count) => sum + count, 0);
  if (
    phaseSummary.occurrence_count !== input.occurrenceRows.length ||
    phaseSummary.eligible_occurrence_count !== eligibleRows.length ||
    phaseSummary.ineligible_occurrence_count !==
      input.occurrenceRows.length - eligibleRows.length ||
    phaseSummary.phase_identity_membership_count !== phaseIdentityMembershipCount ||
    phaseSummary.unique_phase_event_count !== uniquePhaseEventCount ||
    phaseSummary.projected_phase_relation_count !== projectedPhaseRelationCount ||
    phaseSummary.checked_event_event_candidate_count !== phaseCandidatesPin.row_count ||
    phaseCandidateDispositionCount !== phaseSummary.checked_event_event_candidate_count ||
    phaseSummary.counts_by_candidate_disposition.projected_reviewed_phase_relation !==
      projectedPhaseRelationCount ||
    phaseSummary.counts_by_primary_disposition.single_observed_phase_no_related_phase_asserted !==
      singlePhaseCount ||
    phaseSummary.counts_by_primary_disposition.evidence_bound_related_phases !==
      relatedPhaseCount ||
    phaseSummary.reviewed_occurrence_count !== input.occurrenceRows.length ||
    phaseSummary.single_observed_phase_count !== singlePhaseCount ||
    phaseSummary.related_phase_count !== relatedPhaseCount
  ) {
    return yield* fail("phase audit denominators do not reconcile to imported occurrences");
  }

  const graphArtifactContract = [
    { path: "findings.jsonl", hasRows: true },
    { path: "orphan-records.jsonl", hasRows: true },
    { path: "relation-audit.jsonl", hasRows: true },
    { path: "report.md", hasRows: false },
    { path: "summary.json", hasRows: false },
  ] as const;
  const rootRelations = input.manifest.files["relations.jsonl"];
  const expectedGraphFingerprint = canonicalDigest({
    contract_sha256: graphManifest.contract_sha256,
    endpoint_matrix_sha256: graphManifest.endpoint_matrix_sha256,
    canonical_relations_sha256: graphManifest.canonical_relations_sha256,
  });
  if (
    graphManifestArtifact.entry.source_path !==
      "data/quality/relationship-integrity/graph-audit/manifest.json" ||
    graphManifest.endpoint_matrix_sha256 !== endpointCanonicalSha256 ||
    rootRelations === undefined ||
    graphManifest.canonical_relations_sha256 !== rootRelations.sha256 ||
    graphManifest.input_fingerprint !== expectedGraphFingerprint ||
    graphManifest.artifacts.length !== graphArtifactContract.length ||
    graphManifest.reproduction_commands.length === 0 ||
    graphManifest.reproduction_commands.some((command) => command.trim().length === 0)
  ) {
    return yield* fail("relationship graph-audit manifest lineage drifted");
  }
  const graphArtifactRowCounts = new Map<string, number>();
  for (const [index, expected] of graphArtifactContract.entries()) {
    const pin = graphManifest.artifacts[index];
    if (
      pin === undefined ||
      pin.path !== expected.path ||
      expected.hasRows !== (pin.rows !== undefined)
    ) {
      return yield* fail("relationship graph-audit manifest artifact set drifted");
    }
    const sourcePath = `data/quality/relationship-integrity/graph-audit/${pin.path}`;
    const bundled = verifiedBySourcePath.get(sourcePath);
    if (bundled === undefined || bundled.file.metadata.sha256 !== pin.sha256) {
      return yield* fail(`relationship graph-audit artifact digest drifted: ${pin.path}`);
    }
    if (pin.rows !== undefined) {
      const text = yield* decodeMtaWikiReleaseUtf8(bundled.file.bytes, {
        operation: "countRelationshipGraphAuditRows",
        path: bundled.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      const rows =
        text.length === 0 ? 0 : text.split("\n").filter((line) => line.length > 0).length;
      if (rows !== pin.rows) {
        return yield* fail(`relationship graph-audit row count drifted: ${pin.path}`);
      }
      graphArtifactRowCounts.set(pin.path, rows);
    }
  }
  const previousProofArtifact = verifiedBySourcePath.get(proof.previous_proof.path);
  if (previousProofArtifact === undefined) {
    return yield* fail("relationship proof previous_proof is absent from the release bundle");
  }
  const previousProofValue = yield* decodeJsonFile(
    previousProofArtifact.file,
    Schema.Unknown,
    "decodePreviousRelationshipEnforcementProof",
  );
  if (
    canonicalJson(proof.previous_proof) !== canonicalJson(transition.previous_proof) ||
    canonicalDigest(previousProofValue) !== proof.previous_proof.sha256 ||
    canonicalJson(transition.final_matrix) !== canonicalJson(proof.final_matrix)
  ) {
    return yield* fail("relationship enforcement transition lineage commitments drifted");
  }

  const requiredGateIds = [...contract.enforcement_proof.required_gate_ids];
  const proofGateIds = proof.gates.map((gate) => gate.gate_id);
  if (
    !isSortedUnique(requiredGateIds) ||
    !isSortedUnique(proofGateIds) ||
    proof.gate_count !== proof.gates.length ||
    canonicalJson(requiredGateIds) !== canonicalJson(proofGateIds) ||
    canonicalJson(requiredGateIds) !== canonicalJson(REQUIRED_RELATIONSHIP_GATE_IDS)
  ) {
    return yield* fail("relationship proof gate identities are incomplete or inconsistent");
  }
  const previousGateIds = transition.previous_gates.map((gate) => gate.gate_id).toSorted();
  if (
    canonicalJson(previousGateIds) !== canonicalJson(requiredGateIds) ||
    !isSortedUnique(transition.previous_gates.map((gate) => gate.gate_id))
  ) {
    return yield* fail("relationship transition previous-gate identities are incomplete");
  }
  if (
    !sameRolePaths(transition.invariant_artifacts, RELATIONSHIP_INVARIANT_ROLE_PATHS) ||
    !sameRolePaths(transition.refresh_artifacts, RELATIONSHIP_REFRESH_ROLE_PATHS) ||
    transition.invariant_artifacts.some((pin) => !isSafeMtaWikiReleaseRelativePath(pin.path)) ||
    transition.refresh_artifacts.some(
      (pin) =>
        !isSafeMtaWikiReleaseRelativePath(pin.path) ||
        (pin.role === "canonical_db"
          ? pin.archive_path !== undefined || pin.transition_fingerprint !== undefined
          : pin.archive_path === undefined ||
            pin.transition_fingerprint === undefined ||
            !isSafeMtaWikiReleaseRelativePath(pin.archive_path)),
    )
  ) {
    return yield* fail("relationship transition invariant or refresh role contract drifted");
  }
  for (const pin of transition.invariant_artifacts) {
    const bundled = verifiedBySourcePath.get(pin.path);
    if (pin.role === "final_endpoint_matrix") {
      if (
        pin.path !== endpointArtifact.entry.source_path ||
        pin.sha256 !== endpointCanonicalSha256
      ) {
        return yield* fail("relationship transition final-matrix invariant drifted");
      }
    } else if (
      (pin.role === "determinism_consumer_summary" && bundled === undefined) ||
      (bundled !== undefined && bundled.file.metadata.sha256 !== pin.sha256)
    ) {
      return yield* fail(`relationship transition invariant digest drifted: ${pin.role}`);
    }
  }

  const archivedGateSources: Array<{ role: string; path: string; sha256: string }> = [];
  for (const gate of transition.previous_gates) {
    const artifact = verifiedBySourcePath.get(gate.path);
    if (
      !isSafeMtaWikiReleaseRelativePath(gate.path) ||
      artifact === undefined ||
      artifact.file.metadata.sha256 !== gate.sha256
    ) {
      return yield* fail(`relationship transition previous gate drifted: ${gate.gate_id}`);
    }
    const decodedGate = yield* decodeJsonFile(
      artifact.file,
      RelationshipEnforcementGateSchema,
      `decodePreviousRelationshipEnforcementGate:${gate.gate_id}`,
    );
    const expectedSources =
      RELATIONSHIP_GATE_SOURCE_PATHS[gate.gate_id as keyof typeof RELATIONSHIP_GATE_SOURCE_PATHS];
    if (
      decodedGate.artifact_id !== `relationship-contract-v1-enforcement-gate:${gate.gate_id}` ||
      decodedGate.gate_id !== gate.gate_id ||
      decodedGate.source_count !== decodedGate.source_artifacts.length ||
      decodedGate.derived_violation_count !== 0 ||
      expectedSources === undefined ||
      !sameRolePaths(decodedGate.source_artifacts, expectedSources) ||
      decodedGate.source_artifacts.some((source) => !isSafeMtaWikiReleaseRelativePath(source.path))
    ) {
      return yield* fail(
        `relationship transition previous gate source set drifted: ${gate.gate_id}`,
      );
    }
    archivedGateSources.push(...decodedGate.source_artifacts);
  }
  archivedGateSources.sort(
    (left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path),
  );
  const receiptSources = transition.pre_promotion_sources.map(({ role, path, sha256 }) => ({
    role,
    path,
    sha256,
  }));
  const sortedReceiptSources = [...receiptSources].toSorted(
    (left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path),
  );
  if (
    canonicalJson(receiptSources) !== canonicalJson(sortedReceiptSources) ||
    new Set(receiptSources.map((source) => source.role)).size !== receiptSources.length ||
    new Set(receiptSources.map((source) => source.path)).size !== receiptSources.length ||
    canonicalJson(archivedGateSources) !== canonicalJson(receiptSources)
  ) {
    return yield* fail(
      "relationship transition archived gates do not reconcile with pre-promotion sources",
    );
  }
  const refreshRoles = new Set<string>(
    RELATIONSHIP_REFRESH_ROLE_PATHS.map(({ role }) => role).filter(
      (role) => role !== "canonical_db",
    ),
  );
  for (const source of transition.pre_promotion_sources) {
    const active = verifiedBySourcePath.get(source.path);
    const archive = verifiedBySourcePath.get(source.archive_path);
    const needsFingerprint = refreshRoles.has(source.role);
    const isManifestV5ReleaseProjectionRefresh =
      input.manifest.manifest_version === 5 &&
      (source.role === "occurrence_treatment_physicality_summary" ||
        source.role === "phase_review_summary" ||
        source.role === "relationship_completeness_summary");
    if (
      !isSafeMtaWikiReleaseRelativePath(source.path) ||
      !isSafeMtaWikiReleaseRelativePath(source.archive_path) ||
      active === undefined ||
      archive === undefined ||
      archive.file.metadata.sha256 !== source.sha256 ||
      needsFingerprint !== (source.transition_fingerprint !== undefined) ||
      (!needsFingerprint &&
        !isManifestV5ReleaseProjectionRefresh &&
        active.file.metadata.sha256 !== source.sha256)
    ) {
      return yield* fail(`relationship transition source archive drifted: ${source.role}`);
    }
    if (source.transition_fingerprint !== undefined) {
      const activeText = yield* decodeMtaWikiReleaseUtf8(active.file.bytes, {
        operation: "fingerprintRelationshipTransitionActiveSource",
        path: active.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      const archiveText = yield* decodeMtaWikiReleaseUtf8(archive.file.bytes, {
        operation: "fingerprintRelationshipTransitionArchivedSource",
        path: archive.file.path,
      }).pipe(Effect.mapError(fromReleaseError));
      if (
        relationshipTransitionFingerprint(source.role, activeText) !==
          source.transition_fingerprint ||
        relationshipTransitionFingerprint(source.role, archiveText) !==
          source.transition_fingerprint
      ) {
        return yield* fail(`relationship transition source fingerprint drifted: ${source.role}`);
      }
    }
  }
  for (const artifact of transition.refresh_artifacts) {
    if (artifact.role === "canonical_db") continue;
    const active = verifiedBySourcePath.get(artifact.path);
    const archive =
      artifact.archive_path === undefined
        ? undefined
        : verifiedBySourcePath.get(artifact.archive_path);
    const prior = transition.pre_promotion_sources.find((source) => source.role === artifact.role);
    if (
      active === undefined ||
      archive === undefined ||
      prior === undefined ||
      artifact.archive_path !== prior.archive_path ||
      artifact.path !== prior.path ||
      artifact.sha256 !== prior.sha256 ||
      artifact.transition_fingerprint !== prior.transition_fingerprint ||
      archive.file.metadata.sha256 !== artifact.sha256
    ) {
      return yield* fail(`relationship transition refresh commitment drifted: ${artifact.role}`);
    }
  }
  for (const gate of proof.gates) {
    const gateArtifact = yield* required(`enforcement_gate:${gate.gate_id}`);
    const decodedGate = yield* decodeJsonFile(
      gateArtifact.file,
      RelationshipEnforcementGateSchema,
      `decodeRelationshipEnforcementGate:${gate.gate_id}`,
    );
    if (
      gate.artifact_path !== gateArtifact.entry.source_path ||
      gate.artifact_sha256 !== gateArtifact.file.metadata.sha256 ||
      decodedGate.artifact_id !== `relationship-contract-v1-enforcement-gate:${gate.gate_id}` ||
      decodedGate.gate_id !== gate.gate_id ||
      decodedGate.source_count !== decodedGate.source_artifacts.length ||
      decodedGate.derived_violation_count !== 0
    ) {
      return yield* fail(`relationship enforcement gate mismatch: ${gate.gate_id}`);
    }
    const expectedSources =
      RELATIONSHIP_GATE_SOURCE_PATHS[gate.gate_id as keyof typeof RELATIONSHIP_GATE_SOURCE_PATHS];
    if (
      expectedSources === undefined ||
      !sameRolePaths(decodedGate.source_artifacts, expectedSources) ||
      decodedGate.source_artifacts.some((source) => {
        const bundled = verifiedBySourcePath.get(source.path);
        return (
          !isSafeMtaWikiReleaseRelativePath(source.path) ||
          bundled === undefined ||
          bundled.file.metadata.sha256 !== source.sha256
        );
      })
    ) {
      return yield* fail(`relationship enforcement gate source set drifted: ${gate.gate_id}`);
    }
  }

  const manifestRelationCount = input.manifest.record_counts["relation"] ?? -1;
  const manifestRecordCount = Object.values(input.manifest.record_counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const graphFindingCodeCount = Object.values(graphAudit.findings_by_code).reduce(
    (sum, count) => sum + count,
    0,
  );
  const graphFindingSeverityCount = Object.values(graphAudit.findings_by_severity).reduce(
    (sum, count) => sum + count,
    0,
  );
  const graphDispositionCount = Object.values(graphAudit.primary_dispositions).reduce(
    (sum, count) => sum + count,
    0,
  );
  const graphOrphanCount = Object.values(graphAudit.orphan_records_by_kind).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (
    contract.endpoint_matrix.relation_count !== manifestRelationCount ||
    proof.final_matrix.relation_count !== manifestRelationCount ||
    endpointMatrix.covered_relation_count !== manifestRelationCount ||
    graphAudit.distinct_relation_kind_count !== endpointMatrix.relation_kind_rule_count ||
    graphAudit.contract_rule_count !== endpointMatrix.relation_kind_rule_count ||
    graphAudit.canonical_relation_count !== manifestRelationCount ||
    graphAudit.contract_covered_relation_count !== manifestRelationCount ||
    graphAudit.canonical_record_count !== manifestRecordCount ||
    graphAudit.finding_count !== graphFindingCodeCount ||
    graphAudit.finding_count !== graphFindingSeverityCount ||
    graphDispositionCount !== manifestRelationCount ||
    graphOrphanCount !== (graphAudit.findings_by_code["REL_ORPHAN_RECORD"] ?? -1) ||
    (graphArtifactRowCounts.get("findings.jsonl") ?? -1) +
      (graphArtifactRowCounts.get("orphan-records.jsonl") ?? -1) !==
      graphAudit.finding_count ||
    graphArtifactRowCounts.get("orphan-records.jsonl") !== graphOrphanCount ||
    graphArtifactRowCounts.get("relation-audit.jsonl") !== manifestRelationCount ||
    contract.endpoint_matrix.tuple_count !== proof.final_matrix.tuple_count ||
    contract.endpoint_matrix.relation_ids_sha256 !== proof.final_matrix.relation_ids_sha256 ||
    contract.endpoint_matrix.tuple_set_sha256 !== proof.final_matrix.tuple_set_sha256 ||
    endpointMatrix.relation_ids_sha256 !== proof.final_matrix.relation_ids_sha256 ||
    endpointMatrix.tuple_set_sha256 !== proof.final_matrix.tuple_set_sha256 ||
    (graphAudit.findings_by_severity["error"] ?? 0) !== 0 ||
    (graphAudit.findings_by_code["REL_FAMILY_TYPE_SUSPECT_REVIEWED"] ?? 0) !== 3 ||
    graphAudit.finding_count !==
      (graphAudit.findings_by_code["REL_FAMILY_TYPE_SUSPECT_REVIEWED"] ?? 0) +
        (graphAudit.findings_by_code["REL_ORPHAN_RECORD"] ?? 0)
  ) {
    return yield* fail("relationship graph counts, matrix identities, or advisory totals drifted");
  }

  return {
    bundle: importedFile(input.bundleFile, input.releaseId),
    bundleId: bundle.bundle_id,
    contractId: bundle.contract_id,
    validationMode: bundle.validation_mode,
    artifactCount: bundle.artifact_count,
    verifiedArtifactCount: verifiedByRole.size,
    descriptor: {
      sourcePath: bundle.descriptor.source_path,
      bytes: bundle.descriptor.bytes,
      sha256: bundle.descriptor.sha256,
    },
    contract: {
      file: importedFile(contractArtifact.file, input.releaseId),
      contractStatus: contract.contract_status,
      enforcementState: contract.enforcement_state,
      reviewedAt: contract.reviewed_at,
      reviewedBy: contract.reviewed_by,
    },
    enforcementProof: {
      file: importedFile(proofArtifact.file, input.releaseId),
      canonicalSha256: proofCanonicalSha256,
      proofId: proof.proof_id,
      proofStage: proof.proof_stage,
      proofStatus: proof.proof_status,
      gateCount: proof.gate_count,
      totalViolationCount: proof.total_violation_count,
    },
    transitionReceipt: {
      file: importedFile(transitionArtifact.file, input.releaseId),
      canonicalSha256: transitionCanonicalSha256,
    },
    endpointMatrix: {
      file: importedFile(endpointArtifact.file, input.releaseId),
      canonicalSha256: endpointCanonicalSha256,
      relationCount: proof.final_matrix.relation_count,
      tupleCount: proof.final_matrix.tuple_count,
    },
    graphAudit: {
      file: importedFile(graphAuditArtifact.file, input.releaseId),
      canonicalRecordCount: graphAudit.canonical_record_count,
      canonicalRelationCount: graphAudit.canonical_relation_count,
      enforceableViolationCount: proof.total_violation_count,
      reviewedNonEnforceableAdvisoryCount:
        graphAudit.findings_by_code["REL_FAMILY_TYPE_SUSPECT_REVIEWED"] ?? 0,
      informationalOrphanRecordCount: graphAudit.findings_by_code["REL_ORPHAN_RECORD"] ?? 0,
    },
  };
});

const buildImportArtifactV3 = Effect.fn("MtaWikiOperationalOccurrences.buildArtifactV3")(
  function* (input: {
    manifest: ReleaseManifestV3;
    manifestSha256: string;
    occurrenceFile: VerifiedMtaWikiReleaseFile;
    summaryFile: VerifiedMtaWikiReleaseFile;
    reviewFile: VerifiedMtaWikiReleaseFile;
    summary: OperationalOccurrenceSummary;
    snapshot: OperationalOccurrenceReviewSnapshot;
    rows: readonly OperationalOccurrenceRow[];
  }) {
    const projectionRejections = input.rows
      .filter((row) => !row.study_projection_eligible)
      .map((row) => ({
        occurrenceId: row.occurrence_id,
        reasonCodes: uniqueSorted(row.exclusion_reasons),
      }));
    const value: unknown = {
      artifactKind: "bp.studio.mta_wiki_operational_occurrences.v3",
      schemaVersion: 3,
      sourceRelease: {
        manifestVersion: 3,
        releaseId: input.manifest.release_id,
        generatorCommit: input.manifest.generator_commit,
        manifestPath: `data/exports/releases/${input.manifest.release_id}/manifest.json`,
        manifestSha256: input.manifestSha256,
        operationalOccurrenceContractVersion: 1,
        operationalOccurrenceReviewDecisionContractVersion: 1,
        occurrences: importedFile(input.occurrenceFile, input.manifest.release_id),
        summary: importedFile(input.summaryFile, input.manifest.release_id),
        reviewDecisions: importedFile(input.reviewFile, input.manifest.release_id),
        reviewDecisionCount: input.snapshot.decision_count,
      },
      producerSummary: input.summary,
      summary: {
        sourceOccurrenceCount: input.rows.length,
        eligibleOccurrenceCount: input.rows.filter((row) => row.study_projection_eligible).length,
        routeProjectionCount: input.summary.candidate_projection_count,
        rejectedOccurrenceCount: projectionRejections.length,
        countsByRejectionReason: countBy(
          projectionRejections.flatMap((entry) => entry.reasonCodes),
        ),
      },
      occurrences: input.rows,
      projectionRejections,
    };
    return yield* decodeStrict({
      schema: MtaWikiOperationalOccurrenceImportArtifactV3Schema,
      value,
      operation: "buildOperationalOccurrenceImportArtifact",
      path: input.occurrenceFile.path,
    });
  },
);

const buildImportArtifactV4 = Effect.fn("MtaWikiOperationalOccurrences.buildArtifactV4")(
  function* (input: {
    manifest: ReleaseManifestV4;
    manifestSha256: string;
    occurrenceFile: VerifiedMtaWikiReleaseFile;
    summaryFile: VerifiedMtaWikiReleaseFile;
    reviewFile: VerifiedMtaWikiReleaseFile;
    summary: OperationalOccurrenceSummaryV2;
    snapshot: OperationalOccurrenceReviewSnapshotV1Rc22Inspection;
    rows: readonly OperationalOccurrenceRowV2[];
    producerReviewCompatibility:
      | "compatible"
      | "known_rc22_review_v1_physical_scope_incompatibility";
    relationshipIntegrity: unknown;
  }) {
    const projectionRejections = input.rows
      .filter((row) => !row.study_projection_eligible)
      .map((row) => ({
        occurrenceId: row.occurrence_id,
        reasonCodes: uniqueSorted(row.exclusion_reasons),
      }));
    const producerReviewStatus =
      input.producerReviewCompatibility === "compatible"
        ? ({ compatibility: "compatible", promotionEligible: true } as const)
        : ({
            compatibility: "known_rc22_review_v1_physical_scope_incompatibility",
            promotionEligible: false,
          } as const);
    const value: unknown = {
      artifactKind: "bp.studio.mta_wiki_operational_occurrences.v4",
      schemaVersion: 4,
      sourceRelease: {
        manifestVersion: 4,
        releaseId: input.manifest.release_id,
        generatorCommit: input.manifest.generator_commit,
        manifestPath: `data/exports/releases/${input.manifest.release_id}/manifest.json`,
        manifestSha256: input.manifestSha256,
        operationalOccurrenceContractVersion: 2,
        operationalOccurrenceReviewDecisionContractVersion: 1,
        relationshipIntegrityBundleContractVersion: 1,
        producerReviewStatus,
        occurrences: importedFile(input.occurrenceFile, input.manifest.release_id),
        summary: importedFile(input.summaryFile, input.manifest.release_id),
        reviewDecisions: importedFile(input.reviewFile, input.manifest.release_id),
        reviewDecisionCount: input.snapshot.decision_count,
        relationshipIntegrity: input.relationshipIntegrity,
      },
      producerSummary: input.summary,
      summary: {
        sourceOccurrenceCount: input.rows.length,
        eligibleOccurrenceCount: input.rows.filter((row) => row.study_projection_eligible).length,
        routeProjectionCount: input.summary.candidate_projection_count,
        rejectedOccurrenceCount: projectionRejections.length,
        countsByRejectionReason: countBy(
          projectionRejections.flatMap((entry) => entry.reasonCodes),
        ),
        singlePhaseOccurrenceCount: input.rows.filter(
          (row) => row.phase_relation_disposition === "single_phase",
        ).length,
        relatedPhaseOccurrenceCount: input.rows.filter(
          (row) => row.phase_relation_disposition === "related_phases",
        ).length,
        exactPhysicalScopeOccurrenceCount: input.rows.filter(
          (row) => row.physical_scope_record_ids.length > 0,
        ).length,
      },
      occurrences: input.rows,
      projectionRejections,
    };
    return yield* decodeStrict({
      schema: MtaWikiOperationalOccurrenceImportArtifactV4Schema,
      value,
      operation: "buildOperationalOccurrenceImportArtifactV4",
      path: input.occurrenceFile.path,
    });
  },
);

const buildImportArtifactV5 = Effect.fn("MtaWikiOperationalOccurrences.buildArtifactV5")(
  function* (input: {
    manifest: ReleaseManifestV5;
    manifestSha256: string;
    occurrenceFile: VerifiedMtaWikiReleaseFile;
    summaryFile: VerifiedMtaWikiReleaseFile;
    reviewFile: VerifiedMtaWikiReleaseFile;
    routeIdentityFile: VerifiedMtaWikiReleaseFile;
    summary: OperationalOccurrenceSummaryV2;
    snapshot: OperationalOccurrenceReviewSnapshot;
    rows: readonly OperationalOccurrenceRowV2[];
    relationshipIntegrity: unknown;
    retirementClosure: VerifiedManifestV5OccurrenceRetirements;
  }) {
    const projectionRejections = input.rows
      .filter((row) => !row.study_projection_eligible)
      .map((row) => ({
        occurrenceId: row.occurrence_id,
        reasonCodes: uniqueSorted(row.exclusion_reasons),
      }));
    const value: unknown = {
      artifactKind: "bp.studio.mta_wiki_operational_occurrences.v5",
      schemaVersion: 5,
      sourceRelease: {
        manifestVersion: 5,
        releaseId: input.manifest.release_id,
        generatorCommit: input.manifest.generator_commit,
        manifestPath: `data/exports/releases/${input.manifest.release_id}/manifest.json`,
        manifestSha256: input.manifestSha256,
        operationalOccurrenceContractVersion: 2,
        operationalOccurrenceReviewDecisionContractVersion:
          input.manifest.contract_versions.operational_occurrence_review_decisions,
        relationshipIntegrityBundleContractVersion: 1,
        routeIdentityContractVersion: 1,
        producerReviewStatus: {
          compatibility: "compatible",
          promotionEligible: true,
        },
        occurrences: importedFile(input.occurrenceFile, input.manifest.release_id),
        summary: importedFile(input.summaryFile, input.manifest.release_id),
        reviewDecisions: importedFile(input.reviewFile, input.manifest.release_id),
        reviewDecisionCount: input.snapshot.decision_count,
        reviewSourceDecisionCount: input.retirementClosure.sourceDecisionCount,
        reviewRetirementCount: input.retirementClosure.retirementCount,
        reviewRetirements: input.retirementClosure.retirements,
        routeIdentitySnapshot: importedFile(input.routeIdentityFile, input.manifest.release_id),
        relationshipIntegrity: input.relationshipIntegrity,
      },
      producerSummary: input.summary,
      summary: {
        sourceOccurrenceCount: input.rows.length,
        eligibleOccurrenceCount: input.rows.filter((row) => row.study_projection_eligible).length,
        routeProjectionCount: input.summary.candidate_projection_count,
        rejectedOccurrenceCount: projectionRejections.length,
        countsByRejectionReason: countBy(
          projectionRejections.flatMap((entry) => entry.reasonCodes),
        ),
        singlePhaseOccurrenceCount: input.rows.filter(
          (row) => row.phase_relation_disposition === "single_phase",
        ).length,
        relatedPhaseOccurrenceCount: input.rows.filter(
          (row) => row.phase_relation_disposition === "related_phases",
        ).length,
        exactPhysicalScopeOccurrenceCount: input.rows.filter(
          (row) => row.physical_scope_record_ids.length > 0,
        ).length,
      },
      occurrences: input.rows,
      projectionRejections,
    };
    return yield* decodeStrict({
      schema: MtaWikiOperationalOccurrenceImportArtifactV5Schema,
      value,
      operation: "buildOperationalOccurrenceImportArtifactV5",
      path: input.occurrenceFile.path,
    });
  },
);

export const importMtaWikiOperationalOccurrences = Effect.fn("importMtaWikiOperationalOccurrences")(
  function* (input: ImportMtaWikiOperationalOccurrencesInput) {
    const resolved = yield* resolveMtaWikiRelease(input).pipe(Effect.mapError(fromReleaseError));
    const manifestPath = yield* safeMtaWikiReleaseFilePath({
      ...resolved,
      pointer: "manifest.json",
      operation: "readManifest",
    }).pipe(Effect.mapError(fromReleaseError));
    const manifestBytes = yield* readMtaWikiReleaseBytes(manifestPath, "readManifest").pipe(
      Effect.mapError(fromReleaseError),
    );
    const actualManifestSha256 = sha256Bytes(manifestBytes);
    if (actualManifestSha256 !== input.wikiManifestSha256) {
      return yield* importError({
        code: "hash_mismatch",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `expected ${input.wikiManifestSha256}, received ${actualManifestSha256}`,
      });
    }
    const quarantineStatus = yield* readMtaWikiReleaseQuarantineStatus({
      mtaWikiRoot: input.mtaWikiRoot,
      wikiRelease: input.wikiRelease,
      wikiManifestSha256: actualManifestSha256,
    }).pipe(Effect.mapError(fromReleaseError));
    const isFingerprintableRc22Inspection =
      quarantineStatus !== null &&
      input.wikiRelease === "v1-rc22" &&
      actualManifestSha256 === RC22_MANIFEST_SHA256 &&
      quarantineStatus.recordSchemaVersion === 1 &&
      quarantineStatus.reasonCode === "contract_payload_strict_decode_failed";
    if (quarantineStatus !== null && !isFingerprintableRc22Inspection) {
      return yield* importError({
        code: "contract_incompatible",
        operation: "verifyReleaseStatus",
        path: manifestPath,
        detail: `MTA Wiki release ${input.wikiRelease} is quarantined (${quarantineStatus.reasonCode}): ${quarantineStatus.reason}`,
      });
    }
    const manifestText = yield* decodeMtaWikiReleaseUtf8(manifestBytes, {
      operation: "decodeManifest",
      path: manifestPath,
    }).pipe(Effect.mapError(fromReleaseError));
    const manifestValue = yield* parseJson(manifestText, {
      operation: "decodeManifest",
      path: manifestPath,
    });
    const manifestVersion =
      typeof manifestValue === "object" && manifestValue !== null && !Array.isArray(manifestValue)
        ? (manifestValue as Record<string, unknown>)["manifest_version"]
        : undefined;
    let manifest: ReleaseManifest;
    if (manifestVersion === MANIFEST_VERSION_V3) {
      manifest = yield* decodeStrict({
        schema: ReleaseManifestV3Schema,
        value: manifestValue,
        operation: "decodeManifestV3",
        path: manifestPath,
      });
    } else if (manifestVersion === MANIFEST_VERSION_V4) {
      manifest = yield* decodeStrict({
        schema: ReleaseManifestV4Schema,
        value: manifestValue,
        operation: "decodeManifestV4",
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
      return yield* importError({
        code: "schema_mismatch",
        operation: "decodeManifest",
        path: manifestPath,
        detail: `unsupported manifest_version ${String(manifestVersion)}; expected 3, 4, or 5`,
      });
    }
    if (manifest.release_id !== input.wikiRelease) {
      return yield* importError({
        code: "release_mismatch",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `expected release_id ${input.wikiRelease}, received ${manifest.release_id}`,
      });
    }

    const unsafeFileKey = Object.keys(manifest.files).find(
      (pointer) => !isSafeMtaWikiReleaseRelativePath(pointer),
    );
    if (unsafeFileKey !== undefined) {
      return yield* importError({
        code: "unsafe_path",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `manifest files contains an unsafe release-relative path: ${unsafeFileKey}`,
      });
    }
    const allPointers = Object.values(manifest.pointers).filter(
      (pointer): pointer is string => pointer !== null,
    );
    const unsafePointer = allPointers.find((pointer) => !isSafeMtaWikiReleaseRelativePath(pointer));
    if (unsafePointer !== undefined) {
      return yield* importError({
        code: "unsafe_path",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `manifest pointers contains an unsafe release-relative path: ${unsafePointer}`,
      });
    }

    const addressed = [
      {
        pointer: manifest.pointers.operational_anchors,
        operation: "verifyOperationalAnchors",
      },
      {
        pointer: manifest.pointers.operational_anchor_summary,
        operation: "verifyOperationalAnchorSummary",
      },
      {
        pointer: manifest.pointers.operational_anchor_review_decisions,
        operation: "verifyOperationalAnchorReviewDecisions",
      },
      {
        pointer: manifest.pointers.operational_occurrences,
        operation: "verifyOperationalOccurrences",
      },
      {
        pointer: manifest.pointers.operational_occurrence_summary,
        operation: "verifyOperationalOccurrenceSummary",
      },
      {
        pointer: manifest.pointers.operational_occurrence_review_decisions,
        operation: "verifyOperationalOccurrenceReviewDecisions",
      },
      ...(manifest.manifest_version === MANIFEST_VERSION_V4 ||
      manifest.manifest_version === MANIFEST_VERSION_V5
        ? [
            {
              pointer: manifest.pointers.relationship_integrity_bundle,
              operation: "verifyRelationshipIntegrityBundle",
            },
          ]
        : []),
      ...(manifest.manifest_version === MANIFEST_VERSION_V5
        ? [
            {
              pointer: manifest.pointers.route_anchors,
              operation: "verifyRouteAnchors",
            },
            {
              pointer: manifest.pointers.route_identity_snapshot,
              operation: "verifyRouteIdentitySnapshot",
            },
          ]
        : []),
    ] as const;
    const pointers = addressed.map(({ pointer }) => pointer);
    if (new Set(pointers).size !== pointers.length) {
      return yield* importError({
        code: "invalid_input",
        operation: "verifyManifest",
        path: manifestPath,
        detail: `all ${pointers.length} addressed release pointers must be different files`,
      });
    }

    const verifiedFiles: VerifiedMtaWikiReleaseFile[] = [];
    for (const entry of addressed) {
      if (!Object.hasOwn(manifest.files, entry.pointer)) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${entry.pointer}`,
        });
      }
      const metadata = manifest.files[entry.pointer];
      if (metadata === undefined) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: `files is missing ${entry.pointer}`,
        });
      }
      verifiedFiles.push(
        yield* verifyMtaWikiReleaseFile({
          ...resolved,
          pointer: entry.pointer,
          metadata,
          operation: entry.operation,
        }).pipe(Effect.mapError(fromReleaseError)),
      );
    }
    const occurrenceFile = verifiedFiles[3];
    const summaryFile = verifiedFiles[4];
    const reviewFile = verifiedFiles[5];
    if (occurrenceFile === undefined || summaryFile === undefined || reviewFile === undefined) {
      return yield* importError({
        code: "missing_manifest_file",
        operation: "verifyManifest",
        path: manifestPath,
        detail: "manifest occurrence file verification is incomplete",
      });
    }

    const canonicalAddressedTargets = verifiedFiles.map((file) => file.path);
    if (new Set(canonicalAddressedTargets).size !== canonicalAddressedTargets.length) {
      return yield* importError({
        code: "unsafe_path",
        operation: "verifyManifest",
        path: manifestPath,
        detail: "multiple addressed release pointers resolve to the same canonical file",
      });
    }

    let artifact: MtaWikiOperationalOccurrenceImportArtifact;
    if (manifest.manifest_version === MANIFEST_VERSION_V3) {
      const rows = yield* decodeOccurrenceRows(occurrenceFile);
      const summary = yield* decodeJsonFile(
        summaryFile,
        OperationalOccurrenceSummarySchema,
        "decodeOperationalOccurrenceSummary",
      );
      const snapshot = yield* decodeJsonFile(
        reviewFile,
        OperationalOccurrenceReviewSnapshotV1Schema,
        "decodeOperationalOccurrenceReviewSnapshot",
      );
      yield* validateSummary(rows, summary, summaryFile.path);
      yield* validateReviewSnapshot({
        rows,
        snapshot,
        path: reviewFile.path,
        comparisonMode: "declared_review_v1",
      });
      artifact = yield* buildImportArtifactV3({
        manifest,
        manifestSha256: actualManifestSha256,
        occurrenceFile,
        summaryFile,
        reviewFile,
        summary,
        snapshot,
        rows,
      });
    } else if (manifest.manifest_version === MANIFEST_VERSION_V4) {
      const bundleFile = verifiedFiles[6];
      if (bundleFile === undefined) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail: "manifest-v4 relationship bundle verification is incomplete",
        });
      }
      const rows = yield* decodeOccurrenceRowsV2(occurrenceFile);
      const summary = yield* decodeJsonFile(
        summaryFile,
        OperationalOccurrenceSummaryV2Schema,
        "decodeOperationalOccurrenceSummaryV2",
      );
      const inspectionSnapshot = yield* decodeJsonFile(
        reviewFile,
        OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema,
        "decodeOperationalOccurrenceReviewSnapshotV1ForV2Inspection",
      );
      const producerReviewCompatibility = yield* reviewCompatibilityStatus({
        manifestSha256: actualManifestSha256,
        reviewFile,
        snapshot: inspectionSnapshot,
      });
      let snapshot: OperationalOccurrenceReviewSnapshotV1Rc22Inspection = inspectionSnapshot;
      if (producerReviewCompatibility === "compatible") {
        snapshot = yield* decodeJsonFile(
          reviewFile,
          OperationalOccurrenceReviewSnapshotV1Schema,
          "decodeOperationalOccurrenceReviewSnapshotV1",
        );
      }
      yield* validateSummaryV2(rows, summary, summaryFile.path);
      const relationshipIntegrity = yield* verifyRelationshipIntegrity({
        manifest,
        manifestSha256: actualManifestSha256,
        releaseId: manifest.release_id,
        manifestPath,
        resolved,
        bundleFile,
        occurrenceFile,
        occurrenceRows: rows,
      });
      yield* validateReviewSnapshot({
        rows,
        snapshot,
        path: reviewFile.path,
        comparisonMode:
          producerReviewCompatibility === "known_rc22_review_v1_physical_scope_incompatibility"
            ? "fingerprinted_rc22_inspection"
            : "declared_review_v1",
      });
      artifact = yield* buildImportArtifactV4({
        manifest,
        manifestSha256: actualManifestSha256,
        occurrenceFile,
        summaryFile,
        reviewFile,
        summary,
        snapshot,
        rows,
        producerReviewCompatibility,
        relationshipIntegrity,
      });
    } else {
      const bundleFile = verifiedFiles[6];
      const routeAnchorFile = verifiedFiles[7];
      const routeIdentityFile = verifiedFiles[8];
      if (
        bundleFile === undefined ||
        routeAnchorFile === undefined ||
        routeIdentityFile === undefined
      ) {
        return yield* importError({
          code: "missing_manifest_file",
          operation: "verifyManifest",
          path: manifestPath,
          detail:
            "manifest-v5 relationship bundle or route identity snapshot verification is incomplete",
        });
      }
      const rows = yield* decodeOccurrenceRowsV2(occurrenceFile);
      const summary = yield* decodeJsonFile(
        summaryFile,
        OperationalOccurrenceSummaryV2Schema,
        "decodeOperationalOccurrenceSummaryV2",
      );
      const snapshot = yield* decodeJsonFile(
        reviewFile,
        OperationalOccurrenceReviewSnapshotSchema,
        "decodeOperationalOccurrenceReviewSnapshotV5",
      );
      if (
        manifest.contract_versions.operational_occurrence_review_decisions !==
        snapshot.snapshot_version
      ) {
        return yield* importError({
          code: "contract_incompatible",
          operation: "validateOperationalOccurrenceReviewContract",
          path: reviewFile.path,
          detail:
            "manifest-v5 occurrence review contract version does not match the decoded review snapshot",
        });
      }
      yield* validateSummaryV2(rows, summary, summaryFile.path);
      const relationshipIntegrity = yield* verifyRelationshipIntegrity({
        manifest,
        manifestSha256: actualManifestSha256,
        releaseId: manifest.release_id,
        manifestPath,
        resolved,
        bundleFile,
        occurrenceFile,
        occurrenceRows: rows,
      });
      yield* validateReviewSnapshot({
        rows,
        snapshot,
        path: reviewFile.path,
        comparisonMode: "declared_review_v1",
      });
      const retirementClosure = yield* validateManifestV5OccurrenceRetirements({
        manifest,
        resolved,
        routeIdentityFile,
        snapshot,
        rows,
      });
      const routeAnchors = yield* decodeRouteAnchors(routeAnchorFile);
      const expectedRouteAnchors = reconstructedRouteAnchors(
        retirementClosure.routeIdentitySnapshot,
      );
      if (
        canonicalJson(routeAnchors) !== canonicalJson(expectedRouteAnchors) ||
        routeAnchors.length !==
          retirementClosure.routeIdentitySnapshot.expected_route_anchors_count ||
        routeAnchorFile.metadata.sha256 !==
          retirementClosure.routeIdentitySnapshot.expected_route_anchors_sha256
      ) {
        return yield* importError({
          code: "semantic_mismatch",
          operation: "validateRouteAnchorProjection",
          path: routeAnchorFile.path,
          detail: "route_anchors.jsonl is not the exact route identity snapshot projection",
        });
      }
      try {
        assertActiveOccurrenceRouteProjections(rows, retirementClosure.routeIdentitySnapshot);
      } catch (cause) {
        return yield* importError({
          code: "semantic_mismatch",
          operation: "validateActiveOccurrenceRouteProjections",
          path: routeIdentityFile.path,
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
      artifact = yield* buildImportArtifactV5({
        manifest,
        manifestSha256: actualManifestSha256,
        occurrenceFile,
        summaryFile,
        reviewFile,
        routeIdentityFile,
        summary,
        snapshot,
        rows,
        relationshipIntegrity,
        retirementClosure,
      });
    }

    const files = yield* PipelineFileSystemService;
    yield* files
      .writeText({
        command: COMMAND,
        operation: "writeImportArtifact",
        path: input.output,
        contents: `${JSON.stringify(artifact, null, 2)}\n`,
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

export function runMtaWikiOperationalOccurrenceImport(
  input: ImportMtaWikiOperationalOccurrencesInput,
): Promise<MtaWikiOperationalOccurrenceImportArtifact> {
  return runPipelineEffect(importMtaWikiOperationalOccurrences(input), PipelineFileSystemLayer);
}
