import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceAceRoutes,
  replaceCorridorRows,
  replaceRouteBatch,
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteInterventionEvaluationRows,
  replaceRouteMonthCoverage,
  replaceRouteObservedReliabilityRows,
  replaceRouteReadiness,
  replaceRouteReliabilityRows,
  replaceRouteScorecard,
} from "@bp/db/local";
import { buildBriefArtifacts } from "../src/jobs/build/brief-artifacts.js";
import { checkPipelineV1 } from "../src/jobs/check/pipeline-v1.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-11";
const dbPath = fromRepoRoot(join("data/fixtures/check-pipeline-v1/pipeline.sqlite"));
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const routeBriefDir = fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth));
const corridorBriefDir = fromRepoRoot(
  join("data/artifacts/briefs/corridors/street-broadway", isoMonth),
);

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(dbPath, { force: true }),
    rm(exportDir, { force: true, recursive: true }),
    rm(routeBriefDir, { force: true, recursive: true }),
    rm(corridorBriefDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureNetwork(options: { includeObservedAndInterventions: boolean }) {
  await removeFixtureArtifacts();
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteCatalog(local.db, [
      {
        routeId: "T1",
        routeShortName: "T1",
        routeLongName: "Fixture route",
        routeTypes: ["Local"],
        directions: ["N"],
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 2,
        latitudeMin: 40,
        latitudeMax: 41,
        longitudeMin: -74,
        longitudeMax: -73,
      },
    ]);
    await replaceRouteMonthCoverage(local.db, isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        speedObservationCount: 20,
        speedBusTripCount: 200,
        averageSpeedMph: 6,
        scheduleTimepointCount: 100,
        hasSpeedData: true,
        hasScheduleData: true,
      },
    ]);
    await replaceRouteReadiness(local.db, isoMonth, [
      {
        routeId: "T1",
        routeShortName: "T1",
        routeLongName: "Fixture route",
        isoMonth,
        readinessStatus: "ready",
        buildEligible: true,
        readinessScore: 100,
        missingInputs: [],
        speedObservationCount: 20,
        speedBusTripCount: 200,
        averageSpeedMph: 6,
        scheduleTimepointCount: 100,
        shapeCount: 1,
        stopCount: 2,
        timepointStopCount: 2,
      },
    ]);
    await replaceRouteScorecard(local.db, {
      routeId: "T1",
      month: isoMonth,
      routeScore: 40,
      coverageStatus: "full",
      averageSpeedMph: 6,
      hotspotCount: 1,
    });
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId: "T1",
        month: isoMonth,
        routeScore: 40,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 6,
        hotspotCount: 1,
        totalRidership: 1000,
        totalTransfers: 100,
        aceActive: true,
        aceViolationCount: 12,
        busLaneMatchedLaneCount: 1,
        scheduleMatchRate: 0.5,
      },
      peakWindows: [],
      slowestWindows: [],
    });
    await replaceRouteReliabilityRows(local.db, isoMonth, {
      baselines: [
        {
          routeId: "T1",
          month: isoMonth,
          reliabilityStatus: "scheduled_baseline_only",
          scheduledTimepointCount: 20,
          stopHeadwayGroupCount: 3,
          headwaySampleCount: 18,
          medianScheduledHeadwayMinutes: 10,
          p90ScheduledHeadwayMinutes: 20,
          maxScheduledHeadwayMinutes: 30,
          scheduledShortHeadwayShare: 0.1,
          scheduledLongGapShare: 0.2,
        },
      ],
      gapWindows: [],
      sourceStatuses: [
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "scheduledHeadways",
          status: "available",
          rowCount: 20,
          snapshotId: null,
          note: null,
        },
      ],
    });
    await replaceAceRoutes(local.db, [
      {
        routeId: "T1",
        program: "ACE",
        implementationDate: "2026-01-15T00:00:00.000Z",
      },
    ]);
    if (options.includeObservedAndInterventions) {
      await replaceRouteObservedReliabilityRows(local.db, isoMonth, "fixture-gtfs-rt", {
        summaries: [
          {
            routeId: "T1",
            month: isoMonth,
            runId: "fixture-gtfs-rt",
            reliabilityStatus: "observed",
            minSampleThreshold: 3,
            sampleCount: 42,
            stopCount: 5,
            directionCount: 2,
            averageObservedHeadwayMinutes: 8.5,
            medianObservedHeadwayMinutes: 8,
            p90ObservedHeadwayMinutes: 15,
            maxObservedHeadwayMinutes: 22,
            scheduledMedianHeadwayMinutes: 10,
            bunchingThresholdMinutes: 5,
            longGapThresholdMinutes: 20,
            observedBunchingShare: 0.12,
            observedLongGapShare: 0.05,
            expectedWaitMinutes: 5.1,
            scheduledExpectedWaitMinutes: 5,
            excessWaitMinutes: 0.1,
            waitReliabilityRatio: 1.02,
          },
        ],
        sourceStatuses: [
          {
            routeId: "T1",
            month: isoMonth,
            sourceScope: "reliability",
            sourceId: "observedHeadways",
            status: "available",
            rowCount: 42,
            snapshotId: "fixture-gtfs-rt",
            note: null,
          },
          {
            routeId: "T1",
            month: isoMonth,
            sourceScope: "reliability",
            sourceId: "bunching",
            status: "available",
            rowCount: 42,
            snapshotId: "fixture-gtfs-rt",
            note: null,
          },
          {
            routeId: "T1",
            month: isoMonth,
            sourceScope: "reliability",
            sourceId: "waitTimeReliability",
            status: "available",
            rowCount: 42,
            snapshotId: "fixture-gtfs-rt",
            note: null,
          },
        ],
      });
      await replaceRouteInterventionEvaluationRows(local.db, isoMonth, "mta_ace_routes", {
        events: [
          {
            eventId: "ace:T1:ACE:2026-01-15",
            routeId: "T1",
            interventionType: "automated_bus_lane_enforcement",
            sourceId: "mta_ace_routes",
            program: "ACE",
            implementationDate: "2026-01-15T00:00:00.000Z",
            implementationMonth: "2026-01",
            eventStatus: "implemented",
            description: "ACE automated bus lane enforcement for T1",
          },
        ],
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
    }
    await replaceCorridorRows(local.db, isoMonth, {
      corridors: [
        {
          corridorId: "street:broadway",
          corridorName: "Broadway",
          corridorKey: "BROADWAY",
          derivationMethod: "primary_route_stop_street",
        },
      ],
      routeMembers: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          routeId: "T1",
          assignmentStatus: "assigned",
          assignmentReason: "primary_stop_street",
          stopCount: 2,
          matchedStopCount: 2,
          hotspotCount: 1,
          totalRidership: 1000,
          averageSpeedMph: 6,
        },
      ],
      summaries: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          routeCount: 1,
          assignedRouteCount: 1,
          ambiguousRouteCount: 0,
          unassignedRouteCount: 0,
          totalRidership: 1000,
          totalTransfers: 100,
          weightedAverageSpeedMph: 6,
          hotspotCount: 1,
          observedReliabilityRouteCount: options.includeObservedAndInterventions ? 1 : 0,
          insufficientReliabilityRouteCount: 0,
          interventionComparisonCount: options.includeObservedAndInterventions ? 1 : 0,
          evaluatedInterventionComparisonCount: options.includeObservedAndInterventions ? 1 : 0,
        },
      ],
      hotspots: [],
    });
    await replaceRouteBatch(local.db, {
      status: {
        month: isoMonth,
        generatedAt: "2026-11-01T00:00:00.000Z",
        status: "running",
        routeCount: 1,
        artifactCount: 0,
        missingArtifactCount: 0,
        hashMismatchCount: 0,
        byteLengthMismatchCount: 0,
        totalByteLength: 0,
        issueCount: 0,
      },
      builtRoutes: [
        {
          month: isoMonth,
          routeRank: 1,
          routeId: "T1",
          artifactCount: null,
          status: "built",
        },
      ],
      issues: [],
    });
  } finally {
    local.sqlite.close();
  }
  await buildBriefArtifacts({ year: 2026, month: 11, dbPath });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("pipeline v1 check", () => {
  test("passes when all v1 serving evidence is present", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await checkPipelineV1({ year: 2026, month: 11, dbPath });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        status: "pass",
        issueCount: 0,
      }),
    );
    expect(result.counts).toEqual(
      expect.objectContaining({
        publicRouteCount: 1,
        routeObservedReliabilityRows: 1,
        routeInterventionComparisonRows: 1,
        corridorRows: 1,
        routeArtifactRows: 3,
        corridorArtifactRows: 3,
      }),
    );
    expect(result.d1).toEqual(
      expect.objectContaining({
        status: "pass",
        routeObservedReliabilityRows: 1,
        routeInterventionComparisonRows: 1,
      }),
    );
  });

  test("fails loudly when observed reliability and intervention evidence are missing", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: false });

    const result = await checkPipelineV1({ year: 2026, month: 11, dbPath });

    expect(result.status).toBe("fail");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "observed_reliability_missing",
        "observed_reliability_source_status_incomplete",
        "intervention_events_missing",
        "intervention_comparisons_missing",
        "d1_observed_reliability_incomplete",
        "d1_intervention_comparisons_missing",
      ]),
    );
  });
});
