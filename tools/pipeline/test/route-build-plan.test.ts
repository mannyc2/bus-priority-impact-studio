import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { replaceRouteReadiness } from "@bp/db/local";
import { buildRouteBuildPlan } from "../src/jobs/build/route-build-plan.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-06";
const batchDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const dbPath = fromRepoRoot(join("data/fixtures/route-build-plan/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([rm(batchDir, { force: true, recursive: true }), rm(dbPath, { force: true })]);
}

async function writeFixtureArtifacts(): Promise<void> {
  await removeFixtureArtifacts();
  await mkdir(batchDir, { recursive: true });
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
  local.sqlite.close();
  await Bun.write(
    join(batchDir, "batch-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        analysisPeriod: isoMonth,
        routeCount: 1,
        routes: [{ routeId: "T1", isoMonth }],
      },
      null,
      2,
    )}\n`,
  );
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route build plan", () => {
  test("ranks eligible unbuilt routes and keeps blocked and built audit rows", async () => {
    await writeFixtureArtifacts();

    const result = await buildRouteBuildPlan({ year: 2026, month: 6, limit: 1, dbPath });
    const plan = await Bun.file(result.planPath).json();
    const summary = await Bun.file(result.summaryPath).json();

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
    expect(plan.rows.map((row: { routeId: string }) => row.routeId)).toEqual([
      "T2",
      "T4",
      "T1",
      "T3",
    ]);
    expect(plan.rows[0]).toEqual(
      expect.objectContaining({
        routeId: "T2",
        candidateRank: 1,
        planStatus: "selected",
        selectedForNextBatch: true,
        alreadyBuilt: false,
      }),
    );
    expect(plan.rows[1]).toEqual(
      expect.objectContaining({
        routeId: "T4",
        candidateRank: 2,
        planStatus: "backlog",
        selectedForNextBatch: false,
      }),
    );
    expect(plan.rows[2]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        candidateRank: null,
        planStatus: "already_built",
        alreadyBuilt: true,
      }),
    );
    expect(plan.rows[3]).toEqual(
      expect.objectContaining({
        routeId: "T3",
        candidateRank: null,
        planStatus: "blocked",
        buildEligible: false,
      }),
    );
    expect(summary.selectedRouteIds).toEqual(["T2"]);
    expect(summary.missingInputCounts).toEqual({
      segment_speeds: 1,
      speed_bus_trips: 1,
    });
  });
});
