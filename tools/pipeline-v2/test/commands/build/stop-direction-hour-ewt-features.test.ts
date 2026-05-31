import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildStopDirectionHourEwtFeatureArtifactFromDb } from "../../../src/commands/build/stop-direction-hour-ewt-features.ts";
import { runGtfsStaticIngest } from "../../../src/commands/ingest/gtfs-static.ts";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_route_schedule_timepoint (
      route_id text NOT NULL,
      month text NOT NULL,
      row_rank integer NOT NULL,
      schedule_date text NOT NULL,
      day_type text NOT NULL,
      direction text NOT NULL,
      shape_id text NOT NULL,
      stop_sequence integer NOT NULL,
      stop_id text NOT NULL,
      stop_name text,
      schedule_time text NOT NULL,
      distance_from_start real,
      trip_headsign text,
      block_id text NOT NULL,
      bundle text,
      PRIMARY KEY(route_id, month, row_rank)
    );
    CREATE TABLE local_observed_headway_sample (
      run_id text NOT NULL,
      sample_rank integer NOT NULL,
      route_id text NOT NULL,
      source_route_id text,
      direction_id integer,
      stop_id text NOT NULL,
      previous_vehicle_key text NOT NULL,
      vehicle_key text NOT NULL,
      previous_observed_timestamp integer NOT NULL,
      observed_timestamp integer NOT NULL,
      headway_seconds integer NOT NULL,
      headway_minutes real NOT NULL,
      PRIMARY KEY(run_id, sample_rank)
    );
    CREATE TABLE local_route_stop (
      route_id text NOT NULL,
      month text NOT NULL,
      stop_id text NOT NULL,
      route_short_name text NOT NULL,
      stop_name text NOT NULL,
      in_effect integer NOT NULL,
      direction_id text NOT NULL,
      direction text NOT NULL,
      timepoint integer NOT NULL,
      latitude real NOT NULL,
      longitude real NOT NULL,
      PRIMARY KEY(route_id, month, stop_id, direction_id)
    );
  `);
  return db;
}

describe("build stop-direction-hour-ewt-features", () => {
  test("builds a raw schedule-derived stop-hour EWT feature artifact from SQLite", () => {
    const db = createDb();
    try {
      for (const [index, time] of ["08:00", "08:10", "08:20"].entries()) {
        db.prepare(
          `
            INSERT INTO local_route_schedule_timepoint (
              route_id, month, row_rank, schedule_date, day_type, direction, shape_id,
              stop_sequence, stop_id, stop_name, schedule_time, block_id
            )
            VALUES ('M15', '2026-03', ?, '2026-01-05T00:00:00.000Z', 'Weekday', 'N',
              'shape', ?, '401698', '1 AV/E 42 ST', ?, 'block')
          `,
        ).run(index + 1, index + 1, `2026-01-05T${time}:00.000Z`);
      }

      db.prepare(
        `
          INSERT INTO local_route_stop (
            route_id, month, stop_id, route_short_name, stop_name, in_effect,
            direction_id, direction, timepoint, latitude, longitude
          )
          VALUES ('M15', '2026-03', '401698', 'M15', '1 AV/E 42 ST', 1, '0', 'N', 1, 40.0, -73.0)
        `,
      ).run();

      for (const [index, headway] of [4, 5, 10, 18].entries()) {
        const minute = String(5 + index).padStart(2, "0");
        const observedTimestamp = Math.floor(Date.parse(`2026-03-03T08:${minute}:00Z`) / 1000);
        db.prepare(
          `
            INSERT INTO local_observed_headway_sample (
              run_id, sample_rank, route_id, direction_id, stop_id, previous_vehicle_key,
              vehicle_key, previous_observed_timestamp, observed_timestamp, headway_seconds,
              headway_minutes
            )
            VALUES ('run-1', ?, 'M15', 0, '401698', 'prev', 'veh', ?, ?, ?, ?)
          `,
        ).run(
          index + 1,
          observedTimestamp - headway * 60,
          observedTimestamp,
          headway * 60,
          headway,
        );
      }

      const artifact = buildStopDirectionHourEwtFeatureArtifactFromDb({
        sqlite: db,
        month: "2026-03",
        routeId: "M15",
        runId: "run-1",
        scheduleSource: "route_schedule_timepoint",
        gtfsRunId: null,
        timezone: "UTC",
        observedAggregation: "service_date_hour",
        generatedAt: "2026-05-31T00:00:00.000Z",
        dbPath: null,
        artifactPath: "data/artifacts/test.json",
        minHeadways: 3,
        minCoverageShare: 0.5,
      });

      expect(artifact.summary).toMatchObject({
        scheduleTimepointCount: 3,
        observedHeadwaySampleCount: 4,
        scheduleBaselineCount: 1,
        featureCount: 1,
        readyFeatureCount: 1,
      });
      expect(artifact.features[0]).toMatchObject({
        routeId: "M15",
        direction: "N",
        stopId: "401698",
        scheduledBusesPerHour: 3,
        scheduledHeadwayMinutes: 10,
      });
      expect(artifact.auditRows[0]?.missingDataState).toBe("ready");
    } finally {
      db.close();
    }
  });

  test("prefers GTFS static all-stop schedules when requested", async () => {
    const db = createDb();
    try {
      await runGtfsStaticIngest({
        sqlite: db,
        runId: "gtfs-test",
        ingestedAt: "2026-05-31T00:00:00.000Z",
        bundles: [{ sourceId: "bus_gtfs_manhattan", zipPath: "fixture.zip" }],
        entryReader: async (_zipPath, entryName) => {
          const files: Record<string, string> = {
            "routes.txt": "route_id,route_short_name,route_long_name,route_type\nM15,M15,Test,3",
            "trips.txt":
              "route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id\nM15,WKD,trip-1,North,0,block,shape",
            "stops.txt":
              "stop_id,stop_name,stop_lat,stop_lon\n401001,First,40,-73\n401002,Second,40,-73",
            "stop_times.txt": [
              "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint",
              "trip-1,08:00:00,08:00:00,401001,1,0,0,1",
              "trip-1,08:10:00,08:10:00,401002,2,0,0,0",
            ].join("\n"),
            "calendar.txt":
              "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWKD,1,1,1,1,1,0,0,20260501,20260531",
            "calendar_dates.txt": "service_id,date,exception_type\n",
          };
          return files[entryName] ?? "";
        },
      });

      db.prepare(
        `
          INSERT INTO local_route_stop (
            route_id, month, stop_id, route_short_name, stop_name, in_effect,
            direction_id, direction, timepoint, latitude, longitude
          )
          VALUES ('M15', '2026-05', '401002', 'M15', 'Second', 1, '0', 'N', 0, 40.0, -73.0)
        `,
      ).run();

      for (const [index, headway] of [8, 9, 10].entries()) {
        const observedTimestamp = Math.floor(Date.parse(`2026-05-05T08:1${index}:00Z`) / 1000);
        db.prepare(
          `
            INSERT INTO local_observed_headway_sample (
              run_id, sample_rank, route_id, direction_id, stop_id, previous_vehicle_key,
              vehicle_key, previous_observed_timestamp, observed_timestamp, headway_seconds,
              headway_minutes
            )
            VALUES ('run-gtfs', ?, 'M15', 0, '401002', 'prev', 'veh', ?, ?, ?, ?)
          `,
        ).run(
          index + 1,
          observedTimestamp - headway * 60,
          observedTimestamp,
          headway * 60,
          headway,
        );
      }

      const artifact = buildStopDirectionHourEwtFeatureArtifactFromDb({
        sqlite: db,
        month: "2026-05",
        routeId: "M15",
        runId: "run-gtfs",
        scheduleSource: "gtfs_static",
        gtfsRunId: "gtfs-test",
        timezone: "UTC",
        observedAggregation: "service_date_hour",
        generatedAt: "2026-05-31T00:00:00.000Z",
        dbPath: null,
        artifactPath: "data/artifacts/test.json",
        minHeadways: 3,
        minCoverageShare: 0.1,
      });

      expect(artifact.source).toMatchObject({
        scheduleSource: "gtfs_static",
        scheduleTable: "local_gtfs_static_stop_time",
        gtfsRunId: "gtfs-test",
      });
      expect(artifact.summary.scheduleTimepointCount).toBe(42);
      expect(artifact.features[0]).toMatchObject({
        routeId: "M15",
        direction: "N",
        stopId: "401002",
        scheduledBusesPerHour: 1,
      });
    } finally {
      db.close();
    }
  });
});
