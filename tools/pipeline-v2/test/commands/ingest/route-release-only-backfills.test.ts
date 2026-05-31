import { describe, expect, it } from "bun:test";
import { normalizeRouteHourlyRidershipRows } from "../../../src/commands/ingest/route-hourly-ridership.ts";
import { normalizeRouteSegmentSpeedRows } from "../../../src/commands/ingest/route-segment-speeds.ts";

describe("release-only route backfill normalizers", () => {
  it("keeps segment speed rows at the route/month grain and coerces numeric stop IDs", () => {
    const rows = normalizeRouteSegmentSpeedRows(
      [
        {
          year: "2026",
          month: "3",
          timestamp: "2026-03-03T08:00:00.000",
          day_of_week: "Tuesday",
          hour_of_day: "8",
          route_id: "m1",
          direction: "N",
          borough: "Manhattan",
          route_type: "Local",
          stop_order: "10",
          timepoint_stop_id: 401001,
          timepoint_stop_name: "1 AV/E 42 ST",
          timepoint_stop_latitude: "40.7501",
          timepoint_stop_longitude: "-73.9701",
          next_timepoint_stop_id: 401099,
          next_timepoint_stop_name: "1 AV/E 57 ST",
          next_timepoint_stop_latitude: "40.7601",
          next_timepoint_stop_longitude: "-73.9601",
          road_distance: "0.84",
          average_travel_time: "7.5",
          average_road_speed: "6.72",
          bus_trip_count: "17",
        },
        {
          year: "2026",
          month: "4",
          timestamp: "2026-04-03T08:00:00.000",
          day_of_week: "Friday",
          hour_of_day: "8",
          route_id: "M1",
          direction: "N",
          borough: "Manhattan",
          route_type: "Local",
          stop_order: "10",
          timepoint_stop_id: 401001,
          timepoint_stop_name: "1 AV/E 42 ST",
          timepoint_stop_latitude: "40.7501",
          timepoint_stop_longitude: "-73.9701",
          next_timepoint_stop_id: 401099,
          next_timepoint_stop_name: "1 AV/E 57 ST",
          next_timepoint_stop_latitude: "40.7601",
          next_timepoint_stop_longitude: "-73.9601",
          road_distance: "0.84",
          average_travel_time: "7.5",
          average_road_speed: "6.72",
          bus_trip_count: "17",
        },
      ],
      "2026-03",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      routeId: "M1",
      isoMonth: "2026-03",
      timepointStopId: "401001",
      nextTimepointStopId: "401099",
      averageRoadSpeedMph: 6.72,
      busTripCount: 17,
    });
  });

  it("normalizes route-level hourly ridership aggregate rows", () => {
    const rows = normalizeRouteHourlyRidershipRows(
      [
        {
          bus_route: "m1",
          day_of_week_index: "1",
          hour_of_day: "8",
          ridership: "1234",
          transfers: "321",
        },
        {
          bus_route: "B41",
          day_of_week_index: "5",
          hour_of_day: "17",
          ridership: "4321",
          transfers: "123",
        },
      ],
      { year: 2026, month: 3 },
    );

    expect(rows).toEqual([
      {
        routeId: "B41",
        isoMonth: "2026-03",
        dayOfWeek: "Friday",
        hourOfDay: 17,
        ridership: 4321,
        transfers: 123,
      },
      {
        routeId: "M1",
        isoMonth: "2026-03",
        dayOfWeek: "Monday",
        hourOfDay: 8,
        ridership: 1234,
        transfers: 321,
      },
    ]);
  });
});
