import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchMapBusLanes,
  fetchStudioInterventionsEvidence,
  fetchStudioRoute,
  fetchStudioRouteIndex,
  fetchVerifiedMapArtifact,
  joinNetworkMapBundle,
  StudioApiError,
} from "../../src/studio/api-client.js";
import type { StudioRouteIndex3Response } from "../../src/studio/api-contract.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: typeof globalThis.fetch) {
  globalThis.fetch = handler;
}

function emptyRouteIndexV3(): StudioRouteIndex3Response {
  return {
    schemaVersion: 3,
    generatedAt: "2026-07-18T00:00:00.000Z",
    releaseId: "studio/v3",
    baselineMonth: "2026-07",
    dataAsOf: "2026-07",
    routes: [],
    quality: {
      releaseLayer: "baseline_release",
      completenessStatus: "unavailable",
      confidence: "low",
      caveats: [],
    },
  };
}

describe("Studio API client", () => {
  test("requests and strictly decodes route-index schema v3", async () => {
    let requestedPath = "";
    mockFetch((async (input) => {
      requestedPath = String(input);
      return Response.json(emptyRouteIndexV3());
    }) as typeof globalThis.fetch);

    await expect(fetchStudioRouteIndex()).resolves.toEqual(emptyRouteIndexV3());
    expect(requestedPath).toBe("/api/v1/studio/routes?schema=3");
  });

  test("rejects future route-index payloads instead of type-casting them", async () => {
    mockFetch((async () =>
      Response.json({
        ...emptyRouteIndexV3(),
        schemaVersion: 4,
      })) as unknown as typeof globalThis.fetch);

    await expect(fetchStudioRouteIndex()).rejects.toThrow();
  });

  test("throws StudioApiError with server error details", async () => {
    const fetchFailure = async () =>
      Response.json(
        {
          error: {
            code: "SERVING_PROJECTION_MISSING",
            message: "Serving projection is missing.",
          },
        },
        { status: 503 },
      );
    mockFetch(fetchFailure as unknown as typeof globalThis.fetch);

    try {
      await fetchStudioInterventionsEvidence();
      throw new Error("Expected fetchStudioInterventionsEvidence to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioApiError);
      if (error instanceof StudioApiError) {
        expect(error.status).toBe(503);
        expect(error.code).toBe("SERVING_PROJECTION_MISSING");
        expect(error.message).toBe("Serving projection is missing.");
      }
    }
  });

  test("returns null for nullable 404 responses", async () => {
    mockFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
    );

    await expect(fetchStudioRoute("M1")).resolves.toBeNull();
  });

  test("returns a typed ready artifact only after hash and contract checks", async () => {
    const body = JSON.stringify({ value: 7 });
    const expectedSha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    mockFetch((async () => new Response(body)) as unknown as typeof globalThis.fetch);
    await expect(
      fetchVerifiedMapArtifact("/artifact.json", expectedSha256, (value) =>
        typeof value === "object" && value !== null && "value" in value ? value : null,
      ),
    ).resolves.toMatchObject({
      status: "ready",
      data: { value: 7 },
      expectedSha256,
      actualSha256: expectedSha256,
    });
  });

  test("keeps integrity mismatch, invalid contract, and missing states distinct", async () => {
    const body = JSON.stringify({ value: 7 });
    mockFetch((async () => new Response(body)) as unknown as typeof globalThis.fetch);
    await expect(
      fetchVerifiedMapArtifact("/artifact.json", "0".repeat(64), () => ({ value: 7 })),
    ).resolves.toMatchObject({ status: "integrity_mismatch", expectedSha256: "0".repeat(64) });

    const expectedSha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    mockFetch((async () => new Response(body)) as unknown as typeof globalThis.fetch);
    await expect(
      fetchVerifiedMapArtifact("/artifact.json", expectedSha256, () => null),
    ).resolves.toMatchObject({ status: "invalid_contract" });

    mockFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
    );
    await expect(
      fetchVerifiedMapArtifact("/missing.json", expectedSha256, () => ({ value: 7 })),
    ).resolves.toEqual({ status: "missing", path: "/missing.json" });
  });

  test("propagates aborts so route loaders can cancel map artifact work", async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch((async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof globalThis.fetch);
    await expect(
      fetchVerifiedMapArtifact("/artifact.json", "0".repeat(64), () => null, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted");
  });

  test("retains neutral geometry when route facts are unavailable", () => {
    const result = joinNetworkMapBundle({
      manifest: { baselineMonth: "2026-03" },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "MultiLineString",
                coordinates: [
                  [
                    [-73.99, 40.75],
                    [-73.98, 40.76],
                  ],
                ],
              },
              properties: {
                routeId: "M1",
                month: "2026-03",
                hourlySpeedMph: new Array(24).fill(null),
                hourlyTraversalCount: new Array(24).fill(0),
                servedBoroughs: ["Manhattan"],
                servedBoroughsStatus: "verified",
              },
            },
          ],
        },
      },
      context: { status: "unavailable", reason: "fixture" },
      routeFacts: { status: "unavailable", reason: "fixture" },
    } as never);
    expect(result.collection?.features).toHaveLength(1);
    expect(result.collection?.features[0]?.properties).toMatchObject({
      routeId: "M1",
      currentMph: null,
      dailyRiders: null,
      factsStatus: "unavailable",
    });
    expect(result.message).toBe("0 of 1 routes have complete metric facts.");
  });

  test("refuses cross-month fact joins and reports both months", () => {
    const result = joinNetworkMapBundle({
      manifest: { baselineMonth: "2026-03" },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: { type: "FeatureCollection", features: [] },
      },
      context: { status: "unavailable", reason: "fixture" },
      routeFacts: {
        status: "ready",
        path: "/facts.json",
        expectedSha256: "b".repeat(64),
        actualSha256: "b".repeat(64),
        data: { schemaVersion: 1, baselineMonth: "2026-04", generatedAt: "x", routes: [] },
      },
    } as never);
    expect(result.factsStatus).toBe("baseline_mismatch");
    expect(result.message).toContain("2026-03");
    expect(result.message).toContain("2026-04");
  });

  test("does not request unavailable lanes and rejects malformed lane payloads", async () => {
    let requested = false;
    mockFetch((async () => {
      requested = true;
      return new Response(null, { status: 500 });
    }) as unknown as typeof globalThis.fetch);
    await expect(
      fetchMapBusLanes({
        layers: [
          {
            layerId: "bus_lanes",
            readiness: "missing",
            currencyStatus: "unknown",
            artifactKey: null,
            reason: "No current lane snapshot.",
          },
        ],
        artifacts: [],
      } as never),
    ).resolves.toMatchObject({ status: "unavailable" });
    expect(requested).toBe(false);

    const body = JSON.stringify({
      type: "FeatureCollection",
      features: [{ geometry: { type: "Point" } }],
    });
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    mockFetch((async () => new Response(body)) as unknown as typeof globalThis.fetch);
    await expect(
      fetchMapBusLanes({
        layers: [
          {
            layerId: "bus_lanes",
            readiness: "available",
            currencyStatus: "current",
            artifactKey: "map/bus-lanes/current.geojson",
            reason: "Current fixture.",
          },
        ],
        artifacts: [
          {
            artifactKind: "map_bus_lanes_geojson",
            apiPath: "/lanes.geojson",
            sha256,
          },
        ],
      } as never),
    ).resolves.toMatchObject({ status: "invalid_contract" });
  });
});
