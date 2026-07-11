import { describe, expect, test } from "bun:test";
import { detectSegmentHotspots, type SegmentSpeedObservation } from "@bp/analytics/hotspots";

const baseObservation = {
  routeId: "M1",
  isoMonth: "2026-03",
  direction: "N",
  timepointStopId: "A",
  timepointStopName: "A stop",
  nextTimepointStopId: "B",
  nextTimepointStopName: "B stop",
  roadDistanceMiles: 1,
};

function observation(overrides: Partial<SegmentSpeedObservation>): SegmentSpeedObservation {
  return {
    ...baseObservation,
    stopOrder: 1,
    averageTravelTimeMinutes: 10,
    averageRoadSpeedMph: 4,
    busTripCount: 10,
    ...overrides,
  };
}

describe("segment hotspot detection", () => {
  test("ranks persistent slow weighted segments above faster segments", () => {
    const result = detectSegmentHotspots(
      [
        observation({ stopOrder: 1, averageRoadSpeedMph: 4, busTripCount: 10 }),
        observation({ stopOrder: 1, averageRoadSpeedMph: 6, busTripCount: 20 }),
        observation({
          stopOrder: 2,
          timepointStopId: "B",
          nextTimepointStopId: "C",
          timepointStopName: "B stop",
          nextTimepointStopName: "C stop",
          averageRoadSpeedMph: 9,
          busTripCount: 30,
        }),
      ],
      { targetSpeedMph: 8, slowSpeedThresholdMph: 8 },
    );

    expect(result.routeWeightedAverageSpeedMph).toBe(7.1667);
    expect(result.segmentCount).toBe(2);
    expect(result.hotspots[0]).toEqual(
      expect.objectContaining({
        segmentId: "M1:2026-03:N:1:A:B",
        weightedAverageSpeedMph: 5.3333,
        slowWindowShare: 1,
        hotspotScore: 57,
      }),
    );
  });

  test("rejects empty observation sets", () => {
    expect(() => detectSegmentHotspots([])).toThrow();
  });

  test("uses ridership exposure to rank rider-impact hotspots", () => {
    const result = detectSegmentHotspots(
      [
        observation({
          stopOrder: 1,
          averageRoadSpeedMph: 4,
          busTripCount: 10,
          ridership: 10,
          transfers: 1,
        }),
        observation({
          stopOrder: 2,
          timepointStopId: "B",
          nextTimepointStopId: "C",
          timepointStopName: "B stop",
          nextTimepointStopName: "C stop",
          averageRoadSpeedMph: 6,
          busTripCount: 10,
          ridership: 1000,
          transfers: 100,
        }),
      ],
      { targetSpeedMph: 8, slowSpeedThresholdMph: 8 },
    );

    expect(result.ridershipWeighted).toBe(true);
    expect(result.hotspots[0]).toEqual(
      expect.objectContaining({
        segmentId: "M1:2026-03:N:2:B:C",
        hotspotScore: 51,
        ridershipExposure: 1000,
        riderDelayIndex: 250,
        riderImpactShare: 1,
        riderImpactScore: 68,
      }),
    );
  });
});
