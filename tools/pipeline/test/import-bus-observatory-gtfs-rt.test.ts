import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
  listGtfsRtVehiclePositions,
} from "@bp/db/local";
import { importBusObservatoryGtfsRt } from "../src/jobs/ingest/import-bus-observatory-gtfs-rt.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-import-bus-observatory-gtfs-rt"));
const dbPath = join(testRoot, "pipeline.sqlite");
const csvPath = join(testRoot, "bus-observatory-canonical.csv");

async function writeFixtureCsv(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(
    path,
    [
      [
        "entity_id",
        "timestamp",
        "source_route_id",
        "trip_id",
        "direction_id",
        "vehicle_id",
        "vehicle_label",
        "latitude",
        "longitude",
        "stop_id",
        "current_status",
      ].join(","),
      "entity-1,1772323200,MTA NYCT_B46-SBS,trip-1,0,veh-1,4810,40.1,-73.9,stop-a,STOPPED_AT",
      "entity-2,1772323200,MTA NYCT_B46-SBS,trip-2,0,veh-2,4820,40.2,-73.8,stop-a,IN_TRANSIT_TO",
      "entity-3,1772323230,MTA NYCT_M15-SBS,trip-3,1,veh-3,4830,40.3,-73.7,stop-b,STOPPED_AT",
    ].join("\n"),
  );
}

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("Bus Observatory GTFS-RT import", () => {
  test("imports canonical recovered rows into local GTFS-RT tables", async () => {
    await removeFixtureArtifacts();
    await writeFixtureCsv(csvPath);

    const result = await importBusObservatoryGtfsRt({
      dbPath,
      runId: "bus-observatory-2026-03",
      year: 2026,
      month: 3,
      canonicalCsv: csvPath,
      maxGapSeconds: 60,
    });

    const local = await openLocalPipelineDb(dbPath);
    const runs = await listGtfsRtCollectionRuns(local.db);
    const snapshots = await listGtfsRtFeedSnapshots(local.db, "bus-observatory-2026-03");
    const parsedSnapshots = await listGtfsRtParsedSnapshots(local.db, "bus-observatory-2026-03");
    const positions = await listGtfsRtVehiclePositions(local.db, "bus-observatory-2026-03");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        runId: "bus-observatory-2026-03",
        month: "2026-03",
        provenance: "third_party_recovered",
        sampleCount: 2,
        vehiclePositionCount: 3,
        skippedRowCount: 0,
        routeCount: 2,
        vehicleCount: 3,
      }),
    );
    expect(runs[0]).toEqual(
      expect.objectContaining({
        runId: "bus-observatory-2026-03",
        status: "completed",
        requestedFeedTypes: "vehicle_positions",
        snapshotCount: 2,
        successCount: 2,
      }),
    );
    expect(snapshots.map((snapshot) => snapshot.sampleIndex)).toEqual([1, 2]);
    expect(parsedSnapshots).toEqual([
      expect.objectContaining({ sampleIndex: 1, entityCount: 2, vehiclePositionCount: 2 }),
      expect.objectContaining({ sampleIndex: 2, entityCount: 1, vehiclePositionCount: 1 }),
    ]);
    expect(positions.map((position) => position.routeId).sort()).toEqual([
      "B46-SBS",
      "B46-SBS",
      "M15-SBS",
    ]);
  });
});
