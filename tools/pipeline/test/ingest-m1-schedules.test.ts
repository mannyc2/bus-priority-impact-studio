import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ingestM1Schedules } from "../src/jobs/ingest/ingest-m1-schedules.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const rawDir = fromRepoRoot(join("data/raw/route-slices/t1-2026-03"));
const workingDir = fromRepoRoot(join("data/working/route-slices/t1-2026-03"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(rawDir, { force: true, recursive: true }),
    rm(workingDir, { force: true, recursive: true }),
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
    const working = await Bun.file(result.workingPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeId: "T1",
        isoMonth: "2026-03",
        timepointCount: 1,
        dayTypes: ["Weekday"],
      }),
    );
    expect(working.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        scheduleDate: "2026-01-05T00:00:00.000Z",
        scheduleTime: "2026-01-05T07:00:00.000Z",
      }),
    );
    expect(summary.bundles).toEqual(["2025Aug"]);
  });
});
