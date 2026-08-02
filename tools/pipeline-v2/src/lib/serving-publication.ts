import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import {
  canonicalServingJson,
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
  ServingSha256Schema,
} from "@bp/domain/studio/serving-release";
import { Schema } from "effect";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_ID_PATTERN = /^pub_[0-9]{8}T[0-9]{9}Z$/u;
const SAFE_ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const PositiveIntSchema = Schema.Int.check(
  Schema.makeFilter((value) =>
    value > 0 ? [] : [{ path: [], issue: "Value must be a positive integer." }],
  ),
);
const NonNegativeIntSchema = Schema.Int.check(
  Schema.makeFilter((value) =>
    value >= 0 ? [] : [{ path: [], issue: "Value must be a nonnegative integer." }],
  ),
);
const SafeAssetSchema = Schema.String.check(Schema.isPattern(SAFE_ASSET_PATTERN));
const SafeTagSchema = Schema.String.check(Schema.isPattern(SAFE_TAG_PATTERN));
const ReleaseIdSchema = Schema.String.check(Schema.isPattern(RELEASE_ID_PATTERN));

export const ServingPublicationPreparationV1Schema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.serving_publication_preparation.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^serving-publication-[a-f0-9-]+$/u)),
  preparedAt: Schema.String,
  repoSha: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
  candidate: Schema.Struct({
    candidateId: ServingSha256Schema,
    semanticInputFingerprint: ServingSha256Schema,
    sourceCommit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u)),
    releaseTag: SafeTagSchema,
    archiveAsset: SafeAssetSchema,
    archiveSha256: ServingSha256Schema,
    rootDirectory: SafeAssetSchema,
    manifestSha256: ServingSha256Schema,
    manifestKey: Schema.NonEmptyString,
    seedSha256: ServingSha256Schema,
    seedBytes: PositiveIntSchema,
    artifactCount: PositiveIntSchema,
    artifactBytes: PositiveIntSchema,
    uploadInventorySha256: ServingSha256Schema,
    uploadArtifactCount: NonNegativeIntSchema,
    uploadBytes: NonNegativeIntSchema,
    projectionSha256: ServingSha256Schema,
    projectionRowCount: NonNegativeIntSchema,
  }),
  expected: Schema.Struct({
    releaseId: ReleaseIdSchema,
    candidateId: ServingSha256Schema,
    generation: NonNegativeIntSchema,
  }),
  resources: Schema.Struct({
    cloudflareAccountId: Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/u)),
    d1Database: Schema.Literal("bus-priority-serving"),
    r2Bucket: Schema.Literal("bus-priority-artifacts"),
    operatorService: Schema.Literal("bus-priority-plan098-operator"),
  }),
  localProof: Schema.Struct({
    closedManifest: Schema.Literal(true),
    canonicalBytes: Schema.Literal(true),
    verifiedHashSkip: Schema.Literal(true),
    workerdParity: Schema.Literal(true),
  }),
});

export type ServingPublicationPreparationV1 = typeof ServingPublicationPreparationV1Schema.Type;

export type PrepareServingPublicationInput = {
  candidateRoot: string;
  releaseTag: string;
  archiveAsset: string;
  archiveSha256: string;
  expectedReleaseId: string;
  expectedCandidateId: string;
  expectedGeneration: number;
  repoSha: string;
  preparedAt?: string;
  workerdParity: boolean;
};

type StagePlan = {
  candidateId: string;
  candidateManifestKey: string;
  candidateManifestSha256: string;
  candidateSeedBytes: number;
  candidateSeedSha256: string;
  artifactCount: number;
  uploadArtifactCount: number;
  uploadBytes: number;
  semanticInputFingerprint: string;
  sourceCommit: string;
  d1: { projectionSha256: string; rowCounts: Record<string, number> };
};

export type UploadInventoryEntry = {
  logicalId: string;
  key: string;
  sha256: string;
  bytes: number;
  mediaType: string;
};

export type UploadInventory = {
  schemaVersion: 1;
  entries: UploadInventoryEntry[];
};

