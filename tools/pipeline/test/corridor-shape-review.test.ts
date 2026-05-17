import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceCorridorRows,
  replaceRouteBriefRows,
  replaceRouteHotspots,
  replaceRouteSegmentSpeeds,
} from "@bp/db/local";
import {
  buildCorridorShapeReview,
  corridorShapeReviewArtifactPath,
} from "../src/jobs/build/corridor-shape-review.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-03";
const workingDir = fromRepoRoot(join("data/working/test-corridor-shape-review"));
const dbPath = join(workingDir, "pipeline.sqlite");
const artifactRoot = join(workingDir, "artifacts");
const shapeSnapshotPath = join(workingDir, "current_bus_routes.json");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

async function writeRouteShapeSnapshot(): Promise<void> {
  await mkdir(workingDir, { recursive: true });
  await Bun.write(
    shapeSnapshotPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "current_bus_routes",
        fetchedAt: "2026-03-01T00:00:00.000Z",
        rows: [
          {
            route_id: "T1",
            route_short_name: "T1",
            in_effect: "true",
            direction_id: "0",
            direction: "N",
            shape_id: "shape-t1",
            geometry: {
              type: "LineString",
              coordinates: [
                [-73.91, 40.7],
                [-73.9, 40.71],
              ],
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

async function writeFixtureNetwork(): Promise<void> {
  await removeFixtureArtifacts();
  await writeRouteShapeSnapshot();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "T1",
        month: isoMonth,
        routeScore: 40,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 6,
        hotspotCount: 1,
        totalRidership: 1000,
        totalTransfers: 100,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 0.5,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteSegmentSpeeds(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        timestamp: "2026-03-01T00:00:00.000Z",
        dayOfWeek: "Monday",
        hourOfDay: 8,
        direction: "N",
        borough: "Brooklyn",
        routeType: "Local",
        stopOrder: 1,
        timepointStopId: "S1",
        timepointStopName: "BROADWAY/MARCY AV",
        timepointStopLatitude: 40.7,
        timepointStopLongitude: -73.91,
        nextTimepointStopId: "S2",
        nextTimepointStopName: "BROADWAY/KEAP ST",
        nextTimepointStopLatitude: 40.71,
        nextTimepointStopLongitude: -73.9,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 8,
        averageRoadSpeedMph: 6,
        busTripCount: 100,
      },
    ]);
    await replaceRouteHotspots(
      local.db,
      {
        routeId: "T1",
        isoMonth,
        generatedAt: "2026-04-01T00:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 10,
        busTripCount: 100,
        ridershipWeighted: true,
        ridershipWindowCount: 1,
        ridershipMatchedObservationCount: 1,
        ridershipExposure: 1000,
        segmentCount: 1,
        hotspotCount: 1,
      },
      [
        {
          routeId: "T1",
          isoMonth,
          hotspotRank: 1,
          segmentId: "N:1:S1:S2",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "S1",
          timepointStopName: "BROADWAY/MARCY AV",
          nextTimepointStopId: "S2",
          nextTimepointStopName: "BROADWAY/KEAP ST",
          observationCount: 10,
          busTripCount: 100,
          weightedAverageSpeedMph: 6,
          weightedAverageTravelTimeMinutes: 8,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.8,
          speedSeverity: 0.6,
          hotspotScore: 80,
        },
      ],
    );
    await replaceCorridorRows(local.db, isoMonth, {
      corridors: [
        {
          corridorId: "street:broadway",
          corridorName: "Broadway",
          corridorKey: "BROADWAY",
          derivationMethod: "primary_route_hotspot_segment_street",
        },
      ],
      routeMembers: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          routeId: "T1",
          assignmentStatus: "assigned",
          assignmentReason: "primary_hotspot_segment_street",
          stopCount: 2,
          matchedStopCount: 2,
          hotspotCount: 1,
          matchedSegmentCount: 1,
          segmentEvidenceScore: 80,
          totalRidership: 1000,
          averageSpeedMph: 6,
        },
      ],
      summaries: [],
      hotspots: [],
    });
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("corridor shape review", () => {
  test("writes a shape review artifact for segment-backed corridor memberships", async () => {
    await writeFixtureNetwork();

    const result = await buildCorridorShapeReview({
      year: 2026,
      month: 3,
      dbPath,
      artifactRoot,
      routeShapeSnapshotPath: shapeSnapshotPath,
    });
    const artifact = await Bun.file(corridorShapeReviewArtifactPath(artifactRoot, isoMonth)).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        publicRouteCount: 1,
        segmentBackedRouteCount: 1,
        shapeReviewedRouteCount: 1,
        passRouteCount: 1,
        warningRouteCount: 0,
        missingShapeRouteCount: 0,
      }),
    );
    expect(artifact).toEqual(
      expect.objectContaining({
        artifactKind: "corridor_shape_review",
        month: isoMonth,
        summary: expect.objectContaining({
          passRouteCount: 1,
        }),
        routes: [
          expect.objectContaining({
            routeId: "T1",
            corridorId: "street:broadway",
            reviewStatus: "pass",
            reviewedSegmentCount: 1,
            maxEndpointDistanceMeters: 0,
          }),
        ],
      }),
    );
  });
});
