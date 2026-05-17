import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listGtfsRtCollectionRuns, listGtfsRtFeedSnapshots } from "@bp/db/local";
import { importGtfsRtR2Manifests } from "../src/jobs/ingest/import-gtfs-rt-r2-manifests.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-import-gtfs-rt-r2-manifests"));
const dbPath = join(testRoot, "pipeline.sqlite");
const mirrorRoot = join(testRoot, "r2");
const manifestRoot = join(mirrorRoot, "gtfs-rt/vehicle_positions/2026-05-17");

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(value, null, 2));
}

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("GTFS-RT Worker/R2 manifest import", () => {
  test("registers Worker manifests as a completed local collection run", async () => {
    await removeFixtureArtifacts();
    await writeJson(join(manifestRoot, "2026-05-17T120030000Z.json"), {
      feedType: "vehicle_positions",
      fetchedAt: "2026-05-17T12:00:30.000Z",
      objectKey: "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120030000Z.pb",
      byteLength: 4,
      sha256: "b".repeat(64),
      sourceUrl: "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=REDACTED",
    });
    await writeJson(join(manifestRoot, "2026-05-17T120000000Z.json"), {
      feedType: "vehicle_positions",
      fetchedAt: "2026-05-17T12:00:00.000Z",
      objectKey: "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120000000Z.pb",
      byteLength: 3,
      sha256: "a".repeat(64),
      sourceUrl: "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=REDACTED",
    });

    const result = await importGtfsRtR2Manifests({
      dbPath,
      runId: "worker-r2-run",
      manifestRoot,
      rawRoot: mirrorRoot,
      sampleSeconds: 30,
    });
    const local = await openLocalPipelineDb(dbPath);
    const runs = await listGtfsRtCollectionRuns(local.db);
    const snapshots = await listGtfsRtFeedSnapshots(local.db, "worker-r2-run");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        runId: "worker-r2-run",
        manifestCount: 2,
        snapshotCount: 2,
        startedAt: "2026-05-17T12:00:00.000Z",
        endedAt: "2026-05-17T12:00:30.000Z",
      }),
    );
    expect(runs[0]).toEqual(
      expect.objectContaining({
        runId: "worker-r2-run",
        status: "completed",
        sampleSeconds: 30,
        requestedFeedTypes: "vehicle_positions",
        snapshotCount: 2,
        successCount: 2,
      }),
    );
    expect(snapshots.map((snapshot) => snapshot.sampleIndex)).toEqual([1, 2]);
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        sourceId: "bus_time_gtfsrt_vehicle_positions",
        rawPath: join(mirrorRoot, "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120000000Z.pb"),
        redactedUrl: "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=REDACTED",
      }),
    );
  });
});
