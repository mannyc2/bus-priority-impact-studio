import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchMapBusLanes,
  fetchMapManifest,
  fetchMapRouteFacts,
  fetchNetworkMapGeo,
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

const mapReleaseIdentity = {
  releaseId: "pub_20260401T000000123Z",
  publishedAt: "2026-04-01T00:00:00.123Z",
  coverage: { start: null, end: "2026-03" },
} as const;

type MapReleaseIdentityFixture = {
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly coverage: { readonly start: string | null; readonly end: string };
};

function mapRouteFactsReference(identity: MapReleaseIdentityFixture = mapReleaseIdentity) {
  return {
    status: "available" as const,
    artifactKey: "map/2026-03/map-route-facts.json",
    sha256: "b".repeat(64),
    schemaVersion: 2 as const,
    ...identity,
    routeCount: 2,
    byteLength: 1,
    gzipByteLength: 1,
  };
}

function mapManifestFixture(
  input: {
    routeFacts?:
      | ReturnType<typeof mapRouteFactsReference>
      | { status: "unavailable"; reason: string };
    artifacts?: unknown[];
  } = {},
) {
  return {
    schemaVersion: 2 as const,
    ...mapReleaseIdentity,
    releaseProfile: "demo" as const,
    buildStatus: "pass" as const,
    verificationStatus: "not_run" as const,
    routeFacts: input.routeFacts ?? {
      status: "unavailable" as const,
      reason: "Fixture omits route facts.",
    },
    sources: [],
    layers: [],
    routeUniverse: {
      includedRouteTypes: ["Local", "Limited", "SBS"],
      excludedRouteTypes: ["Express", "School"],
      expectedRouteIds: [],
      geometryRouteIds: [],
      routeSegmentRouteIds: [],
      routeFactRouteIds: [],
    },
    status: "pass" as const,
    artifactCount: input.artifacts?.length ?? 0,
    routeSegmentArtifactCount: 0,
    totalFeatureCount: 0,
    totalByteLength: 0,
    issueCount: 0,
    artifacts: input.artifacts ?? [],
    quality: {
      releaseLayer: "baseline_release" as const,
      completenessStatus: "complete" as const,
      confidence: "high" as const,
      caveats: [],
    },
  };
}

