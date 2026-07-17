import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";

const RECOMMENDATIONS = ["recommend_approve", "recommend_reject", "needs_followup"] as const;
const NON_AUTHORIZING = "non_authorizing_recommendation_only" as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const TrimmedNonEmptyStringSchema = Schema.Trim.check(Schema.isMinLength(1));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(SHA256_PATTERN));
const PassthroughRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const passthroughStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [PassthroughRecordSchema]);

const ProvenanceSchema = passthroughStruct({
  sourceKind: NonEmptyStringSchema,
  sourceId: NonEmptyStringSchema,
});
const SourceCandidateFields = {
  candidateId: NonEmptyStringSchema,
  routeId: NonEmptyStringSchema,
  treatmentFamily: NonEmptyStringSchema,
  implementationDate: NonEmptyStringSchema,
  implementationMonth: NonEmptyStringSchema,
  datePrecision: Schema.Literals(["day", "month"]),
  occurrenceId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  treatmentScopeKind: Schema.optionalKey(Schema.String),
  componentTreatmentFamilies: Schema.optionalKey(Schema.Array(Schema.String)),
  conflictState: Schema.optionalKey(Schema.String),
  confounderGroupId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  provenance: Schema.Array(ProvenanceSchema).check(Schema.isMinLength(1)),
} as const;
const SourceCandidateSchema = passthroughStruct(SourceCandidateFields);
const AssignedCandidateSchema = passthroughStruct({
  ...SourceCandidateFields,
  identity: NonEmptyStringSchema,
  occurrenceId: Schema.NullOr(Schema.String),
  treatmentScopeKind: Schema.String,
  componentTreatmentFamilies: Schema.Array(Schema.String),
  conflictState: Schema.String,
  confounderGroupId: Schema.NullOr(Schema.String),
});
const ManifestBatchSchema = passthroughStruct({
  batchId: NonEmptyStringSchema,
  file: NonEmptyStringSchema,
  candidateCount: NonNegativeIntegerSchema,
  sha256: Schema.optionalKey(Sha256Schema),
  inputSha256: Schema.optionalKey(Sha256Schema),
  fileSha256: Schema.optionalKey(Sha256Schema),
});
const ImmutableInputsSchema = passthroughStruct({
  baselineCandidateSetId: NonEmptyStringSchema,
  baselineSha256: Sha256Schema,
  historicalReceiptSha256: Sha256Schema,
  spineManifestSha256: Sha256Schema,
});
const ManifestSchema = passthroughStruct({
  artifactKind: Schema.Literal("bp.studio.codex_review_manifest.v1"),
  candidateSetId: NonEmptyStringSchema,
  candidateSetSha256: Sha256Schema,
  immutableInputs: ImmutableInputsSchema,
  totalCandidateCount: NonNegativeIntegerSchema,
  batches: Schema.Array(ManifestBatchSchema).check(Schema.isMinLength(1)),
  inputHashes: Schema.optionalKey(Schema.Record(Schema.String, Sha256Schema)),
  candidateSetFile: Schema.optionalKey(NonEmptyStringSchema),
});
const CandidateSetSchema = passthroughStruct({
  artifactKind: Schema.Literal("bp.studio.study_events.v2"),
  candidateSetId: NonEmptyStringSchema,
  approvalState: NonEmptyStringSchema,
  approval: Schema.Null,
  candidates: Schema.Array(SourceCandidateSchema),
  invalidated: Schema.optionalKey(Schema.Unknown),
  invalidation: Schema.optionalKey(Schema.Unknown),
  invalidatedAt: Schema.optionalKey(Schema.Unknown),
  status: Schema.optionalKey(Schema.String),
  state: Schema.optionalKey(Schema.String),
  validityState: Schema.optionalKey(Schema.String),
  valid: Schema.optionalKey(Schema.Boolean),
  isValid: Schema.optionalKey(Schema.Boolean),
  _notice: Schema.optionalKey(Schema.String),
  notice: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
const BatchInputSchema = passthroughStruct({
  artifactKind: Schema.Literal("bp.studio.codex_review_batch_input.v1"),
  candidateSetId: NonEmptyStringSchema,
  candidateSetSha256: Sha256Schema,
  batchId: NonEmptyStringSchema,
  decisionCount: NonNegativeIntegerSchema,
  candidates: Schema.Array(AssignedCandidateSchema),
});
const CountsSchema = Schema.Struct({
  recommend_approve: NonNegativeIntegerSchema,
  recommend_reject: NonNegativeIntegerSchema,
  needs_followup: NonNegativeIntegerSchema,
});
const GatesSchema = Schema.Struct({
  evidenceScope: TrimmedNonEmptyStringSchema,
  date: TrimmedNonEmptyStringSchema,
  spine: TrimmedNonEmptyStringSchema,
  outcome: TrimmedNonEmptyStringSchema,
  conflict: TrimmedNonEmptyStringSchema,
  confounder: TrimmedNonEmptyStringSchema,
});
const DecisionSchema = passthroughStruct({
  candidateId: NonEmptyStringSchema,
  identity: NonEmptyStringSchema,
  routeId: NonEmptyStringSchema,
  treatmentFamily: NonEmptyStringSchema,
  implementationDate: NonEmptyStringSchema,
  recommendation: Schema.Literals(RECOMMENDATIONS),
  rationale: TrimmedNonEmptyStringSchema,
  gates: GatesSchema,
});
const BatchOutputSchema = passthroughStruct({
  artifactKind: Schema.Literal("bp.studio.codex_review_batch.v1"),
  authorization: Schema.Literal(NON_AUTHORIZING),
  batchId: NonEmptyStringSchema,
  candidateSetId: NonEmptyStringSchema,
  candidateSetSha256: Sha256Schema,
  decisionCount: NonNegativeIntegerSchema,
  countsByRecommendation: CountsSchema,
  decisions: Schema.Array(DecisionSchema),
  validatedInputHashes: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

type Manifest = typeof ManifestSchema.Type;
type ManifestBatch = typeof ManifestBatchSchema.Type;
type CandidateSet = typeof CandidateSetSchema.Type;
type SourceCandidate = typeof SourceCandidateSchema.Type;
type AssignedCandidate = typeof AssignedCandidateSchema.Type;
type BatchOutput = typeof BatchOutputSchema.Type;
type Recommendation = (typeof RECOMMENDATIONS)[number];
type Counts = Record<Recommendation, number>;
type ParsedFile<T> = { data: T; sha256: string };
type BatchInputRecord = {
  inputFile: string;
  inputSha256: string;
  candidates: readonly AssignedCandidate[];
};
type BatchRecord = {
  batchId: string;
  inputFile: string;
  inputSha256: string;
  outputFile: string;
  outputSha256: string;
  decisionCount: number;
  countsByRecommendation: Counts;
};
type ReconciledRecommendation = {
  sourceBatchId: string;
  authorization: typeof NON_AUTHORIZING;
  candidateId: string;
  identity: string;
  routeId: string;
  treatmentFamily: string;
  implementationDate: string;
  recommendation: Recommendation;
  rationale: string;
  gates: typeof GatesSchema.Type;
};

const repoRoot = resolve(import.meta.dir, "../../..");
const defaultReviewRoot = join(repoRoot, "docs", "research", "reviews", "rc19");

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readParsed<S extends Schema.Constraint>(path: string, schema: S): ParsedFile<S["Type"]> {
  const bytes = readFileSync(path);
  const serviceFreeSchema = Schema.make<Schema.Codec<S["Type"], S["Encoded"], never, unknown>>(
    schema.ast,
  );
  const data = decodeStrict(serviceFreeSchema)(JSON.parse(bytes.toString("utf8")) as unknown);
  return { data, sha256: digest(bytes) };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function describe(values: readonly string[]): string {
  const unique = sortedUnique(values);
  const sample = unique.slice(0, 8).join(", ");
  return `${unique.length}${sample ? ` (${sample}${unique.length > 8 ? ", ..." : ""})` : ""}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function identity(candidate: {
  routeId: string;
  treatmentFamily: string;
  implementationDate: string;
  datePrecision: string;
}): string {
  return [
    candidate.routeId,
    candidate.treatmentFamily,
    candidate.implementationDate,
    candidate.datePrecision,
  ].join("|");
}

function countsFor(rows: readonly { recommendation: Recommendation }[]): Counts {
  const counts: Counts = { recommend_approve: 0, recommend_reject: 0, needs_followup: 0 };
  for (const row of rows) counts[row.recommendation] += 1;
  return counts;
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" ||
    (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot))
  );
}

function declaredPath(root: string, file: string): string {
  if (isAbsolute(file)) throw new Error(`declared path must be relative: ${file}`);
  const path = resolve(root, file);
  if (!isInside(root, path)) throw new Error(`declared path escapes its root: ${file}`);
  return path;
}

function outputFileFor(inputFile: string): string {
  if (!inputFile.endsWith(".input.json")) {
    throw new Error(`batch input file must end in .input.json: ${inputFile}`);
  }
  return `${inputFile.slice(0, -".input.json".length)}.json`;
}

function candidateSetPath(reviewRoot: string, manifest: Manifest): string {
  if (manifest.candidateSetFile !== undefined) {
    return declaredPath(join(reviewRoot, "inputs"), manifest.candidateSetFile);
  }
  const file = `${manifest.candidateSetId.replace(/:/gu, "-")}.study-events.json`;
  const repositoryArtifact = join(repoRoot, "docs", "research", "artifacts", file);
  if (existsSync(repositoryArtifact)) return repositoryArtifact;
  const siblingArtifact = resolve(reviewRoot, "..", "..", "artifacts", file);
  return existsSync(siblingArtifact) ? siblingArtifact : join(reviewRoot, file);
}

function meaningfulMarker(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

function invalidationMarkers(candidateSet: CandidateSet): string[] {
  const markers = Object.entries(candidateSet)
    .filter(([key, value]) => /invalidat/iu.test(key) && meaningfulMarker(value))
    .map(([key]) => key);
  for (const [key, value] of [
    ["status", candidateSet.status],
    ["state", candidateSet.state],
    ["validityState", candidateSet.validityState],
    ["approvalState", candidateSet.approvalState],
    ["_notice", candidateSet._notice],
    ["notice", candidateSet.notice],
    ["reason", candidateSet.reason],
  ] as const) {
    if (value?.toLowerCase().includes("invalidat")) markers.push(key);
  }
  if (candidateSet.valid === false || candidateSet.isValid === false) markers.push("valid");
  return sortedUnique(markers);
}

function unresolvedCrossSourceIdentities(candidates: readonly SourceCandidate[]): string[] {
  const groups = new Map<string, SourceCandidate[]>();
  for (const candidate of candidates) {
    const key = identity(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return [...groups]
    .filter(([, group]) => {
      if (group.length < 2) return false;
      const sources = new Set(
        group.flatMap((candidate) => candidate.provenance.map((item) => item.sourceKind)),
      );
      return sources.size > 1;
    })
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));
}

function expectedInputHash(
  manifest: Manifest,
  batch: ManifestBatch,
  errors: string[],
): string | null {
  const hashes = sortedUnique(
    [batch.sha256, batch.inputSha256, batch.fileSha256, manifest.inputHashes?.[batch.file]].filter(
      (value): value is string => value !== undefined,
    ),
  );
  if (hashes.length > 1) {
    errors.push(
      `manifest declares conflicting SHA-256 values for ${batch.file}: ${hashes.join(", ")}`,
    );
  }
  return hashes[0] ?? null;
}

function validateCandidateBinding(
  assigned: AssignedCandidate,
  source: SourceCandidate,
  label: string,
  errors: string[],
): void {
  const expectedIdentity = identity(source);
  if (assigned.identity !== expectedIdentity) {
    errors.push(
      `${label} identity mismatch: expected ${expectedIdentity}, found ${assigned.identity}`,
    );
  }
  const expected: Record<string, unknown> = {
    routeId: source.routeId,
    treatmentFamily: source.treatmentFamily,
    implementationDate: source.implementationDate,
    implementationMonth: source.implementationMonth,
    datePrecision: source.datePrecision,
    occurrenceId: source.occurrenceId ?? null,
    treatmentScopeKind: source.treatmentScopeKind ?? "atomic",
    componentTreatmentFamilies: source.componentTreatmentFamilies ?? [],
    conflictState: source.conflictState ?? "none",
    confounderGroupId: source.confounderGroupId ?? null,
    provenance: source.provenance,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (!equalJson(assigned[field], value)) {
      errors.push(`${label} differs from the hashed candidate set at ${field}`);
    }
  }
}

function validateClaimedHashes(
  output: BatchOutput,
  manifest: Manifest,
  label: string,
  errors: string[],
): void {
  if (output.validatedInputHashes === undefined) return;
  const expected: Record<string, string> = {
    candidateSet: manifest.candidateSetSha256,
    historicalCandidateSet: manifest.immutableInputs.baselineSha256,
    historicalReceipt: manifest.immutableInputs.historicalReceiptSha256,
    spineManifest: manifest.immutableInputs.spineManifestSha256,
  };
  for (const [key, expectedHash] of Object.entries(expected)) {
    const claimed = output.validatedInputHashes[key];
    if (claimed === undefined) continue;
    if (typeof claimed !== "string" || !SHA256_PATTERN.test(claimed)) {
      errors.push(`${label}.validatedInputHashes.${key} is not a SHA-256 digest`);
    } else if (claimed !== expectedHash) {
      errors.push(`${label}.validatedInputHashes.${key} mismatch`);
    }
  }
}

function parseArgs(argv: readonly string[]): { reviewRoot: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !flag.startsWith("--") ||
      value.startsWith("--")
    ) {
      throw new Error("Expected --review-root path and/or --output path");
    }
    if (flag !== "--review-root" && flag !== "--output") throw new Error(`Unknown flag: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
    values.set(flag, value);
  }
  const reviewRoot = resolve(values.get("--review-root") ?? defaultReviewRoot);
  return {
    reviewRoot,
    output: resolve(values.get("--output") ?? join(reviewRoot, "rc19-review-reconciliation.json")),
  };
}

function assertSafeOutputPath(output: string): void {
  const segments = output.toLowerCase().split(sep);
  if (segments.some((segment) => /approval|receipt/u.test(segment))) {
    throw new Error(`Refusing receipt/approval output path: ${output}`);
  }
}

function run(reviewRoot: string, outputPath: string): number {
  assertSafeOutputPath(outputPath);
  const inputRoot = join(reviewRoot, "inputs");
  const manifestPath = join(inputRoot, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Missing review manifest: ${manifestPath}`);
  const manifestFile = readParsed(manifestPath, ManifestSchema);
  const manifest = manifestFile.data;
  const errors: string[] = [];
  const stats = {
    expectedBatchOutputCount: manifest.batches.length,
    parsedBatchOutputCount: 0,
    expectedDecisionCount: manifest.totalCandidateCount,
    parsedDecisionCount: 0,
  };

  if (isInside(inputRoot, outputPath)) {
    errors.push(`output path must not be inside immutable inputs: ${outputPath}`);
  }
  const batchIds = manifest.batches.map((batch) => batch.batchId);
  const batchFiles = manifest.batches.map((batch) => batch.file);
  if (new Set(batchIds).size !== batchIds.length)
    errors.push("manifest contains duplicate batch IDs");
  if (new Set(batchFiles).size !== batchFiles.length)
    errors.push("manifest contains duplicate batch files");
  const manifestCount = manifest.batches.reduce((total, batch) => total + batch.candidateCount, 0);
  if (manifestCount !== manifest.totalCandidateCount) {
    errors.push(
      `manifest batch counts sum to ${manifestCount}, expected ${manifest.totalCandidateCount}`,
    );
  }

  const sourcePath = candidateSetPath(reviewRoot, manifest);
  if (resolve(sourcePath) === resolve(outputPath)) {
    errors.push(`reconciliation output would overwrite the source candidate set: ${sourcePath}`);
  }
  let sourceCandidates: readonly SourceCandidate[] = [];
  if (!existsSync(sourcePath)) {
    errors.push(`missing source candidate set: ${sourcePath}`);
  } else {
    try {
      const candidateFile = readParsed(sourcePath, CandidateSetSchema);
      const candidateSet = candidateFile.data;
      sourceCandidates = candidateSet.candidates;
      if (candidateFile.sha256 !== manifest.candidateSetSha256) {
        errors.push(
          `candidate-set SHA-256 mismatch: expected ${manifest.candidateSetSha256}, found ${candidateFile.sha256}`,
        );
      }
      if (candidateSet.candidateSetId !== manifest.candidateSetId) {
        errors.push(`candidate-set ID mismatch: expected ${manifest.candidateSetId}`);
      }
      if (candidateSet.approvalState !== "awaiting_approval") {
        errors.push("source candidate set must remain awaiting_approval with approval=null");
      }
      const invalidatedBy = invalidationMarkers(candidateSet);
      if (invalidatedBy.length > 0) {
        errors.push(`source candidate set is marked invalidated by: ${invalidatedBy.join(", ")}`);
      }
      if (sourceCandidates.length !== manifest.totalCandidateCount) {
        errors.push(
          `source candidate count is ${sourceCandidates.length}, expected ${manifest.totalCandidateCount}`,
        );
      }
      const ids = sourceCandidates.map((candidate) => candidate.candidateId);
      if (new Set(ids).size !== ids.length) {
        errors.push(
          `source candidate IDs are not unique: ${describe(ids.filter((id, i) => ids.indexOf(id) !== i))}`,
        );
      }
      const unresolved = unresolvedCrossSourceIdentities(sourceCandidates);
      if (unresolved.length > 0) {
        errors.push(
          `source candidate set has ${unresolved.length} unresolved exact-duplicate cross-source same-date identities: ${describe(unresolved)}`,
        );
      }
    } catch (error) {
      errors.push(
        `invalid source candidate set: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const sourceById = new Map(
    sourceCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const assignments = new Map<string, { batchId: string; candidate: AssignedCandidate }>();
  const inputRecords = new Map<string, BatchInputRecord>();
  const duplicateAssignments: string[] = [];

  for (const batch of manifest.batches) {
    let inputPath: string;
    try {
      inputPath = declaredPath(inputRoot, batch.file);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (!existsSync(inputPath)) {
      errors.push(`missing declared batch input: ${batch.file}`);
      continue;
    }
    try {
      const inputFile = readParsed(inputPath, BatchInputSchema);
      const input = inputFile.data;
      const expectedHash = expectedInputHash(manifest, batch, errors);
      if (expectedHash !== null && inputFile.sha256 !== expectedHash) {
        errors.push(
          `${batch.file} SHA-256 mismatch: expected ${expectedHash}, found ${inputFile.sha256}`,
        );
      }
      if (input.batchId !== batch.batchId) errors.push(`${batch.file} batchId mismatch`);
      if (input.candidateSetId !== manifest.candidateSetId)
        errors.push(`${batch.file} candidateSetId mismatch`);
      if (input.candidateSetSha256 !== manifest.candidateSetSha256) {
        errors.push(`${batch.file} candidateSetSha256 mismatch`);
      }
      if (
        input.decisionCount !== batch.candidateCount ||
        input.candidates.length !== batch.candidateCount
      ) {
        errors.push(
          `${batch.file} count mismatch: manifest=${batch.candidateCount}, decisionCount=${input.decisionCount}, candidates=${input.candidates.length}`,
        );
      }
      const ids = input.candidates.map((candidate) => candidate.candidateId);
      if (
        !equalJson(
          ids,
          [...ids].sort((left, right) => left.localeCompare(right)),
        )
      ) {
        errors.push(`${batch.file} candidates are not sorted by candidateId`);
      }
      for (const candidate of input.candidates) {
        if (assignments.has(candidate.candidateId))
          duplicateAssignments.push(candidate.candidateId);
        else assignments.set(candidate.candidateId, { batchId: batch.batchId, candidate });
        const source = sourceById.get(candidate.candidateId);
        if (source === undefined)
          errors.push(`${batch.file} assigns unknown candidate ${candidate.candidateId}`);
        else
          validateCandidateBinding(
            candidate,
            source,
            `${batch.file}:${candidate.candidateId}`,
            errors,
          );
      }
      inputRecords.set(batch.batchId, {
        inputFile: batch.file,
        inputSha256: inputFile.sha256,
        candidates: input.candidates,
      });
    } catch (error) {
      errors.push(
        `${batch.file} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (duplicateAssignments.length > 0) {
    errors.push(`candidate IDs repeat across batch assignments: ${describe(duplicateAssignments)}`);
  }
  const sourceIds = new Set(sourceById.keys());
  const assignedIds = new Set(assignments.keys());
  const unassigned = [...sourceIds].filter((id) => !assignedIds.has(id));
  const unknownAssigned = [...assignedIds].filter((id) => !sourceIds.has(id));
  if (unassigned.length > 0)
    errors.push(`source candidates missing from assignments: ${describe(unassigned)}`);
  if (unknownAssigned.length > 0) {
    errors.push(
      `assignments contain candidates outside the source set: ${describe(unknownAssigned)}`,
    );
  }
  if (assignedIds.size !== manifest.totalCandidateCount) {
    errors.push(
      `unique assignment coverage is ${assignedIds.size}, expected ${manifest.totalCandidateCount}`,
    );
  }

  const outputOwners = new Map<string, string>();
  const duplicateOutputs: string[] = [];
  const recommendations: ReconciledRecommendation[] = [];
  const batchRecords: BatchRecord[] = [];

  for (const batch of manifest.batches) {
    let outputFile: string;
    let batchOutputPath: string;
    try {
      outputFile = outputFileFor(batch.file);
      batchOutputPath = declaredPath(reviewRoot, outputFile);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (resolve(batchOutputPath) === resolve(outputPath)) {
      errors.push(`reconciliation output would overwrite batch output ${outputFile}`);
    }
    if (!existsSync(batchOutputPath)) {
      errors.push(`missing declared batch output: ${outputFile}`);
      continue;
    }
    try {
      const outputFileContents = readParsed(batchOutputPath, BatchOutputSchema);
      const output = outputFileContents.data;
      stats.parsedBatchOutputCount += 1;
      stats.parsedDecisionCount += output.decisions.length;
      if (output.batchId !== batch.batchId) errors.push(`${outputFile} batchId mismatch`);
      if (output.candidateSetId !== manifest.candidateSetId)
        errors.push(`${outputFile} candidateSetId mismatch`);
      if (output.candidateSetSha256 !== manifest.candidateSetSha256) {
        errors.push(`${outputFile} candidateSetSha256 mismatch`);
      }
      validateClaimedHashes(output, manifest, outputFile, errors);

      const computedCounts = countsFor(output.decisions);
      if (
        output.decisionCount !== batch.candidateCount ||
        output.decisions.length !== batch.candidateCount
      ) {
        errors.push(
          `${outputFile} decision count mismatch: manifest=${batch.candidateCount}, decisionCount=${output.decisionCount}, decisions=${output.decisions.length}`,
        );
      }
      for (const recommendation of RECOMMENDATIONS) {
        if (output.countsByRecommendation[recommendation] !== computedCounts[recommendation]) {
          errors.push(`${outputFile} ${recommendation} bucket mismatch`);
        }
      }
      const bucketTotal = RECOMMENDATIONS.reduce(
        (total, recommendation) => total + output.countsByRecommendation[recommendation],
        0,
      );
      if (bucketTotal !== output.decisionCount) {
        errors.push(
          `${outputFile} recommendation buckets sum to ${bucketTotal}, expected ${output.decisionCount}`,
        );
      }

      const decisionIds = output.decisions.map((decision) => decision.candidateId);
      if (
        !equalJson(
          decisionIds,
          [...decisionIds].sort((left, right) => left.localeCompare(right)),
        )
      ) {
        errors.push(`${outputFile} decisions are not sorted by candidateId`);
      }
      const inputRecord = inputRecords.get(batch.batchId);
      const localAssignments = new Map(
        (inputRecord?.candidates ?? []).map((candidate) => [candidate.candidateId, candidate]),
      );
      const localIds = new Set<string>();
      for (const decision of output.decisions) {
        if (localIds.has(decision.candidateId) || outputOwners.has(decision.candidateId)) {
          duplicateOutputs.push(decision.candidateId);
        }
        localIds.add(decision.candidateId);
        outputOwners.set(decision.candidateId, batch.batchId);
        const assigned = localAssignments.get(decision.candidateId);
        if (assigned === undefined) {
          errors.push(`${outputFile} contains unassigned decision ${decision.candidateId}`);
        } else {
          for (const [field, expected] of Object.entries({
            identity: assigned.identity,
            routeId: assigned.routeId,
            treatmentFamily: assigned.treatmentFamily,
            implementationDate: assigned.implementationDate,
          })) {
            if (decision[field] !== expected) {
              errors.push(`${outputFile}:${decision.candidateId} ${field} mismatch`);
            }
          }
        }
        recommendations.push({
          sourceBatchId: batch.batchId,
          authorization: NON_AUTHORIZING,
          candidateId: decision.candidateId,
          identity: decision.identity,
          routeId: decision.routeId,
          treatmentFamily: decision.treatmentFamily,
          implementationDate: decision.implementationDate,
          recommendation: decision.recommendation,
          rationale: decision.rationale,
          gates: decision.gates,
        });
      }
      const missing = [...localAssignments.keys()].filter((id) => !localIds.has(id));
      const extra = [...localIds].filter((id) => !localAssignments.has(id));
      if (missing.length > 0)
        errors.push(`${outputFile} is missing assigned decisions: ${describe(missing)}`);
      if (extra.length > 0)
        errors.push(`${outputFile} has unassigned decisions: ${describe(extra)}`);
      if (inputRecord !== undefined) {
        batchRecords.push({
          batchId: batch.batchId,
          inputFile: inputRecord.inputFile,
          inputSha256: inputRecord.inputSha256,
          outputFile,
          outputSha256: outputFileContents.sha256,
          decisionCount: output.decisions.length,
          countsByRecommendation: computedCounts,
        });
      }
    } catch (error) {
      errors.push(
        `${outputFile} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (duplicateOutputs.length > 0) {
    errors.push(`candidate IDs repeat across batch outputs: ${describe(duplicateOutputs)}`);
  }
  const outputIds = new Set(outputOwners.keys());
  const missingOutputs = [...assignedIds].filter((id) => !outputIds.has(id));
  const extraOutputs = [...outputIds].filter((id) => !assignedIds.has(id));
  if (missingOutputs.length > 0) {
    errors.push(`assigned candidates missing from batch outputs: ${describe(missingOutputs)}`);
  }
  if (extraOutputs.length > 0) {
    errors.push(`batch outputs contain unassigned candidates: ${describe(extraOutputs)}`);
  }
  if (outputIds.size !== manifest.totalCandidateCount) {
    errors.push(
      `unique output coverage is ${outputIds.size}, expected ${manifest.totalCandidateCount}`,
    );
  }

  if (errors.length > 0) {
    const issues = sortedUnique(errors);
    console.error(
      JSON.stringify(
        {
          status: "validation_failed",
          authorization: NON_AUTHORIZING,
          outputWritten: false,
          stats,
          issueCount: issues.length,
          issues,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  recommendations.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const artifact = {
    artifactKind: "bp.studio.codex_review_reconciliation.v1",
    candidateSetId: manifest.candidateSetId,
    candidateSetSha256: manifest.candidateSetSha256,
    authorization: NON_AUTHORIZING,
    notice:
      "Recommendations only. This artifact is not an approval receipt and does not authorize a study run or publication.",
    authorizesStudyRun: false,
    authorizesPublication: false,
    inputs: {
      manifest: { file: "inputs/manifest.json", sha256: manifestFile.sha256 },
      candidateSet: {
        file: relative(reviewRoot, sourcePath).split(sep).join("/"),
        sha256: manifest.candidateSetSha256,
      },
      immutableInputs: manifest.immutableInputs,
    },
    summary: {
      candidateCount: manifest.totalCandidateCount,
      decisionCount: recommendations.length,
      countsByRecommendation: countsFor(recommendations),
    },
    batches: batchRecords,
    recommendations,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        status: "recommendations_reconciled",
        authorization: NON_AUTHORIZING,
        output: outputPath,
        summary: artifact.summary,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (import.meta.main) {
  try {
    if (Bun.argv.slice(2).includes("--help")) {
      console.log(
        "Usage: bun tools/pipeline-v2/scripts/reconcile-rc19-codex-review.ts [--review-root path] [--output path]",
      );
    } else {
      const args = parseArgs(Bun.argv.slice(2));
      process.exitCode = run(args.reviewRoot, args.output);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
