import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listCorridorHotspots,
  listCorridorMonthSummaries,
  listCorridorRouteMembers,
  replaceRouteBriefRows,
  replaceRouteHotspots,
  replaceRouteInterventionEvaluationRows,
  replaceRouteObservedReliabilityRows,
  replaceRouteStops,
} from "@bp/db/local";
import { buildCorridorModel } from "../src/jobs/build/corridor-model.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-03";
const workingDir = fromRepoRoot(join("data/working/test-corridor-model"));
const dbPath = join(workingDir, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(workingDir, { force: true, recursive: true });
}

function briefSummary(input: { routeId: string; averageSpeedMph: number; totalRidership: number }) {
  return {
    routeId: input.routeId,
    month: isoMonth,
    routeScore: 40,
    publicVisible: true,
    publicVisibilityReason: "included",
    averageSpeedMph: input.averageSpeedMph,
    hotspotCount: 1,
    totalRidership: input.totalRidership,
    totalTransfers: 100,
    aceActive: false,
    aceViolationCount: 0,
    busLaneMatchedLaneCount: 0,
    scheduleMatchRate: 0.5,
  };
}

function hotspot(routeId: string, score: number) {
  return {
    routeId,
    isoMonth,
    segmentId: `${routeId}:1`,
    direction: "N",
    stopOrder: 1,
    timepointStopId: `${routeId}:A`,
    timepointStopName: "BROADWAY/MARCY AV",
    nextTimepointStopId: `${routeId}:B`,
    nextTimepointStopName: "BROADWAY/KEAP ST",
    observationCount: 10,
    busTripCount: 100,
    weightedAverageSpeedMph: 5,
    weightedAverageTravelTimeMinutes: 8,
    averageRoadDistanceMiles: 1,
    slowWindowShare: 0.8,
    speedSeverity: 0.6,
    hotspotScore: score,
    riderImpactScore: score - 1,
  };
}

