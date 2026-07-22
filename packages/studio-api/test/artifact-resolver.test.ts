import { describe, expect, test } from "bun:test";
import {
  loadReleaseArtifactForRelease,
  Plan097ArtifactResolutionError,
  plan097RecoveryManifestKey,
} from "../src/artifact-resolver.js";

const previousReleaseId = "pub_20260605T183601689Z";
const candidateReleaseId = "pub_20260722T120000000Z";
const sha = "a".repeat(64);
const physicalKey = `operations/plan097/blobs/sha256/aa/${sha}.json`;

class FakeR2Object {
  readonly body = null;
  readonly bodyUsed = false;
  readonly checksums = {} as R2Checksums;
  readonly customMetadata: Record<string, string> | undefined;
  readonly etag = "etag";
  readonly httpEtag = '"etag"';
  readonly httpMetadata: R2HTTPMetadata;
  readonly key: string;
  readonly size: number;
  readonly uploaded = new Date("2026-07-22T12:00:00.000Z");
  readonly version = "version";

  constructor(
    key: string,
    private readonly value: unknown,
    options: { contentType?: string; size?: number; sha256?: string } = {},
  ) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    this.key = key;
    this.size = options.size ?? bytes.byteLength;
    this.httpMetadata = { contentType: options.contentType ?? "application/json" };
    this.customMetadata = options.sha256 === undefined ? undefined : { sha256: options.sha256 };
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return new TextEncoder().encode(JSON.stringify(this.value)).buffer as ArrayBuffer;
  }

  async blob(): Promise<Blob> {
    return new Blob([JSON.stringify(this.value)]);
  }

  async json(): Promise<unknown> {
    return this.value;
  }

  async text(): Promise<string> {
    return JSON.stringify(this.value);
  }

  writeHttpMetadata(headers: Headers): void {
    if (this.httpMetadata.contentType !== undefined) {
      headers.set("Content-Type", this.httpMetadata.contentType);
    }
  }
}

class FakeR2Bucket {
  readonly gets: string[] = [];

  constructor(private readonly objects: Map<string, FakeR2Object>) {}

  async get(key: string): Promise<R2ObjectBody | null> {
    this.gets.push(key);
    return (this.objects.get(key) as unknown as R2ObjectBody | undefined) ?? null;
  }
}

function manifest(logicalKey = "studio/v1/routes.json") {
  return {
    artifactKind: "bp.ops.plan097.recovery_artifact_manifest.v1",
    schemaVersion: 1,
    releaseId: candidateReleaseId,
    createdAt: "2026-07-22T12:00:00.000Z",
    entries: [
      {
        logicalId: "studio-routes",
        logicalKey,
        key: physicalKey,
        sha256: sha,
        bytes: 123,
        mediaType: "application/json",
        schemaId: "bp.studio.routes.v1",
      },
    ],
  } as const;
}

describe("Plan 097 release artifact resolver", () => {
  test("is inert until recovery mode is explicitly enabled", async () => {
    const legacy = new FakeR2Object("studio/v1/routes.json", { legacy: true });
    const bucket = new FakeR2Bucket(new Map([[legacy.key, legacy]]));
    const result = await loadReleaseArtifactForRelease({
      bucket: bucket as unknown as R2Bucket,
      recoveryEnabled: false,
      activeReleaseId: candidateReleaseId,
      logicalKey: legacy.key,
    });
    expect(result).toBe(legacy as unknown as R2ObjectBody);
    expect(bucket.gets).toEqual([legacy.key]);
  });

  test("permits stable-key fallback only for the pinned previous release", async () => {
    const legacy = new FakeR2Object("studio/v1/routes.json", { legacy: true });
    const bucket = new FakeR2Bucket(new Map([[legacy.key, legacy]]));
    const result = await loadReleaseArtifactForRelease({
      bucket: bucket as unknown as R2Bucket,
      recoveryEnabled: true,
      activeReleaseId: previousReleaseId,
      previousReleaseId,
      logicalKey: legacy.key,
    });
    expect(result).toBe(legacy as unknown as R2ObjectBody);
    expect(bucket.gets).toEqual([plan097RecoveryManifestKey(previousReleaseId), legacy.key]);

    await expect(
      loadReleaseArtifactForRelease({
        bucket: bucket as unknown as R2Bucket,
        recoveryEnabled: true,
        activeReleaseId: candidateReleaseId,
        previousReleaseId,
        logicalKey: legacy.key,
      }),
    ).rejects.toMatchObject({ code: "manifest_missing" });
  });

  test("resolves a declared candidate logical key and verifies object metadata", async () => {
    const manifestObject = new FakeR2Object(
      plan097RecoveryManifestKey(candidateReleaseId),
      manifest(),
    );
    const body = new FakeR2Object(
      physicalKey,
      { candidate: true },
      {
        contentType: "application/json",
        size: 123,
        sha256: sha,
      },
    );
    const bucket = new FakeR2Bucket(
      new Map([
        [manifestObject.key, manifestObject],
        [body.key, body],
      ]),
    );
    const result = await loadReleaseArtifactForRelease({
      bucket: bucket as unknown as R2Bucket,
      recoveryEnabled: true,
      activeReleaseId: candidateReleaseId,
      previousReleaseId,
      logicalKey: "studio/v1/routes.json",
    });
    expect(result).toBe(body as unknown as R2ObjectBody);
  });

  test("does not infer aliases or fall back for missing and corrupt candidate entries", async () => {
    const manifestObject = new FakeR2Object(
      plan097RecoveryManifestKey(candidateReleaseId),
      manifest("studio/v1/route-alias.json"),
    );
    const bucket = new FakeR2Bucket(new Map([[manifestObject.key, manifestObject]]));
    await expect(
      loadReleaseArtifactForRelease({
        bucket: bucket as unknown as R2Bucket,
        recoveryEnabled: true,
        activeReleaseId: candidateReleaseId,
        previousReleaseId,
        logicalKey: "studio/v1/routes.json",
      }),
    ).rejects.toMatchObject({ code: "logical_entry_missing" });

    const corruptBody = new FakeR2Object(
      physicalKey,
      { candidate: true },
      {
        contentType: "application/json",
        size: 122,
        sha256: sha,
      },
    );
    const corruptBucket = new FakeR2Bucket(
      new Map([
        [manifestObject.key, new FakeR2Object(manifestObject.key, manifest())],
        [physicalKey, corruptBody],
      ]),
    );
    await expect(
      loadReleaseArtifactForRelease({
        bucket: corruptBucket as unknown as R2Bucket,
        recoveryEnabled: true,
        activeReleaseId: candidateReleaseId,
        previousReleaseId,
        logicalKey: "studio/v1/routes.json",
      }),
    ).rejects.toBeInstanceOf(Plan097ArtifactResolutionError);
  });
});
