import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  mapArtifactKey,
  mapArtifactManifestPath,
  mapArtifactPath,
  routeSegmentMapArtifactKey,
} from "../src/artifacts";
import {
  buildMapArtifactManifest,
  buildMapJsonArtifact,
  MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
  MAP_ARTIFACT_JSON_CONTENT_TYPE,
  verifyMapArtifactManifest,
} from "../src/evaluation";

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, bytes);
}

const emptyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

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

describe("map artifact manifest builders", () => {
  test("builds a manifest and verifies required map artifacts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bp-map-artifacts-"));
    try {
      const month = "2026-03";
      const generatedAt = "2026-06-06T00:00:00.000Z";
      const definitions = [
        {
          path: mapArtifactPath(tmp, "sources", "source-snapshot.json"),
          artifactKey: mapArtifactKey("sources", "source-snapshot.json"),
          artifactKind: "map_source_snapshot" as const,
          contentType: MAP_ARTIFACT_JSON_CONTENT_TYPE,
          routeId: null,
          payload: {
            schemaVersion: 1,
            artifactKind: "map_source_snapshot",
            analysisPeriod: month,
            generatedAt,
            sources: [{ sourceId: "current_bus_routes", status: "available" }],
          },
          featureCount: 1,
        },
        {
          path: mapArtifactPath(tmp, "routes", "current-local-limited-sbs.min.geojson"),
          artifactKey: mapArtifactKey("routes", "current-local-limited-sbs.min.geojson"),
          artifactKind: "map_route_shapes_geojson" as const,
          contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
          routeId: null,
          payload: emptyFeatureCollection,
          featureCount: 0,
        },
        {
          path: mapArtifactPath(tmp, "stops", "current-timepoints.min.geojson"),
          artifactKey: mapArtifactKey("stops", "current-timepoints.min.geojson"),
          artifactKind: "map_timepoint_stops_geojson" as const,
          contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
          routeId: null,
          payload: emptyFeatureCollection,
          featureCount: 0,
        },
        {
          path: mapArtifactPath(tmp, "bus-lanes", "local-streets.min.geojson"),
          artifactKey: mapArtifactKey("bus-lanes", "local-streets.min.geojson"),
          artifactKind: "map_bus_lanes_geojson" as const,
          contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
          routeId: null,
          payload: emptyFeatureCollection,
          featureCount: 0,
        },
        {
          path: join(tmp, routeSegmentMapArtifactKey("M1", month)),
          artifactKey: routeSegmentMapArtifactKey("M1", month),
          artifactKind: "map_route_segments_geojson" as const,
          contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
          routeId: "M1",
          payload: routeSegmentFeatureCollection(month, "M1"),
          featureCount: 1,
        },
      ];

      const artifacts = definitions.map((definition) => buildMapJsonArtifact(definition));
      for (const [index, artifact] of artifacts.entries()) {
        await writeBytes(definitions[index]?.path ?? "", artifact.bytes);
      }
      const manifest = buildMapArtifactManifest({
        month,
        generatedAt,
        artifacts: artifacts.map((artifact) => artifact.entry),
      });
      await writeBytes(
        mapArtifactManifestPath(tmp, month),
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      );

      await expect(
        verifyMapArtifactManifest({ artifactRoot: tmp, month, expectedRouteIds: ["M1"] }),
      ).resolves.toMatchObject({
        status: "pass",
        artifactCount: 5,
        routeSegmentArtifactCount: 1,
        totalFeatureCount: 2,
        issueCount: 0,
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("reports tampered files and missing public route segment artifacts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bp-map-artifacts-"));
    try {
      const month = "2026-03";
      const routeKey = routeSegmentMapArtifactKey("M1", month);
      const artifact = buildMapJsonArtifact({
        artifactKey: routeKey,
        artifactKind: "map_route_segments_geojson",
        contentType: MAP_ARTIFACT_GEOJSON_CONTENT_TYPE,
        routeId: "M1",
        payload: routeSegmentFeatureCollection(month, "M1"),
        featureCount: 1,
      });
      await writeBytes(join(tmp, routeKey), artifact.bytes);
      await Bun.write(join(tmp, routeKey), '{"tampered":true}\n');
      const manifest = buildMapArtifactManifest({
        month,
        generatedAt: "2026-06-06T00:00:00.000Z",
        artifacts: [artifact.entry],
      });
      await writeBytes(
        mapArtifactManifestPath(tmp, month),
        new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      );

      const verification = await verifyMapArtifactManifest({
        artifactRoot: tmp,
        month,
        expectedRouteIds: ["M1", "B41"],
      });

      expect(verification.status).toBe("fail");
      expect(verification.issues.map((issue) => issue.code)).toContain(
        "map_artifact_hash_mismatch",
      );
      expect(verification.issues.map((issue) => issue.code)).toContain(
        "map_route_segment_artifact_routes_missing",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
