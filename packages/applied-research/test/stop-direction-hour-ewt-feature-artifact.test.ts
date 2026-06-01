import { describe, expect, test } from "bun:test";
import {
  buildStopDirectionHourEwtFeatureArtifact,
  parseObservedRowsForStopDirectionHourEwt,
  parseScheduleRowsForStopDirectionHourEwt,
} from "../src/feature-resolvers";

describe("stop-direction-hour EWT feature artifact", () => {
  test("parses source rows and builds a raw stop-hour EWT artifact", () => {
    const scheduleArrivals = parseScheduleRowsForStopDirectionHourEwt([
      {
        route_id: "M15",
        day_type: "Weekday",
        direction: "N",
        stop_id: "401698",
        stop_name: "1 AV/E 42 ST",
        schedule_date: "2026-03-03",
        schedule_time: "2026-03-03T08:00:00.000Z",
      },
      {
        route_id: "M15",
        day_type: "Weekday",
        direction: "N",
        stop_id: "401698",
        stop_name: "1 AV/E 42 ST",
        schedule_date: "2026-03-03",
        schedule_time: "2026-03-03T08:10:00.000Z",
      },
      {
        route_id: "M15",
        day_type: "Weekday",
        direction: "N",
        stop_id: "401698",
        stop_name: "1 AV/E 42 ST",
        schedule_date: "2026-03-03",
        schedule_time: "2026-03-03T08:20:00.000Z",
      },
    ]);
    const observedHeadways = parseObservedRowsForStopDirectionHourEwt(
      [4, 5, 10, 18].map((headway, index) => ({
        route_id: "M15",
        direction: "N",
        stop_id: "401698",
        stop_name: "1 AV/E 42 ST",
        observed_timestamp: Math.floor(Date.parse(`2026-03-03T08:0${index}:00Z`) / 1000),
        headway_minutes: headway,
      })),
    );

    const artifact = buildStopDirectionHourEwtFeatureArtifact({
      month: "2026-03",
      routeId: "M15",
      runId: "run-1",
      selection: {
        kind: "route_schedule_timepoint",
        table: "local_route_schedule_timepoint",
        gtfsRunId: null,
        caveat: "fixture",
      },
      scheduleArrivals,
      observedHeadways,
      timezone: "UTC",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: null,
      artifactPath: "data/artifacts/test.json",
      minHeadways: 3,
      minCoverageShare: 0.5,
      observedAggregation: "service_date_hour",
    });

    expect(artifact.artifactKind).toBe("stop_direction_hour_ewt_features");
    expect(artifact.source.scheduleSource).toBe("route_schedule_timepoint");
    expect(artifact.summary.scheduleTimepointCount).toBe(3);
    expect(artifact.summary.observedHeadwaySampleCount).toBe(4);
    expect(artifact.summary.readyFeatureCount).toBe(1);
    expect(artifact.features[0]?.scheduledBusesPerHour).toBe(3);
  });
});
