import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  MtaWikiOperationalOccurrenceImportArtifactV4Schema,
  MtaWikiRc22LineageAuditSchema,
  OperationalOccurrenceReviewSnapshotSchema,
  OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema,
} from "@bp/domain/documents/operational-occurrence";
import { StudyEventMergeArtifactV3Schema } from "@bp/domain/studio/study";
import { Schema } from "effect";
import { writeJson } from "../src/lib/json.ts";

const RC22_MANIFEST_SHA256 = "249ef6be1d927e44d405c11bcff643d18b2133e5407be37dc7612f935a1b53e4";
const RC23_MANIFEST_SHA256 = "e412b0b7a3e98e87e43c8b59375f335c1c0bd84ab4024171ec6c45203f1da83b";
const RC22_AUDIT_SHA256 = "042bd160b6c57f490547f9808b2683a0a7d2a26ccd8f494d74e61c84d873dfa7";
const OCCURRENCE_SHA256 = "d2fff454cc82c9a74f9f4ea9bb0b0334a12af385f53d0e7fbde126ea9e33f98f";
const RELATIONSHIP_BUNDLE_SHA256 =
  "2a4fa7fd0e3b2345b236c06a4e0fc7640db106c959ab65ef6110d30ed6a0641f";
const RELATIONSHIP_PROOF_RAW_SHA256 =
  "47abb7e6602083ef94ca7863c512635ad0ca2332d5bca8ed3483cb175928ef54";
const RELATIONSHIP_PROOF_CANONICAL_SHA256 =
  "2bcdc8859c23baecfb0a463e32a2485eab267d3de5ad6ac9cf3c69c14e270536";
const GRAPH_MANIFEST_SHA256 = "6631fd19b4520be5553420eb4ae347d2ab9fd39762c10a3ece9ab90b0313ac63";
const GRAPH_SUMMARY_SHA256 = "7b77d742fc5cac8e3b3497d254591db0a3381bd694195b013f09252d70672e91";
const CHANGED_REVIEW_PATH = "operational_occurrence_review_decisions.json";
const RC22_REVIEW_SHA256 = "f18dda5c0c758d4193cb1dfdf69e296da79814ebcb39cdefb4e7dc9bec963bed";
const RC23_REVIEW_SHA256 = "69eec1a5fd919eab4ac5743e492a036f0aae05349121195e68630f2fff54032c";

const NonNegativeIntegerSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const FileMetadataSchema = Schema.Struct({ bytes: NonNegativeIntegerSchema, sha256: Sha256Schema });
const FileReferenceSchema = Schema.Struct({
  pointer: Schema.String,
  path: Schema.String,
  bytes: NonNegativeIntegerSchema,
  sha256: Sha256Schema,
});
const ManifestV4Schema = Schema.Struct({
  manifest_version: Schema.Literal(4),
  release_id: Schema.String,
  generator_commit: Schema.String,
  contract_versions: Schema.Struct({
    operational_anchors: Schema.Literal(1),
    operational_anchor_review_decisions: Schema.Literal(1),
    operational_occurrences: Schema.Literal(2),
    operational_occurrence_review_decisions: Schema.Literal(1),
    relationship_integrity_bundle: Schema.Literal(1),
  }),
  record_counts: Schema.Record(Schema.String, NonNegativeIntegerSchema),
  files: Schema.Record(Schema.String, FileMetadataSchema),
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

export const Rc23DeltaAuditSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_rc23_lineage_delta.v1"),
  schemaVersion: Schema.Literal(1),
  authorization: Schema.Literal("non_authorizing_migration_audit_only"),
  generatedAt: Schema.Literal("2026-07-18T00:00:00.000Z"),
  sourceCommits: Schema.Struct({
    trackerBaseline: Schema.String,
    trackerReviewProjection: Schema.Literal("7b5c988b69af17769256332414b798e0d35246d6"),
    trackerCanonicalAuditBinding: Schema.Literal("745f098e1b62c89bf7bc2341818eaaacdba926f8"),
    mtaWikiProducerRepair: Schema.Literal("443e6e344b75d3f7c085574fbab8e57b1a1e8cf3"),
    mtaWikiImmutableRc23: Schema.Literal("d40ee4b62c069f2d8df131a18fe1a71bab9cdbbf"),
    mtaWikiMergedMain: Schema.Literal("299752f2e9c7696296b29b1bcefbb5f454cb1699"),
  }),
  inputs: Schema.Struct({
    rc22LineageAudit: FileReferenceSchema,
    rc22Manifest: FileReferenceSchema,
    rc23Manifest: FileReferenceSchema,
    rc22Import: FileReferenceSchema,
    rc23Import: FileReferenceSchema,
    rc22CandidateSet: FileReferenceSchema,
    rc23CandidateSet: FileReferenceSchema,
    latestPointer: FileReferenceSchema,
  }),
  releaseCorrection: Schema.Struct({
    addressedArtifactCount: NonNegativeIntegerSchema,
    byteIdenticalArtifactCount: NonNegativeIntegerSchema,
    changedArtifactCount: NonNegativeIntegerSchema,
    changedArtifact: Schema.Struct({
      path: Schema.Literal(CHANGED_REVIEW_PATH),
      rc22: FileMetadataSchema,
      rc23: FileMetadataSchema,
    }),
    reviewProjection: Schema.Struct({
      rc22DecisionCount: NonNegativeIntegerSchema,
      rc23DecisionCount: NonNegativeIntegerSchema,
      removedPhaseRelationBindingCount: NonNegativeIntegerSchema,
      removedPhysicalScopeBindingCount: NonNegativeIntegerSchema,
      residualDifferenceCount: NonNegativeIntegerSchema,
    }),
    operationalOccurrenceBytesUnchanged: Schema.Literal(true),
    relationshipBundleBytesUnchanged: Schema.Literal(true),
  }),
  canonicalProof: Schema.Struct({
    operationalOccurrences: FileReferenceSchema,
    relationshipBundle: FileReferenceSchema,
    enforcementProofRaw: FileReferenceSchema,
    enforcementProofCanonicalSha256: Sha256Schema,
    graphManifest: FileReferenceSchema,
    graphSummary: FileReferenceSchema,
    phaseAuditManifest: FileReferenceSchema,
    phaseAuditSummary: FileReferenceSchema,
    physicalAuditManifest: FileReferenceSchema,
    physicalAuditSummary: FileReferenceSchema,
    phaseAuditOccurrencePinMatches: Schema.Literal(true),
    physicalAuditOccurrencePinMatches: Schema.Literal(true),
    rootTreatmentRelationCorridorPinsMatch: Schema.Literal(true),
    hardModeAndCompletenessReady: Schema.Literal(true),
    graphFindingCount: Schema.Literal(45_986),
    enforceableViolationCount: Schema.Literal(0),
    reviewedNonEnforceableAdvisoryCount: Schema.Literal(3),
    informationalOrphanRecordCount: Schema.Literal(45_983),
    phaseFindingCount: Schema.Literal(0),
    physicalFindingCount: Schema.Literal(0),
  }),
  rc19ToRc23: Schema.Unknown,
  categoryCountsByDimension: Schema.Unknown,
  trackerCandidateFunnel: Schema.Unknown,
  physicalAndRouteLineage: Schema.Unknown,
  excludedBusLaneQueue: Schema.Struct({
    candidateCount: Schema.Literal(321),
    unchangedCandidateRowCount: Schema.Literal(321),
    stillUnresolvedCount: Schema.Literal(321),
    genericAuthoritativeRouteTreatmentLinkCount: Schema.Literal(54),
    exactCandidateSegmentProofCount: Schema.Literal(1),
    exactCandidateDateAndPhaseCount: Schema.Literal(0),
    newOrUpdatedOccurrenceCount: Schema.Literal(0),
    canonicalWikiOccurrenceProjectionCount: Schema.Literal(0),
    wikiBoundCandidateCount: Schema.Literal(0),
    approvedCandidateCount: Schema.Literal(0),
    candidateIdsSha256: Sha256Schema,
  }),
  boundaries: Schema.Struct({
    candidateApprovalState: Schema.Literal("awaiting_approval"),
    approvalReceiptPresent: Schema.Literal(false),
    approvedCandidateCount: Schema.Literal(0),
    studyRunAuthorized: Schema.Literal(false),
    publicationAuthorized: Schema.Literal(false),
    publicD1OrR2MutationAuthorized: Schema.Literal(false),
    deploymentAuthorized: Schema.Literal(false),
    latestMutationAuthorized: Schema.Literal(false),
  }),
  promotionRecommendation: Schema.Struct({
    decision: Schema.Literal("ready_for_operator_release_pointer_review"),
    targetRelease: Schema.Literal("v1-rc23"),
    latestObserved: Schema.Literal("v1-rc5"),
    operatorReadyToPromotePinnedRelease: Schema.Literal(true),
    authorizesPromotion: Schema.Literal(false),
    explicitOperatorActionRequired: Schema.Literal(true),
    explicitReleaseAndManifestPinningStillRequired: Schema.Literal(true),
    additionalMtaWikiProducerRepairRequired: Schema.Literal(false),
  }),
});

