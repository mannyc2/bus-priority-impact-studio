import { describe, expect, test } from "bun:test";
import type { LocalRouteHotspot, LocalRouteScheduleTimepoint } from "@bp/db/local";
import { scheduleComparisons } from "../../src/lib/route-briefs/metrics.ts";

function scheduleRow(input: {
  shapeId: string;
  stopSequence: number;
  stopId: string;
  scheduleTime: string;
}): LocalRouteScheduleTimepoint {
  return {
    routeId: "B67",
    isoMonth: "2026-03",
    scheduleDate: "2026-03-02T00:00:00.000",
    dayType: "Weekday",
    direction: "N",
    blockId: "shared-block",
    ...input,
  };
}

describe("route brief schedule comparisons", () => {
  test("keeps timepoints from different shapes in separate trip groups", () => {
    const schedules = [
      scheduleRow({
        shapeId: "B670309",
        stopSequence: 9,
        stopId: "306556",
        scheduleTime: "2026-03-02T08:00:00.000",
      }),
      scheduleRow({
        shapeId: "B670310",
        stopSequence: 1,
        stopId: "other-from",
        scheduleTime: "2026-03-02T08:01:00.000",
      }),
      scheduleRow({
        shapeId: "B670310",
        stopSequence: 2,
        stopId: "other-to",
        scheduleTime: "2026-03-02T08:02:00.000",
      }),
      scheduleRow({
        shapeId: "B670309",
        stopSequence: 12,
        stopId: "306421",
        scheduleTime: "2026-03-02T08:04:00.000",
      }),
    ];
    const hotspot = {
      routeId: "B67",
      isoMonth: "2026-03",
      segmentId: "B67:2026-03:N:9:306556:306421",
      direction: "N",
      stopOrder: 9,
      timepointStopId: "306556",
      timepointStopName: "20 ST/10 AV",
      nextTimepointStopId: "306421",
      nextTimepointStopName: "7 AV/19 ST",
      observationCount: 5,
      busTripCount: 40,
      weightedAverageSpeedMph: 6.7,
      weightedAverageTravelTimeMinutes: 4.5,
      averageRoadDistanceMiles: 0.5,
      slowWindowShare: 1,
      speedSeverity: 1,
      hotspotScore: 46,
    } satisfies LocalRouteHotspot;

    const result = scheduleComparisons(schedules, [hotspot]);

    expect(result.hotspotComparisons[0]).toMatchObject({
      segmentId: hotspot.segmentId,
      scheduledMedianTravelTimeMinutes: 4,
      scheduledSampleCount: 1,
    });
  });
});
