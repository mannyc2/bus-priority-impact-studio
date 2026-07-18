import { createHash } from "node:crypto";
import { basename } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  MtaWikiOperationalOccurrenceImportArtifactV3Schema,
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
  MtaWikiRc22LineageAuditSchema,
} from "@bp/domain/documents/operational-occurrence";
import {
  StudyEventMergeArtifactV2Schema,
  StudyEventMergeArtifactV3Schema,
} from "@bp/domain/studio/study";
import { Schema } from "effect";
import { writeJson } from "../src/lib/json.ts";
import {
  buildMtaWikiRc22LineageAudit,
  type StudyInputFile,
} from "../src/lib/mta-wiki-rc22-lineage.ts";

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const CandidateIdSchema = Schema.String.check(Schema.isPattern(/^study-event-v2:[a-f0-9]{24}$/u));
const LogicalStudyMergeInputsSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.rc19_study_merge_logical_inputs.v1"),
  schemaVersion: Schema.Literal(1),
  summary: Schema.Struct({
    registryRowCount: NonNegativeIntegerSchema,
    availableAnalysisRouteIdCount: NonNegativeIntegerSchema,
  }),
  registryRows: Schema.Array(
    Schema.Struct({
      event_id: Schema.String,
      route_id: Schema.String,
      intervention_type: Schema.String,
      source_id: Schema.String,
      program: Schema.String,
      implementation_date: Schema.String,
      implementation_month: Schema.String,
      event_status: Schema.String,
      description: Schema.String,
    }),
  ),
  availableAnalysisRouteIds: Schema.Array(Schema.String),
});

const SpineManifestSchema = Schema.Struct({
  artifactKind: Schema.String,
  schemaVersion: Schema.Number,
  generatedAt: Schema.String,
  source: Schema.Struct({
    table: Schema.String,
    dbPath: Schema.String,
    startMonth: Schema.String,
    endMonth: Schema.String,
    toleranceMeters: Schema.Number,
    artifactRoot: Schema.String,
    manifestPath: Schema.String,
    routeUniverse: Schema.String,
  }),
  summary: Schema.Struct({
    candidateRouteCount: NonNegativeIntegerSchema,
    routeCount: NonNegativeIntegerSchema,
    currentCatalogRouteCount: NonNegativeIntegerSchema,
    speedRouteNotInCurrentCatalogCount: NonNegativeIntegerSchema,
    currentCatalogRouteMissingSpeedCount: NonNegativeIntegerSchema,
    artifactWrittenRouteCount: NonNegativeIntegerSchema,
    seriesReadyRouteCount: NonNegativeIntegerSchema,
    seriesReadyWithGapsRouteCount: NonNegativeIntegerSchema,
    needsPatternReviewRouteCount: NonNegativeIntegerSchema,
    failedRouteCount: NonNegativeIntegerSchema,
  }),
  routes: Schema.Array(
    Schema.Struct({
      routeId: Schema.String,
      routeSlug: Schema.String,
      inCurrentCatalog: Schema.Boolean,
      readiness: Schema.Literals([
        "series_ready",
        "series_ready_with_gaps",
        "needs_pattern_review",
      ]),
      reasons: Schema.Array(Schema.String),
      artifactPath: Schema.String,
      artifactWritten: Schema.Boolean,
      monthCount: NonNegativeIntegerSchema,
      sourceRowCount: NonNegativeIntegerSchema,
      busTripCount: NonNegativeIntegerSchema,
      nodeCount: NonNegativeIntegerSchema,
      spineSegmentCount: NonNegativeIntegerSchema,
      rawSegmentKeyCount: NonNegativeIntegerSchema,
      rawStopPairCount: NonNegativeIntegerSchema,
      coverage: Schema.Struct({
        minCoverageShare: Schema.Number,
        meanCoverageShare: Schema.Number,
        fullCoverageMonthCount: NonNegativeIntegerSchema,
        partialCoverageMonthCount: NonNegativeIntegerSchema,
        partialCoverageMonthShare: Schema.Number,
        rawKeyDriftMonthCount: NonNegativeIntegerSchema,
        rawKeyDriftMonthShare: Schema.Number,
      }),
      validationStatus: Schema.Literals(["pass", "warn", "fail"]),
      issueCount: NonNegativeIntegerSchema,
    }),
  ),
});

