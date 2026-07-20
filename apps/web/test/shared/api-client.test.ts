import { afterEach, describe, expect, test } from "bun:test";
import type { MapManifestResponse } from "@bp/domain/maps";
import {
  currentMapBusLaneArtifact,
  fetchMapBusLanes,
  fetchMapManifest,
  fetchMapRouteFacts,
  fetchNetworkMapGeo,
  fetchRouteSegmentsGeoLoad,
  fetchSelectedRouteMapEvidence,
  fetchStudioInterventionFacetIndex,
  fetchStudioInterventionsEvidence,
  fetchStudioRoute,
  fetchStudioRouteIndex,
  fetchStudioRouteInterventionInventory,
  fetchStudioRouteInterventionObservations,
  fetchStudioRoutes,
  fetchVerifiedMapArtifact,
  joinNetworkMapBundle,
  StudioApiError,
} from "../../src/studio/api-client.js";
import type {
  StudioRouteDetailResponse,
  StudioRouteIndex3Response,
} from "../../src/studio/api-contract.js";
import { isoMonthFixture } from "./schema-fixtures.js";

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
    releaseId: "pub_20260718T000000000Z",
    publishedAt: "2026-07-18T00:00:00.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-07") },
    dataAsOf: "2026-07",
    routes: [],
    quality: {
      releaseLayer: "published_release",
      completenessStatus: "unavailable",
      confidence: "low",
      caveats: [],
    },
  };
}

const mapReleaseIdentity = {
  releaseId: "pub_20260401T000000123Z",
  publishedAt: "2026-04-01T00:00:00.123Z",
  coverage: { start: null, end: isoMonthFixture("2026-03") },
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
      releaseLayer: "published_release" as const,
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

function selectedRouteDetailFixture(routeId = "M15+"): StudioRouteDetailResponse {
  return {
    schemaVersion: 3,
    generatedAt: "2026-04-01T00:00:00.123Z",
    ...mapReleaseIdentity,
    route: {
      slug: "m15-sbs",
      routeId,
      label: "M15 SBS",
      corridor: "First / Second",
      corridorFull: "First Avenue / Second Avenue",
      borough: "Manhattan",
      sbs: true,
      speedMph: 7.2,
      scheduledMph: null,
      weightedAvgSpeed: 7.2,
      speedPercentile: null,
      dailyRiders: 30_000,
      ridersYoyPct: null,
      riderHoursLost: 6200,
      laneCoverage: 65,
      aceStatus: "active",
      aceSince: "2024",
      tspCoverage: "none",
      reliability: "High attention route",
      observedReliability: null,
      diagnosis: "M15 SBS has slow segments and active treatment evidence.",
      spark: null,
      termini: { north: "East Harlem", south: "South Ferry" },
      miles: 8.1,
      stops: 42,
      flags: ["ACE active"],
      peerSlug: null,
      interventions: [],
      movement6mPct: null,
      context12mPct: null,
    },
    segments: [],
    artifactRefs: [],
    insights: [],
    peakWindows: [],
    slowestWindows: [],
    reliabilitySamples: [],
    capability: null,
    dossier: null,
    equityContext: null,
    quality: {
      releaseLayer: "published_release",
      completenessStatus: "partial_public_speed_only",
      confidence: "medium",
      caveats: [],
    },
  };
}

function emptyRoutesFixture() {
  return {
    schemaVersion: 2,
    generatedAt: mapReleaseIdentity.publishedAt,
    ...mapReleaseIdentity,
    routes: [],
    quality: {
      releaseLayer: "published_release" as const,
      completenessStatus: "complete" as const,
      confidence: "high" as const,
      caveats: [],
    },
  };
}

function routeSegmentCollectionFixture(routeId = "M15+") {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: `${routeId}:0:stop-a:stop-b`,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [-73.99, 40.75],
            [-73.98, 40.76],
          ],
        },
        properties: {
          segmentId: `${routeId}:0:stop-a:stop-b`,
          sourceSegmentId: "stop-a:stop-b",
          studioSegmentId: "studio-segment-1",
          spineSegmentId: "m15-n-stop-a-stop-b",
          spineJoinStatus: "matched" as const,
          routeId,
          directionId: "0",
          month: "2026-03",
          hourOfDay: null,
          averageSpeedMph: 5.2,
          hotspotScore: 92,
          rankOnRoute: 1,
          startStopName: "14 St",
          endStopName: "23 St",
        },
      },
    ],
  };
}

