import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteBuildPlan, replaceRouteBriefRows, replaceRouteReadiness } from "@bp/db/local";
import { buildRouteBuildPlan } from "../src/jobs/build/route-build-plan.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-06";
const dbPath = fromRepoRoot(join("data/fixtures/route-build-plan/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(dbPath, { force: true });
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  await replaceRouteReadiness(local.db, isoMonth, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "Already built route",
      isoMonth,
      readinessStatus: "ready",
      buildEligible: true,
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 100,
      speedBusTripCount: 1000,
      averageSpeedMph: 7,
      scheduleTimepointCount: 200,
      shapeCount: 2,
      stopCount: 20,
      timepointStopCount: 8,
    },
    {
      routeId: "T2",
      routeShortName: "T2",
      routeLongName: "Slow selected route",
      isoMonth,
      readinessStatus: "ready",
      buildEligible: true,
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 40,
      speedBusTripCount: 400,
      averageSpeedMph: 5,
      scheduleTimepointCount: 100,
      shapeCount: 1,
      stopCount: 12,
      timepointStopCount: 5,
    },
    {
      routeId: "T3",
      routeShortName: "T3",
      routeLongName: "Blocked route",
      isoMonth,
      readinessStatus: "missing_speed",
      buildEligible: false,
      readinessScore: 60,
      missingInputs: ["segment_speeds", "speed_bus_trips"],
      speedObservationCount: 0,
      speedBusTripCount: 0,
      averageSpeedMph: null,
      scheduleTimepointCount: 75,
      shapeCount: 1,
      stopCount: 10,
      timepointStopCount: 4,
    },
    {
      routeId: "T4",
      routeShortName: "T4",
      routeLongName: "Backlog route",
      isoMonth,
      readinessStatus: "ready",
      buildEligible: true,
      readinessScore: 100,
      missingInputs: [],
      speedObservationCount: 200,
      speedBusTripCount: 1200,
      averageSpeedMph: 6,
      scheduleTimepointCount: 150,
      shapeCount: 2,
      stopCount: 18,
      timepointStopCount: 6,
    },
  ]);
  await replaceRouteBriefRows(local.db, {
    summary: {
      routeId: "T1",
      month: isoMonth,
      routeScore: 40,
      publicVisible: true,
      publicVisibilityReason: "included",
      averageSpeedMph: 7,
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
  local.sqlite.close();
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route build plan", () => {
  test("ranks eligible unbuilt routes and keeps blocked and built audit rows", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteBuildPlan({ year: 2026, month: 6, limit: 1, dbPath });
    const local = await openLocalPipelineDb(dbPath);
    const plan = await listRouteBuildPlan(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 4,
        selectedRouteCount: 1,
        alreadyBuiltRouteCount: 1,
        blockedRouteCount: 1,
        backlogRouteCount: 1,
      }),
    );
    expect(plan.map((row) => row.routeId)).toEqual(["T2", "T4", "T1", "T3"]);
    expect(plan[0]).toEqual(
      expect.objectContaining({
        routeId: "T2",
        candidateRank: 1,
        planStatus: "selected",
        selectedForNextBatch: true,
        alreadyBuilt: false,
      }),
    );
    expect(plan[1]).toEqual(
      expect.objectContaining({
        routeId: "T4",
        candidateRank: 2,
        planStatus: "backlog",
        selectedForNextBatch: false,
      }),
    );
    expect(plan[2]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        candidateRank: null,
        planStatus: "already_built",
        alreadyBuilt: true,
      }),
    );
    expect(plan[3]).toEqual(
      expect.objectContaining({
        routeId: "T3",
        candidateRank: null,
        planStatus: "blocked",
        buildEligible: false,
      }),
    );
    expect(plan.filter((row) => row.selectedForNextBatch).map((row) => row.routeId)).toEqual([
      "T2",
    ]);
    expect(plan[3]?.missingInputs).toEqual(["segment_speeds", "speed_bus_trips"]);
  });
});
