import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { DATA_PRODUCT_MANIFEST } from "@bp/analytics/data-products";
import {
  type RouteSpeedSpineArtifact,
  RouteSpeedSpineArtifactSchema,
} from "@bp/analytics/feature-history";
import {
  INTERVENTION_ANALYSIS_DISPOSITIONS_V1,
  validateInterventionEvidenceRegistry,
} from "@bp/analytics/intervention-evidence";
import {
  type OperationalOccurrenceMemberExtentRowV1,
  OperationalOccurrenceMemberExtentRowV1Schema,
  type OperationalOccurrenceRowV2,
  OperationalOccurrenceRowV2Schema,
} from "@bp/domain/documents/operational-occurrence";
import {
  type Plan042BusLaneIdentityVerdictRow,
  Plan042BusLaneIdentityVerdictRowSchema,
  type Plan042CandidateSetV5,
  Plan042CandidateSetV5Schema,
  type Plan042CandidateV5,
  type Plan042ExtentBindingArtifact,
  Plan042ExtentBindingArtifactSchema,
  type Plan042ExtentBindingRow,
  type Plan042GrainVerdictArtifact,
  Plan042GrainVerdictArtifactSchema,
  type Plan042GrainVerdictRow,
  type Plan042IdentityVerdictProjection,
  Plan042IdentityVerdictProjectionSchema,
  type Plan042LineageComparabilityArtifact,
  Plan042LineageComparabilityArtifactSchema,
  type Plan042MemberGrainProjection,
  Plan042MemberGrainProjectionSchema,
  type Plan042MemberGrainRow,
  Plan042MemberGrainRowSchema,
  type Plan042OutcomeRelevanceRegistry,
  Plan042OutcomeRelevanceRegistrySchema,
  type Plan042ProducerImportArtifact,
  Plan042ProducerImportArtifactSchema,
  type Plan042ReviewHandoffArtifact,
  Plan042ReviewHandoffArtifactSchema,
  type Plan042ServicePatternCoverageArtifact,
  Plan042ServicePatternCoverageArtifactSchema,
  type Plan042StopSetCoverageArtifact,
  Plan042StopSetCoverageArtifactSchema,
} from "@bp/domain/studio/member-grain-outcomes";
import {
  type StudyEventMergeArtifactV5,
  StudyEventMergeArtifactV5Schema,
  type StudyReviewInputsArtifactV1,
  StudyReviewInputsArtifactV1Schema,
} from "@bp/domain/studio/study";
import { Glob } from "bun";
import { Schema } from "effect";
import { decodeSchemaStrict } from "./schema-decode.ts";

export const PLAN042_PRODUCER_RELEASE_ID = "v1-rc28" as const;
export const PLAN042_PRODUCER_MANIFEST_SHA256 =
  "b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c" as const;
export const PLAN042_PRODUCER_HANDOFF_SHA256 =
  "986dfc18adc7867975c338e960eb99fa808cb585a091073887f744427e471aec" as const;
export const PLAN042_PRODUCER_FINAL_CHECKPOINT_SHA256 =
  "a4eb448ade6361d85fe190103a74606017e4f5a244add480f92990ba45bf368f" as const;
export const PLAN042_PLAN096_REVIEW_CUT_SHA256 =
  "5487f522f1db9b1ace0faad54875b5ff47f5059f5f008caa09e16ffb8f3500b7" as const;
export const PLAN042_PLAN096_RECONCILIATION_SHA256 =
  "a7c0d4bff50d7ca336a36e47e6779d1df039c82a90052378aecc40196b8a705d" as const;
export const PLAN042_PLAN096_REVIEW_INPUTS_SHA256 =
  "754ef948db22acb4b80ccb95c367b6b926b7ae9f6e28f55ab5b2b7a1f695371f" as const;
export const PLAN042_PLAN096_DATABASE_BYTES = 4_969_938_944 as const;
export const PLAN042_PLAN096_DATABASE_SHA256 =
  "07d9d297aac22e3d57bda1909700ad8d2c1ccd7b5651eb43362253701398e079" as const;

export const PLAN042_EXPECTED_HASHES = {
  memberKeys: "2068ca0ea9feaa52109c38b142e6f4bcb0df2115e940c7aaccc44a695fa44010",
  noMemberKeys: "10705a7551653e6f04767149639a3f825c477ea21a300eee43b5bc18a64a4df4",
  completeKeys: "a898040b69c3eaf1cf929901a0b243750c900da5cd6fb206b9113a0bbcdb2318",
  occurrenceRouteGroups: "eeb12ab1c131a100668f56f6e7258addae7d6c45a9d9a1e47f0d32bc36138d82",
  restoredOccurrenceRouteGroups: "cb350d3b9f20f040eec61d5507835f4da8d1647355f725d7fb7ff22e06340a6c",
  boundedMembers: "d11b1f08eedaa360516aee55b2353201dd4fa53dabec8401bccdd1a69fd1565a",
  stopSetMembers: "ed0c41c481ba96af8f840087588bfaaa83134cc941d2eb0976db7ecb5644c9ab",
  priorCandidateIds: "c292e89602551973e4544b5a54f3f53d7c3711f440aef8a14e5ea5ca10870feb",
  bridgeIdentities: "6048f0a64bef03a95c14d0e51d8aa4824459c5f7488aa989c5899d0d8899f783",
  busRegistryCandidates: "c8bc2307b63e73b225c85181480f8af25211f82c73472e67118169c00485c10b",
  identityVerdictCandidates: "2f9ab8284987aa1ddc50af98bc388a23dba3e1495d4413b71039fa413c4fce2f",
  flatbushDedupeCandidates: "08dba4f583c0eaef0ad9c7e5ae489c3e6bf54341f0a14311fcec12293ab67660",
} as const;

const PLAN042_FLATBUSH_DEDUPES = [
  {
    candidateId: "study-event-v2:6b70c52e0eec23eb63cab94f",
    routeId: "B41",
    occurrenceId: "occurrence:8c987704152b459014217d44",
  },
  {
    candidateId: "study-event-v2:d70a3ee36eb94ae88732065f",
    routeId: "B67",
    occurrenceId: "occurrence:8c987704152b459014217d44",
  },
] as const;

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const Commit = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const FileReceipt = Schema.Struct({
  bytes: NonNegativeInteger,
  path: NonEmptyString,
  sha256: Sha256,
});
const RowFileReceipt = Schema.Struct({
  ...FileReceipt.fields,
  row_count: NonNegativeInteger,
});

export const Plan041ProducerHandoffSchema = Schema.Struct({
  artifacts: Schema.Struct({
    identity_verdict: RowFileReceipt,
    member_extent: RowFileReceipt,
    member_grain: RowFileReceipt,
    occurrence: RowFileReceipt,
  }),
  authority: Schema.Struct({
    authorizes_cross_product: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
    authorizes_study: Schema.Literal(false),
  }),
  bridge_v2: Schema.Struct({
    bytes: NonNegativeInteger,
    candidate_count: NonNegativeInteger,
    path: NonEmptyString,
    sha256: Sha256,
  }),
  closure_reconciliation: Schema.Struct({
    bytes: NonNegativeInteger,
    candidate_count: NonNegativeInteger,
    path: NonEmptyString,
    sha256: Sha256,
  }),
  contract_id: Schema.Literal("plan-041-producer-handoff-v1"),
  contract_versions: Schema.Struct({
    bus_lane_identity_verdicts: Schema.Literal(1),
    operational_anchor_review_decisions: NonNegativeInteger,
    operational_anchors: NonNegativeInteger,
    operational_occurrence_member_extents: Schema.Literal(1),
    operational_occurrence_member_grain: Schema.Literal(1),
    operational_occurrence_review_decisions: NonNegativeInteger,
    operational_occurrences: Schema.Literal(2),
    relationship_integrity_bundle: NonNegativeInteger,
    route_anchors: NonNegativeInteger,
    route_identity_snapshot: NonNegativeInteger,
  }),
  evidence_policy: Schema.Struct({
    authoritative_historical_full_stop_inventory_required: Schema.Literal(true),
    exact_positive_required: Schema.Literal(true),
    occurrence_inference_prohibited: Schema.Literal(true),
    stop_id_equivalence_acquisition_required: Schema.Literal(true),
  }),
  fixtures: Schema.Struct({
    identity_verdict: RowFileReceipt,
    member_grain: RowFileReceipt,
  }),
  frontier_exception_count: Schema.Literal(0),
  generator_commit: Commit,
  manifest_sha256: Sha256,
  post_cut_determinism: Schema.Struct({
    bytes: NonNegativeInteger,
    combined: Sha256,
    path: NonEmptyString,
    sha256: Sha256,
  }),
  release_id: Schema.Literal(PLAN042_PRODUCER_RELEASE_ID),
  schema_version: Schema.Literal(1),
  transport: Schema.Struct({
    manifest: FileReceipt,
    mode: Schema.Literal("repository_local"),
  }),
});
export type Plan041ProducerHandoff = typeof Plan041ProducerHandoffSchema.Type;

const Plan041FinalCheckpointSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal("plan-041-final-checkpoint-v1"),
  recorded_at: NonEmptyString,
  checkpoint_scope: Schema.Unknown,
  release: Schema.Struct({
    release_id: Schema.Literal(PLAN042_PRODUCER_RELEASE_ID),
    manifest_version: Schema.Literal(6),
    manifest_path: NonEmptyString,
    manifest_sha256: Schema.Literal(PLAN042_PRODUCER_MANIFEST_SHA256),
    addressed_file_count: Schema.Literal(383),
    canonical_record_count: Schema.Literal(85_396),
    transport_mode: Schema.Literal("repository_local"),
  }),
  artifacts: Schema.Struct({
    producer_handoff: Schema.Struct({
      path: Schema.Literal("data/quality/study-frontier-closure/plan-041-producer-handoff.json"),
      sha256: Schema.Literal(PLAN042_PRODUCER_HANDOFF_SHA256),
    }),
    closure_reconciliation: Schema.Unknown,
    post_cut_determinism: Schema.Unknown,
    identity_verdict: Schema.Struct({
      path: NonEmptyString,
      sha256: Sha256,
      row_count: Schema.Literal(321),
    }),
    member_extent: Schema.Struct({
      path: NonEmptyString,
      sha256: Sha256,
      row_count: Schema.Literal(308),
    }),
    member_grain: Schema.Struct({
      path: NonEmptyString,
      sha256: Sha256,
      row_count: Schema.Literal(308),
    }),
    bridge_v2: Schema.Struct({
      path: NonEmptyString,
      sha256: Sha256,
      row_count: Schema.Literal(484),
    }),
  }),
  candidate_accounting: Schema.Struct({
    candidate_count: Schema.Literal(484),
    identity_candidate_count: Schema.Literal(321),
    member_extent_row_count: Schema.Literal(308),
    member_grain_row_count: Schema.Literal(308),
    frontier_exception_count: Schema.Literal(0),
    source_fixable_count: Schema.Literal(0),
    receipt_reference_count: NonNegativeInteger,
  }),
  verdict_distribution: Schema.Unknown,
  authority: Schema.Struct({
    authorizes_cross_product: Schema.Literal(false),
    authorizes_occurrence: Schema.Literal(false),
    authorizes_publication: Schema.Literal(false),
    authorizes_study: Schema.Literal(false),
    checkpoint_creates_new_authority: Schema.Literal(false),
  }),
  evidence_policy: Schema.Struct({
    authoritative_historical_full_stop_inventory_required: Schema.Literal(true),
    exact_positive_required: Schema.Literal(true),
    occurrence_inference_prohibited: Schema.Literal(true),
    stop_id_equivalence_acquisition_required: Schema.Literal(true),
  }),
  verification: Schema.Unknown,
  preservation: Schema.Unknown,
});
type Plan041FinalCheckpoint = typeof Plan041FinalCheckpointSchema.Type;

const PriorReconciliationSchema = Schema.Struct({
  artifactKind: NonEmptyString,
  schemaVersion: NonNegativeInteger,
  candidateSetId: NonEmptyString,
  reviewCutId: NonEmptyString,
  recommendations: Schema.Array(
    Schema.Struct({
      candidateId: NonEmptyString,
      routeId: NonEmptyString,
      treatmentFamily: NonEmptyString,
      baselineDecision: Schema.Literals(["approved", "rejected"]),
      recommendation: Schema.Literals(["recommend_approve", "recommend_reject"]),
      reviewMode: NonEmptyString,
      rationale: NonEmptyString,
      facts: Schema.Unknown,
    }),
  ),
  summary: Schema.Unknown,
  analysisMonth: NonEmptyString,
  decisionDelta: Schema.Unknown,
  focus: Schema.Unknown,
  inputs: Schema.Unknown,
  notice: Schema.Unknown,
  pinnedProducerRelease: Schema.Unknown,
  unchangedReviewInputs: Schema.Unknown,
  authorizesPublication: Schema.Literal(false),
  authorizesStudyRun: Schema.Literal(false),
});
type PriorReconciliation = typeof PriorReconciliationSchema.Type;

export type Plan042ImportedInputs = {
  readonly handoff: Plan041ProducerHandoff;
  readonly finalCheckpoint: Plan041FinalCheckpoint;
  readonly handoffSha256: string;
  readonly occurrences: readonly OperationalOccurrenceRowV2[];
  readonly memberExtents: readonly OperationalOccurrenceMemberExtentRowV1[];
  readonly identityVerdicts: readonly Plan042BusLaneIdentityVerdictRow[];
  readonly memberGrains: readonly Plan042MemberGrainRow[];
  readonly bridgeIdentities: readonly string[];
};

type Plan042SpineReadiness =
  | "series_ready"
  | "series_ready_with_gaps"
  | "needs_pattern_review"
  | "failed";

type Plan042PinnedSpine = {
  readonly routeId: string;
  readonly readiness: Plan042SpineReadiness;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly artifact: RouteSpeedSpineArtifact;
};

type Plan042StopSetDatabaseInput = {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly observedHeadwayTotalRowCount: number;
  readonly candidateObservedRows: ReadonlyMap<string, number>;
  readonly candidateEwtArtifactMatches: ReadonlyMap<string, number>;
  readonly plannedServiceTablePresent: false;
  readonly candidateServiceBusWaitRows: ReadonlyMap<string, number>;
  readonly candidateServiceObservedRows: ReadonlyMap<string, number>;
};

