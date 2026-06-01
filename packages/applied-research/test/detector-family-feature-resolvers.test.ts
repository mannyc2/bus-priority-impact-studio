import { describe, expect, test } from "bun:test";
import type { FeatureQuality, StopDirectionHourFeature } from "@bp/analytics/features";
import {
  buildDelayConcentrationRoutes,
  buildInterventionPanelFeatures,
  buildPositiveDevianceFeatures,
  buildRiderWeightedExcessWaitFeatures,
} from "../src/feature-resolvers";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 30,
    expectedCount: 30,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 30,
    minSampleCount: 10,
    sampleStatus: "supported",
    ...over,
  };
}

function stopHour(over: Partial<StopDirectionHourFeature> = {}): StopDirectionHourFeature {
  return {
    routeId: "M15",
    stopId: "401234",
    stopName: "1 Av/E 42 St",
    direction: "N",
    serviceDate: "2026-03-05",
    localHour: 8,
    timezone: "America/New_York",
    scheduledHeadwayMinutes: 10,
    scheduledBusesPerHour: 6,
    observedHeadwaysMinutes: [3, 3, 3, 3, 3, 15, 15, 18, 18, 24],
    observedPairCount: 10,
    bunchingPairCount: 0,
    gapPairCount: 1,
    quality: quality(),
    ...over,
  };
}

describe("detector-family feature resolvers", () => {
  test("builds rider-weighted EWT features from stop-hour EWT and route-hour ridership", () => {
    const result = buildRiderWeightedExcessWaitFeatures({
      stopFeatures: [
        stopHour({ stopId: "s1" }),
        stopHour({ stopId: "s2" }),
        stopHour({ stopId: "s3", localHour: 9 }),
      ],
      ridershipRows: [
        {
          route_id: "M15",
          month: "2026-03",
          day_of_week: "Weekday",
          hour_of_day: 8,
          ridership: 120,
        },
      ],
    });

    expect(result.features).toHaveLength(3);
    expect(result.features[0]?.boardings).toBe(60);
    expect(result.features[1]?.boardings).toBe(60);
    expect(result.features[2]?.boardings).toBeNull();
    expect(result.summary["featureWithRidershipCount"]).toBe(2);
    expect(result.summary["featureWithExcessWaitCount"]).toBe(3);
  });

  test("builds positive-deviance features from route-month peers", () => {
    const result = buildPositiveDevianceFeatures({
      releaseMonth: "2026-03",
      minPeerCount: 2,
      minStablePeriods: 2,
      rows: [
        { route_id: "M15", month: "2026-02", speed_observation_count: 30, average_speed_mph: 8 },
        { route_id: "M15", month: "2026-03", speed_observation_count: 30, average_speed_mph: 9 },
        { route_id: "M20", month: "2026-02", speed_observation_count: 30, average_speed_mph: 5 },
        { route_id: "M20", month: "2026-03", speed_observation_count: 30, average_speed_mph: 6 },
      ],
    });

    const m15 = result.features.find((feature) => feature.routeId === "M15");
    expect(result.summary["supportedFeatureCount"]).toBe(2);
    expect(m15?.quality.sampleStatus).toBe("supported");
    expect(m15?.periods.at(-1)?.performancePercentile).toBe(1);
  });

  test("builds intervention panel features with explicit control eligibility", () => {
    const result = buildInterventionPanelFeatures({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          event_id: "evt-1",
          intervention_type: "bus_lane",
          implementation_date: "2026-01-15",
          implementation_month: "2026-01",
          comparison_status: "evaluated",
          pre_start_month: "2025-10",
          pre_end_month: "2025-12",
          post_start_month: "2026-02",
          post_end_month: "2026-03",
          comparison_route_count: 3,
          comparison_route_ids: JSON.stringify(["M20", "M21", "M22"]),
          adjusted_speed_delta_mph: 1.2,
          speed_delta_mph: 1,
        },
      ],
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.controlEligibilityStatus).toBe("eligible");
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.features[0]?.matchedPeerDelta).toBe(1.2);
  });

  test("groups delay-concentration segment rows into route inputs", () => {
    const result = buildDelayConcentrationRoutes({
      rows: [
        {
          route_id: "M15",
          segment_id: "M15:0:1:a:b",
          direction: "0",
          stop_order: 1,
          timepoint_stop_name: "A",
          next_timepoint_stop_name: "B",
          observation_count: 10,
          bus_trip_count: 25,
          weighted_average_speed_mph: 5,
          weighted_average_travel_time_minutes: 8,
          average_road_distance_miles: 0.6,
        },
      ],
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.routeId).toBe("M15");
    expect(result.routes[0]?.segments[0]?.segmentId).toBe("M15:0:1:a:b");
    expect(result.summary["segmentCount"]).toBe(1);
  });
});
