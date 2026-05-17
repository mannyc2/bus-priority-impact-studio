import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listGtfsRtCollectionRuns, listGtfsRtFeedSnapshots } from "@bp/db/local";
import {
  collectGtfsRtSnapshots,
  parseCollectGtfsRtCliArgs,
} from "../src/jobs/collect/collect-gtfs-rt.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const testRoot = fromRepoRoot(join("data/working/test-gtfs-rt"));
const dbPath = join(testRoot, "pipeline.sqlite");
const rawDir = join(testRoot, "raw");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("GTFS-RT snapshot collection", () => {
  test("parses a stable run id from CLI arguments", () => {
    expect(
      parseCollectGtfsRtCliArgs([
        "--sample-count",
        "1",
        "--feed-types",
        "vehicle_positions",
        "--run-id",
        "fixture-run",
      ]),
    ).toEqual(
      expect.objectContaining({
        sampleCount: 1,
        feedTypes: ["vehicle_positions"],
        runId: "fixture-run",
      }),
    );
  });

  test("collects raw snapshots and stores only redacted feed URLs", async () => {
    await removeFixtureArtifacts();
    const seenUrls: string[] = [];

    const result = await collectGtfsRtSnapshots({
      apiKey: "secret-bus-time-key",
      dbPath,
      feedTypes: ["vehicle_positions"],
      rawDir,
      runId: "test-run-ok",
      sampleCount: 1,
      sampleSeconds: 1,
      startedAt: new Date("2026-05-16T12:00:00.000Z"),
      fetcher: async (url) => {
        seenUrls.push(url);
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "application/x-protobuf" },
        });
      },
      now: () => new Date("2026-05-16T12:00:01.000Z"),
      sleep: async () => {},
    });

    const local = await openLocalPipelineDb(dbPath);
    const runs = await listGtfsRtCollectionRuns(local.db);
    const snapshots = await listGtfsRtFeedSnapshots(local.db, "test-run-ok");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        runId: "test-run-ok",
        status: "completed",
        snapshotCount: 1,
        successCount: 1,
        failureCount: 0,
      }),
    );
    expect(seenUrls[0]).toContain("secret-bus-time-key");
    expect(runs[0]).toEqual(
      expect.objectContaining({
        runId: "test-run-ok",
        status: "completed",
        requestedFeedTypes: "vehicle_positions",
        snapshotCount: 1,
      }),
    );
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        runId: "test-run-ok",
        feedType: "vehicle_positions",
        sourceId: "bus_time_gtfsrt_vehicle_positions",
        status: "ok",
        byteLength: 3,
        redactedUrl: "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=<redacted>",
      }),
    );
    expect(snapshots[0]?.redactedUrl).not.toContain("secret-bus-time-key");
    expect((await Bun.file(snapshots[0]?.rawPath ?? "").arrayBuffer()).byteLength).toBe(3);
  });

  test("records HTTP failures without writing a raw protobuf body", async () => {
    await removeFixtureArtifacts();

    const result = await collectGtfsRtSnapshots({
      apiKey: "secret-bus-time-key",
      dbPath,
      feedTypes: ["alerts"],
      rawDir,
      runId: "test-run-http-error",
      sampleCount: 1,
      sampleSeconds: 1,
      startedAt: new Date("2026-05-16T12:00:00.000Z"),
      fetcher: async () => new Response("upstream unavailable", { status: 503 }),
      now: () => new Date("2026-05-16T12:00:01.000Z"),
      sleep: async () => {},
    });

    const local = await openLocalPipelineDb(dbPath);
    const snapshots = await listGtfsRtFeedSnapshots(local.db, "test-run-http-error");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        status: "completed_with_errors",
        snapshotCount: 1,
        successCount: 0,
        failureCount: 1,
      }),
    );
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        feedType: "alerts",
        status: "http_error",
        httpStatus: 503,
        rawPath: null,
        error: "upstream unavailable",
      }),
    );
  });
});