export type Plan042BuildInputs = Plan042ImportedInputs & {
  readonly priorReviewCut: StudyEventMergeArtifactV5;
  readonly priorReconciliation: PriorReconciliation;
  readonly reviewInputs: StudyReviewInputsArtifactV1;
  readonly spines: ReadonlyMap<string, Plan042PinnedSpine>;
  readonly stopSetDatabase: Plan042StopSetDatabaseInput;
};

export type Plan042BuildOutputs = {
  readonly producerImport: Plan042ProducerImportArtifact;
  readonly identityVerdictImport: Plan042IdentityVerdictProjection;
  readonly memberGrainImport: Plan042MemberGrainProjection;
  readonly candidateSet: Plan042CandidateSetV5;
  readonly extentBindings: Plan042ExtentBindingArtifact;
  readonly stopSetCoverage: Plan042StopSetCoverageArtifact;
  readonly servicePatternCoverage: Plan042ServicePatternCoverageArtifact;
  readonly lineageComparability: Plan042LineageComparabilityArtifact;
  readonly relevanceRegistry: Plan042OutcomeRelevanceRegistry;
  readonly grainVerdicts: Plan042GrainVerdictArtifact;
  readonly reviewHandoff: Plan042ReviewHandoffArtifact;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .toSorted()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

export function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestLines(values: readonly string[]): string {
  return sha256Bytes(`${[...values].toSorted().join("\n")}\n`);
}

function digestId(prefix: string, value: unknown): string {
  return `${prefix}:${sha256Bytes(stableJson(value)).slice(0, 24)}`;
}

function histogram(values: readonly string[]): Record<string, number> {
  const output: Record<string, number> = {};
  for (const value of values) output[value] = (output[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(output).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function assertSortedUnique(values: readonly string[], label: string): void {
  if (
    values.some((value) => value.length === 0) ||
    values.some((value, index) => index > 0 && value <= (values[index - 1] ?? ""))
  ) {
    throw new Error(`${label} must be non-empty, sorted, and unique`);
  }
}

function memberKey(value: {
  readonly occurrence_id: string;
  readonly route_record_id: string;
  readonly treatment_record_id: string;
}): string {
  return `${value.occurrence_id}\u0000${value.route_record_id}\u0000${value.treatment_record_id}`;
}

function occurrenceRouteKey(value: {
  readonly occurrence_id: string;
  readonly route_record_id: string;
}): string {
  return `${value.occurrence_id}\u0000${value.route_record_id}`;
}

function decodeJson<T>(schema: Schema.Constraint, bytes: Uint8Array, path: string): T {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path}: invalid JSON: ${String(cause)}`);
  }
  return decodeSchemaStrict(schema, value) as T;
}

function decodeJsonl<T>(
  schema: Schema.Constraint,
  bytes: Uint8Array,
  path: string,
  expectedRows: number,
): T[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\r") || !text.endsWith("\n")) {
    throw new Error(`${path}: canonical JSONL requires LF and a trailing newline`);
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedRows || lines.some((line) => line.length === 0)) {
    throw new Error(
      `${path}: expected ${expectedRows} non-empty JSONL rows, received ${lines.length}`,
    );
  }
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause) {
      throw new Error(`${path}:${index + 1}: invalid JSON: ${String(cause)}`);
    }
    if (stableJson(value) !== line) {
      throw new Error(`${path}:${index + 1}: row is not canonical stable JSON`);
    }
    return decodeSchemaStrict(schema, value) as T;
  });
}

function decodeCanonicalJsonlUnknown(
  bytes: Uint8Array,
  path: string,
  expectedRows: number,
): unknown[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\r") || !text.endsWith("\n")) {
    throw new Error(`${path}: canonical JSONL requires LF and a trailing newline`);
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedRows || lines.some((line) => line.length === 0)) {
    throw new Error(`${path}: expected ${expectedRows} canonical JSONL rows`);
  }
  return lines.map((line, index) => {
    const value = JSON.parse(line) as unknown;
    if (stableJson(value) !== line) {
      throw new Error(`${path}:${index + 1}: row is not canonical stable JSON`);
    }
    return value;
  });
}

async function readPinnedFile(
  root: string,
  receipt: { readonly path: string; readonly bytes: number; readonly sha256: string },
): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(join(root, receipt.path)));
  if (bytes.byteLength !== receipt.bytes || sha256Bytes(bytes) !== receipt.sha256) {
    throw new Error(`${receipt.path}: pinned byte/hash receipt mismatch`);
  }
  return bytes;
}

export function validateIdentityVerdictRows(
  rows: readonly Plan042BusLaneIdentityVerdictRow[],
): void {
  assertSortedUnique(
    rows.map((row) => row.candidate_id),
    "identity verdict candidate ids",
  );
  assertSortedUnique(rows.map((row) => row.verdict_id).toSorted(), "identity verdict ids");
  for (const row of rows) {
    assertSortedUnique(row.dossier_receipts, `${row.candidate_id} dossier receipts`);
    assertSortedUnique(row.acquisition_receipt_ids, `${row.candidate_id} acquisition receipts`);
    if (row.decision_id === null || row.acquisition_receipt_ids.length === 0) {
      throw new Error(`${row.candidate_id}: terminal identity verdict lacks review provenance`);
    }
    if (
      row.verdict === "occurrence_created" &&
      (row.occurrence_id === null || row.canonical_candidate_id !== null)
    ) {
      throw new Error(`${row.candidate_id}: invalid occurrence_created identity verdict`);
    }
    if (
      row.verdict === "superseded_duplicate" &&
      (row.canonical_candidate_id === null ||
        row.canonical_candidate_id === row.candidate_id ||
        row.occurrence_id !== null)
    ) {
      throw new Error(`${row.candidate_id}: invalid superseded_duplicate identity verdict`);
    }
    if (
      row.verdict !== "occurrence_created" &&
      row.verdict !== "superseded_duplicate" &&
      (row.occurrence_id !== null || row.canonical_candidate_id !== null)
    ) {
      throw new Error(`${row.candidate_id}: terminal negative verdict carries positive identity`);
    }
  }
}

export function validateMemberGrainRows(
  rows: readonly Plan042MemberGrainRow[],
  extents: readonly OperationalOccurrenceMemberExtentRowV1[],
): void {
  assertSortedUnique(rows.map(memberKey), "member-grain keys");
  assertSortedUnique(rows.map((row) => row.grain_id).toSorted(), "member-grain ids");
  const extentByKey = new Map(extents.map((row) => [memberKey(row), row]));
  if (extentByKey.size !== extents.length || rows.length !== extents.length) {
    throw new Error("member-grain projection must equal the complete member-extent denominator");
  }
  for (const row of rows) {
    const extent = extentByKey.get(memberKey(row));
    if (extent === undefined || extent.extent_id !== row.extent_id) {
      throw new Error(`${row.grain_id}: member-extent denominator mismatch`);
    }
    assertSortedUnique(row.receipt_ids, `${row.grain_id} receipt ids`);
    assertSortedUnique(
      row.evidence_bindings.map(
        (binding) =>
          `${binding.role}\u0000${binding.record_id}\u0000${binding.source_id}\u0000${binding.evidence_id}`,
      ),
      `${row.grain_id} evidence bindings`,
    );
    if (
      (row.terminal_disposition === "resolved" || row.terminal_disposition === "not_applicable") &&
      (row.service_scope === null || row.decision_id === null)
    ) {
      throw new Error(`${row.grain_id}: reviewed row lacks structured scope or decision`);
    }
    if (
      (row.terminal_disposition === "blocked_upstream" ||
        row.terminal_disposition === "absent_in_source") &&
      row.receipt_ids.length === 0
    ) {
      throw new Error(`${row.grain_id}: terminal blocked row lacks a durable receipt`);
    }
    for (const segment of row.lineage_segments) {
      if (segment.predecessor_gtfs_route_id === segment.successor_gtfs_route_id) {
        throw new Error(`${row.grain_id}: lineage predecessor and successor must differ`);
      }
      if (segment.boundary_stop_ids[0] === segment.boundary_stop_ids[1]) {
        throw new Error(`${row.grain_id}: ordered lineage boundary stops must be distinct`);
      }
      assertSortedUnique(segment.shared_stop_ids, `${row.grain_id} shared stops`);
    }
  }
}

export async function loadPlan042ProducerInputs(
  producerRoot: string,
): Promise<Plan042ImportedInputs> {
  const handoffPath = "data/quality/study-frontier-closure/plan-041-producer-handoff.json";
  const finalCheckpointPath =
    "data/quality/study-frontier-closure/plan-041-final-checkpoint-v1.json";
  const [handoffFile, finalCheckpointFile] = await Promise.all([
    readFile(join(producerRoot, handoffPath)),
    readFile(join(producerRoot, finalCheckpointPath)),
  ]);
  const handoffBytes = new Uint8Array(handoffFile);
  const finalCheckpointBytes = new Uint8Array(finalCheckpointFile);
  const handoffSha256 = sha256Bytes(handoffBytes);
  if (handoffSha256 !== PLAN042_PRODUCER_HANDOFF_SHA256) {
    throw new Error(`Plan 041 handoff hash mismatch: ${handoffSha256}`);
  }
  const finalCheckpointSha256 = sha256Bytes(finalCheckpointBytes);
  if (finalCheckpointSha256 !== PLAN042_PRODUCER_FINAL_CHECKPOINT_SHA256) {
    throw new Error(`Plan 041 final checkpoint hash mismatch: ${finalCheckpointSha256}`);
  }
  const finalCheckpoint = decodeJson<Plan041FinalCheckpoint>(
    Plan041FinalCheckpointSchema,
    finalCheckpointBytes,
    finalCheckpointPath,
  );
  const handoff = decodeJson<Plan041ProducerHandoff>(
    Plan041ProducerHandoffSchema,
    handoffBytes,
    handoffPath,
  );
  if (
    handoff.manifest_sha256 !== PLAN042_PRODUCER_MANIFEST_SHA256 ||
    handoff.transport.manifest.sha256 !== PLAN042_PRODUCER_MANIFEST_SHA256
  ) {
    throw new Error("Plan 041 handoff does not pin the approved RC28 manifest");
  }
  const checkpointArtifacts = finalCheckpoint.artifacts;
  if (
    checkpointArtifacts.identity_verdict.path !== handoff.artifacts.identity_verdict.path ||
    checkpointArtifacts.identity_verdict.sha256 !== handoff.artifacts.identity_verdict.sha256 ||
    checkpointArtifacts.member_extent.path !== handoff.artifacts.member_extent.path ||
    checkpointArtifacts.member_extent.sha256 !== handoff.artifacts.member_extent.sha256 ||
    checkpointArtifacts.member_grain.path !== handoff.artifacts.member_grain.path ||
    checkpointArtifacts.member_grain.sha256 !== handoff.artifacts.member_grain.sha256 ||
    checkpointArtifacts.bridge_v2.path !== handoff.bridge_v2.path ||
    checkpointArtifacts.bridge_v2.sha256 !== handoff.bridge_v2.sha256
  ) {
    throw new Error("Plan 041 final checkpoint and producer handoff artifact pins disagree");
  }
  await readPinnedFile(producerRoot, handoff.transport.manifest);
  const [
    occurrenceBytes,
    extentBytes,
    identityBytes,
    grainBytes,
    bridgeBytes,
    identityFixture,
    grainFixture,
  ] = await Promise.all([
    readPinnedFile(producerRoot, handoff.artifacts.occurrence),
    readPinnedFile(producerRoot, handoff.artifacts.member_extent),
    readPinnedFile(producerRoot, handoff.artifacts.identity_verdict),
    readPinnedFile(producerRoot, handoff.artifacts.member_grain),
    readPinnedFile(producerRoot, handoff.bridge_v2),
    readPinnedFile(producerRoot, handoff.fixtures.identity_verdict),
    readPinnedFile(producerRoot, handoff.fixtures.member_grain),
  ]);
  decodeJsonl<Plan042BusLaneIdentityVerdictRow>(
    Plan042BusLaneIdentityVerdictRowSchema,
    identityFixture,
    handoff.fixtures.identity_verdict.path,
    handoff.fixtures.identity_verdict.row_count,
  );
  decodeJsonl<Plan042MemberGrainRow>(
    Plan042MemberGrainRowSchema,
    grainFixture,
    handoff.fixtures.member_grain.path,
    handoff.fixtures.member_grain.row_count,
  );
  const occurrences = decodeJsonl<OperationalOccurrenceRowV2>(
    OperationalOccurrenceRowV2Schema,
    occurrenceBytes,
    handoff.artifacts.occurrence.path,
    handoff.artifacts.occurrence.row_count,
  );
  const memberExtents = decodeJsonl<OperationalOccurrenceMemberExtentRowV1>(
    OperationalOccurrenceMemberExtentRowV1Schema,
    extentBytes,
    handoff.artifacts.member_extent.path,
    handoff.artifacts.member_extent.row_count,
  );
  const identityVerdicts = decodeJsonl<Plan042BusLaneIdentityVerdictRow>(
    Plan042BusLaneIdentityVerdictRowSchema,
    identityBytes,
    handoff.artifacts.identity_verdict.path,
    handoff.artifacts.identity_verdict.row_count,
  );
  const memberGrains = decodeJsonl<Plan042MemberGrainRow>(
    Plan042MemberGrainRowSchema,
    grainBytes,
    handoff.artifacts.member_grain.path,
    handoff.artifacts.member_grain.row_count,
  );
  validateIdentityVerdictRows(identityVerdicts);
  validateMemberGrainRows(memberGrains, memberExtents);
  const bridgeIdentities = decodeCanonicalJsonlUnknown(
    bridgeBytes,
    handoff.bridge_v2.path,
    handoff.bridge_v2.candidate_count,
  ).map((value, index) => {
    if (
      !isRecord(value) ||
      typeof value["identity"] !== "string" ||
      value["identity"].length === 0
    ) {
      throw new Error(`${handoff.bridge_v2.path}:${index + 1}: missing bridge identity`);
    }
    return value["identity"];
  });
  return {
    handoff,
    finalCheckpoint,
    handoffSha256,
    occurrences,
    memberExtents,
    identityVerdicts,
    memberGrains,
    bridgeIdentities,
  };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function addMonths(month: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/u.test(month)) throw new Error(`Invalid month: ${month}`);
  const [yearText, monthText] = month.split("-");
  const value = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + delta, 1));
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function stopSetComparisonWindow(
  onsetDate: string,
  analysisMonth: string,
): { startMonth: string; endMonth: string; startEpoch: number; endEpochExclusive: number } {
  const onsetMonth = onsetDate.slice(0, 7);
  if (!/^\d{4}-\d{2}$/u.test(onsetMonth)) {
    throw new Error(`Stop-set occurrence onset is not month-addressable: ${onsetDate}`);
  }
  const startMonth = addMonths(onsetMonth, -6);
  const nominalEndMonth = addMonths(onsetMonth, 5);
  const endMonth = nominalEndMonth < analysisMonth ? nominalEndMonth : analysisMonth;
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const afterEndMonth = addMonths(endMonth, 1);
  const [endYear, endMonthNumber] = afterEndMonth.split("-").map(Number);
  return {
    startMonth,
    endMonth,
    startEpoch: Math.floor(Date.UTC(startYear ?? 0, (startMonthNumber ?? 1) - 1, 1) / 1000),
    endEpochExclusive: Math.floor(Date.UTC(endYear ?? 0, (endMonthNumber ?? 1) - 1, 1) / 1000),
  };
}

async function loadPinnedSpines(input: {
  readonly artifactRoot: string;
  readonly reviewInputs: StudyReviewInputsArtifactV1;
  readonly memberExtents: readonly OperationalOccurrenceMemberExtentRowV1[];
  readonly memberGrains: readonly Plan042MemberGrainRow[];
}): Promise<ReadonlyMap<string, Plan042PinnedSpine>> {
  const snapshot = input.reviewInputs.speedSpineSnapshot;
  const readinessHistogram = histogram(snapshot.routes.map((route) => route.readiness));
  if (
    snapshot.routeCount !== 393 ||
    snapshot.routes.length !== 393 ||
    snapshot.manifest.sha256 !==
      "4ff10b34dfea4c32ac7638799271c430ec0935f464182ce781153fb50439f1b7" ||
    snapshot.manifest.byteCount !== 360_880 ||
    snapshot.routes.some((route) => route.readiness === "failed") ||
    stableJson(readinessHistogram) !==
      stableJson({
        needs_pattern_review: 277,
        series_ready: 91,
        series_ready_with_gaps: 25,
      })
  ) {
    throw new Error("Plan 096 pinned spine inventory drifted");
  }
  const routeMetadata = new Map(snapshot.routes.map((route) => [route.routeId, route]));
  const requiredRouteIds = [
    ...new Set([
      ...input.memberExtents
        .filter((extent) => extent.extent === "bounded_segment" || extent.extent === "mixed")
        .map((extent) => extent.gtfs_route_id),
      ...input.memberGrains.flatMap((grain) =>
        grain.lineage_segments.flatMap((lineage) => [
          lineage.predecessor_gtfs_route_id,
          lineage.successor_gtfs_route_id,
        ]),
      ),
    ]),
  ].toSorted();
  const entries = await Promise.all(
    requiredRouteIds.map(async (routeId) => {
      const metadata = routeMetadata.get(routeId);
      if (metadata === undefined) {
        throw new Error(`${routeId}: absent from the exact Plan 096 spine inventory`);
      }
      const path = join(input.artifactRoot, metadata.artifactKey);
      const bytes = new Uint8Array(await readFile(path));
      const actualSha256 = sha256Bytes(bytes);
      if (
        bytes.byteLength !== metadata.artifact.byteCount ||
        actualSha256 !== metadata.artifact.sha256
      ) {
        throw new Error(`${routeId}: Plan 096 pinned spine byte/hash mismatch at ${path}`);
      }
      const artifact = decodeJson<RouteSpeedSpineArtifact>(
        RouteSpeedSpineArtifactSchema,
        bytes,
        metadata.artifactKey,
      );
      if (artifact.routeId !== routeId) {
        throw new Error(`${metadata.artifactKey}: expected route ${routeId}`);
      }
      return [
        routeId,
        {
          routeId,
          readiness: metadata.readiness,
          path: metadata.artifactKey,
          bytes: bytes.byteLength,
          sha256: actualSha256,
          artifact,
        } satisfies Plan042PinnedSpine,
      ] as const;
    }),
  );
  return new Map(entries);
}

async function loadStopSetDatabase(input: {
  readonly path: string;
  readonly artifactRoot: string;
  readonly analysisMonth: string;
  readonly occurrences: readonly OperationalOccurrenceRowV2[];
  readonly memberExtents: readonly OperationalOccurrenceMemberExtentRowV1[];
}): Promise<Plan042StopSetDatabaseInput> {
  const file = await stat(input.path);
  if (file.size !== PLAN042_PLAN096_DATABASE_BYTES) {
    throw new Error(`Plan 096 database byte count drifted: ${file.size}`);
  }
  const fileSha256 = await sha256File(input.path);
  if (fileSha256 !== PLAN042_PLAN096_DATABASE_SHA256) {
    throw new Error(`Plan 096 database hash drifted: ${fileSha256}`);
  }
  const database = new Database(input.path, { readonly: true, strict: true });
  try {
    const tableRows = database
      .query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
         ('local_observed_headway_sample', 'local_bus_wait_assessment',
          'local_route_planned_service_baseline')`,
      )
      .all() as { name: string }[];
    const tableNames = new Set(tableRows.map((row) => row.name));
    if (!tableNames.has("local_observed_headway_sample")) {
      throw new Error("Plan 096 database lacks local_observed_headway_sample");
    }
    if (!tableNames.has("local_bus_wait_assessment")) {
      throw new Error("Plan 096 database lacks local_bus_wait_assessment");
    }
    if (tableNames.has("local_route_planned_service_baseline")) {
      throw new Error("Plan 096 planned-service table presence changed");
    }
    const observed = database
      .query("SELECT count(*) AS row_count FROM local_observed_headway_sample")
      .get() as { row_count: number };
    const occurrenceById = new Map(
      input.occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
    );
    const candidateObservedRows = new Map<string, number>();
    const candidateEwtArtifactMatches = new Map<string, number>();
    const candidateServiceBusWaitRows = new Map<string, number>();
    const candidateServiceObservedRows = new Map<string, number>();
    for (const extent of input.memberExtents.filter((row) => row.extent === "stop_set")) {
      const occurrence = occurrenceById.get(extent.occurrence_id);
      const onsetDate = occurrence?.resolved_onset?.date;
      if (onsetDate === undefined) {
        throw new Error(`${extent.extent_id}: stop-set coverage requires a resolved onset`);
      }
      const window = stopSetComparisonWindow(onsetDate, input.analysisMonth);
      const stopIds = [
        ...new Set(
          extent.components.flatMap((component) =>
            component.identity_namespace === "source_literal_v1" ? component.identifiers : [],
          ),
        ),
      ].toSorted();
      const placeholders = stopIds.map(() => "?").join(",");
      const result = database
        .query(
          `SELECT count(*) AS row_count FROM local_observed_headway_sample
           WHERE route_id = ? AND stop_id IN (${placeholders})
             AND observed_timestamp >= ? AND observed_timestamp < ?`,
        )
        .get(extent.gtfs_route_id, ...stopIds, window.startEpoch, window.endEpochExclusive) as {
        row_count: number;
      };
      candidateObservedRows.set(memberKey(extent), result.row_count);
      const routeSlugs = new Set([extent.gtfs_route_id, extent.gtfs_route_id.toLowerCase()]);
      let artifactMatchCount = 0;
      for (const routeSlug of routeSlugs) {
        const glob = new Glob(
          `analytics-stop-direction-hour-ewt/*/*/${routeSlug}/stop-direction-hour-ewt-features.json`,
        );
        for await (const _path of glob.scan({
          cwd: input.artifactRoot,
          onlyFiles: true,
        })) {
          artifactMatchCount += 1;
        }
      }
      candidateEwtArtifactMatches.set(memberKey(extent), artifactMatchCount);
    }
    for (const extent of input.memberExtents.filter(
      (row) => row.treatment_family === "service_pattern",
    )) {
      const busWait = database
        .query("SELECT count(*) AS row_count FROM local_bus_wait_assessment WHERE route_id = ?")
        .get(extent.gtfs_route_id) as { row_count: number };
      const observedRoute = database
        .query("SELECT count(*) AS row_count FROM local_observed_headway_sample WHERE route_id = ?")
        .get(extent.gtfs_route_id) as { row_count: number };
      candidateServiceBusWaitRows.set(memberKey(extent), busWait.row_count);
      candidateServiceObservedRows.set(memberKey(extent), observedRoute.row_count);
    }
    if (observed.row_count !== 0) {
      throw new Error(
        `Plan 096 database evidence changed: expected zero observed-headway rows, received ${observed.row_count}`,
      );
    }
    return {
      path: input.path,
      bytes: file.size,
      sha256: fileSha256,
      observedHeadwayTotalRowCount: observed.row_count,
      candidateObservedRows,
      candidateEwtArtifactMatches,
      plannedServiceTablePresent: false,
      candidateServiceBusWaitRows,
      candidateServiceObservedRows,
    };
  } finally {
    database.close();
  }
}

export async function loadPlan042BuildInputs(input: {
  readonly producerRoot: string;
  readonly priorReviewCutPath: string;
  readonly priorReconciliationPath: string;
  readonly reviewInputsPath: string;
  readonly spineArtifactRoot: string;
  readonly plan096DatabasePath: string;
}): Promise<Plan042BuildInputs> {
  const [producer, priorFile, reconciliationFile, reviewFile] = await Promise.all([
    loadPlan042ProducerInputs(input.producerRoot),
    readFile(input.priorReviewCutPath),
    readFile(input.priorReconciliationPath),
    readFile(input.reviewInputsPath),
  ]);
  const priorBytes = new Uint8Array(priorFile);
  const reconciliationBytes = new Uint8Array(reconciliationFile);
  const reviewBytes = new Uint8Array(reviewFile);
  const pinnedFiles: readonly [string, Uint8Array, string][] = [
    [input.priorReviewCutPath, priorBytes, PLAN042_PLAN096_REVIEW_CUT_SHA256],
    [input.priorReconciliationPath, reconciliationBytes, PLAN042_PLAN096_RECONCILIATION_SHA256],
    [input.reviewInputsPath, reviewBytes, PLAN042_PLAN096_REVIEW_INPUTS_SHA256],
  ];
  for (const [path, bytes, expected] of pinnedFiles) {
    const actual = sha256Bytes(bytes);
    if (actual !== expected)
      throw new Error(`${path}: exact Plan 096 input hash drifted: ${actual}`);
  }
  const priorReviewCut = decodeJson<StudyEventMergeArtifactV5>(
    StudyEventMergeArtifactV5Schema,
    priorBytes,
    input.priorReviewCutPath,
  );
  const priorReconciliation = decodeJson<PriorReconciliation>(
    PriorReconciliationSchema,
    reconciliationBytes,
    input.priorReconciliationPath,
  );
  const reviewInputs = decodeJson<StudyReviewInputsArtifactV1>(
    StudyReviewInputsArtifactV1Schema,
    reviewBytes,
    input.reviewInputsPath,
  );
  const [spines, stopSetDatabase] = await Promise.all([
    loadPinnedSpines({
      artifactRoot: input.spineArtifactRoot,
      reviewInputs,
      memberExtents: producer.memberExtents,
      memberGrains: producer.memberGrains,
    }),
    loadStopSetDatabase({
      path: input.plan096DatabasePath,
      artifactRoot: input.spineArtifactRoot,
      analysisMonth: reviewInputs.analysisMonth,
      occurrences: producer.occurrences,
      memberExtents: producer.memberExtents,
    }),
  ]);
  return {
    ...producer,
    priorReviewCut,
    priorReconciliation,
    reviewInputs,
    spines,
    stopSetDatabase,
  };
}

function buildImports(input: Plan042BuildInputs): {
  producerImport: Plan042ProducerImportArtifact;
  identityVerdictImport: Plan042IdentityVerdictProjection;
  memberGrainImport: Plan042MemberGrainProjection;
} {
  const identityCandidateIds = input.identityVerdicts.map((row) => row.candidate_id);
  const memberKeys = input.memberGrains.map(memberKey);
  const occurrenceRouteGroups = [...new Set(input.memberGrains.map(occurrenceRouteKey))].toSorted();
  const identityVerdictImport = decodeSchemaStrict(Plan042IdentityVerdictProjectionSchema, {
    artifact_kind: "bp.plan042.identity-verdict-import.v1",
    schema_version: 1,
    source: {
      release_id: PLAN042_PRODUCER_RELEASE_ID,
      manifest_sha256: PLAN042_PRODUCER_MANIFEST_SHA256,
      handoff_sha256: input.handoffSha256,
      source_path: input.handoff.artifacts.identity_verdict.path,
      source_sha256: input.handoff.artifacts.identity_verdict.sha256,
    },
    row_count: input.identityVerdicts.length,
    candidate_ids_sha256: digestLines(identityCandidateIds),
    verdict_histogram: histogram(input.identityVerdicts.map((row) => row.verdict)),
    rows: input.identityVerdicts,
    authority: {
      authorizes_study: false,
      authorizes_occurrence: false,
      authorizes_cross_product: false,
    },
  });
  const memberGrainImport = decodeSchemaStrict(Plan042MemberGrainProjectionSchema, {
    artifact_kind: "bp.plan042.member-grain-import.v1",
    schema_version: 1,
    source: {
      release_id: PLAN042_PRODUCER_RELEASE_ID,
      manifest_sha256: PLAN042_PRODUCER_MANIFEST_SHA256,
      handoff_sha256: input.handoffSha256,
      source_path: input.handoff.artifacts.member_grain.path,
      source_sha256: input.handoff.artifacts.member_grain.sha256,
      member_extent_projection_sha256: input.handoff.artifacts.member_extent.sha256,
    },
    row_count: input.memberGrains.length,
    member_keys_sha256: digestLines(memberKeys),
    occurrence_route_group_count: occurrenceRouteGroups.length,
    occurrence_route_groups_sha256: digestLines(occurrenceRouteGroups),
    terminal_histogram: histogram(input.memberGrains.map((row) => row.terminal_disposition)),
    rows: input.memberGrains,
    authority: { authorizes_study: false, authorizes_cross_product: false },
  });
  const producerImport = decodeSchemaStrict(Plan042ProducerImportArtifactSchema, {
    artifact_kind: "bp.plan042.producer-import.v1",
    schema_version: 1,
    producer: {
      release_id: PLAN042_PRODUCER_RELEASE_ID,
      final_checkpoint_commit: "dc1b1008086bede1d88a1a38afd1747a9d24658a",
      final_checkpoint_path:
        "data/quality/study-frontier-closure/plan-041-final-checkpoint-v1.json",
      final_checkpoint_sha256: "a4eb448ade6361d85fe190103a74606017e4f5a244add480f92990ba45bf368f",
      manifest_sha256: PLAN042_PRODUCER_MANIFEST_SHA256,
      handoff_path: "data/quality/study-frontier-closure/plan-041-producer-handoff.json",
      handoff_sha256: input.handoffSha256,
    },
    source_occurrence_count: input.occurrences.length,
    eligible_occurrence_count: input.occurrences.filter(
      (occurrence) => occurrence.study_projection_eligible,
    ).length,
    route_projection_count: input.occurrences
      .filter((occurrence) => occurrence.study_projection_eligible)
      .flatMap((occurrence) => occurrence.routes).length,
    complete_occurrence_route_count: input.occurrences.flatMap((occurrence) => occurrence.routes)
      .length,
    source_artifacts: [
      { role: "occurrence", ...input.handoff.artifacts.occurrence },
      { role: "member_extent", ...input.handoff.artifacts.member_extent },
      { role: "member_grain", ...input.handoff.artifacts.member_grain },
      { role: "identity_verdict", ...input.handoff.artifacts.identity_verdict },
      {
        role: "bridge_v2",
        path: input.handoff.bridge_v2.path,
        bytes: input.handoff.bridge_v2.bytes,
        sha256: input.handoff.bridge_v2.sha256,
        row_count: input.handoff.bridge_v2.candidate_count,
      },
    ],
    evidence_policy: input.handoff.evidence_policy,
    authority: {
      authorizes_study: false,
      authorizes_occurrence: false,
      authorizes_cross_product: false,
    },
  });
  if (
    producerImport.source_occurrence_count !== 131 ||
    producerImport.eligible_occurrence_count !== 130 ||
    producerImport.route_projection_count !== 167 ||
    producerImport.complete_occurrence_route_count !== 168
  ) {
    throw new Error("Plan 041 producer occurrence denominator drifted");
  }
  return { producerImport, identityVerdictImport, memberGrainImport };
}

function buildCandidateSet(input: Plan042BuildInputs): Plan042CandidateSetV5 {
  if (input.identityVerdicts.some((row) => row.verdict === "occurrence_created")) {
    throw new Error(
      "Plan 042 occurrence_created identity evidence requires a separately reviewed occurrence-backed candidate path",
    );
  }
  const recommendationById = new Map(
    input.priorReconciliation.recommendations.map((row) => [row.candidateId, row.recommendation]),
  );
  if (recommendationById.size !== 484) {
    throw new Error("Plan 096 reconciliation must cover all 484 prior candidates");
  }
  const priorMemberCandidates = input.priorReviewCut.candidates.filter(
    (candidate) => candidate.memberExtents.length > 0,
  );
  const priorNoMemberCandidates = input.priorReviewCut.candidates.filter(
    (candidate) => candidate.memberExtents.length === 0,
  );
  const priorByGroup = new Map(
    priorMemberCandidates.map((candidate) => {
      const first = candidate.memberExtents[0];
      if (first === undefined) throw new Error("unreachable prior member candidate");
      const key = occurrenceRouteKey(first);
      if (candidate.memberExtents.some((extent) => occurrenceRouteKey(extent) !== key)) {
        throw new Error(`${candidate.candidateId}: prior candidate spans occurrence-route groups`);
      }
      return [key, candidate] as const;
    }),
  );
  if (priorByGroup.size !== 97) throw new Error("Expected 97 Plan 096 occurrence-route groups");
  const occurrenceById = new Map(
    input.occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
  );
  const extentsByGroup = new Map<string, OperationalOccurrenceMemberExtentRowV1[]>();
  for (const extent of input.memberExtents) {
    const rows = extentsByGroup.get(occurrenceRouteKey(extent)) ?? [];
    rows.push(extent);
    extentsByGroup.set(occurrenceRouteKey(extent), rows);
  }
  const grainByKey = new Map(input.memberGrains.map((row) => [memberKey(row), row]));
  const verdictByCandidate = new Map(input.identityVerdicts.map((row) => [row.candidate_id, row]));
  const occurrenceCandidates: Plan042CandidateV5[] = [...extentsByGroup.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([groupKey, extents]) => {
      const first = extents[0];
      if (first === undefined) throw new Error("empty member extent group");
      const occurrence = occurrenceById.get(first.occurrence_id);
      const route = occurrence?.routes.find(
        (candidateRoute) => candidateRoute.route_record_id === first.route_record_id,
      );
      if (occurrence === undefined || route === undefined) {
        throw new Error(`${groupKey}: occurrence-route group absent from RC28 occurrence payload`);
      }
      const prior = priorByGroup.get(groupKey);
      const treatmentMemberKeys = extents.map(memberKey).toSorted();
      for (const key of treatmentMemberKeys) {
        if (!grainByKey.has(key)) throw new Error(`${key}: missing member-grain row`);
      }
      const registrySourceIds =
        prior?.provenance.flatMap((provenance) =>
          provenance.sourceKind === "registry" ? [provenance.sourceId] : [],
        ) ?? [];
      return {
        candidate_id:
          prior?.candidateId ??
          digestId("study-event-v5", {
            occurrence_id: first.occurrence_id,
            route_record_id: first.route_record_id,
          }),
        origin: "occurrence_route",
        occurrence_id: first.occurrence_id,
        route_record_id: first.route_record_id,
        route_id: route.gtfs_route_id,
        treatment_families: [
          ...new Set(extents.map((extent) => extent.treatment_family)),
        ].toSorted(),
        implementation_date: occurrence.resolved_onset?.date ?? "unresolved",
        date_precision: occurrence.resolved_onset?.precision ?? "unresolved",
        treatment_member_keys: treatmentMemberKeys,
        restored_from_member_denominator: prior === undefined,
        prior_candidate_id: prior?.candidateId ?? null,
        prior_recommendation:
          prior === undefined
            ? "not_previously_reviewed"
            : (recommendationById.get(prior.candidateId) ?? "not_previously_reviewed"),
        registry_source_ids: [...new Set(registrySourceIds)].toSorted(),
        identity_verdict: null,
        review_eligibility: "requires_member_grain_review",
        authorizes_study: false,
      } satisfies Plan042CandidateV5;
    });

  const noMemberCandidates: Plan042CandidateV5[] = priorNoMemberCandidates
    .map((candidate) => {
      const sourceIds = [
        ...new Set(
          candidate.provenance.flatMap((provenance) =>
            provenance.sourceKind === "registry" ? [provenance.sourceId] : [],
          ),
        ),
      ].toSorted();
      const identity = verdictByCandidate.get(candidate.candidateId);
      if (sourceIds.includes("nyc_dot_bus_lanes") !== (identity !== undefined)) {
        throw new Error(
          `${candidate.candidateId}: registry-only bus-lane identity verdict denominator mismatch`,
        );
      }
      return {
        candidate_id: candidate.candidateId,
        origin: "registry_only",
        occurrence_id: null,
        route_record_id: null,
        route_id: candidate.routeId,
        treatment_families: [candidate.treatmentFamily],
        implementation_date: candidate.implementationDate,
        date_precision: candidate.datePrecision,
        treatment_member_keys: [],
        restored_from_member_denominator: false,
        prior_candidate_id: candidate.candidateId,
        prior_recommendation:
          recommendationById.get(candidate.candidateId) ?? "not_previously_reviewed",
        registry_source_ids: sourceIds,
        identity_verdict:
          identity === undefined
            ? null
            : {
                verdict_id: identity.verdict_id,
                verdict: identity.verdict,
                decision_id: identity.decision_id ?? "",
                occurrence_id: identity.occurrence_id,
                canonical_candidate_id: identity.canonical_candidate_id,
              },
        review_eligibility:
          identity === undefined ? "carried_prior_state" : "excluded_terminal_identity",
        authorizes_study: false,
      } satisfies Plan042CandidateV5;
    })
    .toSorted((left, right) => left.candidate_id.localeCompare(right.candidate_id));

  const candidates = [...occurrenceCandidates, ...noMemberCandidates].toSorted((left, right) =>
    left.candidate_id.localeCompare(right.candidate_id),
  );
  const memberKeys = input.memberGrains.map(memberKey);
  const noMemberKeys = noMemberCandidates.map(
    (candidate) => `${candidate.candidate_id}\u0000<null>`,
  );
  const occurrenceGroups = [...extentsByGroup.keys()].toSorted();
  const restoredGroups = occurrenceCandidates
    .filter((candidate) => candidate.restored_from_member_denominator)
    .map((candidate) => `${candidate.occurrence_id ?? ""}\u0000${candidate.route_record_id ?? ""}`)
    .toSorted();
  const busRegistryIds = input.priorReviewCut.candidates
    .filter((candidate) =>
      candidate.provenance.some(
        (provenance) =>
          provenance.sourceKind === "registry" && provenance.sourceId === "nyc_dot_bus_lanes",
      ),
    )
    .map((candidate) => candidate.candidateId)
    .toSorted();
  const flatbush = PLAN042_FLATBUSH_DEDUPES.map((expected) => {
    const candidate = occurrenceCandidates.find((row) => row.candidate_id === expected.candidateId);
    if (
      candidate?.route_id !== expected.routeId ||
      candidate.occurrence_id !== expected.occurrenceId ||
      !candidate.registry_source_ids.includes("nyc_dot_bus_lanes")
    ) {
      throw new Error(`${expected.candidateId}: Flatbush occurrence-backed dedupe drift`);
    }
    return expected.candidateId;
  });
  const unmatchedBusLaneIds = noMemberCandidates
    .filter((candidate) => candidate.identity_verdict !== null)
    .map((candidate) => candidate.candidate_id)
    .toSorted();
  const priorCandidateIds = input.priorReviewCut.candidates.map(
    (candidate) => candidate.candidateId,
  );
  const checks: readonly [string, string, string][] = [
    ["member keys", digestLines(memberKeys), PLAN042_EXPECTED_HASHES.memberKeys],
    ["no-member keys", digestLines(noMemberKeys), PLAN042_EXPECTED_HASHES.noMemberKeys],
    [
      "complete matrix keys",
      digestLines([...memberKeys, ...noMemberKeys]),
      PLAN042_EXPECTED_HASHES.completeKeys,
    ],
    [
      "occurrence-route groups",
      digestLines(occurrenceGroups),
      PLAN042_EXPECTED_HASHES.occurrenceRouteGroups,
    ],
    [
      "restored occurrence-route groups",
      digestLines(restoredGroups),
      PLAN042_EXPECTED_HASHES.restoredOccurrenceRouteGroups,
    ],
    [
      "prior candidate ids",
      digestLines(priorCandidateIds),
      PLAN042_EXPECTED_HASHES.priorCandidateIds,
    ],
    [
      "bridge identities",
      digestLines(input.bridgeIdentities),
      PLAN042_EXPECTED_HASHES.bridgeIdentities,
    ],
    [
      "bus registry candidate ids",
      digestLines(busRegistryIds),
      PLAN042_EXPECTED_HASHES.busRegistryCandidates,
    ],
    [
      "identity verdict candidate ids",
      digestLines(input.identityVerdicts.map((row) => row.candidate_id)),
      PLAN042_EXPECTED_HASHES.identityVerdictCandidates,
    ],
    [
      "unmatched bus-lane candidate ids",
      digestLines(unmatchedBusLaneIds),
      PLAN042_EXPECTED_HASHES.identityVerdictCandidates,
    ],
    [
      "Flatbush dedupe candidate ids",
      digestLines(flatbush),
      PLAN042_EXPECTED_HASHES.flatbushDedupeCandidates,
    ],
  ];
  for (const [label, actual, expected] of checks) {
    if (actual !== expected) throw new Error(`${label} hash drift: ${actual}`);
  }
  if (
    candidates.length !== 555 ||
    occurrenceCandidates.length !== 168 ||
    noMemberCandidates.length !== 387 ||
    input.memberGrains.length !== 308 ||
    restoredGroups.length !== 71 ||
    busRegistryIds.length !== 323 ||
    unmatchedBusLaneIds.length !== 321 ||
    busRegistryIds.length !== unmatchedBusLaneIds.length + flatbush.length
  ) {
    throw new Error("Plan 042 candidate denominator counts drifted");
  }
  const candidateCore = {
    producer: {
      release_id: PLAN042_PRODUCER_RELEASE_ID,
      manifest_sha256: PLAN042_PRODUCER_MANIFEST_SHA256,
      handoff_sha256: input.handoffSha256,
    },
    prior_review_cut_id: input.priorReviewCut.reviewCutId,
    candidates,
  };
  return decodeSchemaStrict(Plan042CandidateSetV5Schema, {
    artifact_kind: "bp.studio.study_event_candidates.v5",
    schema_version: 5,
    candidate_set_id: digestId("candidate-set-v5", candidateCore),
    approval_state: "awaiting_outcome_grain_review",
    producer: candidateCore.producer,
    prior_review_cut_id: candidateCore.prior_review_cut_id,
    summary: {
      candidate_count: candidates.length,
      occurrence_route_candidate_count: occurrenceCandidates.length,
      no_member_candidate_count: noMemberCandidates.length,
      member_row_count: input.memberGrains.length,
      restored_occurrence_route_count: restoredGroups.length,
      bus_lane_registry_total_count: busRegistryIds.length,
      unmatched_bus_lane_count: unmatchedBusLaneIds.length,
      occurrence_backed_flatbush_count: flatbush.length,
    },
    denominator_hashes: {
      member_keys_sha256: digestLines(memberKeys),
      no_member_keys_sha256: digestLines(noMemberKeys),
      complete_keys_sha256: digestLines([...memberKeys, ...noMemberKeys]),
      occurrence_route_groups_sha256: digestLines(occurrenceGroups),
      restored_occurrence_route_groups_sha256: digestLines(restoredGroups),
      identity_verdict_candidate_ids_sha256: digestLines(
        input.identityVerdicts.map((row) => row.candidate_id),
      ),
    },
    candidates,
    authority: {
      authorizes_study: false,
      authorizes_occurrence: false,
      authorizes_cross_product: false,
    },
  });
}

export type OrderedBoundarySearch = {
  readonly searchedSourceLiterals: readonly string[];
  readonly candidateBoundaryPairs: readonly (readonly [string, string])[];
  readonly matchedNodeCount: number;
  readonly matchedRawPairCount: number;
  readonly orderedMatches: readonly {
    readonly boundaryStartStopId: string;
    readonly boundaryEndStopId: string;
    readonly direction: string;
    readonly segmentIds: readonly string[];
    readonly coveredSourceLiteralIds: readonly string[];
  }[];
  readonly allCandidatePairsResolveUniquely: boolean;
  readonly ambiguousCandidatePairCount: number;
  readonly coverageShare: number;
};

export function classifyExtentBinding(input: {
  readonly spineReadiness: Plan042SpineReadiness;
  readonly search: OrderedBoundarySearch;
  readonly coverageFloor?: number;
}): Plan042ExtentBindingRow["disposition"] {
  const coverageFloor = input.coverageFloor ?? 0.8;
  if (input.spineReadiness === "needs_pattern_review") return "spine_not_ready";
  if (input.search.candidateBoundaryPairs.length === 0) {
    return "missing_endpoint_stop_id_equivalence";
  }
  if (input.search.matchedNodeCount < 2) return "endpoints_not_on_spine";
  if (input.search.ambiguousCandidatePairCount > 0) return "ambiguous_join";
  if (!input.search.allCandidatePairsResolveUniquely) {
    return "missing_endpoint_stop_id_equivalence";
  }
  return input.search.coverageShare >= coverageFloor
    ? "bound_exact"
    : "partial_coverage_below_floor";
}

function findOrderedSpinePaths(input: {
  readonly spine: RouteSpeedSpineArtifact;
  readonly startStopId: string;
  readonly endStopId: string;
  readonly searchedSourceLiterals: readonly string[];
}): readonly {
  readonly direction: string;
  readonly segmentIds: readonly string[];
  readonly coveredSourceLiteralIds: readonly string[];
}[] {
  const nodeById = new Map(input.spine.nodes.map((node) => [node.nodeId, node]));
  const startNodeIds = input.spine.nodes
    .filter((node) => node.sourceStopIds.includes(input.startStopId))
    .map((node) => node.nodeId);
  const endNodeIds = new Set(
    input.spine.nodes
      .filter((node) => node.sourceStopIds.includes(input.endStopId))
      .map((node) => node.nodeId),
  );
  const matches = [...new Set(input.spine.segments.map((segment) => segment.direction))]
    .toSorted()
    .flatMap((direction) => {
      const segments = input.spine.segments.filter((segment) => segment.direction === direction);
      const rawStopIds = new Set(
        segments.flatMap((segment) =>
          segment.raw.sourceStopPairs.flatMap((pair) =>
            [pair.fromStopId, pair.toStopId].filter((stopId): stopId is string => stopId !== null),
          ),
        ),
      );
      if (!rawStopIds.has(input.startStopId) || !rawStopIds.has(input.endStopId)) {
        return [];
      }
      const outgoing = new Map<string, typeof segments>();
      for (const segment of segments) {
        const values = outgoing.get(segment.fromNodeId) ?? [];
        values.push(segment);
        outgoing.set(segment.fromNodeId, values);
      }
      const paths: (typeof segments)[] = [];
      const visit = (
        nodeId: string,
        path: typeof segments,
        visitedNodeIds: ReadonlySet<string>,
      ): void => {
        if (endNodeIds.has(nodeId) && path.length > 0) {
          paths.push(path);
          return;
        }
        for (const segment of outgoing.get(nodeId) ?? []) {
          if (visitedNodeIds.has(segment.toNodeId)) continue;
          visit(
            segment.toNodeId,
            [...path, segment],
            new Set([...visitedNodeIds, segment.toNodeId]),
          );
        }
      };
      for (const startNodeId of startNodeIds) {
        visit(startNodeId, [], new Set([startNodeId]));
      }
      return paths.map((path) => {
        const pathNodeIds = new Set([
          path[0]?.fromNodeId ?? "",
          ...path.map((segment) => segment.toNodeId),
        ]);
        const coveredSourceLiteralIds = [
          ...new Set(
            [...pathNodeIds].flatMap(
              (nodeId) =>
                nodeById
                  .get(nodeId)
                  ?.sourceStopIds.filter((stopId) =>
                    input.searchedSourceLiterals.includes(stopId),
                  ) ?? [],
            ),
          ),
        ].toSorted();
        return {
          direction,
          segmentIds: path.map((segment) => segment.segmentId),
          coveredSourceLiteralIds,
        };
      });
    });
  return [
    ...new Map(
      matches.map((match) => [`${match.direction}\u0000${match.segmentIds.join("\u0000")}`, match]),
    ).values(),
  ].toSorted((left, right) =>
    `${left.direction}\u0000${left.segmentIds.join("\u0000")}`.localeCompare(
      `${right.direction}\u0000${right.segmentIds.join("\u0000")}`,
    ),
  );
}

export function searchExtentBoundaries(
  extent: OperationalOccurrenceMemberExtentRowV1,
  spine: RouteSpeedSpineArtifact,
  typedOrderedBoundaryPairs: readonly (readonly [string, string])[] = [],
): OrderedBoundarySearch {
  const components = extent.components.filter(
    (component) => component.identity_namespace === "source_literal_v1",
  );
  const searchedSourceLiterals = [
    ...new Set(components.flatMap((component) => component.identifiers)),
  ].toSorted();
  const candidateBoundaryPairs = [...typedOrderedBoundaryPairs]
    .filter(
      ([first, last]) =>
        first !== last &&
        searchedSourceLiterals.includes(first) &&
        searchedSourceLiterals.includes(last),
    )
    .toSorted(([leftA, leftB], [rightA, rightB]) =>
      `${leftA}\u0000${leftB}`.localeCompare(`${rightA}\u0000${rightB}`),
    );
  const matchedNodeCount = spine.nodes.filter((node) =>
    node.sourceStopIds.some((stopId) => searchedSourceLiterals.includes(stopId)),
  ).length;
  const rawPairs = spine.segments.flatMap((segment) =>
    segment.raw.sourceStopPairs.map((pair) => ({ segment, pair })),
  );
  const matchedRawPairCount = rawPairs.filter(
    ({ pair }) =>
      (pair.fromStopId !== null && searchedSourceLiterals.includes(pair.fromStopId)) ||
      (pair.toStopId !== null && searchedSourceLiterals.includes(pair.toStopId)),
  ).length;
  const matchesByBoundary = candidateBoundaryPairs.map(([first, last]) =>
    findOrderedSpinePaths({
      spine,
      startStopId: first,
      endStopId: last,
      searchedSourceLiterals,
    }).map((match) => ({
      boundaryStartStopId: first,
      boundaryEndStopId: last,
      ...match,
    })),
  );
  const orderedMatches = matchesByBoundary
    .flat()
    .toSorted((left, right) =>
      `${left.boundaryStartStopId}\u0000${left.boundaryEndStopId}\u0000${left.direction}`.localeCompare(
        `${right.boundaryStartStopId}\u0000${right.boundaryEndStopId}\u0000${right.direction}`,
      ),
    );
  const coveredSourceLiteralCount = new Set(
    orderedMatches.flatMap((match) => match.coveredSourceLiteralIds),
  ).size;
  return {
    searchedSourceLiterals,
    candidateBoundaryPairs,
    matchedNodeCount,
    matchedRawPairCount,
    orderedMatches,
    allCandidatePairsResolveUniquely:
      candidateBoundaryPairs.length > 0 &&
      matchesByBoundary.every((matches) => matches.length === 1),
    ambiguousCandidatePairCount: matchesByBoundary.filter((matches) => matches.length > 1).length,
    coverageShare:
      searchedSourceLiterals.length === 0
        ? 0
        : coveredSourceLiteralCount / searchedSourceLiterals.length,
  };
}

function buildExtentBindings(
  input: Plan042BuildInputs,
  candidateSet: Plan042CandidateSetV5,
): Plan042ExtentBindingArtifact {
  const candidateByGroup = new Map<string, Plan042CandidateV5>(
    candidateSet.candidates.flatMap((candidate) =>
      candidate.origin === "occurrence_route"
        ? [[`${candidate.occurrence_id}\u0000${candidate.route_record_id}`, candidate] as const]
        : [],
    ),
  );
  const grainByKey = new Map(input.memberGrains.map((row) => [memberKey(row), row]));
  const rows: Plan042ExtentBindingRow[] = input.memberExtents
    .filter((extent) => extent.extent === "bounded_segment" || extent.extent === "mixed")
    .map((extent) => {
      const candidate = candidateByGroup.get(occurrenceRouteKey(extent));
      const grain = grainByKey.get(memberKey(extent));
      const spine = input.spines.get(extent.gtfs_route_id);
      if (
        candidate === undefined ||
        grain === undefined ||
        spine === undefined ||
        spine.readiness === "failed"
      ) {
        throw new Error(`${extent.extent_id}: missing candidate, grain, or pinned spine readiness`);
      }
      const search = searchExtentBoundaries(extent, spine.artifact);
      const disposition = classifyExtentBinding({
        spineReadiness: spine.readiness,
        search,
        coverageFloor: 0.8,
      });
      const matchedSegmentIds =
        disposition === "bound_exact" || disposition === "partial_coverage_below_floor"
          ? [...new Set(search.orderedMatches.flatMap((match) => match.segmentIds))].toSorted()
          : [];
      return {
        candidate_id: candidate.candidate_id,
        occurrence_id: extent.occurrence_id,
        route_record_id: extent.route_record_id,
        treatment_record_id: extent.treatment_record_id,
        extent_id: extent.extent_id,
        route_id: extent.gtfs_route_id,
        treatment_family: extent.treatment_family,
        spine_readiness: spine.readiness,
        spine_artifact: {
          path: spine.path,
          bytes: spine.bytes,
          sha256: spine.sha256,
        },
        searched_source_literals: search.searchedSourceLiterals,
        candidate_ordered_boundary_pairs: search.candidateBoundaryPairs,
        matched_node_count: search.matchedNodeCount,
        matched_raw_pair_count: search.matchedRawPairCount,
        ordered_orientation_match_count: search.orderedMatches.length,
        disposition,
        matched_segment_ids: matchedSegmentIds,
        matched_spine_segment_ids: matchedSegmentIds,
        coverage_share_of_extent: search.coverageShare,
        coverage_floor: 0.8,
        unmatched_reason:
          disposition === "bound_exact"
            ? null
            : disposition === "spine_not_ready"
              ? "The exact Plan 096 route spine is needs_pattern_review."
              : `Exact candidate search found ${search.orderedMatches.length} ordered raw-pair matches, but the producer endpoint literals do not supply a unique reviewed boundary equivalence.`,
        authorizes_study: false,
      } satisfies Plan042ExtentBindingRow;
    })
    .toSorted((left, right) => memberKey(left).localeCompare(memberKey(right)));
  const boundedHash = digestLines(rows.map(memberKey));
  if (
    rows.length !== 48 ||
    boundedHash !== PLAN042_EXPECTED_HASHES.boundedMembers ||
    stableJson(histogram(rows.map((row) => row.disposition))) !==
      stableJson({
        missing_endpoint_stop_id_equivalence: 9,
        spine_not_ready: 39,
      }) ||
    stableJson(histogram(rows.map((row) => row.spine_readiness))) !==
      stableJson({
        needs_pattern_review: 39,
        series_ready: 7,
        series_ready_with_gaps: 2,
      }) ||
    rows.some((row) => row.disposition === "bound_exact")
  ) {
    throw new Error("Plan 042 bounded-extent readiness freeze drifted");
  }
  return decodeSchemaStrict(Plan042ExtentBindingArtifactSchema, {
    artifact_kind: "bp.plan042.extent-segment-bindings.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    analysis_month: input.reviewInputs.analysisMonth,
    coverage_floor: 0.8,
    row_count: rows.length,
    disposition_histogram: histogram(rows.map((row) => row.disposition)),
    readiness_histogram: histogram(rows.map((row) => row.spine_readiness)),
    family_histogram: histogram(rows.map((row) => row.treatment_family)),
    rows,
    authority: { authorizes_study: false, authorizes_segment_match: false },
  });
}

type LineageBoundarySearch = {
  readonly route_id: string;
  readonly side: "predecessor" | "successor";
  readonly spine_readiness: Plan042SpineReadiness;
  readonly spine_artifact: {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  };
  readonly boundary_stop_ids: readonly [string, string];
  readonly matched_node_count: number;
  readonly matched_raw_pair_count: number;
  readonly ordered_orientation_match_count: number;
  readonly matched_segment_ids: readonly string[];
  readonly result:
    | "ordered_unique"
    | "spine_not_ready"
    | "endpoint_missing"
    | "orientation_absent"
    | "orientation_ambiguous";
};

export function searchLineageBoundary(input: {
  readonly spine: Plan042PinnedSpine;
  readonly side: "predecessor" | "successor";
  readonly boundaryStopIds: readonly [string, string];
}): LineageBoundarySearch {
  const [startStopId, endStopId] = input.boundaryStopIds;
  const matchedNodes = input.spine.artifact.nodes.filter(
    (node) => node.sourceStopIds.includes(startStopId) || node.sourceStopIds.includes(endStopId),
  );
  const pairRows = input.spine.artifact.segments.flatMap((segment) =>
    segment.raw.sourceStopPairs.map((pair) => ({ segment, pair })),
  );
  const matchedRawPairCount = pairRows.filter(
    ({ pair }) =>
      pair.fromStopId === startStopId ||
      pair.toStopId === startStopId ||
      pair.fromStopId === endStopId ||
      pair.toStopId === endStopId,
  ).length;
  const matches = findOrderedSpinePaths({
    spine: input.spine.artifact,
    startStopId,
    endStopId,
    searchedSourceLiterals: input.boundaryStopIds,
  });
  const ready =
    input.spine.readiness === "series_ready" || input.spine.readiness === "series_ready_with_gaps";
  const bothEndpointsPresent =
    matchedNodes.some((node) => node.sourceStopIds.includes(startStopId)) &&
    matchedNodes.some((node) => node.sourceStopIds.includes(endStopId));
  const result: LineageBoundarySearch["result"] = !ready
    ? "spine_not_ready"
    : !bothEndpointsPresent
      ? "endpoint_missing"
      : matches.length === 0
        ? "orientation_absent"
        : matches.length > 1
          ? "orientation_ambiguous"
          : "ordered_unique";
  return {
    route_id: input.spine.routeId,
    side: input.side,
    spine_readiness: input.spine.readiness,
    spine_artifact: {
      path: input.spine.path,
      bytes: input.spine.bytes,
      sha256: input.spine.sha256,
    },
    boundary_stop_ids: input.boundaryStopIds,
    matched_node_count: matchedNodes.length,
    matched_raw_pair_count: matchedRawPairCount,
    ordered_orientation_match_count: matches.length,
    matched_segment_ids: result === "ordered_unique" ? (matches[0]?.segmentIds ?? []) : [],
    result,
  };
}

function buildLineageComparability(
  input: Plan042BuildInputs,
  candidateSet: Plan042CandidateSetV5,
): Plan042LineageComparabilityArtifact {
  const candidateByGroup = new Map<string, Plan042CandidateV5>(
    candidateSet.candidates.flatMap((candidate) =>
      candidate.origin === "occurrence_route"
        ? [[`${candidate.occurrence_id}\u0000${candidate.route_record_id}`, candidate] as const]
        : [],
    ),
  );
  const rows = input.memberGrains
    .filter((grain) => grain.lineage_segments.length > 0)
    .map((grain) => {
      const candidate = candidateByGroup.get(occurrenceRouteKey(grain));
      if (candidate === undefined) throw new Error(`${grain.grain_id}: missing lineage candidate`);
      const segmentSearches = grain.lineage_segments.map((lineage) => {
        const predecessor = input.spines.get(lineage.predecessor_gtfs_route_id);
        const successor = input.spines.get(lineage.successor_gtfs_route_id);
        if (predecessor === undefined || successor === undefined) {
          throw new Error(`${grain.grain_id}: missing exact old/new Plan 096 spine`);
        }
        return {
          producer_direction_literal: lineage.direction,
          predecessor: searchLineageBoundary({
            spine: predecessor,
            side: "predecessor",
            boundaryStopIds: lineage.boundary_stop_ids,
          }),
          successor: searchLineageBoundary({
            spine: successor,
            side: "successor",
            boundaryStopIds: lineage.boundary_stop_ids,
          }),
        };
      });
      const failingSides = segmentSearches
        .flatMap((search, index) => [
          ...(search.predecessor.result === "ordered_unique"
            ? []
            : [`segment_${index}:predecessor:${search.predecessor.result}`]),
          ...(search.successor.result === "ordered_unique"
            ? []
            : [`segment_${index}:successor:${search.successor.result}`]),
        ])
        .toSorted();
      if (failingSides.length === 0) {
        throw new Error(
          `${grain.grain_id}: evidence could authorize a common-segment frame; separate risk review is required`,
        );
      }
      const hasEndpointOrOrientationFailure = segmentSearches.some(
        (search) =>
          (search.predecessor.result !== "ordered_unique" &&
            search.predecessor.result !== "spine_not_ready") ||
          (search.successor.result !== "ordered_unique" &&
            search.successor.result !== "spine_not_ready"),
      );
      const hasSpineReadinessFailure = segmentSearches.some(
        (search) =>
          search.predecessor.result === "spine_not_ready" ||
          search.successor.result === "spine_not_ready",
      );
      const disposition = hasEndpointOrOrientationFailure
        ? "route_lineage_incomparable:missing_reviewed_endpoint_equivalence"
        : hasSpineReadinessFailure
          ? "route_lineage_incomparable:spine_not_ready"
          : "route_lineage_incomparable:missing_reviewed_endpoint_equivalence";
      return {
        candidate_id: candidate.candidate_id,
        grain_id: grain.grain_id,
        occurrence_id: grain.occurrence_id,
        route_record_id: grain.route_record_id,
        treatment_record_id: grain.treatment_record_id,
        route_id: grain.gtfs_route_id,
        segment_searches: segmentSearches,
        failing_sides: failingSides,
        disposition,
        authorizes_study: false,
      } as const;
    })
    .toSorted((left, right) => left.grain_id.localeCompare(right.grain_id));
  if (
    rows.length !== 22 ||
    rows
      .filter((row) => row.route_id === "Q61")
      .some(
        (row) =>
          row.disposition !== "route_lineage_incomparable:missing_reviewed_endpoint_equivalence",
      )
  ) {
    throw new Error("Plan 042 lineage evidence-computation freeze drifted");
  }
  return decodeSchemaStrict(Plan042LineageComparabilityArtifactSchema, {
    artifact_kind: "bp.plan042.lineage-comparability.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    row_count: rows.length,
    disposition_histogram: histogram(rows.map((row) => row.disposition)),
    rows,
    authority: {
      authorizes_study: false,
      authorizes_common_segment_frame: false,
    },
  });
}

function buildStopSetCoverage(
  input: Plan042BuildInputs,
  candidateSet: Plan042CandidateSetV5,
): Plan042StopSetCoverageArtifact {
  const candidateByGroup = new Map<string, Plan042CandidateV5>(
    candidateSet.candidates.flatMap((candidate) =>
      candidate.origin === "occurrence_route"
        ? [[`${candidate.occurrence_id}\u0000${candidate.route_record_id}`, candidate] as const]
        : [],
    ),
  );
  const occurrenceById = new Map(
    input.occurrences.map((occurrence) => [occurrence.occurrence_id, occurrence]),
  );
  const grainByKey = new Map(input.memberGrains.map((grain) => [memberKey(grain), grain]));
  const rows = input.memberExtents
    .filter((extent) => extent.extent === "stop_set")
    .map((extent) => {
      const candidate = candidateByGroup.get(occurrenceRouteKey(extent));
      const occurrence = occurrenceById.get(extent.occurrence_id);
      const grain = grainByKey.get(memberKey(extent));
      const onsetDate = occurrence?.resolved_onset?.date;
      if (candidate === undefined || onsetDate === undefined || grain === undefined) {
        throw new Error(`${extent.extent_id}: incomplete stop-set coverage input`);
      }
      const sourceLiteralIds = [
        ...new Set(
          extent.components.flatMap((component) =>
            component.identity_namespace === "source_literal_v1" ? component.identifiers : [],
          ),
        ),
      ].toSorted();
      const queryStopIds = sourceLiteralIds.filter((identifier) => /^\d+$/u.test(identifier));
      const lineageStopIds = new Set(
        grain.lineage_segments.flatMap((lineage) => lineage.shared_stop_ids),
      );
      const typedStopIdLineagePresent =
        queryStopIds.length === sourceLiteralIds.length &&
        queryStopIds.length > 0 &&
        queryStopIds.every((stopId) => lineageStopIds.has(stopId));
      const window = stopSetComparisonWindow(onsetDate, input.reviewInputs.analysisMonth);
      const observedHeadwayRowCount = input.stopSetDatabase.candidateObservedRows.get(
        memberKey(extent),
      );
      const ewtArtifactMatchCount = input.stopSetDatabase.candidateEwtArtifactMatches.get(
        memberKey(extent),
      );
      if (observedHeadwayRowCount === undefined || ewtArtifactMatchCount === undefined) {
        throw new Error(`${extent.extent_id}: candidate-specific DB query receipt missing`);
      }
      return {
        candidate_id: candidate.candidate_id,
        extent_id: extent.extent_id,
        route_id: extent.gtfs_route_id,
        treatment_record_id: extent.treatment_record_id,
        source_literal_ids: sourceLiteralIds,
        query_stop_ids: queryStopIds,
        comparison_window: {
          start_month: window.startMonth,
          end_month: window.endMonth,
          analysis_month: input.reviewInputs.analysisMonth,
        },
        observed_headway_row_count: observedHeadwayRowCount,
        ewt_artifact_match_count: ewtArtifactMatchCount,
        typed_stop_id_lineage_present: typedStopIdLineagePresent,
        disposition: "missing_pinned_stop_grain_coverage",
        authorizes_study: false,
      } as const;
    })
    .toSorted((left, right) => left.extent_id.localeCompare(right.extent_id));
  if (
    rows.length !== 9 ||
    rows.some(
      (row) =>
        row.observed_headway_row_count !== 0 ||
        row.ewt_artifact_match_count !== 0 ||
        row.typed_stop_id_lineage_present,
    )
  ) {
    throw new Error("Plan 042 stop-set evidence-computation freeze drifted");
  }
  return decodeSchemaStrict(Plan042StopSetCoverageArtifactSchema, {
    artifact_kind: "bp.plan042.stop-set-coverage.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    database: {
      path: input.stopSetDatabase.path,
      bytes: input.stopSetDatabase.bytes,
      sha256: input.stopSetDatabase.sha256,
    },
    observed_headway_table: "local_observed_headway_sample",
    observed_headway_total_row_count: input.stopSetDatabase.observedHeadwayTotalRowCount,
    ewt_product_id: "stop_direction_hour_ewt_features",
    ewt_feature_grain: "stop_direction_hour",
    ewt_resolver_id: "artifact.stop_direction_hour_ewt_features.v1",
    ewt_artifact_path_template:
      "analytics-stop-direction-hour-ewt/{releaseMonth}/{runId}/{routeId}/stop-direction-hour-ewt-features.json",
    row_count: rows.length,
    rows,
    authority: {
      authorizes_study: false,
      authorizes_stop_grain: false,
    },
  });
}

