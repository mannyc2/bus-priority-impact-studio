import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  MapLayerStatusSchema,
  MapRouteUniverseSchema,
  MapSourceStatusSchema,
} from "@bp/domain/maps";
import { RouteCapabilityManifestSchema } from "@bp/domain/studio";
import {
  CoverageWindowSchema,
  type ReleaseIdentity,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  buildRouteCapabilityManifest,
  buildRouteSpeedAvailabilityResult,
  evaluateAnalysisPeriodCurrency,
  evaluateMaxAgeSnapshotCurrency,
  evaluateRevisionPinnedCurrency,
  isMapArtifactManifest,
  isSafeArtifactKey,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  MAP_LAYER_REGISTRY,
  type MapArtifactEntry,
  mapArtifactPayloadIssues,
  mapBudgetIssues,
  type RouteCapabilityInputRow,
  requestedRouteSpeedAvailability,
  routeSpeedAvailabilityReleaseDecision,
  summarizeRouteSpeedAvailabilityMonths,
  verifyMapArtifactManifestContents,
} from "../src/evaluation/index.js";

function capabilityRow(overrides: Partial<RouteCapabilityInputRow> = {}): RouteCapabilityInputRow {
  return {
    routeId: "M15+",
    hasSummary: true,
    publicVisible: true,
    baselineMonth: "2026-03",
    hasArtifact: true,
    history: {
      endMonth: "2026-03",
      pointCount: 12,
      speedMonthCount: 12,
      ridershipMonthCount: 12,
    },
    speedHistory: { endMonth: "2026-03", monthCount: 12, missingCellCount: 0 },
    scheduleTimepointCount: 20,
    treatment: { aceActive: true, busLaneMatchedLaneCount: 3 },
    detector: {
      present: true,
      findingCandidateCount: 1,
      contextCount: 0,
      reviewQueueCount: 0,
      suppressedCount: 0,
      reliabilityFindingCount: 1,
      reliabilityContextCount: 0,
      months: ["2026-03"],
      caveats: [],
    },
    sourceStatus: { reliability: "available", ridership: "available" },
    ...overrides,
  };
}

function routeSegmentFeatureCollection(month: string, routeId: string) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `${routeId}:0:1`,
        geometry: {
          type: "LineString",
          coordinates: [
            [-73.9903, 40.7527],
            [-73.9738, 40.7616],
          ],
        },
        properties: {
          segmentId: `${routeId}:0:1`,
          sourceSegmentId: "N:1:100:200",
          studioSegmentId: `${routeId}:${month}:N:1:100:200`,
          spineSegmentId: null,
          spineJoinStatus: "not_built",
          routeId,
          directionId: "0",
          month,
          hourOfDay: null,
          averageSpeedMph: 5.8,
          hotspotScore: 88,
          rankOnRoute: 1,
          startStopName: "W 34 St / 5 Av",
          endStopName: "E 42 St / Madison Av",
        },
      },
    ],
  };
}

