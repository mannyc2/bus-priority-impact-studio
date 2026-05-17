import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listRouteInterventionComparisons,
  replaceAceRoutes,
  replaceRouteBriefRows,
  replaceRouteMonthTrends,
} from "@bp/db/local";
import { buildRouteInterventionEvaluation } from "../src/jobs/build/route-intervention-evaluation.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/test-route-intervention-evaluation"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

function briefSummary(routeId: string) {
  return {
    routeId,
    month: "2026-03",
    routeScore: 40,
    publicVisible: true,
    publicVisibilityReason: "included",
    averageSpeedMph: 6,
    hotspotCount: 2,
    totalRidership: 1000,
    totalTransfers: 100,
    aceActive: true,
    aceViolationCount: 12,
    busLaneMatchedLaneCount: 3,
    scheduleMatchRate: 0.5,
  };
}

async function writeFixtureNetwork(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary("T1"),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary("T2"),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceAceRoutes(local.db, [
      {
        routeId: "T1",
        program: "ACE",
        implementationDate: "2026-01-15T00:00:00.000Z",
      },
      {
        routeId: "T2",
        program: "ABLE",
        implementationDate: "2026-04-01T00:00:00.000Z",
      },
    ]);
    await replaceRouteMonthTrends(local.db, [
      {
        routeId: "T1",
        month: "2025-11",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 5,
        ridership: 1000,
        transfers: 100,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T1",
        month: "2025-12",
        speedObservationCount: 20,
        speedBusTripCount: 200,
        averageSpeedMph: 7,
        ridership: 1200,
        transfers: 120,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T1",
        month: "2026-02",
        speedObservationCount: 30,
        speedBusTripCount: 300,
        averageSpeedMph: 8,
        ridership: 1300,
        transfers: 130,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T1",
        month: "2026-03",
        speedObservationCount: 40,
        speedBusTripCount: 400,
        averageSpeedMph: 8,
        ridership: 1500,
        transfers: 150,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
    ]);
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("route intervention evaluation", () => {
  test("builds descriptive before/after comparisons with caveats", async () => {
    await writeFixtureNetwork();

    const result = await buildRouteInterventionEvaluation({
      year: 2026,
      month: 3,
      dbPath,
      windowMonths: 2,
      minSampleMonths: 1,
    });
    const local = await openLocalPipelineDb(dbPath);
    try {
      const comparisons = await listRouteInterventionComparisons(local.db, "2026-03");

      expect(result).toEqual({
        isoMonth: "2026-03",
        routeCount: 2,
        eventCount: 4,
        comparisonCount: 4,
        evaluatedComparisonCount: 1,
        futureComparisonCount: 1,
        insufficientComparisonCount: 0,
        sourceGapComparisonCount: 2,
      });
      expect(comparisons).toEqual([
        expect.objectContaining({
          routeId: "T1",
          sourceId: "mta_ace_routes",
          evaluationLevel: "descriptive_before_after",
          comparisonStatus: "evaluated",
          preStartMonth: "2025-11",
          preEndMonth: "2025-12",
          postStartMonth: "2026-02",
          postEndMonth: "2026-03",
          preSampleMonthCount: 2,
          postSampleMonthCount: 2,
          preAverageSpeedMph: 6.3333,
          postAverageSpeedMph: 8,
          speedDeltaMph: 1.6667,
          preAverageMonthlyRidership: 1100,
          postAverageMonthlyRidership: 1400,
          ridershipDelta: 300,
        }),
        expect.objectContaining({
          routeId: "T1",
          sourceId: "nyc_dot_bus_lanes",
          interventionType: "bus_lane_infrastructure",
          evaluationLevel: "not_evaluated_source_gap",
          comparisonStatus: "source_gap_missing_implementation_date",
          speedDeltaMph: null,
        }),
        expect.objectContaining({
          routeId: "T2",
          sourceId: "mta_ace_routes",
          evaluationLevel: "not_evaluated_future",
          comparisonStatus: "future_intervention",
          postSampleMonthCount: 0,
        }),
        expect.objectContaining({
          routeId: "T2",
          sourceId: "nyc_dot_bus_lanes",
          interventionType: "bus_lane_infrastructure",
          evaluationLevel: "not_evaluated_source_gap",
          comparisonStatus: "source_gap_missing_implementation_date",
          speedDeltaMph: null,
        }),
      ]);
      expect(comparisons[0]?.caveat).toContain("Descriptive before/after only");
      expect(comparisons[1]?.caveat).toContain("no route-level implementation date");
      expect(comparisons[2]?.caveat).toContain("after the analysis month");
    } finally {
      local.sqlite.close();
    }
  });
});