function buildServicePatternCoverage(
  input: Plan042BuildInputs,
  candidateSet: Plan042CandidateSetV5,
): Plan042ServicePatternCoverageArtifact {
  const candidateByGroup = new Map<string, Plan042CandidateV5>(
    candidateSet.candidates.flatMap((candidate) =>
      candidate.origin === "occurrence_route"
        ? [[`${candidate.occurrence_id}\u0000${candidate.route_record_id}`, candidate] as const]
        : [],
    ),
  );
  const grainByKey = new Map(input.memberGrains.map((grain) => [memberKey(grain), grain]));
  const rows = input.memberExtents
    .filter((extent) => {
      const grain = grainByKey.get(memberKey(extent));
      return (
        extent.treatment_family === "service_pattern" &&
        extent.extent === "route_wide" &&
        grain?.terminal_disposition === "resolved" &&
        grain.lineage_segments.length === 0
      );
    })
    .map((extent) => {
      const candidate = candidateByGroup.get(occurrenceRouteKey(extent));
      const busWaitRowCount = input.stopSetDatabase.candidateServiceBusWaitRows.get(
        memberKey(extent),
      );
      const observedHeadwayRowCount = input.stopSetDatabase.candidateServiceObservedRows.get(
        memberKey(extent),
      );
      if (
        candidate === undefined ||
        busWaitRowCount === undefined ||
        observedHeadwayRowCount === undefined
      ) {
        throw new Error(`${extent.extent_id}: service-pattern coverage receipt missing`);
      }
      return {
        candidate_id: candidate.candidate_id,
        extent_id: extent.extent_id,
        route_id: extent.gtfs_route_id,
        bus_wait_row_count: busWaitRowCount,
        observed_headway_row_count: observedHeadwayRowCount,
        planned_service_row_count: 0,
        disposition: "missing_pinned_service_pattern_product_coverage",
        authorizes_study: false,
      } as const;
    })
    .toSorted((left, right) => left.extent_id.localeCompare(right.extent_id));
  if (
    input.stopSetDatabase.plannedServiceTablePresent ||
    rows.length !== 5 ||
    rows.some(
      (row) =>
        row.bus_wait_row_count !== 0 ||
        row.observed_headway_row_count !== 0 ||
        row.planned_service_row_count !== 0,
    )
  ) {
    throw new Error("Plan 042 service-pattern evidence-computation freeze drifted");
  }
  return decodeSchemaStrict(Plan042ServicePatternCoverageArtifactSchema, {
    artifact_kind: "bp.plan042.service-pattern-coverage.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    database: {
      path: input.stopSetDatabase.path,
      bytes: input.stopSetDatabase.bytes,
      sha256: input.stopSetDatabase.sha256,
    },
    bus_wait_table: "local_bus_wait_assessment",
    observed_headway_table: "local_observed_headway_sample",
    planned_service_table: "local_route_planned_service_baseline",
    planned_service_table_present: false,
    row_count: 5,
    rows,
    authority: {
      authorizes_study: false,
      authorizes_service_pattern_grain: false,
    },
  });
}

