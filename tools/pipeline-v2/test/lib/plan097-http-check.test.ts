import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Schema } from "effect";
import {
  assertNoPlan097LegacyEmptyState,
  comparePlan097HttpBaselines,
  fetchPlan097HttpEvidence,
} from "../../src/lib/plan097-http-check.ts";

describe("Plan 097 release-aware HTTP checker", () => {
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

  test("rejects legacy placeholder language in a nominally successful public response", () => {
    expect(() =>
      assertNoPlan097LegacyEmptyState(
        '{"diagnosis":"This route dossier is still building."}',
        "/api/v1/studio/routes/bx38",
      ),
    ).toThrow(/legacy empty-state/i);
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