export function sha256(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function canonicalReceiptText(value: unknown): string {
  return `${canonicalServingJson(value)}\n`;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await Bun.file(path).text());
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

function requireSha256(value: string, label: string): void {
  if (!SHA256_PATTERN.test(value)) throw new Error(`${label} is not a SHA-256 digest.`);
}

function requireSafe(value: string, pattern: RegExp, label: string): void {
  if (!pattern.test(value)) throw new Error(`${label} contains unsafe characters.`);
}

function projectionRowCount(rowCounts: Readonly<Record<string, number>>): number {
  return Object.values(rowCounts).reduce((sum, count) => sum + count, 0);
}

export async function validateCandidateRoot(candidateRoot: string): Promise<{
  manifest: ServingCandidateManifestV1;
  manifestBytes: Uint8Array;
  seedBytes: Uint8Array;
  stagePlan: StagePlan;
  inventory: UploadInventory;
  inventoryBytes: Uint8Array;
  artifactBytes: number;
}> {
  const manifestBytes = new Uint8Array(
    await Bun.file(join(candidateRoot, "candidate.manifest.json")).arrayBuffer(),
  );
  const seedBytes = new Uint8Array(
    await Bun.file(join(candidateRoot, "candidate-seed.sql")).arrayBuffer(),
  );
  const inventoryBytes = new Uint8Array(
    await Bun.file(join(candidateRoot, "upload-inventory.json")).arrayBuffer(),
  );
  const manifest = decodeStrict(ServingCandidateManifestV1Schema)(
    JSON.parse(new TextDecoder().decode(manifestBytes)),
  );
  const stagePlan = (await readJson(join(candidateRoot, "stage-plan.json"))) as StagePlan;
  const inventory = (await readJson(
    join(candidateRoot, "upload-inventory.json"),
  )) as UploadInventory;

  if (
    stagePlan.candidateId !== manifest.candidateId ||
    stagePlan.candidateManifestSha256 !== sha256(manifestBytes) ||
    stagePlan.candidateSeedSha256 !== sha256(seedBytes) ||
    stagePlan.candidateSeedBytes !== seedBytes.byteLength ||
    stagePlan.artifactCount !== manifest.artifacts.length ||
    stagePlan.semanticInputFingerprint !== manifest.semanticInputFingerprint ||
    stagePlan.sourceCommit !== manifest.sourceCommit ||
    stagePlan.d1.projectionSha256 !== manifest.d1.projectionSha256 ||
    canonicalServingJson(stagePlan.d1.rowCounts) !== canonicalServingJson(manifest.d1.rowCounts)
  ) {
    throw new Error("Candidate stage plan drifted from its closed manifest or D1 seed.");
  }
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.entries)) {
    throw new Error("Upload inventory schema is invalid.");
  }
  const manifestByLogicalId = new Map(
    manifest.artifacts.map((artifact) => [artifact.logicalId, artifact]),
  );
  const inventoryIds = new Set<string>();
  for (const entry of inventory.entries) {
    const declared = manifestByLogicalId.get(entry.logicalId);
    if (
      inventoryIds.has(entry.logicalId) ||
      declared === undefined ||
      declared.key !== entry.key ||
      declared.sha256 !== entry.sha256 ||
      declared.bytes !== entry.bytes ||
      declared.mediaType !== entry.mediaType
    ) {
      throw new Error(`Upload inventory is outside the closed manifest: ${entry.logicalId}.`);
    }
    inventoryIds.add(entry.logicalId);
  }
  const uploadBytes = inventory.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (
    stagePlan.uploadArtifactCount !== inventory.entries.length ||
    stagePlan.uploadBytes !== uploadBytes
  ) {
    throw new Error("Upload inventory counts drifted from the stage plan.");
  }

  let artifactBytes = 0;
  for (const artifact of manifest.artifacts) {
    const body = new Uint8Array(
      await Bun.file(join(candidateRoot, "objects", artifact.key)).arrayBuffer(),
    );
    if (body.byteLength !== artifact.bytes || sha256(body) !== artifact.sha256) {
      throw new Error(`Closed candidate object drifted: ${artifact.logicalId}.`);
    }
    artifactBytes += body.byteLength;
  }
  return {
    manifest,
    manifestBytes,
    seedBytes,
    stagePlan,
    inventory,
    inventoryBytes,
    artifactBytes,
  };
}