function buildRelevanceRegistry(input: Plan042BuildInputs): Plan042OutcomeRelevanceRegistry {
  validateInterventionEvidenceRegistry();
  const families = [...new Set(input.memberExtents.map((row) => row.treatment_family))].toSorted();
  const entries = [
    {
      treatment_family: "automated_bus_lane_enforcement",
      member_shapes: ["route_wide", "unresolved"],
      disposition: "supported",
      product_ids: ["local_route_month_trends_history"],
      product_bindings: [
        {
          product_id: "local_route_month_trends_history",
          feature_grain: "route_metric_history",
          resolver_id: "sqlite.local_route_month_trend.history.v1",
        },
      ],
      source_dataset_ids: [],
      grain: "route_month",
      resolver: "exact_route_registry_or_reviewed_route_wide_member",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: [],
    },
    {
      treatment_family: "bus_lane",
      member_shapes: ["bounded_segment"],
      disposition: "supported_when_bound",
      product_ids: ["local_route_segment_speed_history"],
      product_bindings: [
        {
          product_id: "local_route_segment_speed_history",
          feature_grain: "route_segment_month",
          resolver_id: "sqlite.local_route_segment_speed.route_segment_month.v1",
        },
      ],
      source_dataset_ids: ["58t6-89vi", "kufs-yh3x"],
      grain: "route_segment_month",
      resolver: "extent-segment-binding-v1",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: ["reviewed_endpoint_stop_id_equivalence"],
    },
    {
      treatment_family: "bus_stop_or_boarding",
      member_shapes: ["bounded_segment", "stop_set", "unresolved"],
      disposition: "blocked",
      product_ids: ["local_observed_headway_samples_run", "stop_direction_hour_ewt_features"],
      product_bindings: [
        {
          product_id: "local_observed_headway_samples_run",
          feature_grain: null,
          resolver_id: null,
        },
        {
          product_id: "stop_direction_hour_ewt_features",
          feature_grain: "stop_direction_hour",
          resolver_id: "artifact.stop_direction_hour_ewt_features.v1",
        },
      ],
      source_dataset_ids: [],
      grain: "stop_direction_hour",
      resolver: "internal-analyst-stop-set-v1",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: [
        "candidate_specific_observed_headway_ewt_coverage",
        "reviewed_stop_id_lineage",
      ],
    },
    {
      treatment_family: "fare_collection",
      member_shapes: ["route_wide", "unresolved"],
      disposition: "context_only",
      product_ids: ["local_route_month_trends_history"],
      product_bindings: [
        {
          product_id: "local_route_month_trends_history",
          feature_grain: "route_metric_history",
          resolver_id: "sqlite.local_route_month_trend.history.v1",
        },
      ],
      source_dataset_ids: [],
      grain: "route_month",
      resolver: "reviewed_route_scope_context",
      claim_ceiling: "context_only",
      unlock_evidence: [],
    },
    {
      treatment_family: "route_redesign",
      member_shapes: ["bounded_segment"],
      disposition: "lineage_comparability_gate",
      product_ids: ["local_route_segment_speed_history"],
      product_bindings: [
        {
          product_id: "local_route_segment_speed_history",
          feature_grain: "route_segment_month",
          resolver_id: "sqlite.local_route_segment_speed.route_segment_month.v1",
        },
      ],
      source_dataset_ids: ["58t6-89vi", "kufs-yh3x"],
      grain: "common_route_segment_month",
      resolver: "reviewed-old-new-stop-chain-v1",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: ["reviewed_endpoint_stop_id_equivalence", "pre_and_post_spine_binding"],
    },
    {
      treatment_family: "service_pattern",
      member_shapes: ["bounded_segment", "route_wide", "unresolved"],
      disposition: "blocked",
      product_ids: [
        "local_bus_wait_assessment_history",
        "local_observed_headway_samples_run",
        "planned_service_baseline_history",
      ],
      product_bindings: [
        {
          product_id: "local_bus_wait_assessment_history",
          feature_grain: null,
          resolver_id: null,
        },
        {
          product_id: "local_observed_headway_samples_run",
          feature_grain: null,
          resolver_id: null,
        },
        {
          product_id: "planned_service_baseline_history",
          feature_grain: null,
          resolver_id: null,
        },
      ],
      source_dataset_ids: ["v4z4-2h6n"],
      grain: "typed_service_scope_period",
      resolver: "member-grain-service-scope-v1",
      claim_ceiling: "descriptive_observation",
      unlock_evidence: [
        "candidate_specific_planned_and_observed_service_coverage",
        "canonical_feature_grain_and_resolver_bindings",
      ],
    },
    {
      treatment_family: "signage_and_markings",
      member_shapes: ["stop_set"],
      disposition: "blocked",
      product_ids: ["local_observed_headway_samples_run", "stop_direction_hour_ewt_features"],
      product_bindings: [
        {
          product_id: "local_observed_headway_samples_run",
          feature_grain: null,
          resolver_id: null,
        },
        {
          product_id: "stop_direction_hour_ewt_features",
          feature_grain: "stop_direction_hour",
          resolver_id: "artifact.stop_direction_hour_ewt_features.v1",
        },
      ],
      source_dataset_ids: [],
      grain: "stop_direction_hour",
      resolver: "internal-analyst-stop-set-v1",
      claim_ceiling: "context_only",
      unlock_evidence: [
        "candidate_specific_observed_headway_ewt_coverage",
        "reviewed_stop_id_lineage",
      ],
    },
  ] as const;
  if (
    stableJson(entries.map((entry) => entry.treatment_family).toSorted()) !== stableJson(families)
  ) {
    throw new Error("Outcome relevance registry does not cover each canonical treatment family");
  }
  const canonicalProductIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
  for (const entry of entries) {
    assertSortedUnique(entry.product_ids, `${entry.treatment_family} product ids`);
    assertSortedUnique(entry.source_dataset_ids, `${entry.treatment_family} source dataset ids`);
    const bindingIds = entry.product_bindings.map((binding) => binding.product_id);
    assertSortedUnique(bindingIds, `${entry.treatment_family} product binding ids`);
    if (
      entry.product_ids.some((productId) => !canonicalProductIds.has(productId)) ||
      stableJson(entry.product_ids) !== stableJson(bindingIds)
    ) {
      throw new Error(`${entry.treatment_family}: outcome product registry drift`);
    }
  }
  return decodeSchemaStrict(Plan042OutcomeRelevanceRegistrySchema, {
    artifact_kind: "bp.plan042.outcome-relevance-registry.v1",
    schema_version: 1,
    upstream_registry_validation: {
      registry_id: "intervention-evidence-registry-v1",
      canonical_treatment_kind_count: Object.keys(INTERVENTION_ANALYSIS_DISPOSITIONS_V1).length,
      validation: "passed",
    },
    stop_set_authorization: {
      authorization_id: "mta-wiki-owner-2026-07-22-all-closure-plans",
      scope: "internal_analyst_stop_set_admission",
      recorded_decision:
        "versioned_analyst_grain_allowed_only_with_candidate_coverage_and_reviewed_stop_id_lineage",
      current_result: "blocked_missing_pinned_stop_grain_coverage",
    },
    entries,
    authority: { authorizes_study: false, authorizes_public_serving: false },
  });
}

