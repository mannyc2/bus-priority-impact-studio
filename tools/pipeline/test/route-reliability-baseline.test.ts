import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteBriefRows, replaceRouteSchedules } from "@bp/db/local";
import { buildRouteReliabilityBaseline } from "../src/jobs/build/route-reliability-baseline.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-10";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const dbPath = fromRepoRoot(join("data/working/test-route-reliability-baseline/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(batchDir, { force: true, recursive: true }),
    rm(fromRepoRoot(join("data/working/test-route-reliability-baseline")), {
      force: true,
      recursive: true,
    }),
  ]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "T1",
        month: isoMonth,
        routeScore: 40,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 8,
        hotspotCount: 1,
        totalRidership: 1000,
        totalTransfers: 100,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 1,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteSchedules(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "T1001",
        stopSequence: 1,
        stopId: "S1",
        stopName: "First stop",
        scheduleTime: "2026-01-05T08:00:00.000Z",
        blockId: "B1",
      },
      {
        routeId: "T1",
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "T1001",
        stopSequence: 2,
        stopId: "S1",
        stopName: "First stop",
        scheduleTime: "2026-01-05T08:10:00.000Z",
        blockId: "B2",
      },
      {
        routeId: "T1",
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "T1001",
        stopSequence: 3,
        stopId: "S1",
        stopName: "First stop",
        scheduleTime: "2026-01-05T08:35:00.000Z",
        blockId: "B3",
      },
      {
        routeId: "T1",
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "S",
        shapeId: "T1002",
        stopSequence: 1,
        stopId: "S2",
        scheduleTime: "2026-01-05T09:00:00.000Z",
        blockId: "B4",
      },
      {
        routeId: "T1",
        isoMonth,
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "S",
        shapeId: "T1002",
        stopSequence: 2,
        stopId: "S2",
        scheduleTime: "2026-01-05T09:02:00.000Z",
        blockId: "B5",
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route reliability baseline", () => {
  test("builds scheduled headway gap baselines for batch routes", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteReliabilityBaseline({ year: 2026, month: 10, dbPath });
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
