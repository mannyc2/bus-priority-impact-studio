import { createHash } from "node:crypto";
import { decodeStrict } from "@bp/domain/decode";
import {
  canonicalServingCandidateSemanticJson,
  canonicalServingJson,
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";

export type ServingCandidateArtifactBody = {
  logicalId: string;
  body: Uint8Array;
  mediaType: string;
  schemaId: string;
  extension?: string | undefined;
};

export type ServingCandidateArtifactDescriptor = Omit<
  BuiltServingCandidate["objects"][number],
  "body"
>;

export type BuildServingCandidateInput = Omit<
  ServingCandidateManifestV1,
  "candidateId" | "artifacts"
> & {
  artifacts: readonly ServingCandidateArtifactBody[];
};

export type BuildServingCandidateFromDescriptorsInput = Omit<
  ServingCandidateManifestV1,
  "candidateId" | "artifacts"
> & {
  artifacts: readonly ServingCandidateArtifactDescriptor[];
};

export type BuiltServingCandidate = {
  manifest: ServingCandidateManifestV1;
  manifestBytes: Uint8Array;
  manifestSha256: string;
  manifestKey: string;
  objects: ReadonlyArray<{
    logicalId: string;
    key: string;
    body: Uint8Array;
    sha256: string;
    bytes: number;
    mediaType: string;
    schemaId: string;
  }>;
};

export function servingSha256(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

function artifactExtension(artifact: ServingCandidateArtifactBody): string {
  if (artifact.extension !== undefined) {
    if (!/^[a-z0-9]+$/u.test(artifact.extension)) {
      throw new Error(`Invalid artifact extension for ${artifact.logicalId}.`);
    }
    return artifact.extension;
  }
  if (artifact.mediaType.includes("json")) return "json";
  if (artifact.mediaType === "text/csv") return "csv";
  if (artifact.mediaType.startsWith("text/")) return "txt";
  return "bin";
}

export function buildServingCandidate(input: BuildServingCandidateInput): BuiltServingCandidate {
  const objects = input.artifacts
    .map((artifact) => {
      const sha256 = servingSha256(artifact.body);
      return {
        logicalId: artifact.logicalId,
        key: `serving/blobs/sha256/${sha256.slice(0, 2)}/${sha256}.${artifactExtension(artifact)}`,
        body: artifact.body,
        sha256,
        bytes: artifact.body.byteLength,
        mediaType: artifact.mediaType,
        schemaId: artifact.schemaId,
      };
    })
    .toSorted((left, right) => left.logicalId.localeCompare(right.logicalId));
  const built = buildServingCandidateFromDescriptors({
    ...input,
    artifacts: objects.map(({ body: _body, ...artifact }) => artifact),
  });
  return { ...built, objects };
}

export function buildServingCandidateFromDescriptors(
  input: BuildServingCandidateFromDescriptorsInput,
): Omit<BuiltServingCandidate, "objects"> & {
  objects: readonly ServingCandidateArtifactDescriptor[];
} {
  const artifacts = [...input.artifacts].toSorted((left, right) =>
    left.logicalId.localeCompare(right.logicalId),
  );
  const provisional = decodeStrict(ServingCandidateManifestV1Schema)({
    ...input,
    candidateId: "0".repeat(64),
    artifacts,
  });
  const candidateId = servingSha256(canonicalServingCandidateSemanticJson(provisional));
  const manifest = decodeStrict(ServingCandidateManifestV1Schema)({
    ...provisional,
    candidateId,
  });
  const manifestBytes = new TextEncoder().encode(`${canonicalServingJson(manifest)}\n`);
  const manifestSha256 = servingSha256(manifestBytes);
  return {
    manifest,
    manifestBytes,
    manifestSha256,
    manifestKey: `serving/candidates/${candidateId}/manifest.${manifestSha256}.json`,
    objects: artifacts,
  };
}
