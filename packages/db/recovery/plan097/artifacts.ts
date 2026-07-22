import { CanonicalPublishedAtSchema, ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0));

const Plan097ArtifactEntrySchema = Schema.Struct({
  logicalId: NonEmptyStringSchema,
  logicalKey: Schema.String.check(Schema.isPattern(/^(?:studio|map)\/[a-z0-9][a-z0-9+._/-]*$/u)),
  key: Schema.String.check(
    Schema.isPattern(/^operations\/plan097\/blobs\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/u),
  ),
  sha256: Sha256Schema,
  bytes: PositiveIntegerSchema,
  mediaType: NonEmptyStringSchema,
  schemaId: NonEmptyStringSchema,
});

export const Plan097RecoveryArtifactManifestSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.recovery_artifact_manifest.v1"),
  schemaVersion: Schema.Literal(1),
  releaseId: ReleaseIdSchema,
  createdAt: CanonicalPublishedAtSchema,
  entries: Schema.Array(Plan097ArtifactEntrySchema),
}).check(
  Schema.makeFilter((manifest) => {
    const issues: Array<{ path: ReadonlyArray<string | number>; issue: string }> = [];
    const logicalIds = new Set<string>();
    const logicalKeys = new Set<string>();
    const physicalKeys = new Set<string>();
    for (const [index, entry] of manifest.entries.entries()) {
      if (logicalIds.has(entry.logicalId)) {
        issues.push({
          path: ["entries", index, "logicalId"],
          issue: "Duplicate logical artifact ID",
        });
      }
      logicalIds.add(entry.logicalId);
      if (logicalKeys.has(entry.logicalKey)) {
        issues.push({
          path: ["entries", index, "logicalKey"],
          issue: "Duplicate logical artifact key",
        });
      }
      logicalKeys.add(entry.logicalKey);
      if (physicalKeys.has(entry.key)) {
        issues.push({ path: ["entries", index, "key"], issue: "Duplicate physical artifact key" });
      }
      physicalKeys.add(entry.key);
      const expectedPrefix = entry.sha256.slice(0, 2);
      if (!entry.key.includes(`/sha256/${expectedPrefix}/${entry.sha256}.`)) {
        issues.push({
          path: ["entries", index, "key"],
          issue: "Physical key does not match SHA-256",
        });
      }
    }
    return issues;
  }),
);

export type Plan097RecoveryArtifactManifest = typeof Plan097RecoveryArtifactManifestSchema.Type;
