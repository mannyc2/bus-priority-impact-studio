import { describe, expect, test } from "bun:test";
import type {
  LocalRouteHotspot,
  LocalRouteHourlyRidership,
  LocalRouteScheduleTimepoint,
  LocalRouteSegmentSpeed,
} from "@bp/db/local";
import { buildRouteBriefSegmentUniverse } from "../../src/lib/route-briefs/model.ts";
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

  test("collapses adjacent stop-order aliases for the same physical segment", () => {
    const speedRow = (stopOrder: number, hourOfDay: number): LocalRouteSegmentSpeed => ({
      routeId: "Q4",
      isoMonth: "2026-03",
      timestamp: `2026-03-02T${String(hourOfDay).padStart(2, "0")}:00:00.000`,
      dayOfWeek: "Monday",
      hourOfDay,
      direction: "W",
      borough: "Queens",
      routeType: "Local",
      stopOrder,
      timepointStopId: "504037",
      timepointStopName: "From",
      timepointStopLatitude: 40.7,
      timepointStopLongitude: -73.8,
      nextTimepointStopId: "500410",
      nextTimepointStopName: "To",
      nextTimepointStopLatitude: 40.71,
      nextTimepointStopLongitude: -73.79,
      roadDistanceMiles: 1,
      averageTravelTimeMinutes: 10,
      averageRoadSpeedMph: 6,
      busTripCount: 5,
    });
    const ridershipRows: LocalRouteHourlyRidership[] = [8, 9].map((hourOfDay) => ({
      routeId: "Q4",
      isoMonth: "2026-03",
      dayOfWeek: "Monday",
      hourOfDay,
      ridership: 100,
      transfers: 10,
    }));
    const schedules: LocalRouteScheduleTimepoint[] = [
      {
        ...scheduleRow({
          shapeId: "Q040001",
          stopSequence: 8,
          stopId: "504037",
          scheduleTime: "2026-03-02T08:00:00.000",
        }),
        routeId: "Q4",
        direction: "W",
      },
      {
        ...scheduleRow({
          shapeId: "Q040001",
          stopSequence: 10,
          stopId: "500410",
          scheduleTime: "2026-03-02T08:08:00.000",
        }),
        routeId: "Q4",
        direction: "W",
      },
    ];

    const result = buildRouteBriefSegmentUniverse({
      speedRows: [speedRow(8, 8), speedRow(9, 9)],
      ridershipRows,
      schedules,
      year: 2026,
      month: 3,
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      segmentId: "Q4:2026-03:W:8:504037:500410",
      stopOrder: 8,
      observationCount: 2,
      busTripCount: 10,
      ridershipExposure: 200,
    });
  });
});
