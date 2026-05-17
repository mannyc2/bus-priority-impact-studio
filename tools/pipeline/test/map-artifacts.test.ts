import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  replaceBusLanes,
  replaceRouteBriefRows,
  replaceRouteHotspots,
  replaceRouteSegmentSpeeds,
} from "@bp/db/local";
import {
  buildMapArtifacts,
  mapArtifactManifestPath,
  readMapArtifactManifest,
  verifyMapArtifactManifest,
} from "../src/jobs/build/map-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-10";
const workingDir = fromRepoRoot(join("data/working/test-map-artifacts"));
const dbPath = join(workingDir, "pipeline.sqlite");
const artifactRoot = join(workingDir, "artifacts");
const routeShapeSnapshotPath = join(workingDir, "raw", "current_bus_routes.json");
const stopSnapshotPath = join(workingDir, "raw", "current_bus_stops.json");
const busLaneSnapshotPath = join(workingDir, "raw", "bus-lanes-local-streets.json");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeRawSnapshot(path: string, sourceId: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId,
        fetchedAt: "2026-10-01T00:00:00.000Z",
        query: {},
        rows,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeRawFixtures(): Promise<void> {
  await writeRawSnapshot(routeShapeSnapshotPath, "current_bus_routes", [
    {
      route_id: "T1",
      route_short_name: "T1",
      route_long_name: "Fixture Route",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      shape_id: "shape-t1-n",
      route_type: "Local",
      geometry: {
        type: "LineString",
        coordinates: [
          [-73.99, 40.7],
          [-73.98, 40.71],
          [-73.97, 40.72],
        ],
      },
    },
  ]);
  await writeRawSnapshot(stopSnapshotPath, "current_bus_stops", [
    {
      route_id: "T1",
      route_short_name: "T1",
      stop_id: "S1",
      stop_name: "Start Stop",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      timepoint: "1",
      latitude: "40.7",
      longitude: "-73.99",
    },
    {
      route_id: "T1",
      route_short_name: "T1",
      stop_id: "S2",
      stop_name: "End Stop",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      timepoint: "1",
      latitude: "40.72",
      longitude: "-73.97",
    },
  ]);
  await writeRawSnapshot(busLaneSnapshotPath, "nyc_dot_bus_lanes_local_streets", [
    {
      segmentid: "BL1",
      street: "Fixture St",
      boro: "MAN",
      facility: "Bus Lane",
      the_geom: {
        type: "LineString",
        coordinates: [
          [-73.99, 40.7],
          [-73.98, 40.71],
        ],
      },
    },
  ]);
}

async function writeDbFixtures(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "T1",
        month: isoMonth,
        routeScore: 55,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 7,
        hotspotCount: 1,
        totalRidership: 100,
        totalTransfers: 10,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 1,
        scheduleMatchRate: 0.8,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteSegmentSpeeds(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        timestamp: "2026-10-01T08:00:00.000Z",
        dayOfWeek: "weekday",
        hourOfDay: 8,
        direction: "N",
        borough: "Manhattan",
        routeType: "Local",
        stopOrder: 1,
        timepointStopId: "S1",
        timepointStopName: "Start Stop",
        timepointStopLatitude: 40.7,
        timepointStopLongitude: -73.99,
        nextTimepointStopId: "S2",
        nextTimepointStopName: "End Stop",
        nextTimepointStopLatitude: 40.72,
        nextTimepointStopLongitude: -73.97,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 10,
        averageRoadSpeedMph: 6,
        busTripCount: 10,
      },
      {
        routeId: "T1",
        isoMonth,
        timestamp: "2026-10-01T09:00:00.000Z",
        dayOfWeek: "weekday",
        hourOfDay: 9,
        direction: "N",
        borough: "Manhattan",
        routeType: "Local",
        stopOrder: 1,
        timepointStopId: "S1",
        timepointStopName: "Start Stop",
        timepointStopLatitude: 40.7,
        timepointStopLongitude: -73.99,
        nextTimepointStopId: "S2",
        nextTimepointStopName: "End Stop",
        nextTimepointStopLatitude: 40.72,
        nextTimepointStopLongitude: -73.97,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 8,
        averageRoadSpeedMph: 8,
        busTripCount: 30,
      },
    ]);
    await replaceRouteHotspots(
      local.db,
      {
        routeId: "T1",
        isoMonth,
        generatedAt: "2026-10-01T00:00:00.000Z",
        routeWeightedAverageSpeedMph: 7.5,
        observationCount: 2,
        busTripCount: 40,
        ridershipWeighted: false,
        ridershipWindowCount: 0,
        ridershipMatchedObservationCount: 0,
        ridershipExposure: 0,
        segmentCount: 1,
        hotspotCount: 1,
      },
      [
        {
          routeId: "T1",
          isoMonth,
          segmentId: "N:1:S1:S2",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "S1",
          timepointStopName: "Start Stop",
          nextTimepointStopId: "S2",
          nextTimepointStopName: "End Stop",
          observationCount: 2,
          busTripCount: 40,
          weightedAverageSpeedMph: 7.5,
          weightedAverageTravelTimeMinutes: 9,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.5,
          speedSeverity: 50,
          hotspotScore: 75,
        },
      ],
    );
    await replaceBusLanes(local.db, [
      {
        segmentId: "BL1",
        street: "Fixture St",
        borough: "MAN",
        facility: "Bus Lane",
        coordinates: [
          { longitude: -73.99, latitude: 40.7 },
          { longitude: -73.98, latitude: 40.71 },
        ],
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

async function writeFixtures(): Promise<void> {
  await removeFixtureArtifacts();
  await writeRawFixtures();
  await writeDbFixtures();
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("map artifacts", () => {
  test("writes hashed map payloads and verifies route segment contracts", async () => {
    await writeFixtures();

    const result = await buildMapArtifacts({
      year: 2026,
      month: 10,
      dbPath,
      artifactRoot,
      routeShapeSnapshotPath,
      stopSnapshotPath,
      busLaneSnapshotPath,
    });
    const manifest = await readMapArtifactManifest({ artifactRoot, month: isoMonth });
    const routeSegments = await Bun.file(
      join(artifactRoot, "map", "route-segments", "t1", isoMonth, "all-day.geojson"),
    ).json();
    const verification = await verifyMapArtifactManifest({
      artifactRoot,
      month: isoMonth,
      expectedRouteIds: ["T1"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        manifestPath: mapArtifactManifestPath(artifactRoot, isoMonth),
        artifactCount: 5,
        routeSegmentArtifactCount: 1,
        routeSegmentFeatureCount: 1,
        publicRouteCount: 1,
      }),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        artifactKind: "map_artifact_manifest",
        analysisPeriod: isoMonth,
        artifactCount: 5,
        routeSegmentArtifactCount: 1,
        issueCount: 0,
      }),
    );
    expect(routeSegments.features).toEqual([
      expect.objectContaining({
        id: "route-segment:T1:2026-10:N:1:S1:S2",
        geometry: expect.objectContaining({
          type: "LineString",
          coordinates: [
            [-73.99, 40.7],
            [-73.98, 40.71],
            [-73.97, 40.72],
          ],
        }),
        properties: expect.objectContaining({
          routeId: "T1",
          directionId: "0",
          averageSpeedMph: 7.5,
          hotspotScore: 75,
          rankOnRoute: 1,
        }),
      }),
    ]);
    expect(verification).toEqual(
      expect.objectContaining({
        status: "pass",
        issueCount: 0,
        artifactCount: 5,
        routeSegmentArtifactCount: 1,
      }),
    );
  });

  test("reports hash and route coverage issues", async () => {
    await writeFixtures();
    await buildMapArtifacts({
      year: 2026,
      month: 10,
      dbPath,
      artifactRoot,
      routeShapeSnapshotPath,
      stopSnapshotPath,
      busLaneSnapshotPath,
    });
    await Bun.write(
      join(artifactRoot, "map", "route-segments", "t1", isoMonth, "all-day.geojson"),
      `${JSON.stringify({ type: "FeatureCollection", features: [] }, null, 2)}\n`,
    );

    const verification = await verifyMapArtifactManifest({
      artifactRoot,
      month: isoMonth,
      expectedRouteIds: ["T1", "T2"],
    });

    expect(verification.status).toBe("fail");
    expect(verification.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "map_route_segment_artifact_routes_missing",
        "map_artifact_hash_mismatch",
        "map_artifact_payload_feature_count_mismatch",
      ]),
    );
  });
});