type ParsedArguments = ReadonlyMap<string, string>;
type ManifestV4 = typeof ManifestV4Schema.Type;

function parseArguments(argv: readonly string[]): ParsedArguments {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || value === undefined || !flag.startsWith("--")) {
      throw new Error(`Expected --flag value, received ${flag ?? "end of arguments"}`);
    }
    result.set(flag.slice(2), value);
  }
  return result;
}

function required(args: ParsedArguments, name: string): string {
  const value = args.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing --${name}`);
  return value;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function canonicalSha256(value: unknown): string {
  return sha256(new TextEncoder().encode(canonicalJson(value)));
}

async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).arrayBuffer());
}

async function readJson(path: string): Promise<{ bytes: Uint8Array; value: unknown }> {
  const bytes = await readBytes(path);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { bytes, value: JSON.parse(text) };
}

async function fileReference(path: string, logicalPath: string) {
  const bytes = await readBytes(path);
  return {
    pointer: basename(logicalPath),
    path: logicalPath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function isSafeReleasePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

async function verifyReleaseFiles(releaseDirectory: string, manifest: ManifestV4): Promise<void> {
  for (const [pointer, metadata] of Object.entries(manifest.files)) {
    assert(isSafeReleasePath(pointer), `Unsafe release path: ${pointer}`);
    const bytes = await readBytes(join(releaseDirectory, pointer));
    assert(bytes.byteLength === metadata.bytes, `Byte mismatch: ${pointer}`);
    assert(sha256(bytes) === metadata.sha256, `Hash mismatch: ${pointer}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} is not an object`,
  );
  return value as Record<string, unknown>;
}

function normalizeCandidate(candidate: unknown, stripAllProvenance: boolean): unknown {
  const value = structuredClone(asRecord(candidate, "candidate"));
  const provenance = value["provenance"];
  assert(Array.isArray(provenance), "candidate provenance is not an array");
  if (stripAllProvenance) {
    value["provenance"] = [];
    return value;
  }
  value["provenance"] = provenance.map((entry) => {
    const normalized = { ...asRecord(entry, "candidate provenance") };
    if (normalized["sourceKind"] === "mta_wiki") {
      delete normalized["releaseId"];
      delete normalized["manifestSha256"];
      delete normalized["producerReviewCompatibility"];
    }
    return normalized;
  });
  return value;
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function findUniquePin(
  pins: readonly unknown[],
  predicate: (path: string) => boolean,
  label: string,
): Record<string, unknown> {
  const matches = pins
    .map((pin) => asRecord(pin, label))
    .filter((pin) => typeof pin["path"] === "string" && predicate(pin["path"]));
  assert(matches.length === 1, `${label} is missing or ambiguous`);
  return matches[0] as Record<string, unknown>;
}

export async function runRc23DeltaAudit(argv: readonly string[]): Promise<void> {
  const args = parseArguments(argv);
  const rc22ReleaseDirectory = required(args, "rc22-release-dir");
  const rc23ReleaseDirectory = required(args, "rc23-release-dir");
  const rc22ManifestPath = join(rc22ReleaseDirectory, "manifest.json");
  const rc23ManifestPath = join(rc23ReleaseDirectory, "manifest.json");
  const rc22AuditPath = required(args, "rc22-audit");
  const rc22ImportPath = required(args, "rc22-import");
  const rc23ImportPath = required(args, "rc23-import");
  const rc22CandidatePath = required(args, "rc22-candidates");
  const rc23CandidatePath = required(args, "rc23-candidates");
  const latestPath = required(args, "latest");

  const [
    rc22ManifestJson,
    rc23ManifestJson,
    rc22AuditJson,
    rc22ImportJson,
    rc23ImportJson,
    rc22CandidateJson,
    rc23CandidateJson,
    latestBytes,
  ] = await Promise.all([
    readJson(rc22ManifestPath),
    readJson(rc23ManifestPath),
    readJson(rc22AuditPath),
    readJson(rc22ImportPath),
    readJson(rc23ImportPath),
    readJson(rc22CandidatePath),
    readJson(rc23CandidatePath),
    readBytes(latestPath),
  ]);
  assert(sha256(rc22ManifestJson.bytes) === RC22_MANIFEST_SHA256, "rc22 manifest hash drifted");
  assert(sha256(rc23ManifestJson.bytes) === RC23_MANIFEST_SHA256, "rc23 manifest hash drifted");
  assert(sha256(rc22AuditJson.bytes) === RC22_AUDIT_SHA256, "rc22 lineage audit hash drifted");
  const rc22Manifest = decodeStrict(ManifestV4Schema)(rc22ManifestJson.value);
  const rc23Manifest = decodeStrict(ManifestV4Schema)(rc23ManifestJson.value);
  assert(rc22Manifest.release_id === "v1-rc22", "unexpected rc22 release identity");
  assert(rc23Manifest.release_id === "v1-rc23", "unexpected rc23 release identity");
  await Promise.all([
    verifyReleaseFiles(rc22ReleaseDirectory, rc22Manifest),
    verifyReleaseFiles(rc23ReleaseDirectory, rc23Manifest),
  ]);

  const rc22Paths = Object.keys(rc22Manifest.files).toSorted();
  const rc23Paths = Object.keys(rc23Manifest.files).toSorted();
  assert(canonicalJson(rc22Paths) === canonicalJson(rc23Paths), "rc22/rc23 file sets differ");
  const changedPaths = rc22Paths.filter(
    (path) => canonicalJson(rc22Manifest.files[path]) !== canonicalJson(rc23Manifest.files[path]),
  );
  assert(
    canonicalJson(changedPaths) === canonicalJson([CHANGED_REVIEW_PATH]),
    "unexpected release delta",
  );
  const rc22ReviewMetadata = rc22Manifest.files[CHANGED_REVIEW_PATH];
  const rc23ReviewMetadata = rc23Manifest.files[CHANGED_REVIEW_PATH];
  assert(rc22ReviewMetadata?.sha256 === RC22_REVIEW_SHA256, "rc22 review hash drifted");
  assert(rc23ReviewMetadata?.sha256 === RC23_REVIEW_SHA256, "rc23 review hash drifted");

  const rc22ReviewJson = await readJson(join(rc22ReleaseDirectory, CHANGED_REVIEW_PATH));
  const rc23ReviewJson = await readJson(join(rc23ReleaseDirectory, CHANGED_REVIEW_PATH));
  const rc22Review = decodeStrict(OperationalOccurrenceReviewSnapshotV1Rc22InspectionSchema)(
    rc22ReviewJson.value,
  );
  const rc23Review = decodeStrict(OperationalOccurrenceReviewSnapshotSchema)(rc23ReviewJson.value);
  let removedPhaseRelationBindingCount = 0;
  let removedPhysicalScopeBindingCount = 0;
  const projectedRc22Review = {
    ...rc22Review,
    decisions: rc22Review.decisions.map((decision) => ({
      ...decision,
      evidence_bindings: decision.evidence_bindings.filter((binding) => {
        if (binding.role === "phase_relation") removedPhaseRelationBindingCount += 1;
        if (binding.role === "physical_scope") removedPhysicalScopeBindingCount += 1;
        return binding.role !== "phase_relation" && binding.role !== "physical_scope";
      }),
    })),
  };
  assert(
    canonicalJson(projectedRc22Review) === canonicalJson(rc23Review),
    "review projection has residual drift",
  );

  const rc22Audit = decodeStrict(MtaWikiRc22LineageAuditSchema)(rc22AuditJson.value);
  const rc22Import = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV4Schema)(
    rc22ImportJson.value,
  );
  const rc23Import = decodeStrict(MtaWikiOperationalOccurrenceImportArtifactV4Schema)(
    rc23ImportJson.value,
  );
  const rc22Candidates = decodeStrict(StudyEventMergeArtifactV3Schema)(rc22CandidateJson.value);
  const rc23Candidates = decodeStrict(StudyEventMergeArtifactV3Schema)(rc23CandidateJson.value);
  assert(rc22Import.sourceRelease.releaseId === "v1-rc22", "rc22 import release drifted");
  assert(rc23Import.sourceRelease.releaseId === "v1-rc23", "rc23 import release drifted");
  assert(
    rc23Import.sourceRelease.producerReviewStatus.promotionEligible,
    "rc23 review is not compatible",
  );
  assert(
    canonicalJson(rc22Import.occurrences) === canonicalJson(rc23Import.occurrences),
    "occurrences changed",
  );
  assert(
    canonicalJson(rc22Import.producerSummary) === canonicalJson(rc23Import.producerSummary),
    "producer summary changed",
  );
  assert(
    canonicalJson(rc22Import.summary) === canonicalJson(rc23Import.summary),
    "import summary changed",
  );
  assert(
    canonicalJson(rc22Import.projectionRejections) ===
      canonicalJson(rc23Import.projectionRejections),
    "projection rejections changed",
  );

  const rc22ById = new Map(
    rc22Candidates.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const rc23ById = new Map(
    rc23Candidates.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const addedCandidateIds = [...rc23ById.keys()].filter((id) => !rc22ById.has(id)).toSorted();
  const removedCandidateIds = [...rc22ById.keys()].filter((id) => !rc23ById.has(id)).toSorted();
  let exactUnchangedCandidateCount = 0;
  let wikiBoundProvenanceRebindingCount = 0;
  let nonProvenanceCandidateChangeCount = 0;
  let normalizedResidualChangeCount = 0;
  for (const [candidateId, rc23Candidate] of rc23ById) {
    const rc22Candidate = rc22ById.get(candidateId);
    assert(rc22Candidate !== undefined, `candidate addition: ${candidateId}`);
    if (canonicalJson(rc22Candidate) === canonicalJson(rc23Candidate))
      exactUnchangedCandidateCount += 1;
    if (
      canonicalJson(normalizeCandidate(rc22Candidate, true)) !==
      canonicalJson(normalizeCandidate(rc23Candidate, true))
    )
      nonProvenanceCandidateChangeCount += 1;
    if (
      canonicalJson(normalizeCandidate(rc22Candidate, false)) !==
      canonicalJson(normalizeCandidate(rc23Candidate, false))
    )
      normalizedResidualChangeCount += 1;
    if (
      canonicalJson(rc22Candidate) !== canonicalJson(rc23Candidate) &&
      canonicalJson(normalizeCandidate(rc22Candidate, false)) ===
        canonicalJson(normalizeCandidate(rc23Candidate, false))
    )
      wikiBoundProvenanceRebindingCount += 1;
  }
  assert(
    addedCandidateIds.length === 0 && removedCandidateIds.length === 0,
    "candidate identities changed",
  );
  assert(nonProvenanceCandidateChangeCount === 0, "non-provenance candidate fields changed");
  assert(
    normalizedResidualChangeCount === 0,
    "candidate provenance changed beyond rc23 binding fields",
  );
  assert(
    rc23Candidates.approvalState === "awaiting_approval",
    "rc23 candidates are not awaiting approval",
  );
  assert(
    rc23Candidates.approval === null && rc23Candidates.approvedEvents.length === 0,
    "rc23 candidates are authorized",
  );

  const excludedIds = rc22Audit.excludedBusLaneQueue.candidates
    .map((candidate) => candidate.candidateId)
    .toSorted();
  let unchangedExcludedCount = 0;
  for (const candidateId of excludedIds) {
    const before = rc22ById.get(candidateId);
    const after = rc23ById.get(candidateId);
    assert(
      before !== undefined && after !== undefined,
      `excluded candidate missing: ${candidateId}`,
    );
    if (canonicalJson(before) === canonicalJson(after)) unchangedExcludedCount += 1;
  }
  const latestObserved = new TextDecoder("utf-8", { fatal: true }).decode(latestBytes).trim();
  assert(latestObserved === "v1-rc5", "LATEST changed");

  const occurrencePointer = rc23Manifest.pointers.operational_occurrences;
  const relationshipPointer = rc23Manifest.pointers.relationship_integrity_bundle;
  assert(
    rc23Manifest.files[occurrencePointer]?.sha256 === OCCURRENCE_SHA256,
    "occurrence bytes drifted",
  );
  assert(
    rc23Manifest.files[relationshipPointer]?.sha256 === RELATIONSHIP_BUNDLE_SHA256,
    "bundle drifted",
  );
  const relationshipRoot = join(rc23ReleaseDirectory, "relationship-integrity");
  const proofPath = "data/contracts/relationships/v1/enforcement-proof.json";
  const graphManifestPath = "data/quality/relationship-integrity/graph-audit/manifest.json";
  const graphSummaryPath = "data/quality/relationship-integrity/graph-audit/summary.json";
  const phaseManifestPath =
    "data/quality/relationship-integrity/operational-occurrence-phases/manifest.json";
  const phaseSummaryPath =
    "data/quality/relationship-integrity/operational-occurrence-phases/summary.json";
  const physicalManifestPath =
    "data/quality/relationship-integrity/occurrence-treatment-physicality/manifest.json";
  const physicalSummaryPath =
    "data/quality/relationship-integrity/occurrence-treatment-physicality/summary.json";
  const [phaseManifestJson, phaseSummaryJson, physicalManifestJson, physicalSummaryJson] =
    await Promise.all([
      readJson(join(relationshipRoot, phaseManifestPath)),
      readJson(join(relationshipRoot, phaseSummaryPath)),
      readJson(join(relationshipRoot, physicalManifestPath)),
      readJson(join(relationshipRoot, physicalSummaryPath)),
    ]);
  const phaseManifest = asRecord(phaseManifestJson.value, "phase audit manifest");
  const phaseSummary = asRecord(phaseSummaryJson.value, "phase audit summary");
  const physicalManifest = asRecord(physicalManifestJson.value, "physical audit manifest");
  const physicalSummary = asRecord(physicalSummaryJson.value, "physical audit summary");
  const phaseRouteRelease = asRecord(phaseManifest["route_anchor_release"], "phase route release");
  const phaseOccurrencePin = asRecord(
    phaseRouteRelease["operational_occurrences"],
    "phase occurrence pin",
  );
  const physicalPins = physicalManifest["input_pins"];
  assert(Array.isArray(physicalPins), "physical input pins missing");
  const physicalOccurrencePin = findUniquePin(
    physicalPins,
    (path) => path.endsWith("/operational_occurrences.jsonl"),
    "physical occurrence pin",
  );
  for (const pin of [phaseOccurrencePin, physicalOccurrencePin]) {
    assert(
      pin["bytes"] === 866164 && pin["sha256"] === OCCURRENCE_SHA256 && pin["row_count"] === 135,
      "audit occurrence pin drifted",
    );
  }
  for (const [suffix, rootPath, countKey] of [
    ["/treatment_components.jsonl", "treatment_components.jsonl", "treatment_component"],
    ["/relations.jsonl", "relations.jsonl", "relation"],
    ["/corridors.jsonl", "corridors.jsonl", "corridor"],
  ] as const) {
    const pin = findUniquePin(physicalPins, (path) => path.endsWith(suffix), rootPath);
    const metadata = rc23Manifest.files[rootPath];
    assert(metadata !== undefined, `missing root file ${rootPath}`);
    assert(
      pin["bytes"] === metadata.bytes && pin["sha256"] === metadata.sha256,
      `root pin drifted: ${rootPath}`,
    );
    assert(
      pin["row_count"] === rc23Manifest.record_counts[countKey],
      `root row count drifted: ${rootPath}`,
    );
  }
  for (const [value, label] of [
    [phaseSummary["hard_mode_ready"], "phase hard mode"],
    [phaseSummary["review_complete"], "phase review complete"],
    [phaseSummary["exact_evidence_complete"], "phase evidence complete"],
    [physicalSummary["hard_mode_ready"], "physical hard mode"],
    [physicalSummary["physical_scope_complete"], "physical scope complete"],
    [physicalSummary["review_ledger_complete"], "physical ledger complete"],
    [physicalSummary["final_post_semantic_release_guard_ready"], "physical final guard"],
  ] as const)
    assert(value === true, `${label} is not ready`);
  assert(phaseSummary["violation_count"] === 0, "phase violations are nonzero");
  assert(canonicalJson(phaseSummary["finding_counts"]) === "{}", "phase findings are nonzero");
  assert(
    canonicalJson(physicalSummary["finding_counts"]) === "{}",
    "physical findings are nonzero",
  );

  const datePrecisionCounts = countBy(
    rc23Candidates.candidates.map((candidate) => candidate.datePrecision),
  );
  const treatmentFamilyCounts = countBy(
    rc23Candidates.candidates.map((candidate) => candidate.treatmentFamily),
  );
  const sourceCombinationCounts = countBy(
    rc23Candidates.candidates.map((candidate) =>
      [...new Set(candidate.provenance.map((entry) => entry.sourceKind))].toSorted().join("+"),
    ),
  );
  const artifact = {
    artifactKind: "bp.studio.mta_wiki_rc23_lineage_delta.v1",
    schemaVersion: 1,
    authorization: "non_authorizing_migration_audit_only",
    generatedAt: "2026-07-18T00:00:00.000Z",
    sourceCommits: {
      trackerBaseline: required(args, "tracker-baseline-commit"),
      trackerReviewProjection: "7b5c988b69af17769256332414b798e0d35246d6",
      trackerCanonicalAuditBinding: "745f098e1b62c89bf7bc2341818eaaacdba926f8",
      mtaWikiProducerRepair: "443e6e344b75d3f7c085574fbab8e57b1a1e8cf3",
      mtaWikiImmutableRc23: "d40ee4b62c069f2d8df131a18fe1a71bab9cdbbf",
      mtaWikiMergedMain: "299752f2e9c7696296b29b1bcefbb5f454cb1699",
    },
    inputs: {
      rc22LineageAudit: await fileReference(
        rc22AuditPath,
        "docs/research/artifacts/mta-wiki-rc22-lineage-audit.json",
      ),
      rc22Manifest: await fileReference(
        rc22ManifestPath,
        "data/exports/releases/v1-rc22/manifest.json",
      ),
      rc23Manifest: await fileReference(
        rc23ManifestPath,
        "data/exports/releases/v1-rc23/manifest.json",
      ),
      rc22Import: await fileReference(
        rc22ImportPath,
        "docs/research/artifacts/mta-wiki-v1-rc22.operational-occurrences-import.json",
      ),
      rc23Import: await fileReference(
        rc23ImportPath,
        "docs/research/artifacts/mta-wiki-v1-rc23.operational-occurrences-import.json",
      ),
      rc22CandidateSet: await fileReference(
        rc22CandidatePath,
        "docs/research/artifacts/candidate-set-v3-9761a5648df08fbdf6c38bb4.study-events.json",
      ),
      rc23CandidateSet: await fileReference(
        rc23CandidatePath,
        "docs/research/artifacts/candidate-set-v3-aba25fe4209247be31d43b66.study-events.json",
      ),
      latestPointer: await fileReference(latestPath, "data/exports/releases/LATEST"),
    },
    releaseCorrection: {
      addressedArtifactCount: rc23Paths.length,
      byteIdenticalArtifactCount: rc23Paths.length - changedPaths.length,
      changedArtifactCount: changedPaths.length,
      changedArtifact: {
        path: CHANGED_REVIEW_PATH,
        rc22: rc22ReviewMetadata,
        rc23: rc23ReviewMetadata,
      },
      reviewProjection: {
        rc22DecisionCount: rc22Review.decision_count,
        rc23DecisionCount: rc23Review.decision_count,
        removedPhaseRelationBindingCount,
        removedPhysicalScopeBindingCount,
        residualDifferenceCount: 0,
      },
      operationalOccurrenceBytesUnchanged: true,
      relationshipBundleBytesUnchanged: true,
    },
    canonicalProof: {
      operationalOccurrences: await fileReference(
        join(rc23ReleaseDirectory, occurrencePointer),
        `data/exports/releases/v1-rc23/${occurrencePointer}`,
      ),
      relationshipBundle: await fileReference(
        join(rc23ReleaseDirectory, relationshipPointer),
        `data/exports/releases/v1-rc23/${relationshipPointer}`,
      ),
      enforcementProofRaw: await fileReference(join(relationshipRoot, proofPath), proofPath),
      enforcementProofCanonicalSha256: RELATIONSHIP_PROOF_CANONICAL_SHA256,
      graphManifest: await fileReference(
        join(relationshipRoot, graphManifestPath),
        graphManifestPath,
      ),
      graphSummary: await fileReference(join(relationshipRoot, graphSummaryPath), graphSummaryPath),
      phaseAuditManifest: await fileReference(
        join(relationshipRoot, phaseManifestPath),
        phaseManifestPath,
      ),
      phaseAuditSummary: await fileReference(
        join(relationshipRoot, phaseSummaryPath),
        phaseSummaryPath,
      ),
      physicalAuditManifest: await fileReference(
        join(relationshipRoot, physicalManifestPath),
        physicalManifestPath,
      ),
      physicalAuditSummary: await fileReference(
        join(relationshipRoot, physicalSummaryPath),
        physicalSummaryPath,
      ),
      phaseAuditOccurrencePinMatches: true,
      physicalAuditOccurrencePinMatches: true,
      rootTreatmentRelationCorridorPinsMatch: true,
      hardModeAndCompletenessReady: true,
      graphFindingCount:
        rc23Import.sourceRelease.relationshipIntegrity.graphAudit
          .reviewedNonEnforceableAdvisoryCount +
        rc23Import.sourceRelease.relationshipIntegrity.graphAudit.informationalOrphanRecordCount,
      enforceableViolationCount:
        rc23Import.sourceRelease.relationshipIntegrity.graphAudit.enforceableViolationCount,
      reviewedNonEnforceableAdvisoryCount:
        rc23Import.sourceRelease.relationshipIntegrity.graphAudit
          .reviewedNonEnforceableAdvisoryCount,
      informationalOrphanRecordCount:
        rc23Import.sourceRelease.relationshipIntegrity.graphAudit.informationalOrphanRecordCount,
      phaseFindingCount: 0,
      physicalFindingCount: 0,
    },
    rc19ToRc23: {
      ...rc22Audit.rc19ToRc22,
      rc23CandidateSetId: rc23Candidates.candidateSetId,
      rc22ToRc23OccurrenceIdentityDelta: 0,
      rc22ToRc23RouteProjectionDelta: 0,
      rc22ToRc23CandidateAdditions: addedCandidateIds.length,
      rc22ToRc23CandidateRemovals: removedCandidateIds.length,
      rc22ToRc23NonProvenanceCandidateChanges: nonProvenanceCandidateChangeCount,
      rc22ToRc23WikiBoundProvenanceRebindings: wikiBoundProvenanceRebindingCount,
      rc22ToRc23ExactlyUnchangedCandidateRows: exactUnchangedCandidateCount,
      rc22ToRc23NormalizedResidualChanges: normalizedResidualChangeCount,
      datePrecisionCounts,
      treatmentFamilyCounts,
      sourceCombinationCounts,
      approvalRebindingRequired: true,
      priorReceiptApplies: false,
    },
    categoryCountsByDimension: rc22Audit.categoryCountsByDimension,
    trackerCandidateFunnel: rc22Audit.trackerCandidateFunnel,
    physicalAndRouteLineage: {
      ...rc22Audit.summary,
      baseRouteLineageRowCount: rc22Audit.routeLineage.length,
      baseRouteLineageCanonicalSha256: canonicalSha256(rc22Audit.routeLineage),
      unchangedUnderRc23: true,
    },
    excludedBusLaneQueue: {
      candidateCount: rc22Audit.excludedBusLaneQueue.candidateCount,
      unchangedCandidateRowCount: unchangedExcludedCount,
      stillUnresolvedCount: rc22Audit.excludedBusLaneQueue.stillUnresolvedCount,
      genericAuthoritativeRouteTreatmentLinkCount:
        rc22Audit.excludedBusLaneQueue.genericAuthoritativeRouteTreatmentLinkCount,
      exactCandidateSegmentProofCount:
        rc22Audit.excludedBusLaneQueue.exactCandidateSegmentProofCount,
      exactCandidateDateAndPhaseCount:
        rc22Audit.excludedBusLaneQueue.exactCandidateDateAndPhaseCount,
      newOrUpdatedOccurrenceCount: rc22Audit.excludedBusLaneQueue.newOrUpdatedOccurrenceCount,
      canonicalWikiOccurrenceProjectionCount:
        rc22Audit.excludedBusLaneQueue.canonicalWikiOccurrenceProjectionCount,
      wikiBoundCandidateCount: rc22Audit.excludedBusLaneQueue.wikiBoundCandidateCount,
      approvedCandidateCount: rc22Audit.excludedBusLaneQueue.approvedCandidateCount,
      candidateIdsSha256: canonicalSha256(excludedIds),
    },
    boundaries: {
      candidateApprovalState: "awaiting_approval",
      approvalReceiptPresent: false,
      approvedCandidateCount: 0,
      studyRunAuthorized: false,
      publicationAuthorized: false,
      publicD1OrR2MutationAuthorized: false,
      deploymentAuthorized: false,
      latestMutationAuthorized: false,
    },
    promotionRecommendation: {
      decision: "ready_for_operator_release_pointer_review",
      targetRelease: "v1-rc23",
      latestObserved,
      operatorReadyToPromotePinnedRelease: true,
      authorizesPromotion: false,
      explicitOperatorActionRequired: true,
      explicitReleaseAndManifestPinningStillRequired: true,
      additionalMtaWikiProducerRepairRequired: false,
    },
  };
  assert(
    (await fileReference(join(relationshipRoot, proofPath), proofPath)).sha256 ===
      RELATIONSHIP_PROOF_RAW_SHA256,
    "raw proof drifted",
  );
  assert(
    (await fileReference(join(relationshipRoot, graphManifestPath), graphManifestPath)).sha256 ===
      GRAPH_MANIFEST_SHA256,
    "graph manifest drifted",
  );
  assert(
    (await fileReference(join(relationshipRoot, graphSummaryPath), graphSummaryPath)).sha256 ===
      GRAPH_SUMMARY_SHA256,
    "graph summary drifted",
  );
  decodeStrict(Rc23DeltaAuditSchema)(artifact);
  await writeJson(required(args, "output"), artifact);
}

if (import.meta.main) await runRc23DeltaAudit(Bun.argv.slice(2));
