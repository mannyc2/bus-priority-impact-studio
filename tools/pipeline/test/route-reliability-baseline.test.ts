import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteReliabilityBaseline } from "../src/jobs/build/route-reliability-baseline.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-10";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const routeDir = fromRepoRoot(join("data/working/route-slices/t1-2026-10"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(routeDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
  await mkdir(routeDir, { recursive: true });
  await Bun.write(
    join(batchDir, "batch-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        routes: [{ routeId: "T1", isoMonth }],
      },
      null,
      2,
    )}\n`,
  );
  await Bun.write(
    join(routeDir, "schedules.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: "bus_schedules_2026",
        routeId: "T1",
        isoMonth,
        rows: [
          {
            dayType: "Weekday",
            direction: "N",
            stopId: "S1",
            stopName: "First stop",
            scheduleTime: "2026-01-05T08:00:00.000Z",
          },
          {
            dayType: "Weekday",
            direction: "N",
            stopId: "S1",
            stopName: "First stop",
            scheduleTime: "2026-01-05T08:10:00.000Z",
          },
          {
            dayType: "Weekday",
            direction: "N",
            stopId: "S1",
            stopName: "First stop",
            scheduleTime: "2026-01-05T08:35:00.000Z",
          },
          {
            dayType: "Weekday",
            direction: "S",
            stopId: "S2",
            scheduleTime: "2026-01-05T09:00:00.000Z",
          },
          {
            dayType: "Weekday",
            direction: "S",
            stopId: "S2",
            scheduleTime: "2026-01-05T09:02:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route reliability baseline", () => {
  test("builds scheduled headway gap baselines for batch routes", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteReliabilityBaseline({ year: 2026, month: 10 });
    const baseline = await Bun.file(result.baselinePath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 1,
        headwaySampleCount: 3,
      }),
    );
    expect(baseline.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        reliabilityStatus: "scheduled_baseline_only",
        scheduledTimepointCount: 5,
        stopHeadwayGroupCount: 2,
        headwaySampleCount: 3,
        medianScheduledHeadwayMinutes: 10,
        maxScheduledHeadwayMinutes: 25,
      }),
    );
    expect(baseline.rows[0].sourceStatus).toEqual(
      expect.objectContaining({
        observedHeadways: "needs_gtfs_rt_collection",
        bunching: "needs_gtfs_rt_collection",
      }),
    );
    expect(summary.sourceReadiness).toEqual(
      expect.objectContaining({
        equityContext: "not_ingested",
        interventionHistory: "ace_dates_available_bus_lane_dates_partial",
      }),
    );
  });
});