const CampaignCountSchema = Schema.Struct({
  authoritative_route_treatment_binding_proved: NonNegativeIntegerSchema,
  date_and_phase_proved: NonNegativeIntegerSchema,
  exact_segment_binding_proved: NonNegativeIntegerSchema,
  explicitly_excluded: NonNegativeIntegerSchema,
  operational_occurrence_added_or_updated: NonNegativeIntegerSchema,
  researched: NonNegativeIntegerSchema,
  source_acquired: NonNegativeIntegerSchema,
  still_unresolved: NonNegativeIntegerSchema,
});
const AcquisitionSummarySchema = Schema.Struct({
  authorization: Schema.Literal("non_authorizing_read_only_campaign_aggregation"),
  campaign_id: Schema.Literal("registry-only-bus-lane-acquisition-v1"),
  campaign_jsonl_sha256: Sha256Schema,
  candidate_ids_sha256: Sha256Schema,
  candidate_set_id: Schema.Literal("candidate-set-v2:24080902f508b55a0033df32"),
  candidate_set_sha256: Schema.Literal(
    "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
  ),
  coverage_assertions: Schema.Struct({
    all_assertions_passed: Schema.Boolean,
    campaign_candidate_count: NonNegativeIntegerSchema,
    candidate_identity_collision_count: NonNegativeIntegerSchema,
    cross_shard_candidate_collision_count: NonNegativeIntegerSchema,
    cross_shard_exclusion_candidate_collision_count: NonNegativeIntegerSchema,
    cross_shard_receipt_candidate_collision_count: NonNegativeIntegerSchema,
    exclusion_without_partition_count: NonNegativeIntegerSchema,
    expected_shard_count: NonNegativeIntegerSchema,
    extra_shard_candidate_count: NonNegativeIntegerSchema,
    four_channel_receipt_count: NonNegativeIntegerSchema,
    missing_backlog_candidate_count: NonNegativeIntegerSchema,
    observed_shard_count: NonNegativeIntegerSchema,
    partition_union_count: NonNegativeIntegerSchema,
    partition_without_exclusion_count: NonNegativeIntegerSchema,
    partition_without_receipt_count: NonNegativeIntegerSchema,
    receipt_id_collision_count: NonNegativeIntegerSchema,
    receipt_without_partition_count: NonNegativeIntegerSchema,
    reconciliation_backlog_count: NonNegativeIntegerSchema,
    verified_shard_manifest_count: NonNegativeIntegerSchema,
  }),
  exclusive_primary_disposition_counts: Schema.Struct({
    completed_search_route_linkage_unresolved: NonNegativeIntegerSchema,
    linkage_supported_phase_unresolved: NonNegativeIntegerSchema,
  }),
  generated_on: Schema.String,
  input_shards: Schema.Array(
    Schema.Struct({
      candidate_count: NonNegativeIntegerSchema,
      exclusions_sha256: Sha256Schema,
      manifest_path: Schema.String,
      manifest_payload_sha256: Sha256Schema,
      manifest_sha256: Sha256Schema,
      partition_sha256: Sha256Schema,
      receipts_sha256: Sha256Schema,
      shard: Schema.String,
      summary_sha256: Sha256Schema,
    }),
  ),
  nonexclusive_reason_counts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
  reconciliation_ledger_path: Schema.String,
  reconciliation_ledger_sha256: Sha256Schema,
  route_binding_semantics: Schema.String,
  schema_version: Schema.Literal(1),
  shard_counts: Schema.Struct({
    bronx: CampaignCountSchema,
    "brooklyn-null": CampaignCountSchema,
    manhattan: CampaignCountSchema,
    queens: CampaignCountSchema,
    "staten-island": CampaignCountSchema,
  }),
  shard_manifest_set_sha256: Sha256Schema,
  totals: CampaignCountSchema,
});

const AcquisitionCampaignRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  campaign_id: Schema.Literal("registry-only-bus-lane-acquisition-v1"),
  candidate_set_id: Schema.Literal("candidate-set-v2:24080902f508b55a0033df32"),
  candidate_set_sha256: Schema.Literal(
    "42d9dc3139b4ba1439b0737b7f2b2175e7fe71fa20286c1ec349addf8f6455ba",
  ),
  shard: Schema.Literals(["bronx", "brooklyn-null", "manhattan", "queens", "staten-island"]),
  acquisition: Schema.Struct({
    physical_bus_lane_source_acquired: Schema.Literal(true),
    receipt_id: Schema.String,
    required_source_categories_checked: Schema.Tuple([
      Schema.Literal("official_nyc_dot_lane_project"),
      Schema.Literal("official_mta_route_project"),
      Schema.Literal("official_public_board_committee"),
      Schema.Literal("other_repository_approved_primary"),
    ]),
    researched: Schema.Literal(true),
    researched_on: Schema.Literal("2026-07-15"),
  }),
  candidate: Schema.Struct({
    candidate_id: CandidateIdSchema,
    corridor: Schema.String,
    date_precision: Schema.Literal("day"),
    identity: Schema.String,
    implementation_date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
    implementation_month: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/u)),
    normalized_route_id: Schema.String,
    route_id: Schema.String,
    source_event_id: Schema.String,
  }),
  outcome: Schema.Struct({
    exclusion_reason: Schema.String,
    exclusive_primary_disposition: Schema.Literals([
      "completed_search_route_linkage_unresolved",
      "linkage_supported_phase_unresolved",
    ]),
    next_action: Schema.String,
    nonexclusive_reason_codes: Schema.Array(Schema.String),
    registry_projection_excluded: Schema.Literal(true),
    still_unresolved: Schema.Literal(true),
    study_projection_eligible: Schema.Literal(false),
    unsupported_claims: Schema.Array(Schema.String),
  }),
  provenance: Schema.Struct({
    exclusion_path: Schema.String,
    exclusion_row_sha256: Sha256Schema,
    partition_path: Schema.String,
    partition_row_sha256: Sha256Schema,
    receipt_path: Schema.String,
    receipt_row_sha256: Sha256Schema,
    reconciliation_ledger_path: Schema.String,
    reconciliation_ledger_row_sha256: Sha256Schema,
    shard_manifest_path: Schema.String,
    shard_manifest_sha256: Sha256Schema,
  }),
  relationship_proof: Schema.Struct({
    authoritative_route_treatment_binding_proved: Schema.Boolean,
    candidate_date_and_phase_proved: Schema.Literal(false),
    canonical_operational_occurrence_identity_proved: Schema.Literal(false),
    exact_candidate_segment_binding_proved: Schema.Boolean,
    exact_segment_ids: Schema.Array(Schema.String.check(Schema.isPattern(/^\d{7}$/u))),
    explicit_phase_identity_proved: Schema.Literal(false),
    operational_occurrence_added_or_updated: Schema.Literal(false),
    route_binding_precision: Schema.Literal(
      "generic_authoritative_route_treatment_or_corridor_link_not_exact_candidate_segment_day_phase_or_occurrence",
    ),
    source_claim_field: Schema.Literal("exact_route_treatment_binding_proved"),
  }),
});

const Rc22ManifestIdentitySchema = Schema.Struct({
  manifest_version: Schema.Literal(4),
  release_id: Schema.Literal("v1-rc22"),
  generator_commit: Schema.String,
  contract_versions: Schema.Record(Schema.String, Schema.Number),
  record_counts: Schema.Record(Schema.String, Schema.Number),
  files: Schema.Record(
    Schema.String,
    Schema.Struct({ bytes: Schema.Number, sha256: Schema.String }),
  ),
  pointers: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
});

type ParsedArguments = ReadonlyMap<string, string>;

function parseArguments(argv: readonly string[]): ParsedArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || value === undefined || !flag.startsWith("--")) {
      throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
    }
    values.set(flag.slice(2), value);
  }
  return values;
}

