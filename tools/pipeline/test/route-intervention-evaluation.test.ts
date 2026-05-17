import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listRouteInterventionComparisons,
  replaceAceRoutes,
  replaceBusLanes,
  replaceRouteBriefRows,
  replaceRouteMonthTrends,
  replaceRouteStops,
} from "@bp/db/local";
import {
  buildRouteInterventionEvaluation,
  parseBusLaneOpenDates,
} from "../src/jobs/build/route-intervention-evaluation.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingDir = fromRepoRoot(join("data/working/test-route-intervention-evaluation"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

function briefSummary(routeId: string, options: { busLaneMatchedLaneCount?: number } = {}) {
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
    busLaneMatchedLaneCount: options.busLaneMatchedLaneCount ?? 3,
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
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary("T3", { busLaneMatchedLaneCount: 0 }),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceBusLanes(local.db, [
      {
        segmentId: "L1",
        street: "Main St",
        borough: "MAN",
        facility: "Main St",
        openDate: "8/24/82, 1/15/2026",
        coordinates: [{ longitude: -73, latitude: 40 }],
      },
      {
        segmentId: "L2",
        street: "Broadway",
        borough: "MAN",
        facility: "Broadway",
        openDate: "4/1/2026",
        coordinates: [{ longitude: -73.01, latitude: 40.01 }],
      },
    ]);
    await replaceRouteStops(local.db, "T1", "2026-03", [
      {
        routeId: "T1",
        isoMonth: "2026-03",
        routeShortName: "T1",
        stopId: "T1-1",
        stopName: "Main St/1 Av",
        inEffect: true,
        directionId: "0",
        direction: "Northbound",
        timepoint: true,
        latitude: 40,
        longitude: -73,
      },
    ]);
    await replaceRouteStops(local.db, "T2", "2026-03", [
      {
        routeId: "T2",
        isoMonth: "2026-03",
        routeShortName: "T2",
        stopId: "T2-1",
        stopName: "Broadway/W 1 St",
        inEffect: true,
        directionId: "0",
        direction: "Northbound",
        timepoint: true,
        latitude: 40.01,
        longitude: -73.01,
      },
    ]);
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
      {
        routeId: "T3",
        month: "2025-11",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 6,
        ridership: 900,
        transfers: 90,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T3",
        month: "2025-12",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 6,
        ridership: 1100,
        transfers: 110,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T3",
        month: "2026-02",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 7,
        ridership: 950,
        transfers: 95,
        hasSpeedTrend: true,
        hasRidershipTrend: true,
      },
      {
        routeId: "T3",
        month: "2026-03",
        speedObservationCount: 10,
        speedBusTripCount: 100,
        averageSpeedMph: 7,
        ridership: 1150,
        transfers: 115,
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
  test("builds peer-adjusted before/after comparisons with caveats", async () => {
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
        routeCount: 3,
        eventCount: 4,
        comparisonCount: 4,
        evaluatedComparisonCount: 2,
        futureComparisonCount: 2,
        insufficientComparisonCount: 0,
        sourceGapComparisonCount: 0,
      });
      expect(comparisons).toEqual([
        expect.objectContaining({
          routeId: "T1",
          sourceId: "mta_ace_routes",
          evaluationLevel: "peer_adjusted_before_after",
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
          comparisonRouteCount: 1,
          comparisonRouteIds: '["T3"]',
          comparisonPreAverageSpeedMph: 6,
          comparisonPostAverageSpeedMph: 7,
          comparisonSpeedDeltaMph: 1,
          adjustedSpeedDeltaMph: 0.6667,
          comparisonPreAverageMonthlyRidership: 1000,
          comparisonPostAverageMonthlyRidership: 1050,
          comparisonRidershipDelta: 50,
          adjustedRidershipDelta: 250,
        }),
        expect.objectContaining({
          routeId: "T1",
          sourceId: "nyc_dot_bus_lanes",
          interventionType: "bus_lane_infrastructure",
          evaluationLevel: "peer_adjusted_before_after",
          comparisonStatus: "evaluated",
          preStartMonth: "2025-11",
          preEndMonth: "2025-12",
          postStartMonth: "2026-02",
          postEndMonth: "2026-03",
          adjustedSpeedDeltaMph: 0.6667,
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
          evaluationLevel: "not_evaluated_future",
          comparisonStatus: "future_intervention",
          speedDeltaMph: null,
        }),
      ]);
      expect(comparisons[0]?.caveat).toContain("Peer-adjusted before/after");
      expect(comparisons[1]?.caveat).toContain("Peer-adjusted before/after");
      expect(comparisons[2]?.caveat).toContain("after the analysis month");
    } finally {
      local.sqlite.close();
    }
  });

  test("parses multi-value bus lane open_dates with month/year fallbacks", () => {
    expect(parseBusLaneOpenDates("8/30/88,6/01/10,11/14/23")).toEqual([
      { sourceValue: "8/30/88", date: "1988-08-30T00:00:00.000Z", month: "1988-08" },
      { sourceValue: "6/01/10", date: "2010-06-01T00:00:00.000Z", month: "2010-06" },
      { sourceValue: "11/14/23", date: "2023-11-14T00:00:00.000Z", month: "2023-11" },
    ]);
    expect(parseBusLaneOpenDates("6/99")).toEqual([
      { sourceValue: "6/99", date: "1999-06-01T00:00:00.000Z", month: "1999-06" },
    ]);
  });
});
