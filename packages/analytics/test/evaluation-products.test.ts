import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { RouteCapabilityManifestSchema } from "@bp/domain/studio";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  buildRouteCapabilityManifest,
  buildRouteSpeedAvailabilityResult,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  type MapArtifactEntry,
  mapArtifactPayloadIssues,
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

function artifactDefinitions(month: string) {
  const emptyFeatureCollection = { type: "FeatureCollection", features: [] };
  return [
    {
      artifactKey: "maps/sources/source-snapshot.json",
      artifactKind: "map_source_snapshot" as const,
      contentType: MAP_ARTIFACT_JSON_CONTENT_TYPE,
      routeId: null,
      payload: {
        schemaVersion: 1,
        artifactKind: "map_source_snapshot",
        analysisPeriod: month,
        generatedAt: "2026-06-06T00:00:00.000Z",
        sources: [{ sourceId: "current_bus_routes", status: "available" }],
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
      artifactKey: "maps/bus-lanes/local-streets.min.geojson",
      artifactKind: "map_bus_lanes_geojson" as const,
      contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
      routeId: null,
      payload: emptyFeatureCollection,
      featureCount: 0,
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
    const definitions = artifactDefinitions(month);
    const artifacts = definitions.map((definition) => buildMapJsonArtifact(definition));
    const manifest = buildMapArtifactManifest({
      month,
      generatedAt: "2026-06-06T00:00:00.000Z",
      artifacts: artifacts.map((artifact) => artifact.entry),
    });
    const artifactIssues = artifacts.flatMap((artifact, index) =>
      mapArtifactPayloadIssues({
        artifact: artifact.entry,
        payload: definitions[index]?.payload,
        month,
      }),
    );

    expect(
      verifyMapArtifactManifestContents({
        manifestPath: "data/artifacts/maps/2026-03/manifest.json",
        month,
        manifest,
        expectedRouteIds: ["M1"],
        artifactIssues,
      }),
    ).toMatchObject({ status: "pass", artifactCount: 5, issueCount: 0 });

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
