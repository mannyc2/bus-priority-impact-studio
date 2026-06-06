import { describe, expect, test } from "bun:test";
import {
  normalizeAceRouteRows,
  normalizeAceViolationSummaryRows,
} from "@bp/sources/adapters/mta/ace";
import { normalizeBusWaitAssessmentRows } from "@bp/sources/adapters/mta/bus-wait-assessment";
import { normalizeHourlyRidershipRows } from "@bp/sources/adapters/mta/bus-ridership";
import { normalizeSegmentSpeedRows } from "@bp/sources/adapters/mta/bus-speeds";
import { normalizeRouteShapeRows, normalizeStopRows } from "@bp/sources/adapters/mta/routes-stops";
import { normalizeScheduleTimepointRows } from "@bp/sources/adapters/mta/schedules";
import { normalizeBusLaneRows } from "@bp/sources/adapters/nyc-dot/bus-lanes";

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

  test("normalizes bus wait assessment rows when Socrata omits null assessment fields", () => {
    const rows = normalizeBusWaitAssessmentRows([
      {
        month: "2026-04-01T00:00:00.000",
        borough: "Brooklyn",
        day_type: "1",
        trip_type: "UNKNOWN",
        route_id: "B1",
        period: "Peak",
        number_of_trips_passing_wait: "0",
        number_of_scheduled_trips: "0",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        month: "2026-04",
        routeId: "B1",
        waitAssessment: null,
      }),
    ]);
  });

  test("skips segment speed rows without usable next-timepoint metadata", () => {
    const rows = normalizeSegmentSpeedRows([
      {
        year: "2026",
        month: "3",
        timestamp: "2026-03-01T08:00:00.000",
        day_of_week: "Weekday",
        hour_of_day: "8",
        route_id: "Q63",
        direction: "N",
        borough: "Queens",
        route_type: "Local",
        stop_order: "22",
        timepoint_stop_id: "921855",
        timepoint_stop_name: "39 AV/MAIN ST",
        timepoint_stop_latitude: "40.7601",
        timepoint_stop_longitude: "-73.8301",
        next_timepoint_stop_id: "982491",
        road_distance: "0.52",
        average_travel_time: "4.2",
        average_road_speed: "7.4",
        bus_trip_count: "6",
      },
    ]);

    expect(rows).toEqual([]);
  });

  test("skips segment speed rows without usable current-timepoint metadata", () => {
    const rows = normalizeSegmentSpeedRows([
      {
        year: "2026",
        month: "3",
        timestamp: "2026-03-01T08:00:00.000",
        day_of_week: "Weekday",
        hour_of_day: "8",
        route_id: "Q47",
        direction: "N",
        borough: "Queens",
        route_type: "Local",
        stop_order: "1",
        timepoint_stop_id: "904001",
        next_timepoint_stop_id: "904002",
        next_timepoint_stop_name: "74 ST/ROOSEVELT AV",
        next_timepoint_stop_latitude: "40.7461",
        next_timepoint_stop_longitude: "-73.8911",
        road_distance: "0.52",
        average_travel_time: "4.2",
        average_road_speed: "7.4",
        bus_trip_count: "6",
      },
    ]);

    expect(rows).toEqual([]);
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

  test("falls back to route id when current route feeds omit short names", () => {
    const routeShapes = normalizeRouteShapeRows([
      {
        route_id: "M2",
        in_effect: "true",
        direction_id: "0",
        direction: "N",
        shape_id: "M020110",
      },
    ]);
    const stops = normalizeStopRows([
      {
        route_id: "M2",
        stop_id: "404191",
        stop_name: "MADISON AV/E 95 ST",
        in_effect: "true",
        direction_id: "0",
        direction: "N",
        timepoint: "1",
        latitude: "40.786932",
        longitude: "-73.954292",
      },
    ]);

    expect(routeShapes[0]?.routeShortName).toBe("M2");
    expect(stops[0]?.routeShortName).toBe("M2");
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

  test("normalizes ACE route implementation rows", () => {
    const rows = normalizeAceRouteRows([
      {
        route: "m1",
        program: "ACE",
        implementation_date: "2024-06-20T00:00:00.000",
      },
      {
        route: "M14+",
        program: "ABLE",
        implementation_date: "2019-10-07T00:00:00.000",
      },
    ]);

    expect(rows).toEqual([
      {
        schemaVersion: 1,
        routeId: "M1",
        program: "ACE",
        implementationDate: "2024-06-20T00:00:00.000Z",
      },
      {
        schemaVersion: 1,
        routeId: "M14+",
        program: "ABLE",
        implementationDate: "2019-10-07T00:00:00.000Z",
      },
    ]);
  });

  test("normalizes grouped ACE violation rows", () => {
    const rows = normalizeAceViolationSummaryRows([
      {
        bus_route_id: "m15+",
        violation_type: "MOBILE BUS LANE",
        violation_status: "EXEMPT - OTHER",
        violation_count: "12",
      },
    ]);

    expect(rows).toEqual([
      {
        schemaVersion: 1,
        routeId: "M15+",
        violationType: "MOBILE BUS LANE",
        violationStatus: "EXEMPT - OTHER",
        violationCount: 12,
      },
    ]);
  });

  test("normalizes NYC DOT bus lane rows with geometry and operating fields", () => {
    const rows = normalizeBusLaneRows([
      {
        the_geom: {
          type: "MultiLineString",
          coordinates: [
            [
              [
                [-73.97, 40.76],
                [-73.96, 40.77],
              ],
            ],
          ],
        },
        street: "5 AVENUE",
        bltrafdir: "T",
        segmentid: "0001234",
        boro: "MAN",
        facility: "5th Avenue",
        direction: "SB",
        hours: "7AM-7PM",
        days: "Mon - Fri",
        lane_width: "Single",
        lane_type1: "Bus Lane",
        lane_type: "Curbside",
        open_dates: "4/3/1986",
        shape_leng: "255.5",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        segmentId: "0001234",
        street: "5 AVENUE",
        borough: "MAN",
        facility: "5th Avenue",
        direction: "SB",
        trafficDirection: "T",
        hours: "7AM-7PM",
        days: "Mon - Fri",
        laneType: "Curbside",
        laneSubtype: "Bus Lane",
        laneWidth: "Single",
        openDate: "4/3/1986",
        shapeLength: 255.5,
      }),
    ]);
  });

  test("normalizes schedule timepoint rows", () => {
    const rows = normalizeScheduleTimepointRows([
      {
        schedule_date: "2026-01-05T00:00:00.000",
        day_type: "Weekday",
        direction: "N",
        shape_id: "M010108",
        route_id: "m1",
        stop_sequence: "6",
        stop_id: "405527",
        stop_name: "4 AV/E 10 ST",
        schedule_time: "2026-01-05T07:07:00.000",
        distance_from_start: "841",
        trip_headsign: "HARLEM 147 ST via MADISON AV",
        block_id: "38253118",
        bundle: "2025Aug",
      },
    ]);

    expect(rows).toEqual([
      {
        schemaVersion: 1,
        routeId: "M1",
        scheduleDate: "2026-01-05T00:00:00.000Z",
        dayType: "Weekday",
        direction: "N",
        shapeId: "M010108",
        stopSequence: 6,
        stopId: "405527",
        stopName: "4 AV/E 10 ST",
        scheduleTime: "2026-01-05T07:07:00.000Z",
        distanceFromStart: 841,
        tripHeadsign: "HARLEM 147 ST via MADISON AV",
        blockId: "38253118",
        bundle: "2025Aug",
      },
    ]);
  });
});
