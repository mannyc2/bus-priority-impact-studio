import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listRouteMonthSourceStatuses,
  listRouteObservedReliabilitySummaries,
  replaceObservedHeadwayRows,
  replaceRouteBriefRows,
  replaceRouteCatalog,
  replaceRouteReliabilityRows,
} from "@bp/db/local";
import { buildRouteObservedReliability } from "../src/jobs/build/route-observed-reliability.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const isoMonth = "2026-03";
const runId = "test-reliability-run";
const testRoot = fromRepoRoot(join("data/working/test-route-observed-reliability"));
const dbPath = join(testRoot, "pipeline.sqlite");

async function removeFixtureArtifacts(): Promise<void> {
  await rm(testRoot, { force: true, recursive: true });
}

async function writeRouteBriefSummary(routeId: string): Promise<void> {
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteBriefRows(local.db, {
      summary: {
        routeId,
        month: isoMonth,
        routeScore: 50,
        publicVisible: true,
        publicVisibilityReason: "included",
        averageSpeedMph: 8,
        hotspotCount: 1,
        totalRidership: 100,
        totalTransfers: 10,
        aceActive: false,
        aceViolationCount: 0,
        busLaneMatchedLaneCount: 0,
        scheduleMatchRate: 1,
      },
      peakWindows: [],
      slowestWindows: [],
    });
  } finally {
    local.sqlite.close();
  }
}

