import { describe, expect, test } from "bun:test";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
} from "../src/feature-resolvers";

describe("runtime and history feature resolvers", () => {
  test("builds route-direction-daypart runtime features with schedule baselines", () => {
    const result = buildRouteDirectionDaypartFeatures({
      observedRows: [
        {
          route_id: "M15",
          month: "2026-03",
          direction: "0",
          daypart: "am_peak",
          runtime_minutes: 20,
          observed_trip_count: 10,
        },
        {
          route_id: "M15",
          month: "2026-03",
          direction: "0",
          daypart: "am_peak",
          runtime_minutes: 30,
          observed_trip_count: 12,
        },
      ],
      scheduledRows: [
        { route_id: "M15", direction: "0", daypart: "am_peak", runtime_minutes: 18 },
        { route_id: "M15", direction: "0", daypart: "am_peak", runtime_minutes: 22 },
      ],
      minObservedTrips: 20,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      routeId: "M15",
      month: "2026-03",
      direction: "0",
      daypart: "am_peak",
      scheduledRuntimeMinutes: 20,
      observedRuntimeP50Minutes: 25,
      observedTripCount: 22,
    });
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.summary["supportedFeatureCount"]).toBe(1);
  });

  test("builds route metric history features without collapsing release coverage", () => {
    const result = buildRouteMetricHistoryFeatures({
      rows: [
        {
          route_id: "M15",
          month: "2026-01",
          speed_observation_count: 30,
          average_speed_mph: 8,
        },
        {
          route_id: "M15",
          month: "2026-02",
          speed_observation_count: 10,
          average_speed_mph: 7,
        },
        {
          route_id: "M15",
          month: "2026-03",
          speed_observation_count: 35,
          average_speed_mph: 6,
        },
      ],
      releaseMonth: "2026-03",
      historyStartMonth: "2026-01",
      minHistoryPoints: 2,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.features[0]?.points.map((point) => point.coverageStatus)).toEqual([
      "complete",
      "low_coverage",
      "complete",
    ]);
    expect(result.summary["supportedFeatureCount"]).toBe(1);
  });
});