export async function prepareServingPublication(
  input: PrepareServingPublicationInput,
): Promise<ServingPublicationPreparationV1> {
  requireSafe(input.releaseTag, SAFE_TAG_PATTERN, "release tag");
  requireSafe(input.archiveAsset, SAFE_ASSET_PATTERN, "archive asset");
  requireSha256(input.archiveSha256, "archive SHA-256");
  requireSha256(input.expectedCandidateId, "expected candidate ID");
  if (!RELEASE_ID_PATTERN.test(input.expectedReleaseId)) {
    throw new Error("Expected release ID is invalid.");
  }
  if (!/^[a-f0-9]{40}$/u.test(input.repoSha)) throw new Error("Repo SHA is invalid.");
  if (!Number.isInteger(input.expectedGeneration) || input.expectedGeneration < 0) {
    throw new Error("Expected pointer generation must be a nonnegative integer.");
  }
  if (!input.workerdParity) throw new Error("A passing local workerd parity proof is required.");

  const validated = await validateCandidateRoot(input.candidateRoot);
  const {
    manifest,
    manifestBytes,
    seedBytes,
    stagePlan,
    inventory,
    inventoryBytes,
    artifactBytes,
  } = validated;
  const operationId = `serving-publication-${manifest.candidateId.slice(0, 20)}-${input.expectedGeneration + 1}`;
  const preparedAt = input.preparedAt ?? new Date().toISOString();
  const receipt = {
    artifactKind: "bp.ops.serving_publication_preparation.v1",
    schemaVersion: 1,
    operationId,
    preparedAt,
    repoSha: input.repoSha,
    candidate: {
      candidateId: manifest.candidateId,
      semanticInputFingerprint: manifest.semanticInputFingerprint,
      sourceCommit: manifest.sourceCommit,
      releaseTag: input.releaseTag,
      archiveAsset: input.archiveAsset,
      archiveSha256: input.archiveSha256,
      rootDirectory: basename(input.candidateRoot),
      manifestSha256: sha256(manifestBytes),
      manifestKey: stagePlan.candidateManifestKey,
      seedSha256: sha256(seedBytes),
      seedBytes: seedBytes.byteLength,
      artifactCount: manifest.artifacts.length,
      artifactBytes,
      uploadInventorySha256: sha256(inventoryBytes),
      uploadArtifactCount: inventory.entries.length,
      uploadBytes: inventory.entries.reduce((sum, entry) => sum + entry.bytes, 0),
      projectionSha256: manifest.d1.projectionSha256,
      projectionRowCount: projectionRowCount(manifest.d1.rowCounts),
    },
    expected: {
      releaseId: input.expectedReleaseId,
      candidateId: input.expectedCandidateId,
      generation: input.expectedGeneration,
    },
    resources: {
      cloudflareAccountId: "7aa7065a7e971d97435b3f22098d78b0",
      d1Database: "bus-priority-serving",
      r2Bucket: "bus-priority-artifacts",
      operatorService: "bus-priority-plan098-operator",
    },
    localProof: {
      closedManifest: true,
      canonicalBytes: true,
      verifiedHashSkip: true,
      workerdParity: true,
    },
  } as const;
  return decodeStrict(ServingPublicationPreparationV1Schema)(receipt);
}

export async function readServingPublicationPreparation(
  path: string,
): Promise<{ receipt: ServingPublicationPreparationV1; text: string; sha256: string }> {
  const text = await readFile(path, "utf8");
  const receipt = decodeStrict(ServingPublicationPreparationV1Schema)(JSON.parse(text));
  const canonical = canonicalReceiptText(receipt);
  if (text !== canonical) throw new Error("Preparation receipt bytes are not canonical.");
  return { receipt, text, sha256: sha256(text) };
}

export const ServingPublicationPhaseSchema = Schema.Literals([
  "candidate_validated",
  "migrations_applied",
  "blobs_uploaded",
  "d1_staged",
  "candidate_verified",
  "activated",
  "production_smoke_passed",
  "complete",
  "no_op",
  "rolled_back",
]);
export type ServingPublicationPhase = typeof ServingPublicationPhaseSchema.Type;

const FORWARD_PHASES: readonly ServingPublicationPhase[] = [
  "candidate_validated",
  "migrations_applied",
  "blobs_uploaded",
  "d1_staged",
  "candidate_verified",
  "activated",
  "production_smoke_passed",
  "complete",
];

export function advanceServingPublicationPhase(
  current: ServingPublicationPhase,
  next: ServingPublicationPhase,
): ServingPublicationPhase {
  if (current === next) return current;
  if (next === "no_op" && current === "candidate_validated") return next;
  if (
    next === "rolled_back" &&
    (current === "activated" || current === "production_smoke_passed")
  ) {
    return next;
  }
  const currentIndex = FORWARD_PHASES.indexOf(current);
  const nextIndex = FORWARD_PHASES.indexOf(next);
  if (currentIndex < 0 || nextIndex !== currentIndex + 1) {
    throw new Error(`Invalid serving publication transition ${current} -> ${next}.`);
  }
  return next;
}
