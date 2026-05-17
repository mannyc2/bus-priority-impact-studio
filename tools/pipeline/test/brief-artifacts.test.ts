import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
  listCorridorArtifacts,
  listRouteArtifacts,
  replaceCorridorRows,
  replaceObservedHeadwayRows,
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteHotspots,
  replaceRouteInterventionEvaluationRows,
  replaceRouteObservedReliabilityRows,
  replaceRouteReliabilityRows,
} from "@bp/db/local";
import { buildBriefArtifacts } from "../src/jobs/build/brief-artifacts.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-10";
const dbPath = fromRepoRoot(join("data/fixtures/brief-artifacts/pipeline.sqlite"));
const routeBriefDir = fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth));
const corridorBriefDir = fromRepoRoot(
  join("data/artifacts/briefs/corridors/street-broadway", isoMonth),
);

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(dbPath, { force: true }),
    rm(routeBriefDir, { force: true, recursive: true }),
    rm(corridorBriefDir, { force: true, recursive: true }),
  ]);
}

async function writeFixtureNetwork(): Promise<void> {
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
    await replaceRouteHotspots(
      local.db,
      {
        routeId: "T1",
        isoMonth,
        generatedAt: "2026-10-01T00:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 20,
        busTripCount: 200,
        ridershipWeighted: true,
        ridershipWindowCount: 1,
        ridershipMatchedObservationCount: 1,
        ridershipExposure: 1000,
        segmentCount: 1,
        hotspotCount: 1,
      },
      [
        {
          routeId: "T1",
          isoMonth,
          segmentId: "T1:1",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "A",
          timepointStopName: "BROADWAY/MARCY AV",
          nextTimepointStopId: "B",
          nextTimepointStopName: "BROADWAY/KEAP ST",
          observationCount: 10,
          busTripCount: 100,
          weightedAverageSpeedMph: 5,
          weightedAverageTravelTimeMinutes: 8,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.8,
          speedSeverity: 0.5,
          hotspotScore: 80,
          riderImpactScore: 79,
        },
      ],
    );
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
      sourceStatuses: [],
    });
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
      sourceStatuses: [],
    });
    await insertGtfsRtCollectionRun(local.db, {
      runId: "fixture-gtfs-rt",
      startedAt: "2026-10-01T08:00:00.000Z",
      endedAt: "2026-10-01T08:10:00.000Z",
      status: "completed",
      requestedDurationSeconds: 600,
      sampleSeconds: 30,
      requestedFeedTypes: "vehicle_positions",
      snapshotCount: 2,
      successCount: 2,
      failureCount: 0,
      rawDirectory: "/tmp/gtfs-rt",
      error: null,
    });
    for (let sampleIndex = 1; sampleIndex <= 2; sampleIndex += 1) {
      await insertGtfsRtFeedSnapshot(local.db, {
        runId: "fixture-gtfs-rt",
        feedType: "vehicle_positions",
        sampleIndex,
        sourceId: "bus_time_gtfsrt_vehicle_positions",
        fetchedAt: `2026-10-01T08:0${sampleIndex - 1}:00.000Z`,
        status: "ok",
        httpStatus: 200,
        byteLength: 100,
        sha256: "fixture",
        rawPath: `/tmp/gtfs-rt/${sampleIndex}.pb`,
        redactedUrl: "https://example.test/<redacted>",
        error: null,
      });
    }
    await replaceObservedHeadwayRows(local.db, "fixture-gtfs-rt", {
      stopEvents: [],
      headwaySamples: [
        {
          runId: "fixture-gtfs-rt",
          sampleRank: 1,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 0,
          stopId: "S1",
          previousVehicleKey: "bus-1",
          vehicleKey: "bus-2",
          previousObservedTimestamp: Date.UTC(2026, 9, 1, 12, 0, 0) / 1000,
          observedTimestamp: Date.UTC(2026, 9, 1, 12, 24, 0) / 1000,
          headwaySeconds: 1440,
          headwayMinutes: 24,
        },
        {
          runId: "fixture-gtfs-rt",
          sampleRank: 2,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 0,
          stopId: "S1",
          previousVehicleKey: "bus-2",
          vehicleKey: "bus-3",
          previousObservedTimestamp: Date.UTC(2026, 9, 1, 12, 24, 0) / 1000,
          observedTimestamp: Date.UTC(2026, 9, 1, 12, 42, 0) / 1000,
          headwaySeconds: 1080,
          headwayMinutes: 18,
        },
        {
          runId: "fixture-gtfs-rt",
          sampleRank: 3,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 1,
          stopId: "S2",
          previousVehicleKey: "bus-4",
          vehicleKey: "bus-5",
          previousObservedTimestamp: Date.UTC(2026, 9, 1, 13, 0, 0) / 1000,
          observedTimestamp: Date.UTC(2026, 9, 1, 13, 3, 0) / 1000,
          headwaySeconds: 180,
          headwayMinutes: 3,
        },
        {
          runId: "fixture-gtfs-rt",
          sampleRank: 4,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 1,
          stopId: "S2",
          previousVehicleKey: "bus-5",
          vehicleKey: "bus-6",
          previousObservedTimestamp: Date.UTC(2026, 9, 1, 13, 3, 0) / 1000,
          observedTimestamp: Date.UTC(2026, 9, 1, 13, 7, 0) / 1000,
          headwaySeconds: 240,
          headwayMinutes: 4,
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
          observedReliabilityRouteCount: 1,
          insufficientReliabilityRouteCount: 0,
          interventionComparisonCount: 1,
          evaluatedInterventionComparisonCount: 1,
        },
      ],
      interventionContexts: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          contextRank: 1,
          routeId: "T1",
          eventId: "ace:T1:ACE:2026-01-15",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          program: "ACE",
          implementationMonth: "2026-01",
          eventStatus: "implemented",
          evaluationLevel: "descriptive_before_after",
          comparisonStatus: "evaluated",
          speedDeltaMph: 2,
          adjustedSpeedDeltaMph: null,
          ridershipDelta: 400,
          adjustedRidershipDelta: null,
          comparisonRouteCount: 0,
          caveat: "Descriptive before/after only.",
        },
      ],
      hotspots: [
        {
          corridorId: "street:broadway",
          month: isoMonth,
          corridorHotspotRank: 1,
          routeId: "T1",
          routeHotspotRank: 1,
          fromStopName: "BROADWAY/MARCY AV",
          toStopName: "BROADWAY/KEAP ST",
          weightedAverageSpeedMph: 5,
          hotspotScore: 80,
          riderImpactScore: 79,
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

describe("brief artifacts", () => {
  test("writes route and corridor bodies plus verified metadata rows", async () => {
    await writeFixtureNetwork();

    const result = await buildBriefArtifacts({ year: 2026, month: 10, dbPath });
    const routeJson = await Bun.file(
      fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth, "brief.json")),
    ).json();
    const routeMarkdown = await Bun.file(
      fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth, "brief.md")),
    ).text();
    const corridorMarkdown = await Bun.file(
      fromRepoRoot(join("data/artifacts/briefs/corridors/street-broadway", isoMonth, "brief.md")),
    ).text();
    const corridorJson = await Bun.file(
      fromRepoRoot(join("data/artifacts/briefs/corridors/street-broadway", isoMonth, "brief.json")),
    ).json();
    const local = await openLocalPipelineDb(dbPath);
    const [routeArtifacts, corridorArtifacts] = await Promise.all([
      listRouteArtifacts(local.db, isoMonth),
      listCorridorArtifacts(local.db, isoMonth),
    ]);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeBriefCount: 1,
        corridorBriefCount: 1,
        routeArtifactCount: 3,
        corridorArtifactCount: 3,
      }),
    );
    expect(routeJson).toEqual(
      expect.objectContaining({
        artifactKind: "route_brief",
        routeId: "T1",
        month: isoMonth,
        observedReliability: expect.objectContaining({
          collectionWindow: expect.objectContaining({
            runId: "fixture-gtfs-rt",
            elapsedSeconds: 600,
            sampleSeconds: 30,
            successfulVehiclePositionSnapshotCount: 2,
          }),
          windows: expect.objectContaining({
            topLongGapWindows: expect.arrayContaining([
              expect.objectContaining({
                rank: 1,
                stopId: "S1",
                sampleCount: 2,
                p90ObservedHeadwayMinutes: 23.4,
                observedLongGapShare: 0.5,
              }),
            ]),
            topBunchingWindows: expect.arrayContaining([
              expect.objectContaining({
                rank: 1,
                stopId: "S2",
                sampleCount: 2,
                observedBunchingShare: 1,
              }),
            ]),
          }),
        }),
      }),
    );
    expect(routeMarkdown).toContain("GTFS-RT run fixture-gtfs-rt");
    expect(routeMarkdown).toContain("Long-gap window 1");
    expect(routeMarkdown).toContain("Bunching window 1");
    expect(corridorMarkdown).toContain("# Broadway Corridor");
    expect(corridorMarkdown).toContain("## Intervention Context");
    expect(corridorMarkdown).toContain("T1 ACE");
    expect(corridorJson).toEqual(
      expect.objectContaining({
        interventionContext: [
          expect.objectContaining({
            routeId: "T1",
            program: "ACE",
            comparisonStatus: "evaluated",
            speedDeltaMph: 2,
          }),
        ],
      }),
    );
    expect(routeArtifacts).toHaveLength(3);
    expect(corridorArtifacts).toHaveLength(3);
    expect(routeArtifacts[0]).toEqual(
      expect.objectContaining({
        routeId: "T1",
        month: isoMonth,
        byteLength: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
});