function required(args: ParsedArguments, name: string): string {
  const value = args.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readUtf8(path: string): Promise<{ bytes: Uint8Array; text: string }> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Invalid UTF-8 in ${path}`, { cause });
  }
  return { bytes, text };
}

async function readJson(path: string): Promise<{ bytes: Uint8Array; value: unknown }> {
  const input = await readUtf8(path);
  try {
    return { bytes: input.bytes, value: JSON.parse(input.text) };
  } catch (cause) {
    throw new Error(`Invalid JSON in ${path}`, { cause });
  }
}

async function readJsonLines(path: string): Promise<{ bytes: Uint8Array; rows: unknown[] }> {
  const input = await readUtf8(path);
  const lines = input.text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rows = lines.map((line, index) => {
    if (line.trim().length === 0) throw new Error(`Blank JSONL row ${index + 1} in ${path}`);
    try {
      return JSON.parse(line);
    } catch (cause) {
      throw new Error(`Invalid JSON on row ${index + 1} in ${path}`, { cause });
    }
  });
  return { bytes: input.bytes, rows };
}

async function fileReference(
  path: string,
  logicalPath: string,
  pointer = basename(logicalPath),
): Promise<StudyInputFile> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  return {
    pointer,
    path: logicalPath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

export async function runRc22LineageAudit(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const rc19ImportPath = required(args, "rc19-import");
  const rc19CandidatePath = required(args, "rc19-candidates");
  const rc22ImportPath = required(args, "rc22-import");
  const rc22CandidatePath = required(args, "rc22-candidates");
  const manifestPath = required(args, "wiki-manifest");
  const logicalInputsPath = required(args, "logical-inputs");
  const spinePath = required(args, "spine");
  const acquisitionSummaryPath = required(args, "acquisition-summary");
  const acquisitionCampaignPath = required(args, "acquisition-campaign");
  const latestPath = required(args, "latest");
  const outputPath = required(args, "output");

  const [
    rc19ImportJson,
    rc19CandidateJson,
    rc22ImportJson,
    rc22CandidateJson,
    manifestJson,
    logicalInputsJson,
    spineJson,
    acquisitionSummaryJson,
    acquisitionCampaignJsonl,
    latest,
  ] = await Promise.all([
    readJson(rc19ImportPath),
    readJson(rc19CandidatePath),
    readJson(rc22ImportPath),
    readJson(rc22CandidatePath),
    readJson(manifestPath),
    readJson(logicalInputsPath),
    readJson(spinePath),
    readJson(acquisitionSummaryPath),
    readJsonLines(acquisitionCampaignPath),
    readUtf8(latestPath),
  ]);
  // The rc19 importer remains an immutable byte input. Its legacy artifact is
  // intentionally not reinterpreted by this rc22-only lineage projection.
  const rc19Occurrences = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV3Schema)(
    rc19ImportJson.value,
  );
  const rc19Candidates = decodeStrict(StudyEventMergeArtifactV2Schema)(rc19CandidateJson.value);
  const rc22Occurrences = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV4Schema)(
    rc22ImportJson.value,
  );
  const rc22Candidates = decodeStrict(StudyEventMergeArtifactV3Schema)(rc22CandidateJson.value);
  const manifest = decodeStrict(Rc22ManifestIdentitySchema)(manifestJson.value);
  const logicalInputs = decodeStrict(LogicalStudyMergeInputsSchema)(logicalInputsJson.value);
  const spine = decodeStrict(SpineManifestSchema)(spineJson.value);
  const acquisition = decodeStrict(AcquisitionSummarySchema)(acquisitionSummaryJson.value);
  const acquisitionCampaign = acquisitionCampaignJsonl.rows.map((row) =>
    decodeStrict(AcquisitionCampaignRowSchema)(row),
  );
  for (const row of acquisitionCampaign) {
    const expectedReasons = [
      ...(row.relationship_proof.authoritative_route_treatment_binding_proved
        ? []
        : ["authoritative_route_treatment_binding_unproved"]),
      ...(row.relationship_proof.exact_candidate_segment_binding_proved
        ? []
        : ["exact_candidate_segment_binding_unproved"]),
      "explicit_phase_identity_unproved",
      "candidate_date_and_phase_unproved",
      "canonical_operational_occurrence_identity_unproved",
      "operational_occurrence_not_added_or_updated",
    ];
    const expectedDisposition = row.relationship_proof.authoritative_route_treatment_binding_proved
      ? "linkage_supported_phase_unresolved"
      : "completed_search_route_linkage_unresolved";
    if (
      row.acquisition.receipt_id.startsWith(`${row.shard}-acquisition:`) !== true ||
      row.candidate.identity !==
        `${row.candidate.route_id}|bus_lane|${row.candidate.implementation_date}|day` ||
      row.candidate.implementation_month !== row.candidate.implementation_date.slice(0, 7) ||
      row.candidate.source_event_id !==
        `bus-lane:${row.candidate.route_id}:${row.candidate.implementation_month}` ||
      row.outcome.exclusive_primary_disposition !== expectedDisposition ||
      row.relationship_proof.exact_candidate_segment_binding_proved !==
        row.relationship_proof.exact_segment_ids.length > 0 ||
      (row.relationship_proof.exact_candidate_segment_binding_proved &&
        !row.relationship_proof.authoritative_route_treatment_binding_proved) ||
      JSON.stringify(row.relationship_proof.exact_segment_ids) !==
        JSON.stringify([...new Set(row.relationship_proof.exact_segment_ids)].toSorted()) ||
      JSON.stringify(row.outcome.nonexclusive_reason_codes) !== JSON.stringify(expectedReasons)
    ) {
      throw new Error(`Acquisition campaign semantic mismatch for ${row.candidate.candidate_id}`);
    }
  }
  const latestObserved = latest.text.trim();

  const artifact = buildMtaWikiRc22LineageAudit({
    trackerBaselineCommit: required(args, "tracker-baseline-commit"),
    rc19Import: await fileReference(
      rc19ImportPath,
      "docs/research/artifacts/mta-wiki-v1-rc19.operational-occurrences-import.json",
    ),
    rc19CandidateSet: await fileReference(
      rc19CandidatePath,
      "docs/research/artifacts/candidate-set-v2-24080902f508b55a0033df32.study-events.json",
    ),
    rc22Import: await fileReference(
      rc22ImportPath,
      "docs/research/artifacts/mta-wiki-v1-rc22.operational-occurrences-import.json",
    ),
    rc22CandidateSet: await fileReference(
      rc22CandidatePath,
      "docs/research/artifacts/candidate-set-v3-9761a5648df08fbdf6c38bb4.study-events.json",
    ),
    rc22Manifest: await fileReference(
      manifestPath,
      "data/exports/releases/v1-rc22/manifest.json",
      "manifest.json",
    ),
    logicalMergeInputs: await fileReference(
      logicalInputsPath,
      "docs/research/artifacts/mta-wiki-rc19-study-merge-logical-inputs.json",
    ),
    spineManifest: await fileReference(
      spinePath,
      "data/artifacts/studio/v2/speed-spines/2023-04_to_2026-03/manifest.json",
    ),
    busLaneAcquisitionSummary: await fileReference(
      acquisitionSummaryPath,
      "data/exports/releases/v1-rc22/relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/summary.json",
    ),
    busLaneAcquisitionCampaign: await fileReference(
      acquisitionCampaignPath,
      "data/exports/releases/v1-rc22/relationship-integrity/data/quality/relationship-integrity/bus-lane-acquisition/campaign.jsonl",
    ),
    latestPointer: await fileReference(latestPath, "data/exports/releases/LATEST", "LATEST"),
    rc19Candidates,
    rc19Occurrences,
    rc22Occurrences,
    rc22Candidates,
    logicalInputs,
    spine,
    acquisition,
    acquisitionCampaign: acquisitionCampaign.map((row) => ({
      candidateId: row.candidate.candidate_id,
      identity: row.candidate.identity,
      routeId: row.candidate.route_id,
      implementationDate: row.candidate.implementation_date,
      disposition: row.outcome.exclusive_primary_disposition,
      authoritativeRouteTreatmentBindingProved:
        row.relationship_proof.authoritative_route_treatment_binding_proved,
      exactCandidateSegmentBindingProved:
        row.relationship_proof.exact_candidate_segment_binding_proved,
      exactSegmentIds: row.relationship_proof.exact_segment_ids,
      candidateDateAndPhaseProved: row.relationship_proof.candidate_date_and_phase_proved,
      explicitPhaseIdentityProved: row.relationship_proof.explicit_phase_identity_proved,
      canonicalOperationalOccurrenceIdentityProved:
        row.relationship_proof.canonical_operational_occurrence_identity_proved,
      operationalOccurrenceAddedOrUpdated:
        row.relationship_proof.operational_occurrence_added_or_updated,
      stillUnresolved: row.outcome.still_unresolved,
      registryProjectionExcluded: row.outcome.registry_projection_excluded,
      studyProjectionEligible: row.outcome.study_projection_eligible,
      receiptId: row.acquisition.receipt_id,
      receiptPath: row.provenance.receipt_path,
      receiptRowSha256: row.provenance.receipt_row_sha256,
      exclusionPath: row.provenance.exclusion_path,
      exclusionRowSha256: row.provenance.exclusion_row_sha256,
      reconciliationLedgerPath: row.provenance.reconciliation_ledger_path,
      reconciliationLedgerRowSha256: row.provenance.reconciliation_ledger_row_sha256,
    })),
    rc22ManifestValue: manifest,
    latestObserved,
    analysisMonth: required(args, "analysis-month"),
  });
  decodeStrict(MtaWikiRc22LineageAuditSchema)(artifact);
  await writeJson(outputPath, artifact);
}

if (import.meta.main) {
  await runRc22LineageAudit(Bun.argv.slice(2));
}
