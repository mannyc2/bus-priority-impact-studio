import { Schema } from "effect";
import { CanonicalPublishedAtSchema, ReleaseIdSchema } from "./shared.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LOGICAL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?$/;
const PHYSICAL_KEY_PATTERN = /(?:^|\/)[a-f0-9]{64}(?:\.|\/)/;
const DATASET_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export const ServingSha256Schema = Schema.String.check(Schema.isPattern(SHA256_PATTERN));
export const ServingCandidateIdSchema = ServingSha256Schema.pipe(
  Schema.brand("ServingCandidateId"),
);
export const ServingLogicalIdSchema = Schema.String.check(Schema.isPattern(LOGICAL_ID_PATTERN));
export const ServingPhysicalKeySchema = Schema.String.check(Schema.isPattern(PHYSICAL_KEY_PATTERN));
export const ServingDatasetIdSchema = Schema.String.check(Schema.isPattern(DATASET_ID_PATTERN));
export const NonNegativeIntSchema = Schema.Int.check(
  Schema.makeFilter((value) =>
    value >= 0 ? [] : [{ path: [], issue: "Value must be a nonnegative integer." }],
  ),
);

export const ServingCandidateBuilderSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
});

export const ServingCandidateDatasetSchema = Schema.Struct({
  datasetId: ServingDatasetIdSchema,
  grain: Schema.Literals(["month", "day", "snapshot", "realtime"]),
  coverage: Schema.Struct({
    start: Schema.NullOr(Schema.String),
    end: Schema.NonEmptyString,
  }),
  sourceSnapshotIds: Schema.Array(Schema.NonEmptyString),
});

export const ServingCandidateArtifactSchema = Schema.Struct({
  logicalId: ServingLogicalIdSchema,
  key: ServingPhysicalKeySchema,
  sha256: ServingSha256Schema,
  bytes: NonNegativeIntSchema,
  mediaType: Schema.NonEmptyString,
  schemaId: Schema.NonEmptyString,
}).check(
  Schema.makeFilter((artifact) =>
    artifact.key.includes(artifact.sha256)
      ? []
      : [
          {
            path: ["key"],
            issue: "Physical artifact key must contain the declared SHA-256.",
          },
        ],
  ),
);

export const ServingCandidateD1Schema = Schema.Struct({
  projectionSchema: Schema.NonEmptyString,
  projectionSha256: ServingSha256Schema,
  rowCounts: Schema.Record(Schema.NonEmptyString, NonNegativeIntSchema),
});

export const ServingCandidateExactIdentitySchema = Schema.Struct({
  projectionSha256: ServingSha256Schema,
  routeCount: NonNegativeIntSchema,
});

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].toSorted();
}

function candidateManifestIssues(candidate: {
  datasets: readonly { datasetId: string; coverage: { start: string | null; end: string } }[];
  artifacts: readonly {
    logicalId: string;
    key: string;
    sha256: string;
    bytes: number;
    mediaType: string;
    schemaId: string;
  }[];
}): Schema.FilterIssue[] {
  const issues: Schema.FilterIssue[] = [];
  for (const duplicate of duplicateValues(candidate.datasets.map((dataset) => dataset.datasetId))) {
    issues.push({ path: ["datasets"], issue: `Duplicate dataset ID ${duplicate}.` });
  }
  for (const dataset of candidate.datasets) {
    if (dataset.coverage.start !== null && dataset.coverage.start > dataset.coverage.end) {
      issues.push({
        path: ["datasets", dataset.datasetId, "coverage"],
        issue: "Dataset coverage start cannot be later than its end.",
      });
    }
  }
  for (const duplicate of duplicateValues(
    candidate.artifacts.map((artifact) => artifact.logicalId),
  )) {
    issues.push({ path: ["artifacts"], issue: `Duplicate logical artifact ID ${duplicate}.` });
  }
  const physical = new Map<string, string>();
  for (const artifact of candidate.artifacts) {
    const metadata = JSON.stringify({
      bytes: artifact.bytes,
      mediaType: artifact.mediaType,
      schemaId: artifact.schemaId,
      sha256: artifact.sha256,
    });
    const prior = physical.get(artifact.key);
    if (prior !== undefined && prior !== metadata) {
      issues.push({
        path: ["artifacts", artifact.logicalId],
        issue: `Physical key ${artifact.key} has conflicting metadata.`,
      });
    }
    physical.set(artifact.key, metadata);
  }
  return issues;
}

export const ServingCandidateManifestV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  candidateId: ServingCandidateIdSchema,
  semanticInputFingerprint: ServingSha256Schema,
  sourceCommit: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/)),
  builderVersions: Schema.Array(ServingCandidateBuilderSchema),
  datasets: Schema.Array(ServingCandidateDatasetSchema),
  artifacts: Schema.Array(ServingCandidateArtifactSchema),
  d1: ServingCandidateD1Schema,
  exactIdentity: ServingCandidateExactIdentitySchema,
}).check(Schema.makeFilter(candidateManifestIssues));

export const ServingReleaseV1Schema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  releaseId: ReleaseIdSchema,
  candidateId: ServingCandidateIdSchema,
  publishedAt: CanonicalPublishedAtSchema,
  activatedAt: CanonicalPublishedAtSchema,
});

export type ServingCandidateId = typeof ServingCandidateIdSchema.Type;
export type ServingCandidateManifestV1 = typeof ServingCandidateManifestV1Schema.Type;
export type ServingReleaseV1 = typeof ServingReleaseV1Schema.Type;

export type ServingCandidateSemanticPayloadV1 = Omit<
  ServingCandidateManifestV1,
  "candidateId" | "sourceCommit"
>;

export function canonicalServingJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical serving JSON rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalServingJson).join(",")}]`;
  }
  if (typeof value !== "object") {
    throw new Error("Canonical serving JSON accepts only JSON values.");
  }
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalServingJson(entry)}`)
    .join(",")}}`;
}

export function servingCandidateSemanticPayload(
  candidate: ServingCandidateManifestV1,
): ServingCandidateSemanticPayloadV1 {
  const { candidateId: _candidateId, sourceCommit: _sourceCommit, ...semantic } = candidate;
  return {
    ...semantic,
    builderVersions: [...semantic.builderVersions].toSorted((left, right) =>
      `${left.name}\u0000${left.version}`.localeCompare(`${right.name}\u0000${right.version}`),
    ),
    datasets: [...semantic.datasets]
      .map((dataset) => ({
        ...dataset,
        sourceSnapshotIds: [...dataset.sourceSnapshotIds].toSorted(),
      }))
      .toSorted((left, right) => left.datasetId.localeCompare(right.datasetId)),
    artifacts: [...semantic.artifacts].toSorted((left, right) =>
      left.logicalId.localeCompare(right.logicalId),
    ),
    d1: {
      ...semantic.d1,
      rowCounts: Object.fromEntries(
        Object.entries(semantic.d1.rowCounts).toSorted(([a], [b]) => a.localeCompare(b)),
      ),
    },
  };
}

export function canonicalServingCandidateSemanticJson(
  candidate: ServingCandidateManifestV1,
): string {
  return canonicalServingJson(servingCandidateSemanticPayload(candidate));
}