async function sha256ForBody(body: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

  test("strictly decodes the v2 map manifest and rejects the legacy root", async () => {
    mockFetch((async () =>
      Response.json(mapManifestFixture())) as unknown as typeof globalThis.fetch);
    await expect(fetchMapManifest()).resolves.toMatchObject({
      schemaVersion: 2,
      ...mapReleaseIdentity,
    });

    mockFetch((async () =>
      Response.json({
        ...mapManifestFixture(),
        schemaVersion: 1,
        baselineMonth: "2026-03",
        generatedAt: mapReleaseIdentity.publishedAt,
      })) as unknown as typeof globalThis.fetch);
    await expect(fetchMapManifest()).rejects.toThrow();
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

  test("strict artifact loaders reject v1 network and route-facts roots", async () => {
    const legacyNetworkBody = JSON.stringify({
      schemaVersion: 1,
      ...mapReleaseIdentity,
      type: "FeatureCollection",
      features: [],
    });
    const legacyNetworkSha256 = await sha256ForBody(legacyNetworkBody);
    const manifest = mapManifestFixture({
      artifacts: [
        {
          artifactKind: "map_network_simplified_geojson",
          artifactKey: "map/2026-03/network.json",
          contentType: "application/geo+json",
          byteLength: legacyNetworkBody.length,
          gzipByteLength: legacyNetworkBody.length,
          sha256: legacyNetworkSha256,
          featureCount: 0,
          coordinateCount: 0,
          routeId: null,
          apiPath: "/network.json",
        },
      ],
    });
    mockFetch((async (input) =>
      String(input) === "/api/v1/map/manifest"
        ? Response.json(manifest)
        : new Response(legacyNetworkBody)) as typeof globalThis.fetch);

    await expect(fetchNetworkMapGeo()).resolves.toMatchObject({
      network: { status: "invalid_contract" },
    });

    const legacyFactsBody = JSON.stringify({
      schemaVersion: 1,
      baselineMonth: "2026-03",
      generatedAt: mapReleaseIdentity.publishedAt,
      routes: [],
    });
    const legacyFactsSha256 = await sha256ForBody(legacyFactsBody);
    mockFetch((async () => new Response(legacyFactsBody)) as unknown as typeof globalThis.fetch);
    await expect(
      fetchMapRouteFacts({
        ...mapManifestFixture(),
        routeFacts: {
          ...mapRouteFactsReference(),
          sha256: legacyFactsSha256,
          routeCount: 0,
        },
      } as never),
    ).resolves.toMatchObject({ status: "invalid_contract" });
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
      manifest: { ...mapReleaseIdentity, routeFacts: { status: "unavailable" } },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: {
          schemaVersion: 2,
          ...mapReleaseIdentity,
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
      month: "2026-03",
      currentMph: null,
      dailyRiders: null,
      delayCoverage: null,
      factsStatus: "unavailable",
    });
    expect(result.delayCoverageEnd).toBeNull();
    expect(result.message).toBe("0 of 1 routes have complete metric facts.");
  });

  test("serves a delay coverage window only for a unanimous complete release", () => {
    const networkFeature = (routeId: string) => ({
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
        routeId,
        month: "2026-03",
        hourlySpeedMph: new Array(24).fill(null),
        hourlyTraversalCount: new Array(24).fill(0),
        servedBoroughs: ["Manhattan"],
        servedBoroughsStatus: "verified",
      },
    });
    const delayFact = (routeId: string, valueRiderHours: number | null, period: string | null) => ({
      route: {
        routeId,
        label: routeId,
        borough: "Manhattan",
        sbs: false,
        speedMph: 7.1,
        movement6mPct: null,
        dailyRiders: 9_000,
      },
      delayExposure: {
        status: valueRiderHours === null ? "unavailable" : "available",
        valueRiderHours,
        coverage: period === null ? null : { start: period, end: period },
      },
      provenance: {
        lane: { status: "unavailable", valuePct: null },
        ace: { status: "unknown" },
      },
    });
    const bundle = (facts: ReturnType<typeof delayFact>[]) =>
      joinNetworkMapBundle({
        manifest: {
          ...mapReleaseIdentity,
          routeFacts: mapRouteFactsReference(),
        },
        network: {
          status: "ready",
          path: "/network.json",
          expectedSha256: "a".repeat(64),
          actualSha256: "a".repeat(64),
          data: {
            schemaVersion: 2,
            ...mapReleaseIdentity,
            type: "FeatureCollection",
            features: [networkFeature("M1"), networkFeature("M2")],
          },
        },
        context: { status: "unavailable", reason: "fixture" },
        routeFacts: {
          status: "ready",
          path: "/facts.json",
          expectedSha256: "b".repeat(64),
          actualSha256: "b".repeat(64),
          data: { schemaVersion: 2, ...mapReleaseIdentity, routes: facts },
        },
      } as never);

    const unanimous = bundle([delayFact("M1", 12_000, "2026-03"), delayFact("M2", 800, "2026-03")]);
    expect(unanimous.delayCoverageEnd).toBe("2026-03");
    expect(unanimous.collection?.features[0]?.properties.delayCoverage).toEqual({
      start: "2026-03",
      end: "2026-03",
    });

    const partial = bundle([delayFact("M1", 12_000, "2026-03"), delayFact("M2", null, null)]);
    expect(partial.delayCoverageEnd).toBeNull();

    const disagreeing = bundle([
      delayFact("M1", 12_000, "2026-03"),
      delayFact("M2", 800, "2026-02"),
    ]);
    expect(disagreeing.delayCoverageEnd).toBeNull();
  });

  test("refuses cross-coverage fact joins and reports both windows", () => {
    const routeFactsIdentity = {
      ...mapReleaseIdentity,
      coverage: { start: null, end: "2026-04" },
    } as const;
    const result = joinNetworkMapBundle({
      manifest: { ...mapReleaseIdentity, routeFacts: mapRouteFactsReference() },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: {
          schemaVersion: 2,
          ...mapReleaseIdentity,
          type: "FeatureCollection",
          features: [],
        },
      },
      context: { status: "unavailable", reason: "fixture" },
      routeFacts: {
        status: "ready",
        path: "/facts.json",
        expectedSha256: "b".repeat(64),
        actualSha256: "b".repeat(64),
        data: { schemaVersion: 2, ...routeFactsIdentity, routes: [] },
      },
    } as never);
    expect(result.factsStatus).toBe("coverage_mismatch");
    expect(result.collection).toEqual({ type: "FeatureCollection", features: [] });
    expect(result.message).toContain("2026-03");
    expect(result.message).toContain("2026-04");
  });

  test("requires exact publication identity for network and manifest reference joins", () => {
    const shiftedPublication = {
      ...mapReleaseIdentity,
      releaseId: "pub_20260401T000000124Z",
      publishedAt: "2026-04-01T00:00:00.124Z",
    } as const;
    const networkMismatch = joinNetworkMapBundle({
      manifest: {
        ...mapReleaseIdentity,
        routeFacts: { status: "unavailable", reason: "Fixture omits facts." },
      },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: {
          schemaVersion: 2,
          ...shiftedPublication,
          type: "FeatureCollection",
          features: [],
        },
      },
      context: { status: "unavailable", reason: "fixture" },
      routeFacts: { status: "unavailable", reason: "fixture" },
    } as never);
    expect(networkMismatch.factsStatus).toBe("coverage_mismatch");
    expect(networkMismatch.collection).toEqual({ type: "FeatureCollection", features: [] });
    expect(networkMismatch.message).toContain(mapReleaseIdentity.releaseId);
    expect(networkMismatch.message).toContain(shiftedPublication.releaseId);

    const referenceMismatch = joinNetworkMapBundle({
      manifest: {
        ...mapReleaseIdentity,
        routeFacts: mapRouteFactsReference(shiftedPublication),
      },
      network: {
        status: "ready",
        path: "/network.json",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        data: {
          schemaVersion: 2,
          ...mapReleaseIdentity,
          type: "FeatureCollection",
          features: [],
        },
      },
      context: { status: "unavailable", reason: "fixture" },
      routeFacts: {
        status: "ready",
        path: "/facts.json",
        expectedSha256: "b".repeat(64),
        actualSha256: "b".repeat(64),
        data: { schemaVersion: 2, ...mapReleaseIdentity, routes: [] },
      },
    } as never);
    expect(referenceMismatch.factsStatus).toBe("coverage_mismatch");
    expect(referenceMismatch.message).toContain("manifest reference");
    expect(referenceMismatch.message).toContain(shiftedPublication.releaseId);
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
