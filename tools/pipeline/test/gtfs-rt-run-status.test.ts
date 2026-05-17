import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
  replaceGtfsRtParsedSnapshot,
} from "@bp/db/local";
import {
  getGtfsRtRunStatus,
  gtfsRtRunStatusArtifactPath,
} from "../src/jobs/check/gtfs-rt-run-status.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-gtfs-rt-run-status"));
const dbPath = join(testRoot, "pipeline.sqlite");
const dbArg = ` --db ${JSON.stringify(dbPath)}`;
const rawDir = join(testRoot, "raw");
const artifactRoot = join(testRoot, "artifacts");
const artifactRootArg = ` --artifact-root ${JSON.stringify(artifactRoot)}`;

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

async function writeCollectionRun(input: {
  runId: string;
  status: "running" | "completed";
  requestedDurationSeconds: number;
  sampleSeconds: number;
  endedAt?: string | null;
  snapshotCount?: number;
}): Promise<void> {
  await mkdir(rawDir, { recursive: true });
  const local = await openLocalPipelineDb(dbPath);
  try {
    await insertGtfsRtCollectionRun(local.db, {
      runId: input.runId,
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: input.endedAt ?? null,
      status: input.status,
      requestedDurationSeconds: input.requestedDurationSeconds,
      sampleSeconds: input.sampleSeconds,
      requestedFeedTypes: "vehicle_positions",
      snapshotCount: input.snapshotCount ?? 0,
      successCount: input.snapshotCount ?? 0,
      failureCount: 0,
      rawDirectory: rawDir,
      error: null,
    });
  } finally {
    local.sqlite.close();
  }
}

async function writeSnapshot(runId: string, sampleIndex: number): Promise<void> {
  const rawPath = join(rawDir, `${String(sampleIndex).padStart(4, "0")}-vehicle_positions.pb`);
  await Bun.write(rawPath, new Uint8Array([sampleIndex, sampleIndex + 1]));

  const local = await openLocalPipelineDb(dbPath);
  try {
    await insertGtfsRtFeedSnapshot(local.db, {
      runId,
      feedType: "vehicle_positions",
      sampleIndex,
      sourceId: "bus_time_gtfsrt_vehicle_positions",
      fetchedAt: new Date(Date.UTC(2026, 4, 17, 10, sampleIndex - 1, 0)).toISOString(),
      status: "ok",
      httpStatus: 200,
      byteLength: 2,
      sha256: `fixture-${sampleIndex}`,
      rawPath,
      redactedUrl: "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<redacted>",
      error: null,
    });
  } finally {
    local.sqlite.close();
  }
}

async function writeParsedSnapshot(runId: string, sampleIndex: number): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceGtfsRtParsedSnapshot(local.db, {
      parsedSnapshot: {
        runId,
        feedType: "vehicle_positions",
        sampleIndex,
        parsedAt: "2026-05-17T10:05:00.000Z",
        status: "parsed",
        gtfsRealtimeVersion: "2.0",
        feedTimestamp: 1_779_012_000,
        entityCount: 0,
        vehiclePositionCount: 0,
        tripUpdateCount: 0,
        stopTimeUpdateCount: 0,
        alertCount: 0,
        error: null,
      },
      vehiclePositions: [],
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

describe("GTFS-RT run status", () => {
  test("reports running collection progress and wait commands", async () => {
    await removeFixtureArtifacts();
    const runId = "fixture-running-run";
    await writeCollectionRun({
      runId,
      status: "running",
      requestedDurationSeconds: 120,
      sampleSeconds: 30,
    });
    await writeSnapshot(runId, 1);
    await writeSnapshot(runId, 2);

    const status = await getGtfsRtRunStatus({
      dbPath,
      runId,
      now: new Date("2026-05-17T10:01:15.000Z"),
      artifactRoot,
    });

    expect(status).toEqual(
      expect.objectContaining({
        status: "found",
        runId,
        collection: expect.objectContaining({
          status: "running",
          elapsedSeconds: 75,
          expectedSnapshotRows: 4,
          snapshotRows: 2,
          successfulSnapshotRows: 2,
          completionShare: 0.5,
          rawDirectory: expect.objectContaining({
            protobufFileCount: 2,
            totalByteLength: 4,
            readable: true,
          }),
        }),
        readiness: {
          collectionComplete: false,
          snapshotsComplete: false,
          parsedComplete: false,
        },
      }),
    );
    expect(status.nextCommands).toContain(
      "Wait for collection status to become completed or completed_with_errors.",
    );
    expect(status.nextCommands).toContain(
      `bun run gtfs-rt:run-status -- --run-id ${runId}${dbArg}${artifactRootArg}`,
    );
    expect(status.artifactPath).toBe(gtfsRtRunStatusArtifactPath(artifactRoot, runId));
    if (status.artifactPath === undefined) {
      throw new Error("Expected run-status artifact path.");
    }
    await expect(Bun.file(status.artifactPath).json()).resolves.toEqual(status);
  });

  test("reports completed collection handoff commands when parsing is incomplete", async () => {
    await removeFixtureArtifacts();
    const runId = "fixture-completed-run";
    await writeCollectionRun({
      runId,
      status: "completed",
      requestedDurationSeconds: 60,
      sampleSeconds: 30,
      endedAt: "2026-05-17T10:01:00.000Z",
      snapshotCount: 2,
    });
    await writeSnapshot(runId, 1);
    await writeSnapshot(runId, 2);
    await writeParsedSnapshot(runId, 1);

    const status = await getGtfsRtRunStatus({
      dbPath,
      runId,
      now: new Date("2026-05-17T10:05:00.000Z"),
      artifactRoot,
    });

    expect(status.collection).toEqual(
      expect.objectContaining({
        status: "completed",
        elapsedSeconds: 60,
        expectedSnapshotRows: 2,
        snapshotRows: 2,
        completionShare: 1,
      }),
    );
    expect(status.parsed).toEqual(
      expect.objectContaining({
        parsedSnapshotRows: 1,
        parsedVehiclePositionSnapshotRows: 1,
        parseErrorRows: 0,
      }),
    );
    expect(status.readiness).toEqual({
      collectionComplete: true,
      snapshotsComplete: true,
      parsedComplete: false,
    });
    expect(status.nextCommands).toContain(
      `bun run ingest:gtfs-rt-snapshots -- --run-id ${runId}${dbArg}`,
    );
    expect(status.nextCommands).toContain(
      `bun run build:observed-headways -- --run-id ${runId}${dbArg}`,
    );
    expect(status.nextCommands).toContain(
      `bun run route-observed-reliability -- --year 2026 --month 5 --run-id ${runId}${dbArg}`,
    );
    expect(status.artifactPath).toBe(gtfsRtRunStatusArtifactPath(artifactRoot, runId));
    if (status.artifactPath === undefined) {
      throw new Error("Expected run-status artifact path.");
    }
    await expect(Bun.file(status.artifactPath).json()).resolves.toEqual(status);
  });

  test("reports missing runs without throwing", async () => {
    await removeFixtureArtifacts();

    const status = await getGtfsRtRunStatus({ dbPath, runId: "missing-run" });

    expect(status.status).toBe("missing");
    expect(status.runId).toBe("missing-run");
    expect(status.nextCommands).toEqual(["No collection run found for missing-run."]);
  });
});
