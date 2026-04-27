import { describe, expect, test } from "bun:test";
import {
  normalizeHourlyRidershipRows,
  normalizeRouteShapeRows,
  normalizeSegmentSpeedRows,
  normalizeStopRows,
} from "../src/index.js";

describe("MTA route slice normalization", () => {
  test("normalizes segment speed rows from Socrata strings", () => {
    const rows = normalizeSegmentSpeedRows([
      {
        year: "2026",
        month: "3",
        timestamp: "2026-03-01T08:00:00.000",
        day_of_week: "Weekday",
        hour_of_day: "8",
        route_id: "M1",
        direction: "N",
        borough: "Manhattan",
        route_type: "Local",
        stop_order: "48",
        timepoint_stop_id: "405543",
        timepoint_stop_name: "E 8 ST/4 AV",
        timepoint_stop_latitude: "40.7301",
        timepoint_stop_longitude: "-73.9901",
        next_timepoint_stop_id: "803003",
        next_timepoint_stop_name: "E 14 ST/4 AV",
        next_timepoint_stop_latitude: "40.7351",
        next_timepoint_stop_longitude: "-73.9891",
        road_distance: "1.23",
        average_travel_time: "14.080560",
        average_road_speed: "9.357582368883058",
        bus_trip_count: "12",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        routeId: "M1",
        isoMonth: "2026-03",
        hourOfDay: 8,
        stopOrder: 48,
        roadDistanceMiles: 1.23,
        averageTravelTimeMinutes: 14.08056,
        averageRoadSpeedMph: 9.357582368883058,
        busTripCount: 12,
      }),
    ]);
  });

  test("normalizes route shapes and stops without losing geometry payloads", () => {
    const routeShapes = normalizeRouteShapeRows([
      {
        route_id: "M1",
        route_short_name: "M1",
        route_long_name: "Harlem - East Village",
        in_effect: "true",
        direction_id: "0",
        direction: "N",
        shape_id: "M010110",
        route_type: "Local",
        trip_type: "Local",
        bundle: "202604",
        shape_length: "12.5",
        geometry: { type: "MultiLineString", coordinates: [] },
      },
    ]);
    const stops = normalizeStopRows([
      {
        route_id: "M1",
        route_short_name: "M1",
        in_effect: "true",
        stop_id: "404191",
        stop_name: "MADISON AV/E 95 ST",
        direction_id: "0",
        direction: "N",
        timepoint: "1",
        latitude: "40.786932",
        longitude: "-73.954292",
        georeference: { type: "Point", coordinates: [-73.954292, 40.786932] },
      },
    ]);

    expect(routeShapes[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        inEffect: true,
        shapeLength: 12.5,
        geometry: { type: "MultiLineString", coordinates: [] },
      }),
    );
    expect(stops[0]).toEqual(
      expect.objectContaining({
        routeId: "M1",
        timepoint: true,
        latitude: 40.786932,
        longitude: -73.954292,
        georeference: { type: "Point", coordinates: [-73.954292, 40.786932] },
      }),
    );
  });

  test("normalizes hourly ridership rows to the segment-speed join grain", () => {
    const rows = normalizeHourlyRidershipRows(
      [
        {
          day_of_week_index: "1",
          hour_of_day: "8",
          ridership: "1234",
          transfers: "321",
        },
      ],
      { routeId: "m1", year: 2026, month: 3 },
    );

    expect(rows).toEqual([
      {
        schemaVersion: 1,
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
