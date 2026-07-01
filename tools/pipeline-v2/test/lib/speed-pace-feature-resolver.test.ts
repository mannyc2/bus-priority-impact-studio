import { describe, expect, test } from "bun:test";
import {
  buildSegmentDaypartFeaturesFromSpeedRows,
  type SegmentDaypartSpeedSourceRow,
  segmentIdForSpeedRow,
} from "../../src/lib/speed-pace-feature-resolver.ts";

function row(overrides: Partial<SegmentDaypartSpeedSourceRow>): SegmentDaypartSpeedSourceRow {
  return {
    route_id: "M15",
    month: "2026-03",
    hour_of_day: 8,
    direction: "0",
    stop_order: 10,
    timepoint_stop_id: "s1",
    next_timepoint_stop_id: "s2",
    road_distance_miles: 1,
    average_travel_time_minutes: 15,
    average_road_speed_mph: 4,
    bus_trip_count: 20,
    ...overrides,
  };
}

describe("speed pace feature resolver", () => {
  test("builds segment/daypart features without collapsing route-month detail", () => {
    const result = buildSegmentDaypartFeaturesFromSpeedRows({
      rows: [
        row({ hour_of_day: 8, average_travel_time_minutes: 15, average_road_speed_mph: 4 }),
        row({ hour_of_day: 11, average_travel_time_minutes: 5, average_road_speed_mph: 12 }),
      ],
    });

    expect(result.summary.sourceRowCount).toBe(2);
    expect(result.summary.featureCount).toBe(2);
    expect(result.summary.routeCount).toBe(1);
    expect(result.summary.skippedInvalidRowCount).toBe(0);

    const amPeak = result.features.find((feature) => feature.daypart === "am_peak");
    expect(amPeak?.routeId).toBe("M15");
    expect(amPeak?.segmentId).toBe("M15:0:10:s1:s2");
    expect(amPeak?.traversalCount).toBe(20);
    expect(amPeak?.medianPaceMinutesPerMile).toBe(15);
    expect(amPeak?.freeFlowPaceMinutesPerMile).toBe(6.5);
    expect(amPeak?.systematicDelayMinutesPerMile).toBe(8.5);
    expect(amPeak?.quality.sampleStatus).toBe("supported");
  });

  test("skips invalid source rows and preserves deterministic segment ids", () => {
    expect(segmentIdForSpeedRow(row({}))).toBe("M15:0:10:s1:s2");

    const result = buildSegmentDaypartFeaturesFromSpeedRows({
      rows: [row({ road_distance_miles: 0 }), row({ timepoint_stop_id: null })],
    });

    expect(result.summary.featureCount).toBe(0);
    expect(result.summary.skippedInvalidRowCount).toBe(2);
  });
});
