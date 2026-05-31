import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { parseGtfsCsv, runGtfsStaticIngest } from "../../../src/commands/ingest/gtfs-static.ts";

const files = {
  "routes.txt": [
    "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type",
    'M15,MTA NYCT,M15,"East Harlem - South Ferry","via 1 Av / 2 Av",3',
  ].join("\n"),
  "trips.txt": [
    "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id",
    "M15,WKD,trip-1,EAST HARLEM,0,block-1,shape-1",
  ].join("\n"),
  "stops.txt": [
    "stop_id,stop_name,stop_lat,stop_lon",
    '401001,"1 AV/E 1 ST",40.1,-73.9',
    '401002,"1 AV/E 2 ST",40.2,-73.8',
  ].join("\n"),
  "stop_times.txt": [
    "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint",
    "trip-1,07:00:00,07:00:00,401001,1,0,0,1",
    "trip-1,07:02:00,07:02:00,401002,2,0,0,0",
  ].join("\n"),
  "calendar.txt": [
    "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
    "WKD,1,1,1,1,1,0,0,20260501,20260601",
  ].join("\n"),
  "calendar_dates.txt": ["service_id,date,exception_type", "WKD,20260525,2"].join("\n"),
};

describe("ingest gtfs-static", () => {
  test("parses quoted GTFS CSV fields", () => {
    expect(parseGtfsCsv('id,name\n1,"A, B"\n2,"C ""quoted"""')).toEqual([
      { id: "1", name: "A, B" },
      { id: "2", name: 'C "quoted"' },
    ]);
  });

  test("stages routes, trips, stops, calendars, and all stop_times", async () => {
    const sqlite = new Database(":memory:");
    try {
      const result = await runGtfsStaticIngest({
        sqlite,
        runId: "test-gtfs",
        ingestedAt: "2026-05-31T00:00:00.000Z",
        bundles: [{ sourceId: "bus_gtfs_manhattan", zipPath: "fixture.zip" }],
        entryReader: async (_zipPath, entryName) => files[entryName as keyof typeof files] ?? "",
      });

      expect(result).toMatchObject({
        runId: "test-gtfs",
        bundleCount: 1,
        routeCount: 1,
        tripCount: 1,
        stopCount: 2,
        stopTimeCount: 2,
        calendarCount: 1,
        calendarDateCount: 1,
      });
      expect(
        sqlite
          .query(
            `
              SELECT route_id, service_id, direction_id, stop_id, arrival_time, timepoint
              FROM local_gtfs_static_stop_time
              ORDER BY stop_sequence
            `,
          )
          .all(),
      ).toEqual([
        {
          route_id: "M15",
          service_id: "WKD",
          direction_id: "0",
          stop_id: "401001",
          arrival_time: "07:00:00",
          timepoint: 1,
        },
        {
          route_id: "M15",
          service_id: "WKD",
          direction_id: "0",
          stop_id: "401002",
          arrival_time: "07:02:00",
          timepoint: 0,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
