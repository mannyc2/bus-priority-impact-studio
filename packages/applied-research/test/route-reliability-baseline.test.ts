import { describe, expect, test } from "bun:test";
import type { LocalRouteScheduleTimepoint } from "@bp/db/local";
import { buildHeadwayGroups, routeBaseline } from "../src/local-db";

function scheduleTimepoint(
  overrides: Partial<LocalRouteScheduleTimepoint>,
): LocalRouteScheduleTimepoint {
  return {
    routeId: "M15",
    isoMonth: "2026-03",
    scheduleDate: "2026-03-03",
    dayType: "weekday",
    direction: "0",
    shapeId: "shape-1",
    stopSequence: 1,
    stopId: "401001",
    stopName: "1 Av/E 14 St",
    scheduleTime: "2026-03-03T08:00:00.000Z",
    distanceFromStart: undefined,
    tripHeadsign: undefined,
    blockId: "block-1",
    bundle: "bus_gtfs_manhattan",
    ...overrides,
  };
}

describe("route reliability baseline", () => {
  test("builds stop-level scheduled headway groups from unique schedule times", () => {
    const groups = buildHeadwayGroups("M15", [
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:00:00.000Z" }),
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:10:00.000Z" }),
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:25:00.000Z" }),
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:25:00.000Z", blockId: "dupe-time" }),
      scheduleTimepoint({
        stopId: "401002",
        stopName: "1 Av/E 23 St",
        scheduleTime: "2026-03-03T09:00:00.000Z",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      routeId: "M15",
      dayType: "weekday",
      direction: "0",
      stopId: "401001",
      sampleCount: 2,
      intervals: [10, 15],
      medianHeadwayMinutes: 12.5,
      p90HeadwayMinutes: 14.5,
      maxHeadwayMinutes: 15,
    });
  });

  test("builds route scheduled-headway baseline summaries and top long-gap windows", () => {
    const baseline = routeBaseline("M15", "2026-03", [
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:00:00.000Z" }),
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:02:00.000Z" }),
      scheduleTimepoint({ scheduleTime: "2026-03-03T08:05:00.000Z" }),
      scheduleTimepoint({
        stopId: "401002",
        stopName: "1 Av/E 23 St",
        scheduleTime: "2026-03-03T08:00:00.000Z",
      }),
      scheduleTimepoint({
        stopId: "401002",
        stopName: "1 Av/E 23 St",
        scheduleTime: "2026-03-03T08:30:00.000Z",
      }),
      scheduleTimepoint({
        stopId: "401002",
        stopName: "1 Av/E 23 St",
        scheduleTime: "2026-03-03T09:00:00.000Z",
      }),
    ]);

    expect(baseline).toMatchObject({
      schemaVersion: 1,
      routeId: "M15",
      isoMonth: "2026-03",
      reliabilityStatus: "scheduled_baseline_only",
      scheduledTimepointCount: 6,
      stopHeadwayGroupCount: 2,
      headwaySampleCount: 4,
      medianScheduledHeadwayMinutes: 16.5,
      p90ScheduledHeadwayMinutes: 30,
      maxScheduledHeadwayMinutes: 30,
      scheduledShortHeadwayShare: 0.5,
      scheduledLongGapShare: 0.5,
    });
    expect(baseline.topLongGapWindows[0]).toMatchObject({
      stopId: "401002",
      sampleCount: 2,
      p90HeadwayMinutes: 30,
      maxHeadwayMinutes: 30,
    });
    expect(baseline.sourceStatus).toMatchObject({
      scheduledHeadways: "available",
      observedHeadways: "needs_gtfs_rt_collection",
      tripCancellationProxy: "needs_trip_update_history",
    });
  });
});