async function writeFixtureRows(): Promise<void> {
  await writeRouteBriefSummary("T1");
  await writeRouteBriefSummary("T2");
  const local = await openLocalPipelineDb(dbPath);
  try {
    await replaceRouteReliabilityRows(local.db, isoMonth, {
      baselines: [
        {
          routeId: "T1",
          month: isoMonth,
          reliabilityStatus: "scheduled_baseline_only",
          scheduledTimepointCount: 10,
          stopHeadwayGroupCount: 1,
          headwaySampleCount: 4,
          medianScheduledHeadwayMinutes: 10,
          p90ScheduledHeadwayMinutes: 12,
          maxScheduledHeadwayMinutes: 15,
          scheduledShortHeadwayShare: 0,
          scheduledLongGapShare: 0,
        },
        {
          routeId: "T2",
          month: isoMonth,
          reliabilityStatus: "scheduled_baseline_only",
          scheduledTimepointCount: 10,
          stopHeadwayGroupCount: 1,
          headwaySampleCount: 4,
          medianScheduledHeadwayMinutes: 8,
          p90ScheduledHeadwayMinutes: 10,
          maxScheduledHeadwayMinutes: 12,
          scheduledShortHeadwayShare: 0,
          scheduledLongGapShare: 0,
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
          rowCount: 4,
          snapshotId: null,
          note: null,
        },
        {
          routeId: "T1",
          month: isoMonth,
          sourceScope: "reliability",
          sourceId: "observedHeadways",
          status: "needs_gtfs_rt_collection",
          rowCount: null,
          snapshotId: null,
          note: null,
        },
      ],
    });
    await replaceObservedHeadwayRows(local.db, runId, {
      stopEvents: [],
      headwaySamples: [
        {
          runId,
          sampleRank: 1,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 0,
          stopId: "S1",
          previousVehicleKey: "bus-1",
          vehicleKey: "bus-2",
          previousObservedTimestamp: 1_773_576_000,
          observedTimestamp: 1_773_576_240,
          headwaySeconds: 240,
          headwayMinutes: 4,
        },
        {
          runId,
          sampleRank: 2,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 0,
          stopId: "S1",
          previousVehicleKey: "bus-2",
          vehicleKey: "bus-3",
          previousObservedTimestamp: 1_773_576_240,
          observedTimestamp: 1_773_576_960,
          headwaySeconds: 720,
          headwayMinutes: 12,
        },
        {
          runId,
          sampleRank: 3,
          routeId: "T1",
          sourceRouteId: "MTA NYCT_T1",
          directionId: 0,
          stopId: "S1",
          previousVehicleKey: "bus-3",
          vehicleKey: "bus-4",
          previousObservedTimestamp: 1_779_000_000,
          observedTimestamp: 1_779_000_240,
          headwaySeconds: 240,
          headwayMinutes: 4,
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

describe("route observed reliability", () => {
  test("builds route/month observed reliability summaries and insufficient statuses", async () => {
    await removeFixtureArtifacts();
    await writeFixtureRows();

    const result = await buildRouteObservedReliability({
      dbPath,
      runId,
      year: 2026,
      month: 3,
      minSamples: 2,
    });
    const local = await openLocalPipelineDb(dbPath);
    const summaries = await listRouteObservedReliabilitySummaries(local.db, isoMonth, runId);
    const sourceStatuses = await listRouteMonthSourceStatuses(local.db, isoMonth);
    local.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 2,
        observedRouteCount: 1,
        insufficientRouteCount: 1,
        headwaySampleCount: 2,
      }),
    );
    expect(summaries.find((summary) => summary.routeId === "T1")).toEqual(
      expect.objectContaining({
        reliabilityStatus: "observed",
        sampleCount: 2,
        medianObservedHeadwayMinutes: 8,
        bunchingThresholdMinutes: 5,
        longGapThresholdMinutes: 20,
        observedBunchingShare: 0.5,
        observedLongGapShare: 0,
        expectedWaitMinutes: 5,
        scheduledExpectedWaitMinutes: 5,
        waitReliabilityRatio: 1,
      }),
    );
    expect(summaries.find((summary) => summary.routeId === "T2")).toEqual(
      expect.objectContaining({
        reliabilityStatus: "insufficient_gtfs_rt_samples",
        sampleCount: 0,
        medianObservedHeadwayMinutes: null,
      }),
    );
    expect(
      sourceStatuses.filter(
        (status) => status.routeId === "T1" && status.sourceId === "observedHeadways",
      ),
    ).toEqual([
      expect.objectContaining({
        status: "available",
        rowCount: 2,
        snapshotId: runId,
      }),
    ]);
    expect(
      sourceStatuses.filter(
        (status) => status.routeId === "T2" && status.sourceId === "observedHeadways",
      ),
    ).toEqual([
      expect.objectContaining({
        status: "insufficient_gtfs_rt_samples",
        rowCount: 0,
        snapshotId: runId,
      }),
    ]);
    expect(
      sourceStatuses.some(
        (status) => status.routeId === "T1" && status.sourceId === "scheduledHeadways",
      ),
    ).toBe(true);
  });

  test("falls back to route catalog when month brief summaries are not built yet", async () => {
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
      await replaceObservedHeadwayRows(local.db, runId, {
        stopEvents: [],
        headwaySamples: [
          {
            runId,
            sampleRank: 1,
            routeId: "T1",
            sourceRouteId: "MTA NYCT_T1",
            directionId: 0,
            stopId: "S1",
            previousVehicleKey: "bus-1",
            vehicleKey: "bus-2",
            previousObservedTimestamp: 1_773_576_000,
            observedTimestamp: 1_773_576_240,
            headwaySeconds: 240,
            headwayMinutes: 4,
          },
        ],
      });
    } finally {
      local.sqlite.close();
    }

    const result = await buildRouteObservedReliability({
      dbPath,
      runId,
      year: 2026,
      month: 3,
      minSamples: 1,
    });
    const verification = await openLocalPipelineDb(dbPath);
    const summaries = await listRouteObservedReliabilitySummaries(verification.db, isoMonth, runId);
    verification.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 1,
        observedRouteCount: 1,
        headwaySampleCount: 1,
      }),
    );
    expect(summaries).toEqual([
      expect.objectContaining({
        routeId: "T1",
        reliabilityStatus: "observed",
        sampleCount: 1,
      }),
    ]);
  });

  test("keeps prior observed reliability runs for the same month under different runIds", async () => {
    await removeFixtureArtifacts();
    await writeFixtureRows();
    const replacementRunId = "replacement-reliability-run";

    await buildRouteObservedReliability({
      dbPath,
      runId,
      year: 2026,
      month: 3,
      minSamples: 2,
    });
    const local = await openLocalPipelineDb(dbPath);
    try {
      await replaceObservedHeadwayRows(local.db, replacementRunId, {
        stopEvents: [],
        headwaySamples: [
          {
            runId: replacementRunId,
            sampleRank: 1,
            routeId: "T2",
            sourceRouteId: "MTA NYCT_T2",
            directionId: 0,
            stopId: "S2",
            previousVehicleKey: "bus-10",
            vehicleKey: "bus-11",
            previousObservedTimestamp: 1_773_576_000,
            observedTimestamp: 1_773_576_300,
            headwaySeconds: 300,
            headwayMinutes: 5,
          },
          {
            runId: replacementRunId,
            sampleRank: 2,
            routeId: "T2",
            sourceRouteId: "MTA NYCT_T2",
            directionId: 0,
            stopId: "S2",
            previousVehicleKey: "bus-11",
            vehicleKey: "bus-12",
            previousObservedTimestamp: 1_773_576_300,
            observedTimestamp: 1_773_576_900,
            headwaySeconds: 600,
            headwayMinutes: 10,
          },
        ],
      });
    } finally {
      local.sqlite.close();
    }

    await buildRouteObservedReliability({
      dbPath,
      runId: replacementRunId,
      year: 2026,
      month: 3,
      minSamples: 2,
    });

    const verification = await openLocalPipelineDb(dbPath);
    const summaries = await listRouteObservedReliabilitySummaries(verification.db, isoMonth);
    const sourceStatuses = await listRouteMonthSourceStatuses(verification.db, isoMonth);
    verification.sqlite.close();

    expect(new Set(summaries.map((summary) => summary.runId))).toEqual(
      new Set([runId, replacementRunId]),
    );
    expect(
      summaries.find((summary) => summary.routeId === "T1" && summary.runId === replacementRunId),
    ).toEqual(
      expect.objectContaining({
        reliabilityStatus: "insufficient_gtfs_rt_samples",
        sampleCount: 0,
      }),
    );
    expect(
      summaries.find((summary) => summary.routeId === "T2" && summary.runId === replacementRunId),
    ).toEqual(
      expect.objectContaining({
        reliabilityStatus: "observed",
        sampleCount: 2,
      }),
    );
    expect(
      sourceStatuses
        .filter((status) => status.sourceId === "observedHeadways")
        .map((status) => status.snapshotId),
    ).toEqual([replacementRunId, replacementRunId]);
  });
});