function productsForFamily(registry: Plan042OutcomeRelevanceRegistry, family: string): string[] {
  const entry = registry.entries.find((candidate) => candidate.treatment_family === family);
  if (entry === undefined) {
    throw new Error(`No Plan 042 outcome product registry entry for ${family}`);
  }
  return [...entry.product_ids];
}

export function validatePlan042ReviewHandoff(
  handoff: Plan042ReviewHandoffArtifact,
  acceptanceManifestSha256: string,
): void {
  const packageIds = handoff.package_results.map((result) => result.package_id);
  assertSortedUnique(packageIds.toSorted(), "Plan 042 review package ids");
  for (const packageResult of handoff.package_results) {
    const reviewerIds = packageResult.review_receipts
      .map((receipt) => receipt.reviewer_id)
      .toSorted();
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      throw new Error(`${packageResult.package_id}: duplicate independent reviewer`);
    }
    if (
      packageResult.review_receipts.some(
        (receipt) =>
          receipt.reviewed_acceptance_manifest_sha256 !== acceptanceManifestSha256 ||
          receipt.reviewed_review_cut_id !== handoff.review_cut_id,
      )
    ) {
      throw new Error(`${packageResult.package_id}: review receipt target drifted`);
    }
    if (handoff.status === "pending_independent_review") {
      if (
        packageResult.reviewer_result !== "focused_tests_passed_pending_independent_review" ||
        packageResult.review_receipts.length !== 0
      ) {
        throw new Error(`${packageResult.package_id}: pending review is not fail-closed`);
      }
      continue;
    }
    const requiredReviewCount = packageResult.risk_class === "risky" ? 2 : 1;
    const requiredResult =
      packageResult.risk_class === "risky"
        ? "dual_independent_review_passed"
        : "independent_review_passed";
    if (
      packageResult.reviewer_result !== requiredResult ||
      packageResult.review_receipts.length < requiredReviewCount
    ) {
      throw new Error(`${packageResult.package_id}: insufficient independent review receipts`);
    }
  }
}

