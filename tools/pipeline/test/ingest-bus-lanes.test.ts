import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listBusLanes } from "@bp/db/local";
import { ingestBusLanes } from "../src/jobs/ingest/ingest-bus-lanes.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/interventions"));
const workingDir = fromRepoRoot(join("data/working/interventions"));
const dbPath = fromRepoRoot(join("data/working/test-bus-lanes/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
    rm(dbPath, { force: true }),
  ]);
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("NYC DOT bus lane ingestion", () => {
  test("fetches and normalizes bus lane rows", async () => {
    await removeFixtureArtifacts();

    const result = await ingestBusLanes({
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([
          {
            street: "5 AVENUE",
            segmentid: "0001234",
            boro: "MAN",
            facility: "5th Avenue",
            direction: "SB",
            shape_leng: "255.5",
          },
          {
            street: "HILLSIDE AVENUE",
            segmentid: "0005678",
            boro: "QNS",
            facility: "Hillside Avenue",
            direction: "EB",
            shape_leng: "100",
          },
        ]),
    });
    const summary = await Bun.file(result.summaryPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const lanes = await listBusLanes(local.db);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        laneCount: 2,
        manhattanLaneCount: 1,
      }),
    );
    expect(lanes[0]).toEqual(
      expect.objectContaining({
        segmentId: "0001234",
        street: "5 AVENUE",
        borough: "MAN",
      }),
    );
    expect(summary.topStreets[0]).toEqual({ street: "5 AVENUE", count: 1 });
  });
});
