import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { auditRouteScheduleProgress } from "../src/local-db";

describe("route schedule progress local DB audit", () => {
  test("summarizes staged Socrata schedules and GTFS static runs", () => {
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
        CREATE TABLE local_gtfs_static_bundle (
          run_id text NOT NULL,
          source_id text NOT NULL,
          ingested_at text NOT NULL,
          trip_count integer NOT NULL,
          stop_time_count integer NOT NULL,
          calendar_count integer NOT NULL
        );
        INSERT INTO local_gtfs_static_bundle VALUES
          ('gtfs-test', 'bus_gtfs_manhattan', '2026-05-31T00:00:00.000Z', 1, 2, 1);
        CREATE TABLE local_gtfs_static_route (
          run_id text NOT NULL,
          route_id text NOT NULL
        );
        INSERT INTO local_gtfs_static_route VALUES ('gtfs-test', 'M15');
        CREATE TABLE local_gtfs_static_stop (
          run_id text NOT NULL,
          stop_id text NOT NULL
        );
        INSERT INTO local_gtfs_static_stop VALUES
          ('gtfs-test', '401001'),
          ('gtfs-test', '401002');
      `);

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
