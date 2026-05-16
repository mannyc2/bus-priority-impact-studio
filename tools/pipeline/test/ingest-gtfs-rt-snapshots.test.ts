import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listGtfsRtAlerts,
  listGtfsRtParsedSnapshots,
  listGtfsRtStopTimeUpdates,
  listGtfsRtTripUpdates,
  listGtfsRtVehiclePositions,
} from "@bp/db/local";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { collectGtfsRtSnapshots } from "../src/jobs/collect/collect-gtfs-rt.js";
import { ingestGtfsRtSnapshots } from "../src/jobs/ingest/ingest-gtfs-rt-snapshots.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const { transit_realtime: rt } = GtfsRealtimeBindings;
const testRoot = fromRepoRoot(join("data/working/test-ingest-gtfs-rt"));
const dbPath = join(testRoot, "pipeline.sqlite");
const rawDir = join(testRoot, "raw");

function encodeFeed(message: Parameters<typeof rt.FeedMessage.create>[0]): Uint8Array {
  return rt.FeedMessage.encode(rt.FeedMessage.create(message)).finish();
}

function responseFromBytes(bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body);
}

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("GTFS-RT snapshot ingestion", () => {
  test("parses collected raw snapshots into normalized local rows", async () => {
    await removeFixtureArtifacts();
    const vehicleBytes = encodeFeed({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_779_000_000 },
      entity: [
        {
          id: "vehicle-1",
          vehicle: {
            trip: { tripId: "trip-1", routeId: "MTA NYCT_M1", directionId: 0 },
            vehicle: { id: "bus-1" },
            position: { latitude: 40.741, longitude: -73.989 },
            currentStatus: rt.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
            timestamp: 1_779_000_010,
          },
        },
      ],
    });
    const tripBytes = encodeFeed({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_779_000_000 },
      entity: [
        {
          id: "trip-entity-1",
          tripUpdate: {
            trip: { tripId: "trip-2", routeId: "MTA NYCT_M14A+", directionId: 1 },
            vehicle: { id: "bus-2" },
            timestamp: 1_779_000_020,
            delay: 120,
            stopTimeUpdate: [
              {
                stopSequence: 4,
                stopId: "400004",
                arrival: { delay: 90, time: 1_779_000_200 },
              },
            ],
          },
        },
      ],
    });
    const alertBytes = encodeFeed({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_779_000_000 },
      entity: [
        {
          id: "alert-1",
          alert: {
            cause: rt.Alert.Cause.CONSTRUCTION,
            effect: rt.Alert.Effect.DETOUR,
            informedEntity: [{ routeId: "MTA NYCT_M14A+" }],
          },
        },
      ],
    });

    await collectGtfsRtSnapshots({
      apiKey: "secret-bus-time-key",
      dbPath,
      rawDir,
      runId: "test-run-parse",
      sampleCount: 1,
      feedTypes: ["vehicle_positions", "trip_updates", "alerts"],
      startedAt: new Date("2026-05-16T12:00:00.000Z"),
      fetcher: async (url) => {
        if (url.includes("vehiclePositions")) {
          return responseFromBytes(vehicleBytes);
        }
        if (url.includes("tripUpdates")) {
          return responseFromBytes(tripBytes);
        }
        return responseFromBytes(alertBytes);
      },
      now: () => new Date("2026-05-16T12:00:01.000Z"),
      sleep: async () => {},
    });

    const result = await ingestGtfsRtSnapshots({
      dbPath,
      runId: "test-run-parse",
      parsedAt: new Date("2026-05-16T12:05:00.000Z"),
    });
    const local = await openLocalPipelineDb(dbPath);
    const parsedSnapshots = await listGtfsRtParsedSnapshots(local.db, "test-run-parse");
    const vehiclePositions = await listGtfsRtVehiclePositions(local.db, "test-run-parse");
    const tripUpdates = await listGtfsRtTripUpdates(local.db, "test-run-parse");
    const stopTimeUpdates = await listGtfsRtStopTimeUpdates(local.db, "test-run-parse");
    const alerts = await listGtfsRtAlerts(local.db, "test-run-parse");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        snapshotCount: 3,
        parsedSnapshotCount: 3,
        parseErrorCount: 0,
        vehiclePositionCount: 1,
        tripUpdateCount: 1,
        stopTimeUpdateCount: 1,
        alertCount: 1,
      }),
    );
    expect(parsedSnapshots).toHaveLength(3);
    expect(vehiclePositions[0]).toEqual(
      expect.objectContaining({
        feedType: "vehicle_positions",
        routeId: "M1",
        vehicleId: "bus-1",
        currentStatus: "IN_TRANSIT_TO",
      }),
    );
    expect(tripUpdates[0]).toEqual(
      expect.objectContaining({
        feedType: "trip_updates",
        routeId: "M14A+",
        delay: 120,
      }),
    );
    expect(stopTimeUpdates[0]).toEqual(
      expect.objectContaining({
        entityId: "trip-entity-1",
        stopId: "400004",
        arrivalDelay: 90,
      }),
    );
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        feedType: "alerts",
        cause: "CONSTRUCTION",
        effect: "DETOUR",
      }),
    );
  });

  test("records parse errors for malformed raw snapshots", async () => {
    await removeFixtureArtifacts();

    await collectGtfsRtSnapshots({
      apiKey: "secret-bus-time-key",
      dbPath,
      rawDir,
      runId: "test-run-parse-error",
      sampleCount: 1,
      feedTypes: ["vehicle_positions"],
      startedAt: new Date("2026-05-16T12:00:00.000Z"),
      fetcher: async () => new Response(new Uint8Array([255, 255])),
      now: () => new Date("2026-05-16T12:00:01.000Z"),
      sleep: async () => {},
    });

    const result = await ingestGtfsRtSnapshots({
      dbPath,
      runId: "test-run-parse-error",
      parsedAt: new Date("2026-05-16T12:05:00.000Z"),
    });
    const local = await openLocalPipelineDb(dbPath);
    const parsedSnapshots = await listGtfsRtParsedSnapshots(local.db, "test-run-parse-error");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        snapshotCount: 1,
        parsedSnapshotCount: 0,
        parseErrorCount: 1,
      }),
    );
    expect(parsedSnapshots[0]).toEqual(
      expect.objectContaining({
        status: "parse_error",
        entityCount: 0,
      }),
    );
  });
});
