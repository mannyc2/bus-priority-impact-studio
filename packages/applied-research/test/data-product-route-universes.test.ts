import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildDataProductRouteUniverses,
  dataProductRouteUniverseSummary,
  latestDataProductGtfsRunId,
} from "../src/local-db";

describe("data product route universes local DB builder", () => {
  test("builds route universes from local tables with catalog normalization and fallback visibility", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
      CREATE TABLE local_route_schedule_stop (route_id TEXT NOT NULL, source_year INTEGER NOT NULL);
      CREATE TABLE local_route_segment_speed (route_id TEXT NOT NULL, month TEXT NOT NULL);
      CREATE TABLE local_route_hourly_ridership (route_id TEXT NOT NULL, month TEXT NOT NULL);
      CREATE TABLE local_observed_headway_sample (route_id TEXT NOT NULL, run_id TEXT NOT NULL);
      CREATE TABLE local_route_observed_reliability_summary (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        run_id TEXT NOT NULL,
        sample_count INTEGER NOT NULL
      );
      CREATE TABLE local_gtfs_static_bundle (
        run_id TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );
      CREATE TABLE local_gtfs_static_route (route_id TEXT NOT NULL, run_id TEXT NOT NULL);

      INSERT INTO local_route_catalog VALUES ('M1'), ('M15'), ('Q1');
      INSERT INTO local_route_schedule_stop VALUES ('M001', 2026), ('Q1', 2026), ('B99', 2026);
      INSERT INTO local_route_segment_speed VALUES ('M1', '2026-03'), ('M15', '2026-03'), ('B99', '2026-03');
      INSERT INTO local_route_segment_speed VALUES ('Q1', '2026-02');
      INSERT INTO local_route_hourly_ridership VALUES ('M001', '2026-03'), ('Q1', '2026-03');
      INSERT INTO local_observed_headway_sample VALUES ('M1', 'run-1'), ('M15', 'other-run');
      INSERT INTO local_route_observed_reliability_summary VALUES ('M1', '2026-03', 'run-1', 30);
      INSERT INTO local_route_observed_reliability_summary VALUES ('M15', '2026-03', 'run-1', 29);
      INSERT INTO local_gtfs_static_bundle VALUES ('gtfs-old', '2026-01-01T00:00:00Z');
      INSERT INTO local_gtfs_static_bundle VALUES ('gtfs-new', '2026-03-01T00:00:00Z');
      INSERT INTO local_gtfs_static_route VALUES ('M1', 'gtfs-new'), ('Q1', 'gtfs-new');
    `);

    const gtfsRunId = latestDataProductGtfsRunId(sqlite);
    const universes = buildDataProductRouteUniverses({
      sqlite,
      releaseMonth: "2026-03",
      runId: "run-1",
      gtfsRunId,
    });
    const summary = dataProductRouteUniverseSummary(universes);

    expect(gtfsRunId).toBe("gtfs-new");
    expect([...universes.schedule_source_routes].sort()).toEqual(["M1", "Q1"]);
    expect([...universes.speed_source_routes].sort()).toEqual(["M1", "M15"]);
    expect([...universes.historical_speed_source_routes].sort()).toEqual([
      "B99",
      "M1",
      "M15",
      "Q1",
    ]);
    expect([...universes.speed_ridership_source_routes].sort()).toEqual(["M1"]);
    expect([...universes.observed_reliability_routes].sort()).toEqual(["M1"]);
    expect([...universes.ewt_eligible_routes].sort()).toEqual(["M1"]);
    expect([...universes.public_visible_routes].sort()).toEqual(["M1"]);
    expect(summary.route_catalog).toEqual({
      routeCount: 3,
      sampleRoutes: ["M1", "M15", "Q1"],
    });
  });

  test("uses explicit public-visible rows when the brief summary table is present", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
      CREATE TABLE local_route_segment_speed (route_id TEXT NOT NULL, month TEXT NOT NULL);
      CREATE TABLE local_route_hourly_ridership (route_id TEXT NOT NULL, month TEXT NOT NULL);
      CREATE TABLE local_route_brief_summary (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        public_visible INTEGER NOT NULL
      );

      INSERT INTO local_route_catalog VALUES ('M1'), ('M15');
      INSERT INTO local_route_segment_speed VALUES ('M1', '2026-03'), ('M15', '2026-03');
      INSERT INTO local_route_hourly_ridership VALUES ('M1', '2026-03'), ('M15', '2026-03');
      INSERT INTO local_route_brief_summary VALUES ('M15', '2026-03', 1), ('M1', '2026-03', 0);
    `);

    const universes = buildDataProductRouteUniverses({
      sqlite,
      releaseMonth: "2026-03",
      runId: "run-1",
      gtfsRunId: null,
    });

    expect([...universes.public_visible_routes]).toEqual(["M15"]);
  });
});
