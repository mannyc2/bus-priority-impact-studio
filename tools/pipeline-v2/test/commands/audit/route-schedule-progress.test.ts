import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { auditRouteScheduleProgress } from "../../../src/commands/audit/route-schedule-progress.ts";
import { runGtfsStaticIngest } from "../../../src/commands/ingest/gtfs-static.ts";

describe("audit route-schedule-progress", () => {
  test("summarizes staged Socrata schedules and GTFS static runs", async () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id text primary key);
        INSERT INTO local_route_catalog (route_id) VALUES ('M15'), ('B1');
        CREATE TABLE local_route_schedule_stop (
          source_year integer NOT NULL,
          route_id text NOT NULL,
          stop_id text NOT NULL,
          timepoint integer
        );
        INSERT INTO local_route_schedule_stop VALUES
          (2026, 'M15', '401001', 1),
          (2026, 'M15', '401002', 1),
          (2026, 'B1', '301001', 1);
      `);

      await runGtfsStaticIngest({
        sqlite,
        runId: "gtfs-test",
        ingestedAt: "2026-05-31T00:00:00.000Z",
        bundles: [{ sourceId: "bus_gtfs_manhattan", zipPath: "fixture.zip" }],
        entryReader: async (_zipPath, entryName) => {
          const files: Record<string, string> = {
            "routes.txt": "route_id,route_short_name\nM15,M15",
            "trips.txt": "route_id,service_id,trip_id,direction_id\nM15,WKD,trip-1,0",
            "stops.txt": "stop_id,stop_name\n401001,First\n401002,Second",
            "stop_times.txt":
              "trip_id,arrival_time,departure_time,stop_id,stop_sequence,timepoint\ntrip-1,07:00:00,07:00:00,401001,1,1\ntrip-1,07:02:00,07:02:00,401002,2,0",
            "calendar.txt":
              "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWKD,1,1,1,1,1,0,0,20260501,20260531",
            "calendar_dates.txt": "service_id,date,exception_type\n",
          };
          return files[entryName] ?? "";
        },
      });

      expect(auditRouteScheduleProgress(sqlite)).toMatchObject({
        routeCatalogCount: 2,
        socrataRouteSchedules: [
          {
            sourceYear: 2026,
            rowCount: 3,
            routeCount: 2,
            stopCount: 3,
            timepointRowCount: 3,
            stagedRouteShare: 1,
            timepointRowShare: 1,
            likelyTimepointGrain: true,
          },
        ],
        gtfsStaticRuns: [
          {
            runId: "gtfs-test",
            bundleCount: 1,
            routeCount: 1,
            stopCount: 2,
            tripCount: 1,
            stopTimeCount: 2,
            serviceCount: 1,
            sourceIds: ["bus_gtfs_manhattan"],
          },
        ],
      });
    } finally {
      sqlite.close();
    }
  });
});
