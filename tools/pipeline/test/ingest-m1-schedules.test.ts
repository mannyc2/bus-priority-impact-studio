import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteSchedules } from "@bp/db/local";
import { ingestM1Schedules } from "../src/jobs/ingest/ingest-m1-schedules.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/route-slices/t1-2026-03"));
const workingDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));
const dbPath = fromRepoRoot(join("data/working/test-m1-schedules/pipeline.sqlite"));

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

describe("M1 schedule ingestion", () => {
  test("fetches and normalizes route timepoint schedules", async () => {
    await removeFixtureArtifacts();

    const result = await ingestM1Schedules({
      routeId: "T1",
      year: 2026,
      month: 3,
      fetchedAt: new Date("2026-04-27T12:00:00.000Z"),
      dbPath,
      fetcher: async () =>
        Response.json([
          {
            schedule_date: "2026-01-05T00:00:00.000",
            day_type: "Weekday",
            direction: "N",
            shape_id: "T1001",
            route_id: "T1",
            stop_sequence: "1",
            stop_id: "A",
            stop_name: "A stop",
            schedule_time: "2026-01-05T07:00:00.000",
            distance_from_start: "0",
            block_id: "B1",
            bundle: "2025Aug",
          },
        ]),
    });
    const summary = await Bun.file(result.summaryPath).json();
    const local = await openLocalPipelineDb(dbPath);
    const schedules = await listRouteSchedules(local.db, "T1", "2026-03");
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        timepointCount: 1,
        dayTypes: ["Weekday"],
      }),
    );
    expect(schedules[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        scheduleDate: "2026-01-05T00:00:00.000Z",
        scheduleTime: "2026-01-05T07:00:00.000Z",
      }),
    );
    expect(summary.bundles).toEqual(["2025Aug"]);
  });
});
