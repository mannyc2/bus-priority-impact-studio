import { createD1ServingDb, findLatestPublishedStudioServingRelease } from "@bp/db/d1";
import { Plan097RecoveryArtifactManifestSchema } from "@bp/db/recovery/plan097/artifacts";
import { publicInterventionEpisodesKey } from "@bp/domain/studio/public-intervention-episodes";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import type { StudioApiEnv } from "./env.js";
import { decodeSchemaStrict } from "./schema-decode.js";

export const PLAN097_RECOVERY_NAMESPACE = "operations/plan097/";
const PUBLIC_ROUTE_INTERVENTION_HISTORY_KEY =
  /^studio\/v2\/routes\/[a-z0-9]+(?:-[a-z0-9]+)*\/intervention-history\.json$/;

/**
 * Public intervention episodes are an independently generated release: route
 * bodies are verified first and its network index is the activation pointer.
 * Keep this allowlist exact so Plan 097 recovery cannot be bypassed for any
 * other Studio artifact, including operator-facing reconciliation data.
 */
export function isPublicInterventionArtifactKey(key: string): boolean {
  return key === publicInterventionEpisodesKey() || PUBLIC_ROUTE_INTERVENTION_HISTORY_KEY.test(key);
}

export function plan097RecoveryManifestKey(releaseId: string): string {
  return `operations/plan097/releases/${releaseId}/artifact-manifest.json`;
}

export class Plan097ArtifactResolutionError extends Error {
  readonly code:
    | "configuration_invalid"
    | "manifest_invalid"
    | "manifest_missing"
    | "logical_entry_missing"
    | "object_invalid"
    | "object_missing";

  constructor(code: Plan097ArtifactResolutionError["code"], message: string) {
    super(message);
    this.name = "Plan097ArtifactResolutionError";
    this.code = code;
  }
}

function recoveryEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export async function loadReleaseArtifactForRelease(input: {
  bucket: R2Bucket;
  recoveryEnabled: boolean;
  activeReleaseId: string;
  previousReleaseId?: string | undefined;
  logicalKey: string;
}): Promise<R2ObjectBody | null> {
  if (!input.recoveryEnabled) return input.bucket.get(input.logicalKey);
  if (input.previousReleaseId === undefined || input.previousReleaseId.length === 0) {
    throw new Plan097ArtifactResolutionError(
      "configuration_invalid",
      "Plan 097 recovery mode requires the pinned previous release ID.",
    );
  }

  const manifestKey = plan097RecoveryManifestKey(input.activeReleaseId);
  const manifestObject = await input.bucket.get(manifestKey);
  if (manifestObject === null) {
    if (input.activeReleaseId === input.previousReleaseId) {
      return input.bucket.get(input.logicalKey);
    }
    throw new Plan097ArtifactResolutionError(
      "manifest_missing",
      `Recovery manifest is missing for active release ${input.activeReleaseId}.`,
    );
  }

  let manifest: typeof Plan097RecoveryArtifactManifestSchema.Type;
  try {
    manifest = decodeSchemaStrict(
      Plan097RecoveryArtifactManifestSchema,
      await manifestObject.json(),
    );
  } catch {
    throw new Plan097ArtifactResolutionError(
      "manifest_invalid",
      `Recovery manifest is invalid for active release ${input.activeReleaseId}.`,
    );
  }
  if (manifest.releaseId !== input.activeReleaseId) {
    throw new Plan097ArtifactResolutionError(
      "manifest_invalid",
      `Recovery manifest release ${manifest.releaseId} does not match ${input.activeReleaseId}.`,
    );
  }
  const entry = manifest.entries.find((candidate) => candidate.logicalKey === input.logicalKey);
  if (entry === undefined) {
    throw new Plan097ArtifactResolutionError(
      "logical_entry_missing",
      `Recovery manifest lacks logical artifact ${input.logicalKey}.`,
    );
  }
  const object = await input.bucket.get(entry.key);
  if (object === null) {
    throw new Plan097ArtifactResolutionError(
      "object_missing",
      `Recovery artifact ${entry.logicalId} is unavailable.`,
    );
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = headers.get("Content-Type");
  const metadataSha256 = object.customMetadata?.["sha256"];
  if (
    object.size !== entry.bytes ||
    contentType !== entry.mediaType ||
    metadataSha256 !== entry.sha256
  ) {
    throw new Plan097ArtifactResolutionError(
      "object_invalid",
      `Recovery artifact ${entry.logicalId} metadata failed verification.`,
    );
  }
  return object;
}

export async function loadReleaseArtifact(
  env: Pick<
    StudioApiEnv,
    "ARTIFACTS" | "DB" | "PLAN097_PREVIOUS_RELEASE_ID" | "PLAN097_RECOVERY_ENABLED"
  >,
  logicalKey: string,
): Promise<R2ObjectBody | null> {
  if (env.ARTIFACTS === undefined) return null;
  if (isPublicInterventionArtifactKey(logicalKey)) {
    return env.ARTIFACTS.get(logicalKey);
  }
  if (!recoveryEnabled(env.PLAN097_RECOVERY_ENABLED)) {
    return env.ARTIFACTS.get(logicalKey);
  }
  if (env.DB === undefined) {
    throw new Plan097ArtifactResolutionError(
      "configuration_invalid",
      "Plan 097 recovery mode requires the production D1 binding.",
    );
  }
  const publishedRelease = await findLatestPublishedStudioServingRelease(createD1ServingDb(env.DB));
  if (publishedRelease === null) {
    throw new Plan097ArtifactResolutionError(
      "configuration_invalid",
      "Plan 097 recovery mode could not resolve the active Studio release.",
    );
  }
  const activeReleaseId = releaseIdFromPublishedAt(publishedRelease.publishedAt);
  try {
    return await loadReleaseArtifactForRelease({
      bucket: env.ARTIFACTS,
      recoveryEnabled: true,
      activeReleaseId,
      previousReleaseId: env.PLAN097_PREVIOUS_RELEASE_ID,
      logicalKey,
    });
  } catch (error) {
    if (
      !(error instanceof Plan097ArtifactResolutionError) ||
      error.code !== "logical_entry_missing"
    ) {
      console.error("Plan 097 artifact resolution failed.", {
        code: error instanceof Plan097ArtifactResolutionError ? error.code : "unexpected",
        releaseId: activeReleaseId,
        logicalKey,
      });
    }
    throw error;
  }
}
