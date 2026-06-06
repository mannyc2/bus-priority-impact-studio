import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildStopDirectionHourEwtFeatureArtifactFromDb } from "../src/local-db";

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

function insertObservedHeadways(input: {
  db: Database;
  runId: string;
  routeId: string;
  stopId: string;
  month: string;
  headways: readonly number[];
}) {
  for (const [index, headway] of input.headways.entries()) {
    const observedTimestamp = Math.floor(
      Date.parse(`${input.month}-05T08:${String(10 + index).padStart(2, "0")}:00Z`) / 1000,
    );
    input.db
      .prepare(
        `
          INSERT INTO local_observed_headway_sample (
            run_id, sample_rank, route_id, direction_id, stop_id, previous_vehicle_key,
            vehicle_key, previous_observed_timestamp, observed_timestamp, headway_seconds,
            headway_minutes
          )
          VALUES (?, ?, ?, 0, ?, 'prev', 'veh', ?, ?, ?, ?)
        `,
      )
      .run(
        input.runId,
        index + 1,
        input.routeId,
        input.stopId,
        observedTimestamp - headway * 60,
        observedTimestamp,
        headway * 60,
        headway,
      );
  }
}

describe("stop-direction-hour EWT feature local DB rows", () => {
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

      insertObservedHeadways({
        db,
        runId: "run-1",
        routeId: "M15",
        stopId: "401698",
        month: "2026-03",
        headways: [4, 5, 10, 18],
      });

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

  test("prefers GTFS static all-stop schedules when requested", () => {
    const db = createDb();
    try {
      db.exec(`
        CREATE TABLE local_gtfs_static_bundle (
          run_id text NOT NULL,
          source_id text NOT NULL,
          ingested_at text NOT NULL
        );
        CREATE TABLE local_gtfs_static_trip (
          run_id text NOT NULL,
          source_id text NOT NULL,
          route_id text NOT NULL,
          service_id text NOT NULL,
          trip_id text NOT NULL
        );
        CREATE TABLE local_gtfs_static_calendar (
          run_id text NOT NULL,
          source_id text NOT NULL,
          service_id text NOT NULL,
          monday integer,
          tuesday integer,
          wednesday integer,
          thursday integer,
          friday integer,
          saturday integer,
          sunday integer,
          start_date text NOT NULL,
          end_date text NOT NULL
        );
        CREATE TABLE local_gtfs_static_calendar_date (
          run_id text NOT NULL,
          source_id text NOT NULL,
          service_id text NOT NULL,
          service_date text NOT NULL,
          exception_type integer NOT NULL
        );
        CREATE TABLE local_gtfs_static_stop_time (
          run_id text NOT NULL,
          source_id text NOT NULL,
          service_id text NOT NULL,
          route_id text NOT NULL,
          direction_id text NOT NULL,
          stop_id text NOT NULL,
          arrival_time text NOT NULL
        );
        CREATE TABLE local_gtfs_static_stop (
          run_id text NOT NULL,
          source_id text NOT NULL,
          stop_id text NOT NULL,
          stop_name text NOT NULL
        );
      `);
      db.prepare(
        "INSERT INTO local_gtfs_static_bundle VALUES ('gtfs-test', 'bus', '2026-05-31')",
      ).run();
      db.prepare(
        "INSERT INTO local_gtfs_static_trip VALUES ('gtfs-test', 'bus', 'M15', 'WKD', 't1')",
      ).run();
      db.prepare(
        "INSERT INTO local_gtfs_static_calendar VALUES ('gtfs-test', 'bus', 'WKD', 1, 1, 1, 1, 1, 0, 0, '20260501', '20260531')",
      ).run();
      db.prepare(
        "INSERT INTO local_gtfs_static_calendar_date VALUES ('gtfs-test', 'bus', 'WKD', '20260505', 1)",
      ).run();
      db.prepare(
        "INSERT INTO local_gtfs_static_stop_time VALUES ('gtfs-test', 'bus', 'WKD', 'M15', '0', '401002', '08:10:00')",
      ).run();
      db.prepare(
        "INSERT INTO local_gtfs_static_stop VALUES ('gtfs-test', 'bus', '401002', 'Second')",
      ).run();

      db.prepare(
        `
          INSERT INTO local_route_stop (
            route_id, month, stop_id, route_short_name, stop_name, in_effect,
            direction_id, direction, timepoint, latitude, longitude
          )
          VALUES ('M15', '2026-05', '401002', 'M15', 'Second', 1, '0', 'N', 0, 40.0, -73.0)
        `,
      ).run();
      insertObservedHeadways({
        db,
        runId: "run-gtfs",
        routeId: "M15",
        stopId: "401002",
        month: "2026-05",
        headways: [8, 9, 10],
      });

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
      expect(artifact.summary.scheduleTimepointCount).toBe(21);
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
