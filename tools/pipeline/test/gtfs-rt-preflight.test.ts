import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  insertGtfsRtCollectionRun,
  insertGtfsRtFeedSnapshot,
  replaceGtfsRtParsedSnapshot,
  replaceObservedHeadwayRows,
  replaceRouteObservedReliabilityRows,
} from "@bp/db/local";
import { preflightGtfsRt } from "../src/jobs/check/gtfs-rt-preflight.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-06";
const runId = "fixture-gtfs-rt-preflight";
const testRoot = fromRepoRoot(join("data/working/test-gtfs-rt-preflight"));
const dbPath = join(testRoot, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

async function writeReadyGtfsRtState(
  options: {
    outsideMonth?: boolean;
    endedAt?: string;
    requestedDurationSeconds?: number;
    sampleSeconds?: number;
    snapshotCount?: number;
  } = {},
): Promise<void> {
  const gtfsRtDatePrefix = options.outsideMonth ? "2026-05-01" : "2026-06-01";
  const gtfsRtTimestampBase = options.outsideMonth ? 1_777_593_600 : 1_780_272_000;
  const startedAt = `${gtfsRtDatePrefix}T00:00:00.000Z`;
  const endedAt = options.endedAt ?? `${gtfsRtDatePrefix}T00:10:00.000Z`;
  const requestedDurationSeconds = options.requestedDurationSeconds ?? 600;
  const sampleSeconds = options.sampleSeconds ?? 30;
  const snapshotCount = options.snapshotCount ?? 1;
  const local = await openLocalPipelineDb(dbPath);
  try {
    await insertGtfsRtCollectionRun(local.db, {
      runId,
      startedAt,
      endedAt,
      status: "completed",
      requestedDurationSeconds,
      sampleSeconds,
      requestedFeedTypes: "vehicle_positions",
      snapshotCount,
      successCount: snapshotCount,
      failureCount: 0,
      rawDirectory: "/tmp/gtfs-rt",
      error: null,
    });
    const startedAtMilliseconds = Date.parse(startedAt);
    for (let sampleIndex = 1; sampleIndex <= snapshotCount; sampleIndex += 1) {
      await insertGtfsRtFeedSnapshot(local.db, {
        runId,
        feedType: "vehicle_positions",
        sampleIndex,
        sourceId: "bus_time_gtfsrt_vehicle_positions",
        fetchedAt: new Date(
          startedAtMilliseconds + (sampleIndex - 1) * sampleSeconds * 1000,
        ).toISOString(),
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
        runId,
        feedType: "vehicle_positions",
        sampleIndex: 1,
        parsedAt: "2026-06-01T00:00:01.000Z",
        status: "parsed",
        gtfsRealtimeVersion: "2.0",
        feedTimestamp: gtfsRtTimestampBase,
        entityCount: 1,
        vehiclePositionCount: 1,
        tripUpdateCount: 0,
        stopTimeUpdateCount: 0,
        alertCount: 0,
        error: null,
      },
      vehiclePositions: [
        {
          runId,
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
    await replaceObservedHeadwayRows(local.db, runId, {
      stopEvents: [],
      headwaySamples: [1, 2, 3].map((sampleRank) => ({
        runId,
        sampleRank,
        routeId: "T1",
        sourceRouteId: "MTA NYCT_T1",
        directionId: 0,
        stopId: "S1",
        previousVehicleKey: `bus-${sampleRank}`,
        vehicleKey: `bus-${sampleRank + 1}`,
        previousObservedTimestamp: gtfsRtTimestampBase + sampleRank * 300,
        observedTimestamp: gtfsRtTimestampBase + 300 + sampleRank * 300,
        headwaySeconds: 300,
        headwayMinutes: 5,
      })),
    });
    await replaceRouteObservedReliabilityRows(local.db, isoMonth, runId, {
      summaries: [
        {
          routeId: "T1",
          month: isoMonth,
          runId,
          reliabilityStatus: "observed",
          minSampleThreshold: 3,
          sampleCount: 3,
          stopCount: 1,
          directionCount: 1,
          averageObservedHeadwayMinutes: 5,
          medianObservedHeadwayMinutes: 5,
          p90ObservedHeadwayMinutes: 5,
          maxObservedHeadwayMinutes: 5,
          scheduledMedianHeadwayMinutes: 10,
          bunchingThresholdMinutes: 5,
          longGapThresholdMinutes: 20,
          observedBunchingShare: 1,
          observedLongGapShare: 0,
          expectedWaitMinutes: 2.5,
          scheduledExpectedWaitMinutes: 5,
          excessWaitMinutes: -2.5,
          waitReliabilityRatio: 0.5,
        },
      ],
      sourceStatuses: [
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "observedHeadways",
          status: "available",
          rowCount: 3,
          snapshotId: runId,
          note: null,
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "bunching",
          status: "available",
          rowCount: 3,
          snapshotId: runId,
          note: null,
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "waitTimeReliability",
          status: "available",
          rowCount: 3,
          snapshotId: runId,
          note: null,
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

describe("GTFS-RT preflight", () => {
  test("reports the missing collection prerequisites on an empty local DB", async () => {
    await removeFixtureArtifacts();

    const result = await preflightGtfsRt({
      year: 2026,
      month: 6,
      dbPath,
      apiKey: null,
      minObservedHeadwaySamples: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        status: "fail",
        selectedRunId: null,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "api_key_missing",
        "gtfs_rt_collection_run_missing",
        "observed_headway_samples_insufficient",
        "route_observed_reliability_missing",
      ]),
    );
    expect(result.readiness).toEqual(
      expect.objectContaining({
        canCollect: false,
        strictPipelineV1ObservedLayerReady: false,
      }),
    );
  });

  test("passes when a completed run has parsed vehicle positions, headways, and observed route reliability", async () => {
    await removeFixtureArtifacts();
    await writeReadyGtfsRtState();

    const result = await preflightGtfsRt({
      year: 2026,
      month: 6,
      dbPath,
      apiKey: "fixture-key",
      minGtfsRtCollectionHours: 0.001,
      minObservedHeadwaySamples: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth,
        status: "pass",
        selectedRunId: runId,
        issueCount: 0,
      }),
    );
    expect(result.counts).toEqual(
      expect.objectContaining({
        collectionRunRows: 1,
        completedCollectionRunRows: 1,
        shortestCollectionSeconds: 600,
        longestSampleSeconds: 30,
        successfulVehiclePositionSnapshotRows: 1,
        requiredVehiclePositionSnapshotRows: 1,
        collectionRunMonthMismatchRows: 0,
        feedSnapshotMonthMismatchRows: 0,
        parsedVehiclePositionSnapshotRows: 1,
        vehiclePositionRows: 1,
        observedHeadwaySampleRows: 3,
        observedHeadwaySampleMonthMismatchRows: 0,
        routeObservedReliabilityRows: 1,
        routeObservedReliabilityObservedRows: 1,
        observedReliabilitySourceStatusRows: 3,
      }),
    );
    expect(result.readiness).toEqual(
      expect.objectContaining({
        hasAnalysisMonthAlignedEvidence: true,
        hasCollectionRun: true,
        hasCollectionWindow: true,
        hasSuccessfulVehiclePositionSnapshots: true,
        hasParsedVehiclePositions: true,
        hasObservedHeadways: true,
        hasObservedRouteReliability: true,
        strictPipelineV1ObservedLayerReady: true,
      }),
    );
  });

  test("counts the final sample interval toward a full requested collection window", async () => {
    await removeFixtureArtifacts();
    await writeReadyGtfsRtState({
      endedAt: "2026-06-01T03:59:46.000Z",
      requestedDurationSeconds: 14_400,
      sampleSeconds: 30,
      snapshotCount: 480,
    });

    const result = await preflightGtfsRt({
      year: 2026,
      month: 6,
      dbPath,
      apiKey: "fixture-key",
      minGtfsRtCollectionHours: 4,
      minObservedHeadwaySamples: 3,
    });

    expect(result.status).toBe("pass");
    expect(result.counts).toEqual(
      expect.objectContaining({
        shortestCollectionSeconds: 14_400,
        successfulVehiclePositionSnapshotRows: 480,
        requiredVehiclePositionSnapshotRows: 384,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      "gtfs_rt_collection_duration_insufficient",
    );
  });

  test("fails when the selected run is outside the analysis month", async () => {
    await removeFixtureArtifacts();
    await writeReadyGtfsRtState({ outsideMonth: true });

    const result = await preflightGtfsRt({
      year: 2026,
      month: 6,
      dbPath,
      apiKey: "fixture-key",
      minGtfsRtCollectionHours: 0.001,
      minObservedHeadwaySamples: 3,
    });

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        collectionRunMonthMismatchRows: 1,
        feedSnapshotMonthMismatchRows: 1,
        observedHeadwaySampleMonthMismatchRows: 3,
      }),
    );
    expect(result.readiness).toEqual(
      expect.objectContaining({
        hasAnalysisMonthAlignedEvidence: false,
        strictPipelineV1ObservedLayerReady: false,
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

  test("fails when the selected collection run is shorter than strict v1 requires", async () => {
    await removeFixtureArtifacts();
    await writeReadyGtfsRtState();

    const result = await preflightGtfsRt({
      year: 2026,
      month: 6,
      dbPath,
      apiKey: "fixture-key",
      minObservedHeadwaySamples: 3,
    });

    expect(result.status).toBe("fail");
    expect(result.counts).toEqual(
      expect.objectContaining({
        shortestCollectionSeconds: 600,
        longestSampleSeconds: 30,
        successfulVehiclePositionSnapshotRows: 1,
        requiredVehiclePositionSnapshotRows: 384,
      }),
    );
    expect(result.readiness).toEqual(
      expect.objectContaining({
        hasCollectionWindow: false,
        strictPipelineV1ObservedLayerReady: false,
      }),
    );
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "gtfs_rt_collection_duration_insufficient",
        "gtfs_rt_vehicle_position_snapshot_coverage_insufficient",
      ]),
    );
  });
});