function buildGrainVerdicts(
  input: Plan042BuildInputs,
  candidateSet: Plan042CandidateSetV5,
  extentBindings: Plan042ExtentBindingArtifact,
  stopSetCoverage: Plan042StopSetCoverageArtifact,
  servicePatternCoverage: Plan042ServicePatternCoverageArtifact,
  lineageComparability: Plan042LineageComparabilityArtifact,
  relevanceRegistry: Plan042OutcomeRelevanceRegistry,
): Plan042GrainVerdictArtifact {
  const candidateByGroup = new Map<string, Plan042CandidateV5>(
    candidateSet.candidates.flatMap((candidate) =>
      candidate.origin === "occurrence_route"
        ? [[`${candidate.occurrence_id}\u0000${candidate.route_record_id}`, candidate] as const]
        : [],
    ),
  );
  const extentByKey = new Map(input.memberExtents.map((row) => [memberKey(row), row]));
  const bindingByExtent = new Map(extentBindings.rows.map((row) => [row.extent_id, row]));
  const stopCoverageByExtent = new Map(stopSetCoverage.rows.map((row) => [row.extent_id, row]));
  const serviceCoverageByExtent = new Map(
    servicePatternCoverage.rows.map((row) => [row.extent_id, row]),
  );
  const lineageByGrain = new Map(lineageComparability.rows.map((row) => [row.grain_id, row]));
  const memberRows: Plan042GrainVerdictRow[] = input.memberGrains.map((grain) => {
    const candidate = candidateByGroup.get(occurrenceRouteKey(grain));
    const extent = extentByKey.get(memberKey(grain));
    if (candidate === undefined || extent === undefined) {
      throw new Error(`${grain.grain_id}: missing candidate or extent`);
    }
    const lineageVerdict = lineageByGrain.get(grain.grain_id)?.disposition ?? null;
    if (grain.lineage_segments.length > 0 !== (lineageVerdict !== null)) {
      throw new Error(`${grain.grain_id}: lineage evidence receipt mismatch`);
    }
    let verdict: Plan042GrainVerdictRow["verdict"];
    let reasonId: string | null = null;
    if (lineageVerdict !== null) {
      verdict = "blocked:route_lineage_incomparable";
      reasonId = lineageVerdict;
    } else if (extent.extent === "stop_set") {
      const coverage = stopCoverageByExtent.get(extent.extent_id);
      if (coverage === undefined || coverage.disposition !== "missing_pinned_stop_grain_coverage") {
        throw new Error(`${extent.extent_id}: stop-set coverage receipt mismatch`);
      }
      verdict = "blocked:missing_pinned_stop_grain_coverage";
      reasonId = "missing_pinned_stop_grain_coverage";
    } else if (
      extent.treatment_family === "service_pattern" &&
      serviceCoverageByExtent.has(extent.extent_id)
    ) {
      const coverage = serviceCoverageByExtent.get(extent.extent_id);
      if (
        coverage === undefined ||
        coverage.disposition !== "missing_pinned_service_pattern_product_coverage"
      ) {
        throw new Error(`${extent.extent_id}: service-pattern coverage receipt mismatch`);
      }
      verdict = "blocked:missing_pinned_service_pattern_product_coverage";
      reasonId = "missing_pinned_service_pattern_product_coverage";
    } else if (extent.extent === "bounded_segment" || extent.extent === "mixed") {
      const binding = bindingByExtent.get(extent.extent_id);
      if (binding === undefined) throw new Error(`${extent.extent_id}: missing binding receipt`);
      verdict =
        binding.disposition === "spine_not_ready"
          ? "blocked:spine_not_ready"
          : "blocked:missing_endpoint_stop_id_equivalence";
      reasonId = binding.disposition;
    } else if (extent.treatment_family === "route_redesign") {
      verdict = "blocked:route_lineage_incomparable";
      reasonId = "missing_typed_lineage_comparability_receipt";
    } else if (grain.terminal_disposition === "absent_in_source") {
      verdict = "blocked:member_grain_absent_in_source";
      reasonId = "member_grain_absent_in_source";
    } else if (grain.terminal_disposition === "blocked_upstream") {
      verdict = "blocked:member_grain_blocked_upstream";
      reasonId = "member_grain_blocked_upstream";
    } else if (extent.extent === "unresolved") {
      verdict = "blocked:unresolved_extent";
      reasonId = "unresolved_extent";
    } else if (
      extent.treatment_family === "automated_bus_lane_enforcement" &&
      candidate.prior_recommendation === "recommend_approve"
    ) {
      verdict = "grain_matched_primary";
    } else if (
      grain.terminal_disposition === "not_applicable" ||
      extent.treatment_family === "fare_collection"
    ) {
      verdict = "grain_context_only";
    } else {
      verdict = "blocked:missing_pinned_outcome_product_coverage";
      reasonId = "missing_pinned_outcome_product_coverage";
    }
    return {
      candidate_id: candidate.candidate_id,
      member_extent_id: extent.extent_id,
      occurrence_id: grain.occurrence_id,
      route_record_id: grain.route_record_id,
      treatment_record_id: grain.treatment_record_id,
      route_id: grain.gtfs_route_id,
      treatment_family: extent.treatment_family,
      verdict,
      reason_id: reasonId,
      product_ids: productsForFamily(relevanceRegistry, extent.treatment_family),
      claim_ceiling:
        verdict === "grain_context_only"
          ? "context_only"
          : verdict.startsWith("blocked:")
            ? "none"
            : "descriptive_observation",
      prior_recommendation: candidate.prior_recommendation,
      lineage_verdict: lineageVerdict,
      authorizes_study: false,
    } satisfies Plan042GrainVerdictRow;
  });
  const noMemberRows: Plan042GrainVerdictRow[] = candidateSet.candidates
    .filter((candidate) => candidate.origin === "registry_only")
    .map((candidate) => {
      const family = candidate.treatment_families[0];
      if (family === undefined) throw new Error(`${candidate.candidate_id}: missing family`);
      const terminal = candidate.identity_verdict !== null;
      return {
        candidate_id: candidate.candidate_id,
        member_extent_id: null,
        occurrence_id: null,
        route_record_id: null,
        treatment_record_id: null,
        route_id: candidate.route_id,
        treatment_family: family,
        verdict: terminal
          ? "blocked:binding_absent_after_search"
          : candidate.prior_recommendation === "recommend_approve"
            ? "grain_matched_primary"
            : "blocked:preserved_prior_rejection",
        reason_id: terminal
          ? (candidate.identity_verdict?.verdict ?? null)
          : candidate.prior_recommendation === "recommend_approve"
            ? null
            : "plan096_recommend_reject",
        product_ids: terminal ? [] : productsForFamily(relevanceRegistry, family),
        claim_ceiling:
          terminal || candidate.prior_recommendation !== "recommend_approve"
            ? "none"
            : "descriptive_observation",
        prior_recommendation: candidate.prior_recommendation,
        lineage_verdict: null,
        authorizes_study: false,
      } satisfies Plan042GrainVerdictRow;
    });
  const rows = [...memberRows, ...noMemberRows].toSorted((left, right) => {
    const leftKey =
      left.member_extent_id === null
        ? `${left.candidate_id}\u0000<null>`
        : `${left.occurrence_id}\u0000${left.route_record_id}\u0000${left.treatment_record_id}`;
    const rightKey =
      right.member_extent_id === null
        ? `${right.candidate_id}\u0000<null>`
        : `${right.occurrence_id}\u0000${right.route_record_id}\u0000${right.treatment_record_id}`;
    return leftKey.localeCompare(rightKey);
  });
  const candidateIds = new Set(rows.map((row) => row.candidate_id));
  const memberExtentIds = memberRows.map((row) => row.member_extent_id).toSorted();
  if (
    rows.length !== 695 ||
    memberRows.length !== 308 ||
    noMemberRows.length !== 387 ||
    candidateIds.size !== 555 ||
    memberExtentIds.some(
      (id, index) => id !== input.memberExtents.map((extent) => extent.extent_id).toSorted()[index],
    )
  ) {
    throw new Error("Plan 042 grain-verdict denominator is incomplete");
  }
  const stopSetRows = memberRows.filter((row) => {
    const extent =
      row.member_extent_id === null
        ? undefined
        : input.memberExtents.find((candidate) => candidate.extent_id === row.member_extent_id);
    return extent?.extent === "stop_set";
  });
  const stopSetKeys = input.memberExtents
    .filter((extent) => extent.extent === "stop_set")
    .map(memberKey);
  if (
    stopSetRows.length !== 9 ||
    digestLines(stopSetKeys) !== PLAN042_EXPECTED_HASHES.stopSetMembers ||
    stopSetRows.some((row) =>
      row.lineage_verdict === null
        ? row.verdict !== "blocked:missing_pinned_stop_grain_coverage"
        : row.verdict !== "blocked:route_lineage_incomparable",
    )
  ) {
    throw new Error("Plan 042 stop-set analyst-grain block drifted");
  }
  const lineageRows = memberRows.filter((row) => row.lineage_verdict !== null);
  if (
    lineageRows.length !== 22 ||
    lineageRows.length !== lineageComparability.row_count ||
    lineageRows.some((row) => row.verdict !== "blocked:route_lineage_incomparable")
  ) {
    throw new Error("Plan 042 lineage denominator drifted");
  }
  const serviceCoverageExtentIds = new Set(servicePatternCoverage.rows.map((row) => row.extent_id));
  const servicePatternRows = memberRows.filter(
    (row) => row.member_extent_id !== null && serviceCoverageExtentIds.has(row.member_extent_id),
  );
  if (
    servicePatternRows.length !== 5 ||
    servicePatternRows.some(
      (row) =>
        row.lineage_verdict === null &&
        row.verdict !== "blocked:missing_pinned_service_pattern_product_coverage",
    )
  ) {
    throw new Error("Plan 042 service-pattern product coverage block drifted");
  }
  const priorAcceptedAceRows = rows.filter(
    (row) =>
      row.treatment_family === "automated_bus_lane_enforcement" &&
      row.prior_recommendation === "recommend_approve",
  );
  const priorAcceptedAceRowCount = priorAcceptedAceRows.length;
  if (
    priorAcceptedAceRowCount !== 8 ||
    priorAcceptedAceRows.some(
      (row) =>
        row.verdict !== "grain_matched_primary" ||
        stableJson(row.product_ids) !== stableJson(["local_route_month_trends_history"]),
    )
  ) {
    throw new Error(
      "Expected eight preserved ACE approvals at the canonical route-month product grain",
    );
  }
  const familyByVerdict: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    familyByVerdict[row.treatment_family] ??= {};
    const family = familyByVerdict[row.treatment_family];
    if (family === undefined) throw new Error("unreachable family histogram");
    family[row.verdict] = (family[row.verdict] ?? 0) + 1;
  }
  const reviewCutId = digestId("study-review-cut-v2", {
    candidate_set_id: candidateSet.candidate_set_id,
    prior_review_inputs: input.reviewInputs,
    extent_bindings: extentBindings.rows,
    grain_verdicts: rows,
  });
  return decodeSchemaStrict(Plan042GrainVerdictArtifactSchema, {
    artifact_kind: "bp.plan042.grain-verdict-matrix.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    review_cut_id: reviewCutId,
    row_count: rows.length,
    denominator: {
      member_row_count: memberRows.length,
      no_member_candidate_count: noMemberRows.length,
      expected_row_count: memberRows.length + noMemberRows.length,
    },
    verdict_histogram: histogram(rows.map((row) => row.verdict)),
    family_by_verdict_histogram: Object.fromEntries(
      Object.entries(familyByVerdict).toSorted(([left], [right]) => left.localeCompare(right)),
    ),
    prior_accepted_ace_row_count: priorAcceptedAceRowCount,
    rows,
    authority: { authorizes_study: false, authorizes_publication: false },
  });
}

