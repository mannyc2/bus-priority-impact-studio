import { describe, expect, test } from "bun:test";
import {
  createEwtRouteMonthRowsPort,
  createStopDirectionHourEwtFeatureInputPort,
  LOCAL_PIPELINE_SQLITE_CORPUS,
} from "../src/local-db";

describe("local DB research ports", () => {
  test("wraps EWT route-month row loaders with a named local corpus port", () => {
    const port = createEwtRouteMonthRowsPort(({ startMonth, endMonth }) => [
      {
        routeId: "M15",
        month: `${startMonth}:${endMonth}`,
        runId: "run-a",
        reliabilityStatus: "ready",
        sampleCount: 42,
        stopCount: 12,
        directionCount: 2,
        averageObservedHeadwayMinutes: 6,
        expectedWaitMinutes: 3,
        scheduledExpectedWaitMinutes: 2,
        excessWaitMinutes: 1,
        mtaAbstMinutes: null,
        waitReliabilityRatio: 1.5,
      },
    ]);

    expect(port.id).toBe("ewt_route_month_rows");
    expect(port.corpus).toBe(LOCAL_PIPELINE_SQLITE_CORPUS);
    expect(port.load({ startMonth: "2026-01", endMonth: "2026-03" })).toHaveLength(1);
  });

  test("wraps stop-direction-hour EWT input loaders without owning SQLite", () => {
    const port = createStopDirectionHourEwtFeatureInputPort(({ routeId }) => ({
      selection: {
        kind: "gtfs_static",
        table: "local_gtfs_static_stop_time",
        gtfsRunId: "gtfs-run",
        caveat: "fixture",
      },
      scheduleArrivals: [
        {
          routeId,
          dayType: "weekday",
          direction: "0",
          stopId: "stop-a",
          stopName: "Stop A",
          scheduleDate: "2026-03-03",
          scheduleTime: "08:00:00",
        },
      ],
      observedHeadways: [
        {
          routeId,
          direction: "0",
          stopId: "stop-a",
          stopName: "Stop A",
          observedTimestamp: Date.parse("2026-03-03T08:05:00Z"),
          headwayMinutes: 5,
        },
      ],
    }));

    const rows = port.load({
      month: "2026-03",
      routeId: "M15",
      runId: "run-a",
      scheduleSource: "auto",
      gtfsRunId: "gtfs-run",
    });

    expect(port.id).toBe("stop_direction_hour_ewt_feature_inputs");
    expect(rows.selection.table).toBe("local_gtfs_static_stop_time");
    expect(rows.scheduleArrivals).toHaveLength(1);
    expect(rows.observedHeadways).toHaveLength(1);
  });
});
