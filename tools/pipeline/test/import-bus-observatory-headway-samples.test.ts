import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  listGtfsRtCollectionRuns,
  listGtfsRtFeedSnapshots,
  listGtfsRtParsedSnapshots,
  listGtfsRtVehiclePositions,
  listObservedHeadwaySamples,
} from "@bp/db/local";
import { importBusObservatoryHeadwaySamples } from "../src/jobs/ingest/import-bus-observatory-headway-samples.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-import-bus-observatory-headway-samples"));
const dbPath = join(testRoot, "pipeline.sqlite");
const snapshotsCsv = join(testRoot, "snapshots.csv");
const samplesCsv = join(testRoot, "headway-samples.csv");

async function writeFixtureCsvs(): Promise<void> {
  await mkdir(dirname(snapshotsCsv), { recursive: true });
  await Bun.write(
    snapshotsCsv,
    [
      "sample_index,timestamp,entity_count,vehicle_position_count,source_route_id,route_id,direction_id,vehicle_id,stop_id,latitude,longitude",
      "1,1772323200,2,2,MTA NYCT_B46-SBS,B46-SBS,0,veh-1,stop-a,40.1,-73.9",
      "2,1772323230,3,3,MTA NYCT_B46-SBS,B46-SBS,0,veh-2,stop-a,40.2,-73.8",
    ].join("\n"),
  );
  await Bun.write(
    samplesCsv,
    [
      "sample_rank,route_id,source_route_id,direction_id,stop_id,previous_vehicle_key,vehicle_key,previous_observed_timestamp,observed_timestamp,headway_seconds,headway_minutes",
      "1,B46-SBS,MTA NYCT_B46-SBS,0,stop-a,veh-1,veh-2,1772323200,1772323230,30,0.5",
      "2,B46-SBS,MTA NYCT_B46-SBS,0,stop-a,veh-2,veh-3,1772323230,1772323260,30,0.5",
    ].join("\n"),
  );
}

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("Bus Observatory headway sample import", () => {
  test("imports recovered run metadata, parsed snapshot evidence, and headway samples", async () => {
    await removeFixtureArtifacts();
    await writeFixtureCsvs();

    const result = await importBusObservatoryHeadwaySamples({
      dbPath,
      year: 2026,
      month: 3,
      runId: "bus-observatory-2026-03",
      snapshotsCsv,
      headwaySamplesCsv: samplesCsv,
    });

    const local = await openLocalPipelineDb(dbPath);
    const [runs, snapshots, parsedSnapshots, vehiclePositions, headwaySamples] = await Promise.all([
      listGtfsRtCollectionRuns(local.db),
      listGtfsRtFeedSnapshots(local.db, "bus-observatory-2026-03"),
      listGtfsRtParsedSnapshots(local.db, "bus-observatory-2026-03"),
      listGtfsRtVehiclePositions(local.db, "bus-observatory-2026-03"),
      listObservedHeadwaySamples(local.db, "bus-observatory-2026-03"),
    ]);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        snapshotCount: 2,
        parsedSnapshotCount: 2,
        vehiclePositionEvidenceCount: 2,
        headwaySampleCount: 2,
        routeCount: 1,
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
    expect(parsedSnapshots.map((snapshot) => snapshot.vehiclePositionCount)).toEqual([2, 3]);
    expect(vehiclePositions.map((position) => position.entityId)).toEqual([
      "snapshot-1",
      "snapshot-2",
    ]);
    expect(headwaySamples.map((sample) => sample.headwaySeconds)).toEqual([30, 30]);
  });
});