export function buildPlan042Outputs(input: Plan042BuildInputs): Plan042BuildOutputs {
  const imports = buildImports(input);
  const candidateSet = buildCandidateSet(input);
  const extentBindings = buildExtentBindings(input, candidateSet);
  const stopSetCoverage = buildStopSetCoverage(input, candidateSet);
  const servicePatternCoverage = buildServicePatternCoverage(input, candidateSet);
  const lineageComparability = buildLineageComparability(input, candidateSet);
  const relevanceRegistry = buildRelevanceRegistry(input);
  const grainVerdicts = buildGrainVerdicts(
    input,
    candidateSet,
    extentBindings,
    stopSetCoverage,
    servicePatternCoverage,
    lineageComparability,
    relevanceRegistry,
  );
  const chunk = (
    packagePrefix: string,
    ids: readonly string[],
    targetSize = 50,
  ): { readonly package_id: string; readonly ids: readonly string[] }[] => {
    const sorted = [...ids].toSorted();
    const shardCount = Math.ceil(sorted.length / targetSize);
    const baseSize = Math.floor(sorted.length / shardCount);
    const largerShardCount = sorted.length % shardCount;
    let offset = 0;
    return Array.from({ length: shardCount }, (_, index) => {
      const size = baseSize + (index < largerShardCount ? 1 : 0);
      const idsForShard = sorted.slice(offset, offset + size);
      offset += size;
      return {
        package_id: `${packagePrefix}-${index + 1}-of-${shardCount}`,
        ids: idsForShard,
      };
    });
  };
  const noMemberRows = grainVerdicts.rows.filter((row) => row.member_extent_id === null);
  const memberRows = grainVerdicts.rows.filter(
    (row): row is typeof row & { readonly member_extent_id: string } =>
      row.member_extent_id !== null,
  );
  const identityPackages = chunk(
    "identity-terminal",
    noMemberRows
      .filter((row) => row.verdict === "blocked:binding_absent_after_search")
      .map((row) => row.candidate_id),
  );
  const acePackages = chunk(
    "ace-route-grain",
    noMemberRows
      .filter((row) => row.verdict !== "blocked:binding_absent_after_search")
      .map((row) => row.candidate_id),
  );
  const lineageIds = memberRows
    .filter((row) => row.lineage_verdict !== null)
    .map((row) => row.member_extent_id);
  const lineageSet = new Set(lineageIds);
  const stopExtentIds = new Set(stopSetCoverage.rows.map((row) => row.extent_id));
  const stopIds = memberRows
    .filter(
      (row) => !lineageSet.has(row.member_extent_id) && stopExtentIds.has(row.member_extent_id),
    )
    .map((row) => row.member_extent_id);
  const stopSet = new Set(stopIds);
  const boundedExtentIds = new Set(extentBindings.rows.map((row) => row.extent_id));
  const boundedIds = memberRows
    .filter(
      (row) =>
        !lineageSet.has(row.member_extent_id) &&
        !stopSet.has(row.member_extent_id) &&
        boundedExtentIds.has(row.member_extent_id),
    )
    .map((row) => row.member_extent_id);
  const boundedSet = new Set(boundedIds);
  const preclassifiedRiskIds = new Set([...lineageSet, ...stopSet, ...boundedSet]);
  const serviceProductCoverageIds = memberRows
    .filter(
      (row) =>
        !preclassifiedRiskIds.has(row.member_extent_id) &&
        row.verdict === "blocked:missing_pinned_service_pattern_product_coverage",
    )
    .map((row) => row.member_extent_id);
  const serviceProductCoverageSet = new Set(serviceProductCoverageIds);
  const upstreamRiskGroups = new Map<string, string[]>();
  for (const row of memberRows) {
    if (
      preclassifiedRiskIds.has(row.member_extent_id) ||
      serviceProductCoverageSet.has(row.member_extent_id) ||
      row.verdict !== "blocked:member_grain_blocked_upstream"
    ) {
      continue;
    }
    const ids = upstreamRiskGroups.get(row.treatment_family) ?? [];
    ids.push(row.member_extent_id);
    upstreamRiskGroups.set(row.treatment_family, ids);
  }
  const upstreamRiskPackages = [...upstreamRiskGroups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([family, ids]) => chunk(`upstream-risk-${family.replaceAll("_", "-")}`, ids));
  const upstreamRiskSet = new Set(upstreamRiskPackages.flatMap((entry) => entry.ids));
  const remainingMemberGroups = new Map<string, string[]>();
  for (const row of memberRows) {
    if (
      lineageSet.has(row.member_extent_id) ||
      stopSet.has(row.member_extent_id) ||
      boundedSet.has(row.member_extent_id) ||
      serviceProductCoverageSet.has(row.member_extent_id) ||
      upstreamRiskSet.has(row.member_extent_id)
    ) {
      continue;
    }
    const disposition = `${row.treatment_family}-${row.verdict}`;
    const ids = remainingMemberGroups.get(disposition) ?? [];
    ids.push(row.member_extent_id);
    remainingMemberGroups.set(disposition, ids);
  }
  const remainingMemberPackages = [...remainingMemberGroups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([disposition, ids]) =>
      chunk(`member-${disposition.replaceAll(":", "-").replaceAll("_", "-")}`, ids),
    );
  const routinePackages = [...identityPackages, ...acePackages, ...remainingMemberPackages];
  const riskyPackages = [
    { package_id: "bounded-extent-38", ids: boundedIds },
    { package_id: "stop-set-6", ids: stopIds },
    { package_id: "lineage-22", ids: lineageIds },
    {
      package_id: "service-product-coverage-gap-5",
      ids: serviceProductCoverageIds,
    },
    ...upstreamRiskPackages,
  ];
  const packagedIds = [...routinePackages, ...riskyPackages].flatMap((entry) => entry.ids);
  const riskyIds = riskyPackages.flatMap((entry) => entry.ids);
  const expectedIds = grainVerdicts.rows
    .map((row) => row.member_extent_id ?? row.candidate_id)
    .toSorted();
  if (
    packagedIds.length !== 695 ||
    new Set(packagedIds).size !== 695 ||
    stableJson(packagedIds.toSorted()) !== stableJson(expectedIds) ||
    boundedIds.length !== 38 ||
    stopIds.length !== 6 ||
    lineageIds.length !== 22 ||
    serviceProductCoverageIds.length !== 5 ||
    upstreamRiskSet.size !== 51 ||
    riskyIds.length !== 122 ||
    routinePackages.flatMap((entry) => entry.ids).length !== 573
  ) {
    throw new Error("Accelerated package coverage does not partition all 695 verdict rows");
  }
  const reviewHandoff = decodeSchemaStrict(Plan042ReviewHandoffArtifactSchema, {
    artifact_kind: "bp.plan042.review-handoff.v1",
    schema_version: 1,
    candidate_set_id: candidateSet.candidate_set_id,
    review_cut_id: grainVerdicts.review_cut_id,
    row_count: grainVerdicts.row_count,
    status: "pending_independent_review",
    approval_applied: false,
    package_results: [
      ...routinePackages.map(({ package_id, ids }) => ({
        package_id,
        candidate_or_member_count: ids.length,
        item_ids: ids,
        item_ids_sha256: digestLines(ids),
        risk_class: "routine",
        focused_result: "passed",
        replay_result: "passed",
        reviewer_result: "focused_tests_passed_pending_independent_review",
        review_receipts: [],
      })),
      ...riskyPackages.map(({ package_id, ids }) => ({
        package_id,
        candidate_or_member_count: ids.length,
        item_ids: ids,
        item_ids_sha256: digestLines(ids),
        risk_class: "risky",
        focused_result: "passed",
        replay_result: "passed",
        reviewer_result: "focused_tests_passed_pending_independent_review",
        review_receipts: [],
      })),
    ],
    authority: {
      authorizes_study: false,
      authorizes_publication: false,
      authorizes_d1_r2_mutation: false,
      authorizes_deploy: false,
    },
  });
  validatePlan042ReviewHandoff(
    reviewHandoff,
    // Pending handoffs carry no review receipts. The final reviewed handoff
    // replaces this placeholder with the frozen acceptance-manifest hash.
    sha256Bytes(new TextEncoder().encode(`${JSON.stringify(grainVerdicts, null, 2)}\n`)),
  );
  return {
    ...imports,
    candidateSet,
    extentBindings,
    stopSetCoverage,
    servicePatternCoverage,
    lineageComparability,
    relevanceRegistry,
    grainVerdicts,
    reviewHandoff,
  };
}

