import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
  replaceAceRoutes,
  replaceBusLanes,
  replaceCorridorRows,
  replaceGtfsRtParsedSnapshot,
  replaceObservedHeadwayRows,
  replaceRouteBatch,
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteHotspots,
  replaceRouteInterventionEvaluationRows,
  replaceRouteMonthCoverage,
  replaceRouteMonthTrends,
  replaceRouteObservedReliabilityRows,
  replaceRouteReadiness,
  replaceRouteReliabilityRows,
  replaceRouteScorecard,
  replaceRouteSegmentSpeeds,
  replaceRouteStops,
} from "@bp/db/local";
import { buildBriefArtifacts } from "../src/jobs/build/brief-artifacts.js";
import { buildEvaluationArtifacts } from "../src/jobs/build/evaluation-artifacts.js";
import { buildMapArtifacts } from "../src/jobs/build/map-artifacts.js";
import { checkPipelineV1 } from "../src/jobs/check/pipeline-v1.js";
import { auditPipelineV1 } from "../src/jobs/check/pipeline-v1-audit.js";
import { routeSpeedAvailabilityArtifactPath } from "../src/jobs/check/route-speed-availability.js";
import { sourceRefreshPlanArtifactPath } from "../src/jobs/check/source-refresh-plan.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-11";
const dbPath = fromRepoRoot(join("data/fixtures/check-pipeline-v1/pipeline.sqlite"));
const exportDir = fromRepoRoot(join("data/exports/d1", isoMonth));
const routeBriefDir = fromRepoRoot(join("data/artifacts/briefs/routes/t1", isoMonth));
const corridorBriefDir = fromRepoRoot(
  join("data/artifacts/briefs/corridors/street-broadway", isoMonth),
);
const unassignedCorridorBriefDir = fromRepoRoot(
  join("data/artifacts/briefs/corridors/unassigned-t1", isoMonth),
);
const evaluationArtifactDir = fromRepoRoot(join("data/artifacts/evaluations", isoMonth));
const mapArtifactDir = fromRepoRoot(join("data/artifacts/map"));
const routeSpeedAvailabilityPath = routeSpeedAvailabilityArtifactPath(
  fromRepoRoot(join("data/artifacts")),
);
const sourceRefreshPlanPath = sourceRefreshPlanArtifactPath(fromRepoRoot(join("data/artifacts")));
const corridorShapeReviewDir = fromRepoRoot(join("data/artifacts/route-batches", isoMonth));
const corridorShapeReviewPath = join(corridorShapeReviewDir, "corridor-shape-review.json");
const mapRawDir = fromRepoRoot(join("data/fixtures/check-pipeline-v1/map-raw"));
const routeShapeSnapshotPath = join(mapRawDir, "current_bus_routes.json");
const stopSnapshotPath = join(mapRawDir, "current_bus_stops.json");
const busLaneSnapshotPath = join(mapRawDir, "bus-lanes-local-streets.json");
const sourceMetadataDir = fromRepoRoot(join("data/fixtures/check-pipeline-v1/source-metadata"));
const auditOutputPath = fromRepoRoot(join("data/fixtures/check-pipeline-v1/audit.json"));
const fixtureNow = new Date("2026-11-15T00:00:00.000Z");
const observedRunId = "fixture-gtfs-rt";
const requiredSourceIds = [
  "bus_segment_speeds_2025",
  "current_bus_routes",
  "current_bus_stops",
  "bus_hourly_ridership_2025",
  "bus_schedules_2026",
  "ace_routes",
  "ace_violations",
  "nyc_dot_bus_lanes_local_streets",
  "nyc_borough_boundaries",
  "census_acs5_profile_tracts",
] as const;

async function removeFixtureArtifacts(): Promise<void> {
  await Promise.all([
    rm(dbPath, { force: true }),
    rm(exportDir, { force: true, recursive: true }),
    rm(routeBriefDir, { force: true, recursive: true }),
    rm(corridorBriefDir, { force: true, recursive: true }),
    rm(unassignedCorridorBriefDir, { force: true, recursive: true }),
    rm(evaluationArtifactDir, { force: true, recursive: true }),
    rm(mapArtifactDir, { force: true, recursive: true }),
    rm(dirname(routeSpeedAvailabilityPath), { force: true, recursive: true }),
    rm(dirname(sourceRefreshPlanPath), { force: true, recursive: true }),
    rm(corridorShapeReviewDir, { force: true, recursive: true }),
    rm(mapRawDir, { force: true, recursive: true }),
    rm(sourceMetadataDir, { force: true, recursive: true }),
    rm(auditOutputPath, { force: true }),
  ]);
}