function routeSegmentArtifact(sha256: string, routeId = "M15+") {
  return {
    artifactKind: "map_route_segments_geojson",
    artifactKey: `map/2026-03/routes/${encodeURIComponent(routeId)}.segments.geojson`,
    contentType: "application/geo+json",
    byteLength: 1,
    gzipByteLength: 1,
    sha256,
    featureCount: 1,
    coordinateCount: 2,
    routeId,
    apiPath: `/api/v1/artifacts/map/2026-03/routes/${encodeURIComponent(routeId)}.segments.geojson`,
  };
}

describe("Studio API client", () => {
  test("strictly decodes Studio routes and detail publication identities", async () => {
    mockFetch((async (input) =>
      Response.json(
        String(input).includes("/studio/routes/M15%2B")
          ? selectedRouteDetailFixture()
          : emptyRoutesFixture(),
      )) as typeof globalThis.fetch);

    await expect(fetchStudioRoutes()).resolves.toMatchObject(mapReleaseIdentity);
    await expect(fetchStudioRoute("M15+")).resolves.toMatchObject(mapReleaseIdentity);

    mockFetch((async () =>
      Response.json({
        ...emptyRoutesFixture(),
        publishedAt: undefined,
      })) as unknown as typeof globalThis.fetch);
    await expect(fetchStudioRoutes()).rejects.toThrow();
  });

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

  test("loads nullable intervention inventory artifacts from exact public keys", async () => {
    const requestedPaths: string[] = [];
    mockFetch((async (input) => {
      requestedPaths.push(String(input));
      return Response.json({ artifactKind: "fixture" });
    }) as typeof globalThis.fetch);

    await fetchStudioRouteInterventionInventory("b44-sbs");
    await fetchStudioInterventionFacetIndex();

    expect(requestedPaths).toEqual([
      "/api/v1/artifacts/studio/v2/routes/b44-sbs/intervention-inventory.json",
      "/api/v1/artifacts/studio/v2/interventions/facet-index.json",
    ]);

    mockFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
    );
    await expect(fetchStudioRouteInterventionInventory("b44")).resolves.toBeNull();
    await expect(fetchStudioInterventionFacetIndex()).resolves.toBeNull();
  });

  test("inventory artifact loads preserve malformed JSON errors and aborts", async () => {
    mockFetch(
      (async () =>
        new Response("{not-json", { status: 200 })) as unknown as typeof globalThis.fetch,
    );
    await expect(fetchStudioRouteInterventionInventory("b44")).rejects.toThrow();

    const controller = new AbortController();
    mockFetch((async (_input, init) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }) as typeof globalThis.fetch);
    const load = fetchStudioInterventionFacetIndex({ signal: controller.signal });
    controller.abort();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
  });

  test("loads nullable intervention observation bundles from encoded public keys", async () => {
    const fixture = {
      schemaVersion: 1,
      artifactKind: "studio_route_intervention_observations",
      route: { slug: "m15+sbs" },
    };
    let requestedPath = "";
    mockFetch((async (input) => {
      requestedPath = String(input);
      return Response.json(fixture);
    }) as typeof globalThis.fetch);

    const result: unknown = await fetchStudioRouteInterventionObservations("m15+sbs");
    expect(result).toEqual(fixture);
    expect(requestedPath).toBe(
      "/api/v1/artifacts/studio/v2/routes/m15%2Bsbs/intervention-observations.json",
    );

    mockFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
    );
    await expect(fetchStudioRouteInterventionObservations("m15-sbs")).resolves.toBeNull();
  });

  test("observation bundle loads propagate aborts", async () => {
    const controller = new AbortController();
    mockFetch((async (_input, init) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }) as typeof globalThis.fetch);

    const load = fetchStudioRouteInterventionObservations("m15-sbs", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
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

  test("loads selected-route detail and verified segments in parallel without refetching the manifest", async () => {
    const routeId = "M15+";
    const segmentBody = JSON.stringify(routeSegmentCollectionFixture(routeId));
    const segmentSha256 = await sha256ForBody(segmentBody);
    const manifest = mapManifestFixture({
      artifacts: [routeSegmentArtifact(segmentSha256, routeId)],
    });
    let resolveDetail: (response: Response) => void = () => {};
    let resolveSegments: (response: Response) => void = () => {};
    const detailResponse = new Promise<Response>((resolve) => {
      resolveDetail = resolve;
    });
    const segmentResponse = new Promise<Response>((resolve) => {
      resolveSegments = resolve;
    });
    const requestedPaths: string[] = [];
    mockFetch(((input) => {
      const path = String(input);
      requestedPaths.push(path);
      return path.includes("/studio/routes/") ? detailResponse : segmentResponse;
    }) as typeof globalThis.fetch);

    const load = fetchSelectedRouteMapEvidence(manifest as never, routeId);
    await Promise.resolve();
    expect(requestedPaths).toEqual([
      "/api/v1/studio/routes/M15%2B",
      routeSegmentArtifact(segmentSha256, routeId).apiPath,
    ]);
    expect(requestedPaths).not.toContain("/api/v1/map/manifest");

    resolveDetail(Response.json(selectedRouteDetailFixture(routeId)));
    resolveSegments(new Response(segmentBody));
    await expect(load).resolves.toMatchObject({
      routeId,
      routeDetail: { status: "ready", data: { route: { routeId } } },
      segments: {
        status: "ready",
        expectedSha256: segmentSha256,
        actualSha256: segmentSha256,
        data: { features: [{ properties: { routeId } }] },
      },
    });
  });

  test("preserves unavailable route detail and undeclared segment states", async () => {
    const requestedPaths: string[] = [];
    mockFetch(((input) => {
      requestedPaths.push(String(input));
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof globalThis.fetch);

    await expect(
      fetchSelectedRouteMapEvidence(mapManifestFixture() as never, "M15+"),
    ).resolves.toMatchObject({
      routeDetail: { status: "unavailable" },
      segments: { status: "unavailable" },
    });
    expect(requestedPaths).toEqual(["/api/v1/studio/routes/M15%2B"]);
  });

  test("fails closed when a manifest declares duplicate exact route-segment artifacts", async () => {
    const routeId = "M15+";
    const artifact = routeSegmentArtifact("a".repeat(64), routeId);
    const requestedPaths: string[] = [];
    mockFetch(((input) => {
      requestedPaths.push(String(input));
      return Promise.resolve(Response.json(selectedRouteDetailFixture(routeId)));
    }) as typeof globalThis.fetch);

    await expect(
      fetchSelectedRouteMapEvidence(
        mapManifestFixture({ artifacts: [artifact, { ...artifact }] }) as never,
        routeId,
      ),
    ).resolves.toMatchObject({
      routeDetail: { status: "ready" },
      segments: { status: "unavailable", reason: expect.stringContaining("multiple") },
    });
    expect(requestedPaths).toEqual(["/api/v1/studio/routes/M15%2B"]);
  });

  test("preserves missing, integrity-mismatch, and request-failed segment states", async () => {
    const routeId = "M15+";
    const body = JSON.stringify(routeSegmentCollectionFixture(routeId));
    const sha256 = await sha256ForBody(body);
    const manifest = mapManifestFixture({ artifacts: [routeSegmentArtifact(sha256, routeId)] });

    mockFetch(((input) =>
      String(input).includes("/studio/routes/")
        ? Promise.resolve(Response.json(selectedRouteDetailFixture(routeId)))
        : Promise.resolve(new Response(null, { status: 404 }))) as typeof globalThis.fetch);
    await expect(fetchSelectedRouteMapEvidence(manifest as never, routeId)).resolves.toMatchObject({
      routeDetail: { status: "ready" },
      segments: { status: "missing" },
    });

    mockFetch(((input) =>
      String(input).includes("/studio/routes/")
        ? Promise.resolve(Response.json(selectedRouteDetailFixture(routeId)))
        : Promise.resolve(new Response(body))) as typeof globalThis.fetch);
    await expect(
      fetchSelectedRouteMapEvidence(
        mapManifestFixture({ artifacts: [routeSegmentArtifact("0".repeat(64), routeId)] }) as never,
        routeId,
      ),
    ).resolves.toMatchObject({
      routeDetail: { status: "ready" },
      segments: { status: "integrity_mismatch", expectedSha256: "0".repeat(64) },
    });

    mockFetch(((input) =>
      String(input).includes("/studio/routes/")
        ? Promise.resolve(Response.json(selectedRouteDetailFixture(routeId)))
        : Promise.resolve(new Response(null, { status: 503 }))) as typeof globalThis.fetch);
    await expect(fetchSelectedRouteMapEvidence(manifest as never, routeId)).resolves.toMatchObject({
      routeDetail: { status: "ready" },
      segments: { status: "request_failed", httpStatus: 503 },
    });
  });

  test("route-detail geometry fails closed when a mutable artifact body changes", async () => {
    const routeId = "M15+";
    const declaredBody = JSON.stringify(routeSegmentCollectionFixture(routeId));
    const declaredSha256 = await sha256ForBody(declaredBody);
    const changedBody = JSON.stringify({
      ...routeSegmentCollectionFixture(routeId),
      features: [],
    });
    const manifest = mapManifestFixture({
      artifacts: [routeSegmentArtifact(declaredSha256, routeId)],
    });
    mockFetch(((input) =>
      String(input) === "/api/v1/map/manifest"
        ? Promise.resolve(Response.json(manifest))
        : Promise.resolve(new Response(changedBody))) as typeof globalThis.fetch);

    await expect(fetchRouteSegmentsGeoLoad(routeId)).resolves.toMatchObject({
      status: "integrity_mismatch",
      expectedSha256: declaredSha256,
    });
  });

  test("rejects selected-route segment payloads belonging to another exact source route", async () => {
    const routeId = "M15+";
    const body = JSON.stringify(routeSegmentCollectionFixture("B46-SBS"));
    const sha256 = await sha256ForBody(body);
    mockFetch(((input) =>
      String(input).includes("/studio/routes/")
        ? Promise.resolve(Response.json(selectedRouteDetailFixture(routeId)))
        : Promise.resolve(new Response(body))) as typeof globalThis.fetch);

    await expect(
      fetchSelectedRouteMapEvidence(
        mapManifestFixture({ artifacts: [routeSegmentArtifact(sha256, routeId)] }) as never,
        routeId,
      ),
    ).resolves.toMatchObject({ segments: { status: "invalid_contract" } });
  });

  test("propagates one AbortSignal to both selected-route requests", async () => {
    const routeId = "M15+";
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    mockFetch(
      ((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal instanceof AbortSignal) {
            signals.push(init.signal);
            init.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }
        })) as typeof globalThis.fetch,
    );

    const load = fetchSelectedRouteMapEvidence(
      mapManifestFixture({
        artifacts: [routeSegmentArtifact("0".repeat(64), routeId)],
      }) as never,
      routeId,
      { signal: controller.signal },
    );
    await Promise.resolve();
    expect(signals).toEqual([controller.signal, controller.signal]);
    controller.abort();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
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
            artifactKey: "map/bus-lanes/current.geojson",
            apiPath: "/lanes.geojson",
            sha256,
          },
        ],
      } as never),
    ).resolves.toMatchObject({ status: "invalid_contract" });
  });

  test("requires the current layer and artifact tables to name the same bus-lane object", async () => {
    const manifest = {
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
          artifactKey: "map/bus-lanes/old.geojson",
          apiPath: "/old-lanes.geojson",
          sha256: "a".repeat(64),
        },
      ],
    } as unknown as MapManifestResponse;
    expect(currentMapBusLaneArtifact(manifest)).toBeNull();
    await expect(fetchMapBusLanes(manifest)).resolves.toMatchObject({ status: "unavailable" });

    const exact = {
      artifactKind: "map_bus_lanes_geojson",
      artifactKey: "map/bus-lanes/current.geojson",
      apiPath: "/current-lanes.geojson",
      sha256: "b".repeat(64),
    };
    const duplicateManifest = {
      ...manifest,
      artifacts: [exact, { ...exact }],
    } as unknown as MapManifestResponse;
    expect(currentMapBusLaneArtifact(duplicateManifest)).toBeNull();
    await expect(fetchMapBusLanes(duplicateManifest)).resolves.toMatchObject({
      status: "unavailable",
    });
  });
});