export function plan042ArtifactFileName(kind: keyof Plan042BuildOutputs): string {
  switch (kind) {
    case "producerImport":
      return "producer-import.json";
    case "identityVerdictImport":
      return "identity-verdict-import.json";
    case "memberGrainImport":
      return "member-grain-import.json";
    case "candidateSet":
      return "candidate-set-v5.json";
    case "extentBindings":
      return "extent-segment-bindings.json";
    case "stopSetCoverage":
      return "stop-set-coverage.json";
    case "servicePatternCoverage":
      return "service-pattern-coverage.json";
    case "lineageComparability":
      return "lineage-comparability.json";
    case "relevanceRegistry":
      return "outcome-relevance-registry.json";
    case "grainVerdicts":
      return "grain-verdict-matrix.json";
    case "reviewHandoff":
      return "review-handoff.json";
  }
}

export function artifactSummary(outputs: Plan042BuildOutputs) {
  return {
    candidateSetId: outputs.candidateSet.candidate_set_id,
    candidateCount: outputs.candidateSet.summary.candidate_count,
    memberGrainCount: outputs.memberGrainImport.row_count,
    extentBindingCount: outputs.extentBindings.row_count,
    grainVerdictCount: outputs.grainVerdicts.row_count,
    reviewCutId: outputs.grainVerdicts.review_cut_id,
    files: (Object.keys(outputs) as (keyof Plan042BuildOutputs)[]).map((kind) =>
      basename(plan042ArtifactFileName(kind)),
    ),
  };
}
