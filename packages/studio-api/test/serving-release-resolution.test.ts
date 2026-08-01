import { describe, expect, test } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";
import type { StudioApiEnv } from "../src/env.js";
import { handlePublicApiRoutes } from "../src/public-api.js";

const releaseA = "pub_20260801T200000000Z";
const candidateA = "a".repeat(64);
const artifactSha = "b".repeat(64);
const physicalKey = `serving/blobs/sha256/bb/${artifactSha}.json`;
const logicalId = "route/m1/speed-history";
const body = '{"routeId":"M1"}\n';

class ArtifactStatement {
  #bindings: unknown[] = [];

  constructor(private readonly published: boolean) {}

  bind(...bindings: unknown[]): ArtifactStatement {
    this.#bindings = bindings;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (!this.published || this.#bindings[0] !== releaseA || this.#bindings[1] !== logicalId) {
      return null;
    }
    return {
      logicalId,
      key: physicalKey,
      sha256: artifactSha,
      bytes: new TextEncoder().encode(body).byteLength,
      mediaType: "application/json",
      schemaId: "bp.route-speed.v1",
    } as T;
  }
}

function artifactDb(published: boolean): D1Database {
  return {
    prepare: () => new ArtifactStatement(published),
  } as unknown as D1Database;
}

function bucket(): R2Bucket {
  return {
    get: async (key: string) =>
      key === physicalKey
        ? ({
            body: new Response(body).body,
            size: new TextEncoder().encode(body).byteLength,
            httpEtag: `"${artifactSha}"`,
            customMetadata: { sha256: artifactSha },
            writeHttpMetadata: (headers: Headers) =>
              headers.set("Content-Type", "application/json"),
          } as unknown as R2ObjectBody)
        : null,
  } as unknown as R2Bucket;
}

function pointedEnv(): StudioApiEnv {
  return {
    ARTIFACTS: bucket(),
    SERVING_RELEASE_CONTEXT: {
      kind: "pointed",
      generation: 2,
      release: {
        schemaVersion: 1,
        releaseId: releaseA,
        candidateId: candidateA,
        publishedAt: "2026-08-01T20:00:00.000Z",
        activatedAt: "2026-08-01T20:00:00.000Z",
      },
      candidate: {
        schemaVersion: 1,
        candidateId: candidateA,
        semanticInputFingerprint: "c".repeat(64),
        sourceCommit: "d".repeat(40),
        builderVersions: [],
        datasets: [],
        artifacts: [
          {
            logicalId,
            key: physicalKey,
            sha256: artifactSha,
            bytes: new TextEncoder().encode(body).byteLength,
            mediaType: "application/json",
            schemaId: "bp.route-speed.v1",
          },
        ],
        d1: { projectionSchema: "v2", projectionSha256: "e".repeat(64), rowCounts: {} },
        exactIdentity: { projectionSha256: "f".repeat(64), routeCount: 0 },
      },
      artifactByLogicalId: new Map(),
    } as unknown as NonNullable<StudioApiEnv["SERVING_RELEASE_CONTEXT"]>,
  };
}

describe("Plan 098 public artifact release resolution", () => {
  test("redirects legacy artifact paths to the one request-resolved release", async () => {
    const response = await handlePublicApiRoutes(
      new URL(`https://example.test/api/v1/artifacts/${logicalId}`),
      pointedEnv(),
    );
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(
      `/api/v1/releases/${releaseA}/artifacts/${logicalId}`,
    );
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });

  test("serves a retained public release immutably after the active pointer has moved", async () => {
    const response = await handlePublicApiRoutes(
      new URL(`https://example.test/api/v1/releases/${releaseA}/artifacts/${logicalId}`),
      {
        ARTIFACTS: bucket(),
        SERVING_UNSCOPED_DB: artifactDb(true),
      },
    );
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe(body);
    expect(response?.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  test("denies a leaked staged physical object without published release membership", async () => {
    const response = await handlePublicApiRoutes(
      new URL(`https://example.test/api/v1/releases/${releaseA}/artifacts/${logicalId}`),
      {
        ARTIFACTS: bucket(),
        SERVING_UNSCOPED_DB: artifactDb(false),
      },
    );
    expect(response?.status).toBe(404);
  });
});
