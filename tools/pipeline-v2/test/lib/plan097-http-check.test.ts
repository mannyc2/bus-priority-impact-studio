import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Schema } from "effect";
import {
  assertNoPlan097LegacyEmptyState,
  assertPlan097RecoveryCacheSafety,
  assertPlan097RouteDetail,
  comparePlan097HttpBaselines,
  fetchPlan097HttpBaselineEvidence,
  fetchPlan097HttpEvidence,
} from "../../src/lib/plan097-http-check.ts";

describe("Plan 097 release-aware HTTP checker", () => {
  test("captures a legacy null dossier in baseline mode but requires it for the candidate", () => {
    const detail = {
      expectedReleaseId: "pub_20260721T120000000Z",
      expectedRouteId: "BX38",
      expectedSlug: "bx38",
      requireCandidateDossier: true,
      actualReleaseId: "pub_20260721T120000000Z",
      actualRouteId: "BX38",
      actualSlug: "bx38",
      dossierPresent: false,
    } as const;
    expect(() => assertPlan097RouteDetail({ ...detail, mode: "baseline" })).not.toThrow();
    expect(() => assertPlan097RouteDetail({ ...detail, mode: "candidate" })).toThrow(/incomplete/i);
  });

  test("strict-decodes safe public JSON and records its exact hash and cache headers", async () => {
    const body = '{"schemaVersion":1,"releaseId":"pub_20260721T120000000Z"}\n';
    const result = await fetchPlan097HttpEvidence({
      fetch: async () =>
        new Response(body, {
          headers: {
            "content-type": "application/json",
            "x-request-id": "request-1",
            "cf-ray": "ray-1",
            "cache-control": "public, max-age=60",
            etag: '"fixture"',
          },
        }),
      baseUrl: "https://production.example/",
      path: "/api/v1/status?plan097=fixture",
      schemaId: "bp.test.release.v1",
      schema: Schema.Struct({
        schemaVersion: Schema.Literal(1),
        releaseId: Schema.String,
      }),
    });
    expect(result.value.releaseId).toBe("pub_20260721T120000000Z");
    expect(result.evidence).toEqual({
      path: "/api/v1/status?plan097=fixture",
      status: 200,
      schemaId: "bp.test.release.v1",
      safeBodySha256: createHash("sha256").update(body).digest("hex"),
      requestId: "request-1",
      cfRay: "ray-1",
      cacheControl: "public, max-age=60",
      cfCacheStatus: null,
      age: null,
      workerVersionId: null,
      etag: '"fixture"',
    });
    await expect(
      fetchPlan097HttpEvidence({
        fetch: async () => Response.json({ schemaVersion: 1, releaseId: "x", extra: true }),
        baseUrl: "https://production.example/",
        path: "/api/v1/status",
        schemaId: "bp.test.release.v1",
        schema: Schema.Struct({ schemaVersion: Schema.Literal(1), releaseId: Schema.String }),
      }),
    ).rejects.toThrow();
  });

  test("requires and records the exact Worker version on version-routed evidence", async () => {
    const workerVersionId = "aef011c3-0e48-4c35-92f7-3516a2259afe";
    const overrideHeaders: string[] = [];
    const result = await fetchPlan097HttpEvidence({
      fetch: async (_input, init) => {
        const overrideHeader = new Headers(init?.headers).get(
          "Cloudflare-Workers-Version-Overrides",
        );
        if (overrideHeader !== null) overrideHeaders.push(overrideHeader);
        return Response.json(
          { schemaVersion: 1 },
          {
            headers: {
              "cache-control": "no-store",
              "cf-cache-status": "BYPASS",
              "x-bp-worker-version": workerVersionId,
            },
          },
        );
      },
      baseUrl: "https://production.example/",
      path: "/api/v1/status?plan097=version",
      schemaId: "bp.test.release.v1",
      schema: Schema.Struct({ schemaVersion: Schema.Literal(1) }),
      expectedWorkerVersionId: workerVersionId,
      versionOverrideWorkerName: "bus-priority-impact-studio",
    });

    expect(overrideHeaders).toEqual([`bus-priority-impact-studio="${workerVersionId}"`]);
    expect(result.evidence.workerVersionId).toBe(workerVersionId);
    expect(result.evidence.cfCacheStatus).toBe("BYPASS");

    await expect(
      fetchPlan097HttpEvidence({
        fetch: async () =>
          Response.json(
            { schemaVersion: 1 },
            { headers: { "x-bp-worker-version": "f2067a1d-6c4f-4e00-abd4-43fea7469f4e" } },
          ),
        baseUrl: "https://production.example/",
        path: "/api/v1/status?plan097=wrong-version",
        schemaId: "bp.test.release.v1",
        schema: Schema.Struct({ schemaVersion: Schema.Literal(1) }),
        expectedWorkerVersionId: workerVersionId,
      }),
    ).rejects.toThrow(/expected Worker/i);
  });

  test("records a baseline HTTP defect without pretending its body matches the success schema", async () => {
    const body = '{"error":"map unavailable"}\n';
    const result = await fetchPlan097HttpBaselineEvidence({
      fetch: async () => new Response(body, { status: 503 }),
      baseUrl: "https://production.example/",
      path: "/api/v1/map/manifest?plan097=fixture",
      schemaId: "bp.map_manifest_response.v2",
      schema: Schema.Struct({ schemaVersion: Schema.Literal(2) }),
    });
    expect(result.value).toBeNull();
    expect(result.evidence.status).toBe(503);
    expect(result.evidence.safeBodySha256).toBe(createHash("sha256").update(body).digest("hex"));
  });

  test("rejects legacy placeholder language in a nominally successful public response", () => {
    expect(() =>
      assertNoPlan097LegacyEmptyState(
        '{"diagnosis":"This route dossier is still building."}',
        "/api/v1/studio/routes/bx38",
      ),
    ).toThrow(/legacy empty-state/i);
  });

  test("requires every successful recovery response to bypass caches", () => {
    const endpoint = {
      path: "/api/v1/status?plan097=fixture",
      status: 200,
      schemaId: "bp.release_status_response.v1",
      safeBodySha256: "a".repeat(64),
      requestId: "request-1",
      cfRay: "ray-1",
      cacheControl: "no-store",
      cfCacheStatus: null,
      age: null,
      workerVersionId: null,
      etag: null,
    };
    expect(() => assertPlan097RecoveryCacheSafety([endpoint])).not.toThrow();
    expect(() =>
      assertPlan097RecoveryCacheSafety([
        { ...endpoint, cacheControl: "public, max-age=60, stale-while-revalidate=86400" },
      ]),
    ).toThrow(/cache bypass/i);
    expect(() =>
      assertPlan097RecoveryCacheSafety([
        { ...endpoint, path: "/api/v1/map/manifest", status: 503, cacheControl: null },
      ]),
    ).not.toThrow();
  });

  test("requires rollback to restore every safe public hash while ignoring only the nonce", () => {
    const endpoint = {
      path: "/api/v1/status?plan097=before",
      status: 200,
      schemaId: "bp.release_status_response.v1",
      safeBodySha256: "a".repeat(64),
      requestId: "request-before",
      cfRay: "ray-before",
      cacheControl: "public, max-age=60",
      cfCacheStatus: null,
      age: null,
      workerVersionId: null,
      etag: '"same"',
    };
    const baseline = {
      checkedAt: "2026-07-22T11:00:00.000Z",
      activeReleaseId: "pub_20260721T120000000Z",
      endpoints: [endpoint],
    };
    expect(
      comparePlan097HttpBaselines({
        expected: baseline,
        actual: {
          ...baseline,
          checkedAt: "2026-07-22T12:00:00.000Z",
          endpoints: [
            {
              ...endpoint,
              path: "/api/v1/status?plan097=after",
              requestId: "request-after",
              cfRay: "ray-after",
            },
          ],
        },
      }),
    ).toEqual({ matchedEndpointCount: 1 });
    expect(() =>
      comparePlan097HttpBaselines({
        expected: baseline,
        actual: {
          ...baseline,
          endpoints: [{ ...endpoint, safeBodySha256: "b".repeat(64) }],
        },
      }),
    ).toThrow(/safe body hash/i);
  });
});