async function writeRouteSpeedAvailabilityArtifact(): Promise<void> {
  await mkdir(dirname(routeSpeedAvailabilityPath), { recursive: true });
  await Bun.write(
    routeSpeedAvailabilityPath,
    `${JSON.stringify(
      {
        sourceId: "bus_segment_speeds_2025",
        checkedAt: "2026-11-15T00:00:00.000Z",
        startYear: 2026,
        endYear: 2026,
        minSpeedRoutes: 1,
        latestSpeedMonth: {
          isoMonth,
          year: 2026,
          month: 11,
          routeCount: 1,
          rowCount: 2,
          busTripCount: 20,
          status: "complete",
        },
        requestedMonth: {
          isoMonth,
          year: 2026,
          month: 11,
          routeCount: 1,
          rowCount: 2,
          busTripCount: 20,
          status: "complete",
        },
        releaseDecision: {
          status: "new_complete_month_available",
          latestCompleteMonth: isoMonth,
          lastBuiltMonth: null,
          shouldRebuild: true,
          reason: `Latest complete speed month is ${isoMonth}; no last built month was provided.`,
        },
        months: [
          {
            isoMonth,
            year: 2026,
            month: 11,
            routeCount: 1,
            rowCount: 2,
            busTripCount: 20,
            status: "complete",
          },
        ],
        artifactPath: routeSpeedAvailabilityPath,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeSourceRefreshPlanArtifact(): Promise<void> {
  await mkdir(dirname(sourceRefreshPlanPath), { recursive: true });
  await Bun.write(
    sourceRefreshPlanPath,
    `${JSON.stringify(
      {
        checkedAt: "2026-11-15T00:00:00.000Z",
        requestedMonth: isoMonth,
        lastBuiltMonth: "2026-10",
        routeSpeedAvailability: {
          sourceId: "bus_segment_speeds_2025",
          checkedAt: "2026-11-15T00:00:00.000Z",
          startYear: 2026,
          endYear: 2026,
          minSpeedRoutes: 1,
          latestSpeedMonth: {
            isoMonth,
            year: 2026,
            month: 11,
            routeCount: 1,
            rowCount: 2,
            busTripCount: 20,
            status: "complete",
          },
          requestedMonth: {
            isoMonth,
            year: 2026,
            month: 11,
            routeCount: 1,
            rowCount: 2,
            busTripCount: 20,
            status: "complete",
          },
          releaseDecision: {
            status: "new_complete_month_available",
            latestCompleteMonth: isoMonth,
            lastBuiltMonth: "2026-10",
            shouldRebuild: true,
            reason: `Latest complete speed month ${isoMonth} is newer than last built month 2026-10.`,
          },
          months: [
            {
              isoMonth,
              year: 2026,
              month: 11,
              routeCount: 1,
              rowCount: 2,
              busTripCount: 20,
              status: "complete",
            },
          ],
          artifactPath: routeSpeedAvailabilityPath,
        },
        jobs: [
          {
            id: "gtfs_rt_collector",
            requiredForV1: true,
            cadence: "vehicle_positions every 30s while service is running",
            status: "required",
            evidence: "Fixture realtime collection requirement.",
            nextActions: ["Deploy a scheduled collector."],
          },
          {
            id: "route_speed_monthly_watcher",
            requiredForV1: true,
            cadence: "poll current and previous public months",
            status: "ready_to_rebuild",
            evidence: "Fixture watcher rebuild decision.",
            nextActions: ["Run ingest/build/finalize."],
          },
        ],
        artifactPath: sourceRefreshPlanPath,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeRawSnapshot(path: string, sourceId: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId,
        fetchedAt: "2026-11-01T00:00:00.000Z",
        query: {},
        rows,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeMapRawFixtures(): Promise<void> {
  await writeRawSnapshot(routeShapeSnapshotPath, "current_bus_routes", [
    {
      route_id: "T1",
      route_short_name: "T1",
      route_long_name: "Fixture route",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      shape_id: "shape-t1-n",
      route_type: "Local",
      geometry: {
        type: "LineString",
        coordinates: [
          [-73.99, 40.7],
          [-73.98, 40.71],
          [-73.97, 40.72],
        ],
      },
    },
  ]);
  await writeRawSnapshot(stopSnapshotPath, "current_bus_stops", [
    {
      route_id: "T1",
      route_short_name: "T1",
      stop_id: "S1",
      stop_name: "Start Stop",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      timepoint: "1",
      latitude: "40.7",
      longitude: "-73.99",
    },
    {
      route_id: "T1",
      route_short_name: "T1",
      stop_id: "S2",
      stop_name: "End Stop",
      in_effect: "true",
      direction_id: "0",
      direction: "N",
      timepoint: "1",
      latitude: "40.72",
      longitude: "-73.97",
    },
  ]);
  await writeRawSnapshot(busLaneSnapshotPath, "nyc_dot_bus_lanes_local_streets", [
    {
      segmentid: "BL1",
      street: "Fixture St",
      boro: "MAN",
      facility: "Bus Lane",
      the_geom: {
        type: "LineString",
        coordinates: [
          [-73.99, 40.7],
          [-73.98, 40.71],
        ],
      },
    },
  ]);
}

async function writeSourceProbeMetadata(
  overrides: Partial<
    Record<(typeof requiredSourceIds)[number], { checkedAt?: string; probeStatus?: string }>
  > = {},
): Promise<void> {
  await mkdir(sourceMetadataDir, { recursive: true });

  await Promise.all(
    requiredSourceIds.map((sourceId) =>
      Bun.write(
        join(sourceMetadataDir, `${sourceId}.json`),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            sourceId,
            checkedAt: overrides[sourceId]?.checkedAt ?? "2026-11-01T00:00:00.000Z",
            probeStatus: overrides[sourceId]?.probeStatus ?? "active",
          },
          null,
          2,
        )}\n`,
      ),
    ),
  );
}

async function writeCorridorShapeReviewArtifact(
  overrides: {
    routeId?: string;
    reviewStatus?: string;
    assignmentStatus?: string;
    matchedSegmentCount?: number;
    publicRouteCount?: number;
    segmentBackedRouteCount?: number;
  } = {},
): Promise<void> {
  const reviewStatus = overrides.reviewStatus ?? "pass";
  const matchedSegmentCount = overrides.matchedSegmentCount ?? 1;
  const publicRouteCount = overrides.publicRouteCount ?? 1;
  const segmentBackedRouteCount =
    overrides.segmentBackedRouteCount ?? (matchedSegmentCount > 0 ? 1 : 0);
  await mkdir(corridorShapeReviewDir, { recursive: true });
  await Bun.write(
    corridorShapeReviewPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        artifactKind: "corridor_shape_review",
        month: isoMonth,
        generatedAt: "2026-11-01T00:00:00.000Z",
        routeShapeSnapshotPath: "/tmp/current_bus_routes.json",
        routeShapeSnapshotFetchedAt: "2026-11-01T00:00:00.000Z",
        maxAllowedEndpointDistanceMeters: 250,
        summary: {
          publicRouteCount,
          segmentBackedRouteCount,
          shapeReviewedRouteCount: reviewStatus === "pass" ? 1 : 0,
          passRouteCount: reviewStatus === "pass" ? 1 : 0,
          warningRouteCount: reviewStatus === "shape_distance_warning" ? 1 : 0,
          missingShapeRouteCount: reviewStatus === "missing_shape" ? 1 : 0,
          missingSegmentEvidenceRouteCount: reviewStatus === "missing_segment_evidence" ? 1 : 0,
          missingSegmentCoordinateRouteCount:
            reviewStatus === "missing_segment_coordinates" ? 1 : 0,
          unassignedRouteCount: reviewStatus === "unassigned" ? 1 : 0,
          maxEndpointDistanceMeters: reviewStatus === "pass" ? 12 : null,
          p95EndpointDistanceMeters: reviewStatus === "pass" ? 12 : null,
        },
        routes: [
          {
            routeId: overrides.routeId ?? "T1",
            corridorId: "street:broadway",
            corridorName: "Broadway",
            assignmentStatus: overrides.assignmentStatus ?? "assigned",
            assignmentReason: "primary_hotspot_segment_street",
            shapeCount: reviewStatus === "missing_shape" ? 0 : 1,
            shapeCoordinateCount: reviewStatus === "missing_shape" ? 0 : 2,
            matchedSegmentCount,
            reviewedSegmentCount: reviewStatus === "pass" ? 1 : 0,
            missingSegmentCoordinateCount: reviewStatus === "missing_segment_coordinates" ? 1 : 0,
            maxEndpointDistanceMeters: reviewStatus === "pass" ? 12 : null,
            medianEndpointDistanceMeters: reviewStatus === "pass" ? 10 : null,
            reviewStatus,
            caveat: "Fixture corridor shape review.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function checkArgs(overrides: Parameters<typeof checkPipelineV1>[0] = {}) {
  return {
    year: 2026,
    month: 11,
    dbPath,
    sourceMetadataDir,
    now: fixtureNow,
    minGtfsRtCollectionHours: 0.1,
    ...overrides,
  };
}

async function writeFixtureNetwork(options: {
  includeObservedAndInterventions: boolean;
  includeGtfsRtProvenance?: boolean;
  includeRouteTrends?: boolean;
  gtfsRtOutsideMonth?: boolean;
}) {
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
    await replaceRouteSegmentSpeeds(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        timestamp: "2026-11-01T08:00:00.000Z",
        dayOfWeek: "weekday",
        hourOfDay: 8,
        direction: "N",
        borough: "Manhattan",
        routeType: "Local",
        stopOrder: 1,
        timepointStopId: "S1",
        timepointStopName: "Start Stop",
        timepointStopLatitude: 40.7,
        timepointStopLongitude: -73.99,
        nextTimepointStopId: "S2",
        nextTimepointStopName: "End Stop",
        nextTimepointStopLatitude: 40.72,
        nextTimepointStopLongitude: -73.97,
        roadDistanceMiles: 1,
        averageTravelTimeMinutes: 10,
        averageRoadSpeedMph: 6,
        busTripCount: 10,
      },
    ]);
    await replaceRouteStops(local.db, "T1", isoMonth, [
      {
        routeId: "T1",
        isoMonth,
        routeShortName: "T1",
        stopId: "S1",
        stopName: "Fixture St / Start Stop",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.7,
        longitude: -73.99,
      },
      {
        routeId: "T1",
        isoMonth,
        routeShortName: "T1",
        stopId: "S2",
        stopName: "Fixture St / End Stop",
        inEffect: true,
        directionId: "0",
        direction: "N",
        timepoint: true,
        latitude: 40.72,
        longitude: -73.97,
      },
    ]);
    await replaceRouteHotspots(
      local.db,
      {
        routeId: "T1",
        isoMonth,
        generatedAt: "2026-11-01T00:00:00.000Z",
        routeWeightedAverageSpeedMph: 6,
        observationCount: 1,
        busTripCount: 10,
        ridershipWeighted: false,
        ridershipWindowCount: 0,
        ridershipMatchedObservationCount: 0,
        ridershipExposure: 0,
        segmentCount: 1,
        hotspotCount: 1,
      },
      [
        {
          routeId: "T1",
          isoMonth,
          segmentId: "N:1:S1:S2",
          direction: "N",
          stopOrder: 1,
          timepointStopId: "S1",
          timepointStopName: "Start Stop",
          nextTimepointStopId: "S2",
          nextTimepointStopName: "End Stop",
          observationCount: 1,
          busTripCount: 10,
          weightedAverageSpeedMph: 6,
          weightedAverageTravelTimeMinutes: 10,
          averageRoadDistanceMiles: 1,
          slowWindowShare: 0.5,
          speedSeverity: 50,
          hotspotScore: 75,
        },
      ],
    );
    await replaceBusLanes(local.db, [
      {
        segmentId: "BL1",
        street: "Fixture St",
        borough: "MAN",
        facility: "Bus Lane",
        coordinates: [
          { longitude: -73.99, latitude: 40.7 },
          { longitude: -73.98, latitude: 40.71 },
        ],
      },
    ]);
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
    if (options.includeRouteTrends !== false) {
      await replaceRouteMonthTrends(local.db, [
        {
          routeId: "T1",
          month: "2025-11",
          speedObservationCount: 10,
          speedBusTripCount: 100,
          averageSpeedMph: 5,
          ridership: 900,
          transfers: 90,
          hasSpeedTrend: true,
          hasRidershipTrend: true,
        },
        {
          routeId: "T1",
          month: "2025-12",
          speedObservationCount: 20,
          speedBusTripCount: 200,
          averageSpeedMph: 7,
          ridership: 1100,
          transfers: 110,
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
    }
    if (options.includeObservedAndInterventions) {
      await replaceRouteObservedReliabilityRows(local.db, isoMonth, observedRunId, {
        summaries: [
          {
            routeId: "T1",
            month: isoMonth,
            runId: observedRunId,
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
            snapshotId: observedRunId,
            note: null,
          },
          {
            routeId: "T1",
            month: isoMonth,
            sourceScope: "reliability",
            sourceId: "bunching",
            status: "available",
            rowCount: 42,
            snapshotId: observedRunId,
            note: null,
          },
          {
            routeId: "T1",
            month: isoMonth,
            sourceScope: "reliability",
            sourceId: "waitTimeReliability",
            status: "available",
            rowCount: 42,
            snapshotId: observedRunId,
            note: null,
          },
        ],
      });
      if (options.includeGtfsRtProvenance !== false) {
        const gtfsRtDatePrefix = options.gtfsRtOutsideMonth ? "2026-10-01" : "2026-11-01";
        const gtfsRtTimestampBase = options.gtfsRtOutsideMonth ? 1_790_812_800 : 1_793_491_200;
        await insertGtfsRtCollectionRun(local.db, {
          runId: observedRunId,
          startedAt: `${gtfsRtDatePrefix}T00:00:00.000Z`,
          endedAt: `${gtfsRtDatePrefix}T00:10:00.000Z`,
          status: "completed",
          requestedDurationSeconds: 600,
          sampleSeconds: 30,
          requestedFeedTypes: "vehicle_positions",
          snapshotCount: 10,
          successCount: 10,
          failureCount: 0,
          rawDirectory: "/tmp/gtfs-rt",
          error: null,
        });
        for (let sampleIndex = 1; sampleIndex <= 10; sampleIndex += 1) {
          await insertGtfsRtFeedSnapshot(local.db, {
            runId: observedRunId,
            feedType: "vehicle_positions",
            sampleIndex,
            sourceId: "bus_time_gtfsrt_vehicle_positions",
            fetchedAt: `${gtfsRtDatePrefix}T00:${String(sampleIndex - 1).padStart(2, "0")}:00.000Z`,
            status: "ok",
            httpStatus: 200,
            byteLength: 100,
            sha256: "fixture",
            rawPath: `/tmp/gtfs-rt/vehicle_positions-${sampleIndex}.pb`,
            redactedUrl: "https://example.test/<redacted>",
            error: null,
          });
        }
        await replaceGtfsRtParsedSnapshot(local.db, {
          parsedSnapshot: {
            runId: observedRunId,
            feedType: "vehicle_positions",
            sampleIndex: 1,
            parsedAt: "2026-11-01T00:00:01.000Z",
            status: "parsed",
            gtfsRealtimeVersion: "2.0",
            feedTimestamp: gtfsRtTimestampBase,
            entityCount: 2,
            vehiclePositionCount: 2,
            tripUpdateCount: 0,
            stopTimeUpdateCount: 0,
            alertCount: 0,
            error: null,
          },
          vehiclePositions: [
            {
              runId: observedRunId,
              feedType: "vehicle_positions",
              sampleIndex: 1,
              entityId: "entity-bus-1",
              entityDeleted: false,
              gtfsRealtimeVersion: "2.0",
              feedTimestamp: gtfsRtTimestampBase,
              sourceRouteId: "MTA NYCT_T1",
              routeId: "T1",
              tripId: "trip-1",
              startDate: null,
              startTime: null,
              directionId: 0,
              scheduleRelationship: "SCHEDULED",
              vehicleId: "bus-1",
              vehicleLabel: null,
              vehicleLicensePlate: null,
              latitude: 40.741,
              longitude: -73.989,
              bearing: null,
              odometer: null,
              speed: null,
              currentStopSequence: null,
              stopId: "S1",
              currentStatus: "STOPPED_AT",
              timestamp: gtfsRtTimestampBase,
              congestionLevel: null,
              occupancyStatus: null,
              occupancyPercentage: null,
            },
          ],
          tripUpdates: [],
          stopTimeUpdates: [],
          alerts: [],
        });
        await replaceObservedHeadwayRows(local.db, observedRunId, {
          stopEvents: [],
          headwaySamples: Array.from({ length: 42 }, (_, index) => ({
            runId: observedRunId,
            sampleRank: index + 1,
            routeId: "T1",
            sourceRouteId: "MTA NYCT_T1",
            directionId: 0,
            stopId: "S1",
            previousVehicleKey: `bus-${index}`,
            vehicleKey: `bus-${index + 1}`,
            previousObservedTimestamp: gtfsRtTimestampBase + index * 600,
            observedTimestamp: gtfsRtTimestampBase + 300 + index * 600,
            headwaySeconds: 300,
            headwayMinutes: 5,
          })),
        });
      }
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
            evaluationLevel: "peer_adjusted_before_after",
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
            comparisonRouteCount: 1,
            comparisonRouteIds: '["T2"]',
            comparisonPreAverageSpeedMph: 5.5,
            comparisonPostAverageSpeedMph: 6,
            comparisonSpeedDeltaMph: 0.5,
            adjustedSpeedDeltaMph: 1.5,
            comparisonPreAverageMonthlyRidership: 900,
            comparisonPostAverageMonthlyRidership: 1000,
            comparisonRidershipDelta: 100,
            adjustedRidershipDelta: 300,
            caveat: "Peer-adjusted before/after using 1 public route.",
          },
        ],
      });
      await replaceRouteInterventionEvaluationRows(local.db, isoMonth, "nyc_dot_bus_lanes", {
        events: [
          {
            eventId: "bus-lane-source-gap:T1:2026-11",
            routeId: "T1",
            interventionType: "bus_lane_infrastructure",
            sourceId: "nyc_dot_bus_lanes",
            program: "NYC DOT Bus Lanes",
            implementationDate: "2026-11-01T00:00:00.000Z",
            implementationMonth: "2026-11",
            eventStatus: "source_gap",
            description:
              "NYC DOT bus lane match for T1; route-level implementation date is not available in the current pipeline evidence.",
          },
        ],
        comparisons: [
          {
            routeId: "T1",
            month: isoMonth,
            eventId: "bus-lane-source-gap:T1:2026-11",
            interventionType: "bus_lane_infrastructure",
            sourceId: "nyc_dot_bus_lanes",
            evaluationLevel: "not_evaluated_source_gap",
            comparisonStatus: "source_gap_missing_implementation_date",
            preStartMonth: null,
            preEndMonth: null,
            postStartMonth: null,
            postEndMonth: null,
            requestedPreMonthCount: 0,
            requestedPostMonthCount: 0,
            preSampleMonthCount: 0,
            postSampleMonthCount: 0,
            preSpeedObservationCount: 0,
            postSpeedObservationCount: 0,
            preAverageSpeedMph: null,
            postAverageSpeedMph: null,
            speedDeltaMph: null,
            preAverageMonthlyRidership: null,
            postAverageMonthlyRidership: null,
            ridershipDelta: null,
            caveat:
              "NYC DOT bus lane geometry is matched to the route, but this pipeline has no route-level implementation date for a before/after comparison.",
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
          matchedSegmentCount: 1,
          segmentEvidenceScore: 80,
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
      interventionContexts: options.includeObservedAndInterventions
        ? [
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
              evaluationLevel: "peer_adjusted_before_after",
              comparisonStatus: "evaluated",
              speedDeltaMph: 2,
              adjustedSpeedDeltaMph: 1.5,
              ridershipDelta: 400,
              adjustedRidershipDelta: 300,
              comparisonRouteCount: 1,
              caveat: "Peer-adjusted before/after using 1 public route.",
            },
            {
              corridorId: "street:broadway",
              month: isoMonth,
              contextRank: 2,
              routeId: "T1",
              eventId: "bus-lane-source-gap:T1:2026-11",
              interventionType: "bus_lane_infrastructure",
              sourceId: "nyc_dot_bus_lanes",
              program: "NYC DOT Bus Lanes",
              implementationMonth: "2026-11",
              eventStatus: "source_gap",
              evaluationLevel: "not_evaluated_source_gap",
              comparisonStatus: "source_gap_missing_implementation_date",
              speedDeltaMph: null,
              adjustedSpeedDeltaMph: null,
              ridershipDelta: null,
              adjustedRidershipDelta: null,
              comparisonRouteCount: 0,
              caveat:
                "NYC DOT bus lane geometry is matched to the route, but this pipeline has no route-level implementation date for a before/after comparison.",
            },
          ]
        : [],
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
  await writeSourceProbeMetadata();
  await writeMapRawFixtures();
  await writeCorridorShapeReviewArtifact();
  await buildEvaluationArtifacts({ year: 2026, month: 11, dbPath });
  await buildMapArtifacts({
    year: 2026,
    month: 11,
    dbPath,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    busLaneSnapshotPath,
  });
  await buildBriefArtifacts({ year: 2026, month: 11, dbPath });
}

async function replaceWithInsufficientObservedReliability(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, observedRunId, {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId: observedRunId,
          reliabilityStatus: "insufficient_gtfs_rt_samples",
          minSampleThreshold: 30,
          sampleCount: 0,
          stopCount: 0,
          directionCount: 0,
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
      sourceStatuses: [
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "observedHeadways",
          status: "insufficient_gtfs_rt_samples",
          rowCount: 0,
          snapshotId: observedRunId,
          note: "0 observed headway samples; minimum 30",
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "bunching",
          status: "insufficient_gtfs_rt_samples",
          rowCount: 0,
          snapshotId: observedRunId,
          note: "0 observed headway samples; minimum 30",
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "waitTimeReliability",
          status: "insufficient_gtfs_rt_samples",
          rowCount: 0,
          snapshotId: observedRunId,
          note: "0 observed headway samples; minimum 30",
        },
      ],
    });
  } finally {
    local.sqlite.close();
  }
  await buildEvaluationArtifacts({ year: 2026, month: 11, dbPath });
  await buildBriefArtifacts({ year: 2026, month: 11, dbPath });
}

async function replaceWithBelowThresholdObservedReliability(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, observedRunId, {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId: observedRunId,
          reliabilityStatus: "observed",
          minSampleThreshold: 30,
          sampleCount: 2,
          stopCount: 1,
          directionCount: 1,
          averageObservedHeadwayMinutes: 8,
          medianObservedHeadwayMinutes: 8,
          p90ObservedHeadwayMinutes: 9,
          maxObservedHeadwayMinutes: 10,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: 0,
          observedLongGapShare: 0,
          expectedWaitMinutes: 4,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: -1,
          waitReliabilityRatio: 0.8,
        },
      ],
      sourceStatuses: [
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "observedHeadways",
          status: "available",
          rowCount: 2,
          snapshotId: observedRunId,
          note: "2 observed headway samples; minimum 30",
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "bunching",
          status: "available",
          rowCount: 2,
          snapshotId: observedRunId,
          note: "2 observed headway samples; minimum 30",
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "waitTimeReliability",
          status: "available",
          rowCount: 2,
          snapshotId: observedRunId,
          note: "2 observed headway samples; minimum 30",
        },
      ],
    });
  } finally {
    local.sqlite.close();
  }
  await buildEvaluationArtifacts({ year: 2026, month: 11, dbPath });
  await buildBriefArtifacts({ year: 2026, month: 11, dbPath });
}

async function insertStaleObservedReliabilityRun(): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    local.sqlite.exec(`
      insert into local_route_observed_reliability_summary (
        route_id,
        month,
        run_id,
        reliability_status,
        min_sample_threshold,
        sample_count,
        stop_count,
        direction_count,
        average_observed_headway_minutes,
        median_observed_headway_minutes,
        p90_observed_headway_minutes,
        max_observed_headway_minutes,
        scheduled_median_headway_minutes,
        bunching_threshold_minutes,
        long_gap_threshold_minutes,
        observed_bunching_share,
        observed_long_gap_share,
        expected_wait_minutes,
        scheduled_expected_wait_minutes,
        excess_wait_minutes,
        wait_reliability_ratio
      ) values (
        'T1',
        '${isoMonth}',
        'stale-gtfs-rt',
        'observed',
        3,
        9,
        2,
        1,
        9,
        9,
        12,
        18,
        10,
        5,
        20,
        0.2,
        0.1,
        6,
        5,
        1,
        1.2
      );
    `);
  } finally {
    local.sqlite.close();
  }
}

async function replaceWithCorridorAssignmentStatus(
  assignmentStatus: "ambiguous" | "unassigned",
): Promise<void> {
  const corridorId = assignmentStatus === "ambiguous" ? "street:broadway" : "unassigned:t1";
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceCorridorRows(local.db, isoMonth, {
      corridors: [
        {
          corridorId,
          corridorName: assignmentStatus === "ambiguous" ? "Broadway" : "Unassigned T1",
          corridorKey: assignmentStatus === "ambiguous" ? "BROADWAY" : corridorId,
          derivationMethod:
            assignmentStatus === "ambiguous"
              ? "primary_route_stop_street"
              : "unassigned_route_placeholder",
        },
      ],
      routeMembers: [
        {
          corridorId,
          month: isoMonth,
          routeId: "T1",
          assignmentStatus,
          assignmentReason:
            assignmentStatus === "ambiguous" ? "ambiguous_primary_stop_street" : "no_route_stops",
          stopCount: assignmentStatus === "ambiguous" ? 2 : 0,
          matchedStopCount: assignmentStatus === "ambiguous" ? 1 : 0,
          hotspotCount: 1,
          matchedSegmentCount: assignmentStatus === "ambiguous" ? 1 : 0,
          segmentEvidenceScore: assignmentStatus === "ambiguous" ? 80 : 0,
          totalRidership: 1000,
          averageSpeedMph: 6,
        },
      ],
      summaries: [
        {
          corridorId,
          month: isoMonth,
          routeCount: 1,
          assignedRouteCount: 0,
          ambiguousRouteCount: assignmentStatus === "ambiguous" ? 1 : 0,
          unassignedRouteCount: assignmentStatus === "unassigned" ? 1 : 0,
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
          corridorId,
          month: isoMonth,
          contextRank: 1,
          routeId: "T1",
          eventId: "ace:T1:ACE:2026-01-15",
          interventionType: "automated_bus_lane_enforcement",
          sourceId: "mta_ace_routes",
          program: "ACE",
          implementationMonth: "2026-01",
          eventStatus: "implemented",
          evaluationLevel: "peer_adjusted_before_after",
          comparisonStatus: "evaluated",
          speedDeltaMph: 2,
          adjustedSpeedDeltaMph: 1.5,
          ridershipDelta: 400,
          adjustedRidershipDelta: 300,
          comparisonRouteCount: 1,
          caveat: "Peer-adjusted before/after using 1 public route.",
        },
        {
          corridorId,
          month: isoMonth,
          contextRank: 2,
          routeId: "T1",
          eventId: "bus-lane-source-gap:T1:2026-11",
          interventionType: "bus_lane_infrastructure",
          sourceId: "nyc_dot_bus_lanes",
          program: "NYC DOT Bus Lanes",
          implementationMonth: "2026-11",
          eventStatus: "source_gap",
          evaluationLevel: "not_evaluated_source_gap",
          comparisonStatus: "source_gap_missing_implementation_date",
          speedDeltaMph: null,
          adjustedSpeedDeltaMph: null,
          ridershipDelta: null,
          adjustedRidershipDelta: null,
          comparisonRouteCount: 0,
          caveat:
            "NYC DOT bus lane geometry is matched to the route, but this pipeline has no route-level implementation date for a before/after comparison.",
        },
      ],
      hotspots: [],
    });
  } finally {
    local.sqlite.close();
  }
  await buildEvaluationArtifacts({ year: 2026, month: 11, dbPath });
  await buildBriefArtifacts({ year: 2026, month: 11, dbPath });
}

afterEach(async () => {
  await removeFixtureArtifacts();
});

describe("pipeline v1 check", () => {
  test("passes when all v1 serving evidence is present", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await checkPipelineV1(checkArgs());

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
        routeObservedReliabilityObservedRows: 1,
        routeObservedReliabilityInsufficientRows: 0,
        routeObservedReliabilityRequiredObservedRows: 1,
        routeObservedReliabilityObservedRouteShare: 1,
        routeObservedReliabilityBelowThresholdRows: 0,
        routeObservedReliabilityHeadwaySampleCount: 42,
        routeMonthTrendRows: 4,
        routeMonthTrendSpeedRows: 4,
        routeMonthTrendRidershipRows: 4,
        gtfsRtCollectionRunRows: 1,
        gtfsRtCompletedCollectionRunRows: 1,
        gtfsRtShortestCollectionSeconds: 600,
        gtfsRtLongestSampleSeconds: 30,
        gtfsRtFeedSnapshotRows: 10,
        gtfsRtSuccessfulFeedSnapshotRows: 10,
        gtfsRtSuccessfulVehiclePositionSnapshotRows: 10,
        gtfsRtRequiredVehiclePositionSnapshotRows: 10,
        gtfsRtCollectionRunMonthMismatchRows: 0,
        gtfsRtFeedSnapshotMonthMismatchRows: 0,
        gtfsRtParsedSnapshotRows: 1,
        gtfsRtParsedVehiclePositionSnapshotRows: 1,
        gtfsRtObservedHeadwaySampleRows: 42,
        gtfsRtObservedHeadwaySampleMonthMismatchRows: 0,
        routeInterventionComparisonRows: 2,
        evaluatedInterventionComparisonRows: 1,
        evaluatedInterventionComparisonRidershipDeltaRows: 1,
        peerAdjustedInterventionComparisonRows: 1,
        busLaneMatchedPublicRouteCount: 1,
        busLaneInterventionComparisonRows: 1,
        busLaneDatedInterventionComparisonRows: 0,
        busLaneSourceGapComparisonRows: 1,
        sourceProbeRows: 10,
        sourceProbeFreshRows: 10,
        sourceProbeMissingRows: 0,
        sourceProbeStaleRows: 0,
        sourceProbeInactiveRows: 0,
        corridorRows: 1,
        corridorRouteMemberRows: 1,
        corridorAssignedRouteMemberRows: 1,
        corridorAmbiguousRouteMemberRows: 0,
        corridorUnassignedRouteMemberRows: 0,
        corridorSegmentEvidenceRouteMemberRows: 1,
        corridorShapeReviewRouteRows: 1,
        corridorShapeReviewPassRows: 1,
        corridorShapeReviewWarningRows: 0,
        corridorShapeReviewIncompleteRows: 0,
        corridorShapeReviewMissingRouteRows: 0,
        corridorInterventionContextRows: 2,
        corridorAmbiguousRouteShare: 0,
        corridorUnassignedRouteShare: 0,
        routeArtifactRows: 3,
        corridorArtifactRows: 3,
        evaluationArtifactRows: 5,
        evaluationArtifactIssueRows: 0,
        mapArtifactRows: 8,
        mapRouteSegmentArtifactRows: 1,
        mapArtifactIssueRows: 0,
      }),
    );
    expect(result.d1).toEqual(
      expect.objectContaining({
        status: "pass",
        routeObservedReliabilityRows: 1,
        routeInterventionComparisonRows: 2,
        corridorInterventionContextRows: 2,
      }),
    );
  });

  test("fails strict mode when the GTFS-RT collection window is too short", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await checkPipelineV1({
      year: 2026,
      month: 11,
      dbPath,
      sourceMetadataDir,
      now: fixtureNow,
    });

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        gtfsRtShortestCollectionSeconds: 600,
        gtfsRtLongestSampleSeconds: 30,
        gtfsRtSuccessfulVehiclePositionSnapshotRows: 10,
        gtfsRtRequiredVehiclePositionSnapshotRows: 384,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "gtfs_rt_collection_duration_insufficient",
        "gtfs_rt_vehicle_position_snapshot_coverage_insufficient",
      ]),
    );
  });

  test("fails strict mode when the GTFS-RT sample cadence is too sparse", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await checkPipelineV1(checkArgs({ maxGtfsRtSampleSeconds: 10 }));

    expect(result.status).toBe("fail");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["gtfs_rt_collection_cadence_too_sparse"]),
    );
  });

  test("fails strict mode when observed reliability provenance is outside the analysis month", async () => {
    await writeFixtureNetwork({
      includeObservedAndInterventions: true,
      gtfsRtOutsideMonth: true,
    });

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        gtfsRtCollectionRunMonthMismatchRows: 1,
        gtfsRtFeedSnapshotMonthMismatchRows: 10,
        gtfsRtObservedHeadwaySampleMonthMismatchRows: 42,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "gtfs_rt_collection_month_mismatch",
        "gtfs_rt_feed_snapshot_month_mismatch",
        "observed_headway_sample_month_mismatch",
      ]),
    );
  });

  test("fails loudly when observed reliability and intervention evidence are missing", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: false });

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "observed_reliability_missing",
        "observed_reliability_source_status_incomplete",
        "intervention_events_missing",
        "intervention_comparisons_missing",
        "bus_lane_intervention_comparisons_missing",
        "d1_observed_reliability_incomplete",
        "d1_intervention_comparisons_missing",
      ]),
    );
  });

  test("fails strict mode when reliability rows are all insufficient samples", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await replaceWithInsufficientObservedReliability();

    const result = await checkPipelineV1(checkArgs());
    const structuralResult = await checkPipelineV1(checkArgs({ allowInsufficientGtfsRt: true }));

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeObservedReliabilityRows: 1,
        routeObservedReliabilityObservedRows: 0,
        routeObservedReliabilityInsufficientRows: 1,
        routeObservedReliabilityRequiredObservedRows: 1,
        routeObservedReliabilityObservedRouteShare: 0,
        routeObservedReliabilityBelowThresholdRows: 0,
        routeObservedReliabilityHeadwaySampleCount: 0,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "observed_reliability_no_observed_routes",
        "observed_reliability_route_coverage_insufficient",
        "observed_reliability_sample_coverage_insufficient",
      ]),
    );
    expect(structuralResult).toEqual(
      expect.objectContaining({
        status: "pass",
        issueCount: 0,
      }),
    );
  });

  test("fails strict mode when observed summaries are not backed by a GTFS-RT run", async () => {
    await writeFixtureNetwork({
      includeObservedAndInterventions: true,
      includeGtfsRtProvenance: false,
    });

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeObservedReliabilityObservedRows: 1,
        routeObservedReliabilityHeadwaySampleCount: 42,
        gtfsRtCollectionRunRows: 0,
        gtfsRtObservedHeadwaySampleRows: 0,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "gtfs_rt_collection_run_missing",
        "gtfs_rt_collection_run_not_completed",
        "gtfs_rt_feed_snapshots_missing",
        "gtfs_rt_vehicle_positions_not_parsed",
        "observed_headway_rows_incomplete",
      ]),
    );
  });

  test("fails strict mode when observed route coverage is below the configured threshold", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await checkPipelineV1(checkArgs({ minObservedRouteCount: 2 }));

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeObservedReliabilityObservedRows: 1,
        routeObservedReliabilityRequiredObservedRows: 2,
        routeObservedReliabilityObservedRouteShare: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["observed_reliability_route_coverage_insufficient"]),
    );
  });

  test("fails when stale observed reliability runs duplicate a route/month", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await insertStaleObservedReliabilityRun();

    const result = await checkPipelineV1(checkArgs({ allowInsufficientGtfsRt: true }));

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeObservedReliabilityRows: 2,
        routeObservedReliabilityObservedRows: 2,
        routeObservedReliabilityObservedRouteCount: 1,
        routeObservedReliabilityDuplicateRouteRows: 1,
        routeObservedReliabilityActiveRunCount: 2,
        routeObservedReliabilityObservedRouteShare: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "observed_reliability_duplicate_route_rows",
        "observed_reliability_multiple_active_runs",
      ]),
    );
  });

  test("fails strict mode when observed rows are below their sample thresholds", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await replaceWithBelowThresholdObservedReliability();

    const result = await checkPipelineV1(checkArgs({ minObservedHeadwaySamples: 1 }));

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeObservedReliabilityObservedRows: 1,
        routeObservedReliabilityBelowThresholdRows: 1,
        routeObservedReliabilityHeadwaySampleCount: 2,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["observed_reliability_observed_samples_below_threshold"]),
    );
  });

  test("fails when required source probe captures are missing, stale, or inactive", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await writeSourceProbeMetadata({
      bus_segment_speeds_2025: { checkedAt: "2026-08-01T00:00:00.000Z" },
      current_bus_routes: { probeStatus: "blocked" },
    });
    await rm(join(sourceMetadataDir, "current_bus_stops.json"), { force: true });

    const result = await checkPipelineV1(checkArgs({ maxSourceProbeAgeDays: 30 }));

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        sourceProbeRows: 10,
        sourceProbeFreshRows: 7,
        sourceProbeMissingRows: 1,
        sourceProbeStaleRows: 1,
        sourceProbeInactiveRows: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "source_probe_metadata_missing",
        "source_probe_metadata_stale",
        "source_probe_metadata_inactive",
      ]),
    );
  });

  test("fails when corridor assignments are too ambiguous", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await replaceWithCorridorAssignmentStatus("ambiguous");

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        corridorAssignedRouteMemberRows: 0,
        corridorAmbiguousRouteMemberRows: 1,
        corridorUnassignedRouteMemberRows: 0,
        corridorAmbiguousRouteShare: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["corridor_ambiguous_route_share_high"]),
    );
  });

  test("fails when corridor assignments use too many unassigned placeholders", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await replaceWithCorridorAssignmentStatus("unassigned");

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        corridorAssignedRouteMemberRows: 0,
        corridorAmbiguousRouteMemberRows: 0,
        corridorUnassignedRouteMemberRows: 1,
        corridorUnassignedRouteShare: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["corridor_unassigned_route_share_high"]),
    );
  });

  test("fails when corridor shape review is missing or incomplete", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await rm(corridorShapeReviewPath, { force: true });

    const missingResult = await checkPipelineV1(checkArgs());

    expect(missingResult.status).toBe("fail");
    expect(missingResult.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["corridor_shape_review_missing"]),
    );

    await writeCorridorShapeReviewArtifact({ reviewStatus: "missing_shape" });
    const incompleteResult = await checkPipelineV1(checkArgs());

    expect(incompleteResult.status).toBe("fail");
    expect(incompleteResult.counts).toEqual(
      expect.objectContaining({
        corridorShapeReviewRouteRows: 1,
        corridorShapeReviewPassRows: 0,
        corridorShapeReviewIncompleteRows: 1,
      }),
    );
    expect(incompleteResult.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["corridor_shape_review_incomplete"]),
    );
  });

  test("fails when map artifact manifest is missing", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await rm(join(mapArtifactDir, isoMonth, "manifest.json"), { force: true });

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        mapArtifactRows: 0,
        mapRouteSegmentArtifactRows: 0,
        mapArtifactIssueRows: 1,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["map_artifact_manifest_missing"]),
    );
  });

  test("fails when intervention trend coverage is missing", async () => {
    await writeFixtureNetwork({
      includeObservedAndInterventions: true,
      includeRouteTrends: false,
    });

    const result = await checkPipelineV1(checkArgs());

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        routeMonthTrendRows: 0,
        routeMonthTrendSpeedRows: 0,
        routeMonthTrendRidershipRows: 0,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "route_month_trends_missing",
        "route_month_trend_speed_missing",
        "route_month_trend_ridership_missing",
      ]),
    );
  });

  test("writes a prompt-to-artifact audit when single-month gates are green", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await writeRouteSpeedAvailabilityArtifact();
    await writeSourceRefreshPlanArtifact();

    const result = await auditPipelineV1({
      publicYear: 2026,
      publicMonth: 11,
      realtimeYear: 2026,
      realtimeMonth: 11,
      runId: observedRunId,
      dbPath,
      sourceMetadataDir,
      now: fixtureNow,
      minGtfsRtCollectionHours: 0.1,
      output: auditOutputPath,
    });

    expect(result.status).toBe("partial");
    expect(result.gates).toEqual(
      expect.objectContaining({
        publicStructuralStatus: "pass",
        publicStrictStatus: "pass",
        realtimePreflightStatus: "pass",
        publicStrictIssues: [],
        realtimePreflightIssues: [],
      }),
    );
    expect(result.objective).toContain("Finish Data Pipeline v1");
    expect(result.successCriteria).toEqual(
      expect.arrayContaining([
        "GTFS-RT observed reliability and bunching computed from collected realtime samples and attached as a current observed appendix when source months differ.",
        "D1 serving export and static evaluation/map artifact contracts verify against generated data.",
      ]),
    );
    expect(result.releaseModel).toEqual(
      expect.objectContaining({
        canonicalMonthlyRelease: isoMonth,
        realtimeAppendix: isoMonth,
        layers: expect.arrayContaining([
          expect.objectContaining({
            id: "baseline_release",
            label: "Baseline Release",
            completenessStatus: "complete",
            confidence: "high",
          }),
          expect.objectContaining({
            id: "observed_release",
            label: "Observed Release",
            completenessStatus: "complete",
          }),
        ]),
        metricCompleteness: expect.arrayContaining([
          expect.objectContaining({
            metric: "public_monthly_speed",
            completenessStatus: "complete",
          }),
          expect.objectContaining({
            metric: "observed_reliability",
            completenessStatus: "partial_realtime_only",
          }),
        ]),
        sameMonthPromotionReady: true,
        sameMonthPromotionIssues: [],
      }),
    );
    expect(result.checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: "Observed monthly promotion condition",
          status: "pass",
        }),
        expect.objectContaining({
          requirement: "Source cadence and release availability",
          status: "pass",
        }),
        expect.objectContaining({
          requirement: "Completeness-aware release labels",
          status: "pass",
        }),
      ]),
    );
    expect(result.interventions.busLaneSourceGaps).toEqual(
      expect.objectContaining({
        publicMatchedRouteCount: 1,
        matchedLaneInstanceCount: 1,
        missingOpenDateLaneInstanceCount: 1,
        blankOpenDateLaneInstanceCount: 1,
        unparsableOpenDateLaneInstanceCount: 0,
        routesWithMissingOpenDateCount: 1,
      }),
    );
    expect(result.interventions.methodologyGate).toEqual(
      expect.objectContaining({
        status: "descriptive_only",
        externalReviewStatus: "open",
        causalClaimsAllowed: false,
        maxSupportedClaim: "descriptive_association",
        allowedEvaluationLevels: expect.arrayContaining(["matched_comparison"]),
      }),
    );
    expect(result.sourceAvailability.routeSpeed).toEqual(
      expect.objectContaining({
        latestSpeedMonth: expect.objectContaining({
          isoMonth,
          status: "complete",
        }),
        requestedMonth: expect.objectContaining({
          isoMonth,
          status: "complete",
        }),
      }),
    );
    expect(result.sourceAvailability.refreshPlan).toEqual(
      expect.objectContaining({
        jobs: expect.arrayContaining([
          expect.objectContaining({
            id: "gtfs_rt_collector",
            status: "required",
          }),
          expect.objectContaining({
            id: "route_speed_monthly_watcher",
            status: "ready_to_rebuild",
          }),
        ]),
      }),
    );
    expect(
      result.checklist.find(
        (item) => item.requirement === "Source cadence and release availability",
      )?.evidence,
    ).toContain("shouldRebuild=true");
    expect(
      result.checklist.find(
        (item) => item.requirement === "Source cadence and release availability",
      )?.evidence,
    ).toContain("route_speed_monthly_watcher=ready_to_rebuild");
    expect(
      result.checklist.find((item) => item.requirement === "Before/after intervention evaluation")
        ?.evidence,
    ).toContain("blank source open_date values");
    const written = JSON.parse(await Bun.file(auditOutputPath).text());
    expect(written).toEqual(
      expect.objectContaining({
        status: "partial",
        objective: expect.stringContaining("Finish Data Pipeline v1"),
        successCriteria: expect.arrayContaining([
          "Same-month public-speed and collected-realtime alignment is tracked as an observed monthly promotion condition, not a Data Pipeline v1 blocker.",
        ]),
        releaseModel: expect.objectContaining({
          layers: expect.arrayContaining([
            expect.objectContaining({
              label: "Baseline Release",
              completenessStatus: "complete",
            }),
          ]),
          metricCompleteness: expect.arrayContaining([
            expect.objectContaining({
              metric: "intervention_evaluation",
              completenessStatus: "partial_public_monthly_only",
            }),
          ]),
          sameMonthPromotionReady: true,
        }),
        publicMonth: isoMonth,
        interventions: expect.objectContaining({
          busLaneSourceGaps: expect.objectContaining({
            blankOpenDateLaneInstanceCount: 1,
          }),
          methodologyGate: expect.objectContaining({
            causalClaimsAllowed: false,
          }),
        }),
      }),
    );
  });

  test("marks the reproducible pipeline requirement pass when clean rebuild proof is supplied", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await auditPipelineV1({
      publicYear: 2026,
      publicMonth: 11,
      realtimeYear: 2026,
      realtimeMonth: 11,
      runId: observedRunId,
      dbPath,
      cleanDbPath: dbPath,
      sourceMetadataDir,
      now: fixtureNow,
      minGtfsRtCollectionHours: 0.1,
      output: auditOutputPath,
    });
    const reproduciblePipeline = result.checklist.find(
      (item) => item.requirement === "Reproducible full-network public-source pipeline",
    );

    expect(result.gates).toEqual(
      expect.objectContaining({
        cleanRebuildStatus: "pass",
        cleanRebuildIssues: [],
      }),
    );
    expect(reproduciblePipeline).toEqual(
      expect.objectContaining({
        status: "pass",
        missing: [],
      }),
    );
  });

  test("records a missing source-refresh plan in the audit", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });
    await writeRouteSpeedAvailabilityArtifact();

    const result = await auditPipelineV1({
      publicYear: 2026,
      publicMonth: 11,
      realtimeYear: 2026,
      realtimeMonth: 11,
      runId: observedRunId,
      dbPath,
      sourceMetadataDir,
      now: fixtureNow,
      minGtfsRtCollectionHours: 0.1,
      output: auditOutputPath,
    });
    const sourceAvailability = result.checklist.find(
      (item) => item.requirement === "Source cadence and release availability",
    );

    expect(result.sourceAvailability.refreshPlan).toBeNull();
    expect(sourceAvailability).toEqual(
      expect.objectContaining({
        status: "partial",
        missing: ["Source-refresh plan artifact is missing."],
      }),
    );
    expect(sourceAvailability?.evidence).toContain("No source-refresh plan artifact found.");
  });

  test("keeps month mismatch as an observed monthly promotion issue", async () => {
    await writeFixtureNetwork({ includeObservedAndInterventions: true });

    const result = await auditPipelineV1({
      publicYear: 2026,
      publicMonth: 11,
      realtimeYear: 2026,
      realtimeMonth: 12,
      runId: observedRunId,
      dbPath,
      sourceMetadataDir,
      now: fixtureNow,
      minGtfsRtCollectionHours: 0.1,
      output: auditOutputPath,
    });

    expect(result.status).toBe("blocked");
    expect(result.releaseModel).toEqual(
      expect.objectContaining({
        canonicalMonthlyRelease: "2026-11",
        realtimeAppendix: "2026-12",
        layers: expect.arrayContaining([
          expect.objectContaining({
            id: "current_signal",
            completenessStatus: "insufficient_samples",
          }),
          expect.objectContaining({
            id: "pending_publication",
            completenessStatus: "source_lag_expected",
          }),
          expect.objectContaining({
            id: "observed_release",
            month: null,
            completenessStatus: "source_lag_expected",
          }),
        ]),
        metricCompleteness: expect.arrayContaining([
          expect.objectContaining({
            metric: "current_month_speed",
            month: "2026-12",
            completenessStatus: "missing_speed",
          }),
          expect.objectContaining({
            metric: "observed_reliability",
            month: "2026-12",
            completenessStatus: "insufficient_samples",
          }),
        ]),
        sameMonthPromotionReady: false,
        sameMonthPromotionIssues: expect.arrayContaining([
          "Canonical public-source month 2026-11 differs from realtime appendix month 2026-12.",
          "Realtime appendix month 2026-12 has no public monthly speed coverage yet.",
        ]),
      }),
    );
    expect(result.gates).toEqual(
      expect.objectContaining({
        publicStructuralStatus: "pass",
        publicStrictStatus: "pass",
        realtimePreflightStatus: "fail",
      }),
    );
    expect(result.checklist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: "Source cadence and release availability",
          status: "partial",
        }),
        expect.objectContaining({
          requirement: "Observed monthly promotion condition",
          status: "pass",
        }),
        expect.objectContaining({
          requirement: "GTFS-RT observed reliability and bunching",
          status: "blocked",
        }),
      ]),
    );
  });
});