function artifactDefinitions(month: string, releaseIdentity: ReleaseIdentity) {
  const emptyFeatureCollection = { type: "FeatureCollection", features: [] };
  return [
    {
      artifactKey: "maps/sources/source-snapshot.json",
      artifactKind: "map_source_snapshot" as const,
      contentType: MAP_ARTIFACT_JSON_CONTENT_TYPE,
      routeId: null,
      payload: {
        schemaVersion: 2,
        artifactKind: "map_source_snapshot",
        ...releaseIdentity,
        sources: [
          {
            sourceId: "current_bus_routes",
            snapshotPath: "data/raw/network/current_bus_routes.json",
            status: "available",
            fetchedAt: releaseIdentity.publishedAt,
            rowCount: 1,
            sha256: "a".repeat(64),
          },
        ],
      },
      featureCount: 1,
    },
    {
      artifactKey: "maps/routes/current-local-limited-sbs.min.geojson",
      artifactKind: "map_route_shapes_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: emptyFeatureCollection,
      featureCount: 0,
    },
    {
      artifactKey: "maps/stops/current-timepoints.min.geojson",
      artifactKind: "map_timepoint_stops_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: emptyFeatureCollection,
      featureCount: 0,
    },
    {
      artifactKey: "maps/context/nyc-boroughs.min.geojson",
      artifactKind: "map_borough_context_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: {
        type: "FeatureCollection",
        sourceRevision: {
          sourceId: "nyc_borough_boundaries",
          sha256: "a".repeat(64),
          currencyPolicy: "revision_pinned",
        },
        features: [
          {
            type: "Feature",
            properties: { boroName: "Manhattan", labelPoint: [-73.98, 40.76] },
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [-74, 40.7],
                    [-73.9, 40.7],
                    [-73.9, 40.8],
                    [-74, 40.7],
                  ],
                ],
              ],
            },
          },
        ],
      },
      featureCount: 1,
    },
    {
      artifactKey: "maps/bus-lanes/local-streets.min.geojson",
      artifactKind: "map_bus_lanes_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: emptyFeatureCollection,
      featureCount: 0,
    },
    {
      artifactKey: `maps/${month}/network-simplified.geojson`,
      artifactKind: "map_network_simplified_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: {
        schemaVersion: 2,
        ...releaseIdentity,
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
              month,
              hourlySpeedMph: Array.from({ length: 24 }, () => null),
              hourlyTraversalCount: Array.from({ length: 24 }, () => 0),
              servedBoroughs: [],
              servedBoroughsStatus: "unavailable",
            },
          },
        ],
      },
      featureCount: 1,
    },
    {
      artifactKey: `maps/routes/M1/${month}/segments.min.geojson`,
      artifactKind: "map_route_segments_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: "M1",
      payload: routeSegmentFeatureCollection(month, "M1"),
      featureCount: 1,
    },
  ];
}

