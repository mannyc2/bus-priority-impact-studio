import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listObservedHeadwaySamples,
  listObservedVehicleStopEvents,
  replaceGtfsRtParsedSnapshot,
} from "@bp/db/local";
import { buildObservedHeadways } from "../src/jobs/build/observed-headways.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-observed-headways"));
const dbPath = join(testRoot, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

async function writeVehiclePositions(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceGtfsRtParsedSnapshot(local.db, {
      parsedSnapshot: {
        runId: "test-run-headways",
        feedType: "vehicle_positions",
        sampleIndex: 1,
        parsedAt: "2026-05-16T12:00:00.000Z",
        status: "parsed",
        gtfsRealtimeVersion: "2.0",
        feedTimestamp: 1_779_000_000,
        entityCount: 4,
        vehiclePositionCount: 4,
        tripUpdateCount: 0,
        stopTimeUpdateCount: 0,
        alertCount: 0,
        error: null,
      },
      vehiclePositions: [
        {
          runId: "test-run-headways",
          feedType: "vehicle_positions",
          sampleIndex: 1,
          entityId: "entity-bus-1",
          entityDeleted: false,
          gtfsRealtimeVersion: "2.0",
          feedTimestamp: 1_779_000_000,
          sourceRouteId: "MTA NYCT_M1",
          routeId: "M1",
          tripId: "trip-1",
          startDate: null,
          startTime: null,
          directionId: 0,
          scheduleRelationship: "SCHEDULED",
          vehicleId: "bus-1",
          vehicleLabel: null,
          vehicleLicensePlate: null,
          latitude: 40.741,
          longitude: -73.989,
          bearing: null,
          odometer: null,
          speed: null,
          currentStopSequence: null,
          stopId: "400001",
          currentStatus: "STOPPED_AT",
          timestamp: 1_779_000_000,
          congestionLevel: null,
          occupancyStatus: null,
          occupancyPercentage: null,
        },
        {
          runId: "test-run-headways",
          feedType: "vehicle_positions",
          sampleIndex: 2,
          entityId: "entity-bus-1-duplicate",
          entityDeleted: false,
          gtfsRealtimeVersion: "2.0",
          feedTimestamp: 1_779_000_030,
          sourceRouteId: "MTA NYCT_M1",
          routeId: "M1",
          tripId: "trip-1",
          startDate: null,
          startTime: null,
          directionId: 0,
          scheduleRelationship: "SCHEDULED",
          vehicleId: "bus-1",
          vehicleLabel: null,
          vehicleLicensePlate: null,
          latitude: 40.741,
          longitude: -73.989,
          bearing: null,
          odometer: null,
          speed: null,
          currentStopSequence: null,
          stopId: "400001",
          currentStatus: "STOPPED_AT",
          timestamp: 1_779_000_030,
          congestionLevel: null,
          occupancyStatus: null,
          occupancyPercentage: null,
        },
        {
          runId: "test-run-headways",
          feedType: "vehicle_positions",
          sampleIndex: 3,
          entityId: "entity-bus-2",
          entityDeleted: false,
          gtfsRealtimeVersion: "2.0",
          feedTimestamp: 1_779_000_360,
          sourceRouteId: "MTA NYCT_M1",
          routeId: "M1",
          tripId: "trip-2",
          startDate: null,
          startTime: null,
          directionId: 0,
          scheduleRelationship: "SCHEDULED",
          vehicleId: "bus-2",
          vehicleLabel: null,
          vehicleLicensePlate: null,
          latitude: 40.741,
          longitude: -73.989,
          bearing: null,
          odometer: null,
          speed: null,
          currentStopSequence: null,
          stopId: "400001",
          currentStatus: "STOPPED_AT",
          timestamp: 1_779_000_360,
          congestionLevel: null,
          occupancyStatus: null,
          occupancyPercentage: null,
        },
        {
          runId: "test-run-headways",
          feedType: "vehicle_positions",
          sampleIndex: 4,
          entityId: "missing-stop",
          entityDeleted: false,
          gtfsRealtimeVersion: "2.0",
          feedTimestamp: 1_779_000_400,
          sourceRouteId: "MTA NYCT_M1",
          routeId: "M1",
          tripId: "trip-3",
          startDate: null,
          startTime: null,
          directionId: 0,
          scheduleRelationship: "SCHEDULED",
          vehicleId: "bus-3",
          vehicleLabel: null,
          vehicleLicensePlate: null,
          latitude: null,
          longitude: null,
          bearing: null,
          odometer: null,
          speed: null,
          currentStopSequence: null,
          stopId: null,
          currentStatus: "STOPPED_AT",
          timestamp: 1_779_000_400,
          congestionLevel: null,
          occupancyStatus: null,
          occupancyPercentage: null,
        },
      ],
      tripUpdates: [],
      stopTimeUpdates: [],
      alerts: [],
    });
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("observed headway build", () => {
  test("collapses duplicate vehicle observations and computes stop headways", async () => {
    await removeFixtureArtifacts();
    await writeVehiclePositions();

    const result = await buildObservedHeadways({ dbPath, runId: "test-run-headways" });
    const local = await openLocalPipelineDb(dbPath);
    const stopEvents = await listObservedVehicleStopEvents(local.db, "test-run-headways");
    const headways = await listObservedHeadwaySamples(local.db, "test-run-headways");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        vehiclePositionCount: 4,
        stopEventCount: 2,
        headwaySampleCount: 1,
      }),
    );
    expect(stopEvents.map((event) => event.vehicleKey)).toEqual(["bus-1", "bus-2"]);
    expect(headways[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        stopId: "400001",
        previousVehicleKey: "bus-1",
        vehicleKey: "bus-2",
        headwaySeconds: 360,
        headwayMinutes: 6,
      }),
    );
  });
});
