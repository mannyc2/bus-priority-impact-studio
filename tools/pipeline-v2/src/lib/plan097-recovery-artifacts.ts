import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import {
  canonicalPlan097Json,
  type Plan097RecoveryArtifactManifest,
  Plan097RecoveryArtifactManifestSchema,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import type { ReleaseIdentity } from "@bp/domain/studio/shared";
import { Glob } from "bun";
import {
  collectD1ArtifactKeys,
  collectManifestArtifactKeys,
} from "../commands/publish/publish-artifact-keys.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mediaType(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".geojson")) return "application/geo+json";
  if (key.endsWith(".pbf")) return "application/x-protobuf";
  if (key.endsWith(".pmtiles")) return "application/vnd.pmtiles";
  if (key.endsWith(".csv")) return "text/csv";
  if (key.endsWith(".txt") || key.endsWith(".md")) return "text/plain; charset=utf-8";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function schemaId(key: string, body: Uint8Array, contentType: string): string {
  if (contentType === "application/json" || contentType === "application/geo+json") {
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new Error(`Plan 097 candidate artifact ${key} is invalid JSON`);
    }
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown> & { type?: unknown };
      for (const field of ["artifactKind", "schemaId", "$schema"] as const) {
        if (typeof record[field] === "string" && record[field].length > 0) return record[field];
      }
      if (record.type === "FeatureCollection") return "geojson.FeatureCollection";
    }
    return `json:${key}`;
  }
  return `media:${contentType}`;
}

async function collectStudioKeys(artifactRoot: string): Promise<string[]> {
  const root = join(artifactRoot, "studio");
  try {
    await stat(root);
  } catch {
    return [];
  }
  const keys: string[] = [];
  for await (const path of new Glob("**/*").scan({ cwd: root, onlyFiles: true, dot: false })) {
    keys.push(`studio/${path.split(sep).join("/")}`);
  }
  return keys;
}

export type Plan097RecoveryArtifactInventory = {
  manifest: Plan097RecoveryArtifactManifest;
  manifestText: string;
  manifestSha256: string;
  manifestBytes: number;
  manifestKey: string;
  files: Array<{ logicalId: string; logicalKey: string; localPath: string }>;
};

export async function buildPlan097RecoveryArtifactInventory(input: {
  artifactRoot: string;
  month: string;
  schemaPath: string;
  seedPath: string;
  finalMapManifestKey: string;
  releaseIdentity: ReleaseIdentity;
}): Promise<Plan097RecoveryArtifactInventory> {
  const [manifestKeys, d1Keys, studioKeys] = await Promise.all([
    collectManifestArtifactKeys({
      artifactRoot: input.artifactRoot,
      manifestDirs: ["map"],
      month: input.month,
    }),
    collectD1ArtifactKeys({
      month: input.month,
      schemaPath: input.schemaPath,
      seedPath: input.seedPath,
    }),
    collectStudioKeys(input.artifactRoot),
  ]);
  const logicalKeys = [
    ...new Set([...manifestKeys.keys, ...d1Keys.keys, ...studioKeys, input.finalMapManifestKey]),
  ]
    .filter((key) => key.startsWith("studio/") || key.startsWith("map/"))
    .sort();
  if (logicalKeys.length === 0) throw new Error("Plan 097 candidate artifact inventory is empty");

  const files: Plan097RecoveryArtifactInventory["files"] = [];
  const entries: Plan097RecoveryArtifactManifest["entries"][number][] = [];
  for (const logicalKey of logicalKeys) {
    const localPath = join(input.artifactRoot, logicalKey);
    const file = Bun.file(localPath);
    if (!(await file.exists())) {
      throw new Error(`Plan 097 candidate artifact ${logicalKey} is missing`);
    }
    const body = new Uint8Array(await file.arrayBuffer());
    if (body.byteLength === 0)
      throw new Error(`Plan 097 candidate artifact ${logicalKey} is empty`);
    const contentSha256 = sha256(body);
    const extension = extname(logicalKey).slice(1).toLowerCase();
    if (!/^[a-z0-9]+$/u.test(extension)) {
      throw new Error(`Plan 097 candidate artifact ${logicalKey} has an unsafe extension`);
    }
    const contentType = mediaType(logicalKey);
    entries.push({
      logicalId: logicalKey,
      logicalKey,
      key: `operations/plan097/blobs/sha256/${contentSha256.slice(0, 2)}/${contentSha256}.${extension}`,
      sha256: contentSha256,
      bytes: body.byteLength,
      mediaType: contentType,
      schemaId: schemaId(logicalKey, body, contentType),
    });
    files.push({ logicalId: logicalKey, logicalKey, localPath });
  }
  const manifest = decodeStrict(Plan097RecoveryArtifactManifestSchema)({
    artifactKind: "bp.ops.plan097.recovery_artifact_manifest.v1",
    schemaVersion: 1,
    releaseId: input.releaseIdentity.releaseId,
    createdAt: input.releaseIdentity.publishedAt,
    entries,
  });
  const manifestText = `${canonicalPlan097Json(manifest)}\n`;
  return {
    manifest,
    manifestText,
    manifestSha256: sha256(new TextEncoder().encode(manifestText)),
    manifestBytes: new TextEncoder().encode(manifestText).byteLength,
    manifestKey: `operations/plan097/releases/${input.releaseIdentity.releaseId}/artifact-manifest.json`,
    files,
  };
}