describe("evaluation data products", () => {
  test("evaluates fixed map-layer currency and budgets without weakening priorities", () => {
    const decodeCoverage = decodeStrict(CoverageWindowSchema);

    expect(MAP_LAYER_REGISTRY.bus_lanes).toEqual({ priority: "p1", requiredForFull: false });
    expect(MAP_LAYER_REGISTRY.network_simplified).toEqual({
      priority: "p0",
      requiredForFull: true,
    });
    const boundary = evaluateMaxAgeSnapshotCurrency({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      evaluatedAt: "2026-02-15T00:00:00.000Z",
    });
    expect(boundary.status).toBe("current");
    expect(
      evaluateMaxAgeSnapshotCurrency({
        fetchedAt: "2026-01-01T00:00:00.000Z",
        evaluatedAt: "2026-02-15T00:00:00.001Z",
      }).status,
    ).toBe("stale");
    expect(
      evaluateMaxAgeSnapshotCurrency({
        fetchedAt: null,
        evaluatedAt: "2026-02-15T00:00:00.000Z",
      }).status,
    ).toBe("unknown");
    expect(
      evaluateAnalysisPeriodCurrency({
        coverage: decodeCoverage({ start: "2026-02", end: "2026-02" }),
        releaseCoverage: decodeCoverage({ start: "2026-03", end: "2026-03" }),
        coveragePassed: true,
      }).status,
    ).toBe("stale");
    expect(
      evaluateAnalysisPeriodCurrency({
        coverage: decodeCoverage({ start: null, end: "2026-03" }),
        releaseCoverage: decodeCoverage({ start: null, end: "2026-03" }),
        coveragePassed: true,
      }).status,
    ).toBe("period_aligned");
    expect(
      evaluateAnalysisPeriodCurrency({
        coverage: decodeCoverage({ start: "2026-03", end: "2026-03" }),
        releaseCoverage: decodeCoverage({ start: null, end: "2026-03" }),
        coveragePassed: true,
      }).status,
    ).toBe("period_aligned");
    expect(evaluateRevisionPinnedCurrency({ embeddedSha256: "a", sourceSha256: "b" }).status).toBe(
      "stale",
    );
    expect(
      mapBudgetIssues({ kind: "network", rawBytes: 1, gzipBytes: 1, features: 1, coordinates: 1 }),
    ).toEqual([]);
    expect(
      mapBudgetIssues({
        kind: "busLanes",
        rawBytes: 1_700_001,
        gzipBytes: 1,
        features: 1,
      }),
    ).toEqual(["raw bytes 1700001 > 1700000"]);
  });
  test("summarizes route-speed availability and release decisions", () => {
    const months = summarizeRouteSpeedAvailabilityMonths({
      minSpeedRoutes: 2,
      rows: [
        {
          year: 2026,
          month: 3,
          route_id: " b41 ",
          row_count: 100,
          bus_trip_count: 10,
        },
        {
          year: 2026,
          month: 3,
          route_id: "B41",
          row_count: 20,
          bus_trip_count: 2,
        },
        {
          year: 2026,
          month: 3,
          route_id: "M14A",
          row_count: 80,
          bus_trip_count: 8,
        },
        {
          year: 2026,
          month: 2,
          route_id: "B41",
          row_count: 90,
          bus_trip_count: 9,
        },
      ],
    });

    expect(months.map((month) => [month.isoMonth, month.routeCount, month.status])).toEqual([
      ["2026-03", 2, "complete"],
      ["2026-02", 1, "insufficient_speed_routes"],
    ]);
    expect(requestedRouteSpeedAvailability({ months: [], year: 2026, month: 5 }).status).toBe(
      "missing_speed",
    );
    expect(
      routeSpeedAvailabilityReleaseDecision({
        latestSpeedMonth: months[0] ?? null,
        lastBuiltYear: 2026,
        lastBuiltMonth: 2,
      }).status,
    ).toBe("new_complete_month_available");
    expect(
      buildRouteSpeedAvailabilityResult({
        rows: [],
        checkedAt: "2026-06-06T00:00:00.000Z",
        startYear: 2026,
        endYear: 2026,
        minSpeedRoutes: 2,
        artifactPath: "data/artifacts/source-availability/route-speed-availability.json",
      }).releaseDecision.status,
    ).toBe("no_complete_speed_month");
  });

  test("builds schema-valid route capability manifests", () => {
    const manifest = buildRouteCapabilityManifest({
      generatedAt: "2026-06-10T00:00:00.000Z",
      releaseMonth: "2026-03",
      rows: [capabilityRow()],
    });

    expect(() => decodeStrict(RouteCapabilityManifestSchema)(manifest)).not.toThrow();
    expect(manifest.routes[0]?.overallState).toBe("ready");
    expect(manifest.routes[0]?.surfaces["speedHistory"]?.state).toBe("ready");
    expect(manifest.routes[0]?.surfaces["reliability"]?.state).toBe("ready");
  });

  test("validates map manifests from manifest contents and caller-provided artifact checks", () => {
    const month = "2026-03";
    const publishedAt = "2026-06-06T00:00:00.000Z";
    const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
      releaseId: releaseIdFromPublishedAt(publishedAt),
      publishedAt,
      coverage: { start: month, end: month },
    });
    const definitions = artifactDefinitions(month, releaseIdentity);
    const artifacts = definitions.map((definition) => buildMapJsonArtifact(definition));
    const manifest = buildMapArtifactManifest({
      releaseIdentity,
      artifacts: artifacts.map((artifact) => artifact.entry),
      releaseProfile: "demo",
      routeFacts: { status: "unavailable", reason: "Fixture omits route facts." },
      sources: [
        decodeStrict(MapSourceStatusSchema)({
          sourceId: "fixture",
          priority: "p0",
          requiredForFull: true,
          readiness: "available",
          currencyStatus: "current",
          currency: {
            policy: "max_age_snapshot",
            fetchedAt: "2026-06-06T00:00:00.000Z",
            evaluatedAt: "2026-06-06T00:00:00.000Z",
            ageDays: 0,
            maxAgeDays: 45,
          },
          reason: "Fixture source posture.",
        }),
      ],
      layers: [
        ["route_shapes", "p0", true, "maps/routes/current-local-limited-sbs.min.geojson"],
        ["timepoint_stops", "p0", true, "maps/stops/current-timepoints.min.geojson"],
        ["network_simplified", "p0", true, `maps/${month}/network-simplified.geojson`],
        ["route_segments", "p0", true, null],
        ["borough_context", "p0", true, "maps/context/nyc-boroughs.min.geojson"],
        ["route_facts", "p0", true, null],
        ["bus_lanes", "p1", false, "maps/bus-lanes/local-streets.min.geojson"],
      ].map(([layerId, priority, requiredForFull, artifactKey]) =>
        decodeStrict(MapLayerStatusSchema)({
          layerId,
          priority,
          requiredForFull,
          readiness: layerId === "route_facts" ? "missing" : "available",
          currencyStatus: "current",
          currency: {
            policy: "max_age_snapshot",
            fetchedAt: "2026-06-06T00:00:00.000Z",
            evaluatedAt: "2026-06-06T00:00:00.000Z",
            ageDays: 0,
            maxAgeDays: 45,
          },
          sourceIds: ["fixture"],
          artifactKey,
          featureCount: 0,
          routeCount: layerId === "network_simplified" || layerId === "route_segments" ? 1 : 0,
          reason: "Fixture posture.",
        }),
      ),
      routeUniverse: decodeStrict(MapRouteUniverseSchema)({
        includedRouteTypes: ["Local", "Limited", "SBS"],
        excludedRouteTypes: ["Express", "School"],
        expectedRouteIds: ["M1"],
        geometryRouteIds: ["M1"],
        routeSegmentRouteIds: ["M1"],
        routeFactRouteIds: [],
      }),
    });
    const artifactIssues = artifacts.flatMap((artifact, index) =>
      mapArtifactPayloadIssues({
        artifact: artifact.entry,
        payload: definitions[index]?.payload,
        month,
        releaseIdentity,
      }),
    );

    expect(isMapArtifactManifest(manifest)).toBe(true);
    expect(isMapArtifactManifest({ ...manifest, baselineMonth: month })).toBe(false);
    expect(isMapArtifactManifest({ ...manifest, sources: [null] })).toBe(false);
    expect(
      isMapArtifactManifest({
        ...manifest,
        artifacts: [{ ...manifest.artifacts[0], artifactKey: "../secret.json" }],
      }),
    ).toBe(false);
    expect(isSafeArtifactKey("map/2026-03/manifest.json")).toBe(true);
    expect(isSafeArtifactKey("../secret.json")).toBe(false);
    expect(isSafeArtifactKey("map//secret.json")).toBe(false);
    expect(isSafeArtifactKey("map\\secret.json")).toBe(false);
    expect(isSafeArtifactKey("C:/secret.json")).toBe(false);
    expect(isSafeArtifactKey("map/%2e%2e/secret.json")).toBe(false);
    expect(isSafeArtifactKey("map/\u0001secret.json")).toBe(false);

    const sourceArtifact = artifacts.find(
      (artifact) => artifact.entry.artifactKind === "map_source_snapshot",
    );
    expect(sourceArtifact).toBeDefined();
    expect(
      mapArtifactPayloadIssues({
        artifact: sourceArtifact?.entry as MapArtifactEntry,
        payload: { arbitrary: true },
        month,
        releaseIdentity,
      }).map((issue) => issue.code),
    ).toContain("map_source_snapshot_payload_invalid");

    expect(
      verifyMapArtifactManifestContents({
        manifestPath: "data/artifacts/maps/2026-03/manifest.json",
        month,
        manifest,
        expectedRouteIds: ["M1"],
        artifactIssues,
      }),
    ).toMatchObject({ status: "pass", artifactCount: 7, issueCount: 0 });

    const missingRoute = verifyMapArtifactManifestContents({
      manifestPath: "data/artifacts/maps/2026-03/manifest.json",
      month,
      manifest: {
        ...manifest,
        artifacts: manifest.artifacts.filter(
          (artifact: MapArtifactEntry) => artifact.artifactKind !== "map_route_segments_geojson",
        ),
        routeSegmentArtifactCount: 0,
      },
      expectedRouteIds: ["M1"],
    });
    expect(missingRoute.issues.map((issue) => issue.code)).toContain(
      "map_route_segment_artifact_routes_missing",
    );
  });
});
