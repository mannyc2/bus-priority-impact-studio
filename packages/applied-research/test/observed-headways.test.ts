import { describe, expect, test } from "bun:test";
import type { LocalGtfsRtVehiclePosition } from "@bp/db/local";
import { deriveObservedHeadwayRows } from "../src/local-db";

function vehiclePosition(
  overrides: Partial<LocalGtfsRtVehiclePosition>,
): LocalGtfsRtVehiclePosition {
  return {
    runId: "gtfs-rt-test",
    feedType: "vehicle_positions",
    sampleIndex: 0,
    entityId: "entity-0",
    entityDeleted: false,
    gtfsRealtimeVersion: "2.0",
    feedTimestamp: 1_779_000_000,
    sourceRouteId: null,
    routeId: null,
    tripId: null,
    startDate: null,
    startTime: null,
    directionId: null,
    scheduleRelationship: null,
    vehicleId: null,
    vehicleLabel: null,
    vehicleLicensePlate: null,
    latitude: null,
    longitude: null,
    bearing: null,
    odometer: null,
    speed: null,
    currentStopSequence: null,
    stopId: null,
    currentStatus: null,
    timestamp: null,
    congestionLevel: null,
    occupancyStatus: null,
    occupancyPercentage: null,
    ...overrides,
  };
}

describe("observed headway derivation", () => {
  test("deduplicates stop observations and derives bounded successive-vehicle headways", () => {
    const rows = deriveObservedHeadwayRows("gtfs-rt-test", [
      vehiclePosition({
        sampleIndex: 2,
        entityId: "entity-a-late",
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        vehicleId: "vehicle-a",
        vehicleLabel: "A",
        timestamp: 1_000,
        currentStatus: "STOPPED_AT",
        latitude: 40.7,
        longitude: -73.9,
      }),
      vehiclePosition({
        sampleIndex: 1,
        entityId: "entity-a-early",
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        vehicleId: "vehicle-a",
        vehicleLabel: "A",
        timestamp: 990,
      }),
      vehiclePosition({
        sampleIndex: 3,
        entityId: "entity-b",
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        vehicleId: "vehicle-b",
        vehicleLabel: "B",
        timestamp: 1_350,
      }),
      vehiclePosition({
        sampleIndex: 4,
        entityId: "entity-c",
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        tripId: "trip-c",
        timestamp: 1_710,
      }),
      vehiclePosition({
        sampleIndex: 5,
        entityId: "missing-stop",
        routeId: "M15",
        directionId: 0,
        stopId: null,
        vehicleId: "vehicle-d",
        timestamp: 1_900,
      }),
      vehiclePosition({
        sampleIndex: 6,
        entityId: "long-gap",
        routeId: "M15",
        directionId: 0,
        stopId: "401001",
        vehicleId: "vehicle-e",
        timestamp: 30_000,
      }),
    ]);

    expect(
      rows.stopEvents.map((event) => [
        event.eventRank,
        event.vehicleKey,
        event.observedTimestamp,
        event.sampleIndex,
      ]),
    ).toEqual([
      [1, "vehicle-a", 990, 1],
      [2, "vehicle-b", 1_350, 3],
      [3, "trip-c", 1_710, 4],
      [4, "vehicle-e", 30_000, 6],
    ]);
    expect(rows.headwaySamples).toEqual([
      {
        runId: "gtfs-rt-test",
        sampleRank: 1,
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        previousVehicleKey: "vehicle-a",
        vehicleKey: "vehicle-b",
        previousObservedTimestamp: 990,
        observedTimestamp: 1_350,
        headwaySeconds: 360,
        headwayMinutes: 6,
      },
      {
        runId: "gtfs-rt-test",
        sampleRank: 2,
        routeId: "M15",
        sourceRouteId: "M15-SBS",
        directionId: 0,
        stopId: "401001",
        previousVehicleKey: "vehicle-b",
        vehicleKey: "trip-c",
        previousObservedTimestamp: 1_350,
        observedTimestamp: 1_710,
        headwaySeconds: 360,
        headwayMinutes: 6,
      },
    ]);
  });
});
