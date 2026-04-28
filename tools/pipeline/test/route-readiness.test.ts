import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { listRouteReadiness, replaceRouteCatalog, replaceRouteMonthCoverage } from "@bp/db/local";
import { buildRouteReadiness } from "../src/jobs/build/route-readiness.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-05";
const dbPath = fromRepoRoot(join("data/fixtures/route-readiness/pipeline.sqlite"));

async function removeFixtureArtifacts(): Promise<void> {
  await rm(dbPath, { force: true });
}

async function writeFixtureLocalDb(): Promise<void> {
  await removeFixtureArtifacts();

  const local = await openLocalPipelineDb(dbPath);
  await replaceRouteCatalog(local.db, [
    {
      routeId: "T1",
      routeShortName: "T1",
      routeLongName: "Ready route",
      routeTypes: [],
      directions: [],
      shapeCount: 2,
      stopCount: 12,
      timepointStopCount: 6,
      latitudeMin: null,
      latitudeMax: null,
      longitudeMin: null,
      longitudeMax: null,
    },
    {
      routeId: "T2",
      routeShortName: "T2",
      routeLongName: "Missing speed route",
      routeTypes: [],
      directions: [],
      shapeCount: 1,
      stopCount: 8,
      timepointStopCount: 4,
      latitudeMin: null,
      latitudeMax: null,
      longitudeMin: null,
      longitudeMax: null,
    },
    {
      routeId: "T3",
      routeShortName: "T3",
      routeLongName: "Missing geometry route",
      routeTypes: [],
      directions: [],
      shapeCount: 0,
      stopCount: 0,
      timepointStopCount: 0,
      latitudeMin: null,
      latitudeMax: null,
      longitudeMin: null,
      longitudeMax: null,
    },
  ]);
  await replaceRouteMonthCoverage(local.db, isoMonth, [
    {
      routeId: "T1",
      isoMonth,
      speedObservationCount: 20,
      speedBusTripCount: 200,
      averageSpeedMph: 6.5,
      scheduleTimepointCount: 100,
      hasSpeedData: true,
      hasScheduleData: true,
    },
    {
      routeId: "T3",
      isoMonth,
      speedObservationCount: 10,
      speedBusTripCount: 50,
      averageSpeedMph: 7.5,
      scheduleTimepointCount: 12,
      hasSpeedData: true,
      hasScheduleData: true,
    },
  ]);
  local.sqlite.close();
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route readiness build", () => {
  test("joins route catalog and monthly coverage into build-ready rows", async () => {
    await writeFixtureLocalDb();

    const result = await buildRouteReadiness({ year: 2026, month: 5, dbPath });
    const local = await openLocalPipelineDb(dbPath);
    const readiness = await listRouteReadiness(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        routeCount: 3,
        buildEligibleRouteCount: 3,
      }),
    );
    expect(readiness.map((row) => row.routeId)).toEqual(["T1", "T2", "T3"]);
    expect(readiness[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        readinessStatus: "ready",
        buildEligible: true,
        readinessScore: 100,
        missingInputs: [],
      }),
    );
    expect(readiness[1]).toEqual(
      expect.objectContaining({
        routeId: "T2",
        readinessStatus: "missing_speed",
        buildEligible: true,
        missingInputs: ["segment_speeds", "speed_bus_trips", "schedules"],
      }),
    );
    expect(readiness[2]).toEqual(
      expect.objectContaining({
        routeId: "T3",
        readinessStatus: "missing_geometry",
        buildEligible: true,
      }),
    );
  });
});