async function writeFixtureNetwork(): Promise<void> {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary({ routeId: "T1", averageSpeedMph: 6, totalRidership: 1000 }),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary({ routeId: "T2", averageSpeedMph: 8, totalRidership: 500 }),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteBriefRows(local.db, {
      summary: briefSummary({ routeId: "T3", averageSpeedMph: 10, totalRidership: 100 }),
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteStops(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        routeShortName: "T1",
        stopId: "T1A",
        stopName: "BROADWAY/MARCY AV",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.7,
        longitude: -73.9,
      },
      {
        routeId: "T1",
        isoMonth,
        routeShortName: "T1",
        stopId: "T1B",
        stopName: "BROADWAY/KEAP ST",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.71,
        longitude: -73.91,
      },
    ]);
    await replaceRouteStops(local.db, "T2", isoMonth, [
      {
        routeId: "T2",
        isoMonth,
        routeShortName: "T2",
        stopId: "T2A",
        stopName: "BROADWAY/ROEBLING ST",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.72,
        longitude: -73.92,
      },
      {
        routeId: "T2",
        isoMonth,
        routeShortName: "T2",
        stopId: "T2B",
        stopName: "BROADWAY/DRIGGS AV",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.73,
        longitude: -73.93,
      },
    ]);
    for (const [routeId, score] of [
      ["T1", 80],
      ["T2", 70],
    ] as const) {
      await replaceRouteHotspots(
        local.db,
        {
          routeId,
          isoMonth,
          generatedAt: "2026-04-01T00:00:00.000Z",
          routeWeightedAverageSpeedMph: 6,
          observationCount: 10,
          busTripCount: 100,
          ridershipWeighted: true,
          ridershipWindowCount: 1,
          ridershipMatchedObservationCount: 1,
          ridershipExposure: 1000,
          segmentCount: 1,
          hotspotCount: 1,
        },
        [hotspot(routeId, score)],
      );
    }
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-gtfs-rt", {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId: "fixture-gtfs-rt",
          reliabilityStatus: "observed",
          minSampleThreshold: 3,
          sampleCount: 30,
          stopCount: 2,
          directionCount: 1,
          averageObservedHeadwayMinutes: 8,
          medianObservedHeadwayMinutes: 8,
          p90ObservedHeadwayMinutes: 12,
          maxObservedHeadwayMinutes: 20,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: 0.1,
          observedLongGapShare: 0.05,
          expectedWaitMinutes: 5,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: 0,
          waitReliabilityRatio: 1,
        },
        {
          routeId: "T2",
          month: isoMonth,
          runId: "fixture-gtfs-rt",
          reliabilityStatus: "insufficient_gtfs_rt_samples",
          minSampleThreshold: 3,
          sampleCount: 1,
          stopCount: 1,
          directionCount: 1,
          averageObservedHeadwayMinutes: null,
          medianObservedHeadwayMinutes: null,
          p90ObservedHeadwayMinutes: null,
          maxObservedHeadwayMinutes: null,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: null,
          observedLongGapShare: null,
          expectedWaitMinutes: null,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: null,
          waitReliabilityRatio: null,
        },
      ],
      sourceStatuses: [],
    });
    await replaceRouteInterventionEvaluationRows(local.db, isoMonth, "mta_ace_routes", {
      events: [],
      comparisons: [
        {
          routeId: "T1",
          month: isoMonth,
          eventId: "ace:T1:ACE:2026-01-15",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          evaluationLevel: "descriptive_before_after",
          comparisonStatus: "evaluated",
          preStartMonth: "2025-11",
          preEndMonth: "2025-12",
          postStartMonth: "2026-02",
          postEndMonth: "2026-03",
          requestedPreMonthCount: 2,
          requestedPostMonthCount: 2,
          preSampleMonthCount: 2,
          postSampleMonthCount: 2,
          preSpeedObservationCount: 30,
          postSpeedObservationCount: 70,
          preAverageSpeedMph: 6,
          postAverageSpeedMph: 8,
          speedDeltaMph: 2,
          preAverageMonthlyRidership: 1000,
          postAverageMonthlyRidership: 1400,
          ridershipDelta: 400,
          caveat: "Descriptive before/after only.",
        },
      ],
    });
  } finally {
    local.sqlite.close();
  }
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("corridor model", () => {
  test("assigns public routes to deterministic corridors and summarizes evidence", async () => {
    await writeFixtureNetwork();

    const result = await buildCorridorModel({
      year: 2026,
      month: 3,
      dbPath,
    });
    const local = await openLocalPipelineDb(dbPath);
    try {
      const [members, summaries, hotspots] = await Promise.all([
        listCorridorRouteMembers(local.db, isoMonth),
        listCorridorMonthSummaries(local.db, isoMonth),
        listCorridorHotspots(local.db, isoMonth),
      ]);

      expect(result).toEqual({
        isoMonth,
        publicRouteCount: 3,
        corridorCount: 2,
        assignedRouteCount: 2,
        ambiguousRouteCount: 0,
        unassignedRouteCount: 1,
        corridorHotspotCount: 2,
      });
      expect(members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            corridorId: "street:broadway",
            routeId: "T1",
            assignmentStatus: "assigned",
            matchedStopCount: 2,
          }),
          expect.objectContaining({
            corridorId: "street:broadway",
            routeId: "T2",
            assignmentStatus: "assigned",
            matchedStopCount: 2,
          }),
          expect.objectContaining({
            corridorId: "unassigned:t3",
            routeId: "T3",
            assignmentStatus: "unassigned",
            assignmentReason: "no_route_stops",
          }),
        ]),
      );
      expect(summaries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            corridorId: "street:broadway",
            routeCount: 2,
            totalRidership: 1500,
            weightedAverageSpeedMph: 6.6667,
            observedReliabilityRouteCount: 1,
            insufficientReliabilityRouteCount: 1,
            interventionComparisonCount: 1,
            evaluatedInterventionComparisonCount: 1,
          }),
        ]),
      );
      expect(hotspots.map((row) => row.routeId)).toEqual(["T1", "T2"]);
    } finally {
      local.sqlite.close();
    }
  });
});
