import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildRouteSourceReconciliation } from "../src/local-db";

function createDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_catalog (
      route_id TEXT NOT NULL,
      route_short_name TEXT,
      route_long_name TEXT
    );
    CREATE TABLE local_route_schedule_stop (
      route_id TEXT NOT NULL,
      source_year INTEGER NOT NULL
    );
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_route_hourly_ridership (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_observed_headway_sample (
      route_id TEXT NOT NULL,
      run_id TEXT NOT NULL
    );
    CREATE TABLE local_route_observed_reliability_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      run_id TEXT NOT NULL,
      sample_count INTEGER NOT NULL
    );
    CREATE TABLE local_route_brief_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      public_visible INTEGER NOT NULL
    );
    CREATE TABLE local_route_schedule_ingest_status (
      route_id TEXT NOT NULL,
      source_year INTEGER NOT NULL,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL
    );
  `);
  sqlite.query("INSERT INTO local_route_catalog VALUES (?, ?, ?)").run("M1", "M1", "Main line");
  sqlite
    .query("INSERT INTO local_route_catalog VALUES (?, ?, ?)")
    .run("M2", "M2", "Replacement shuttle");
  sqlite.query("INSERT INTO local_route_catalog VALUES (?, ?, ?)").run("T1", "T1", "Future route");
  sqlite.query("INSERT INTO local_route_schedule_stop VALUES (?, ?)").run("M01", 2026);
  sqlite.query("INSERT INTO local_route_schedule_stop VALUES (?, ?)").run("Q099", 2026);
  sqlite.query("INSERT INTO local_route_segment_speed VALUES (?, ?)").run("M1", "2026-03");
  sqlite.query("INSERT INTO local_route_hourly_ridership VALUES (?, ?)").run("M1", "2026-03");
  sqlite.query("INSERT INTO local_observed_headway_sample VALUES (?, ?)").run("M01", "run-1");
  sqlite
    .query("INSERT INTO local_route_observed_reliability_summary VALUES (?, ?, ?, ?)")
    .run("M1", "2026-03", "run-1", 42);
  sqlite.query("INSERT INTO local_route_brief_summary VALUES (?, ?, ?)").run("M1", "2026-03", 1);
  sqlite
    .query("INSERT INTO local_route_schedule_ingest_status VALUES (?, ?, ?, ?)")
    .run("M2", 2026, "complete", 0);
  return sqlite;
}

describe("route source reconciliation local DB builder", () => {
  test("reconciles source-backed route universes and alias candidates", () => {
    const sqlite = createDb();
    try {
      const artifact = buildRouteSourceReconciliation({
        sqlite,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "run-1",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: "data/local.sqlite",
        artifactPath: "data/artifacts/reconciliation.json",
      });

      expect(artifact.universes.route_catalog).toEqual({
        routeCount: 3,
        sampleRoutes: ["M1", "M2", "T1"],
      });
      expect(artifact.routes).toEqual([
        {
          routeId: "M1",
          scheduleSource: true,
          speedSource: true,
          ridershipSource: true,
          observedHeadwaySource: true,
          observedReliabilityUsable: true,
          publicVisible: true,
          classification: "source_complete",
          eligibleProducts: [
            "local_route_schedule_timepoints_release",
            "local_route_month_coverage_release",
            "studio_route_peak_windows",
            "studio_route_slowest_windows",
            "studio_route_comparison_ranks",
            "ewt_route_month_score_vectors",
            "studio_route_artifact_index",
            "generated_route_briefs",
            "map_route_segment_geojsons",
          ],
        },
        {
          routeId: "M2",
          scheduleSource: false,
          speedSource: false,
          ridershipSource: false,
          observedHeadwaySource: false,
          observedReliabilityUsable: false,
          publicVisible: false,
          classification: "source_absent_or_current_only",
          eligibleProducts: [],
        },
        {
          routeId: "T1",
          scheduleSource: false,
          speedSource: false,
          ridershipSource: false,
          observedHeadwaySource: false,
          observedReliabilityUsable: false,
          publicVisible: false,
          classification: "source_absent_or_current_only",
          eligibleProducts: [],
        },
      ]);
      expect(artifact.aliasCandidates).toEqual([
        {
          source: "local_observed_headway_sample",
          rawRouteId: "M01",
          normalizedRouteId: "M1",
          mappedCatalogRouteId: "M1",
        },
        {
          source: "local_route_schedule_stop",
          rawRouteId: "M01",
          normalizedRouteId: "M1",
          mappedCatalogRouteId: "M1",
        },
        {
          source: "local_route_schedule_stop",
          rawRouteId: "Q099",
          normalizedRouteId: "Q99",
          mappedCatalogRouteId: null,
        },
      ]);
      expect(artifact.sourceAbsentRouteIds).toEqual(["M2", "T1"]);
      expect(artifact.needsLineageMappingRouteIds).toEqual(["Q099"]);
      expect(
        artifact.sourceYearRouteReconciliation.routeYears.map((row) => ({
          routeId: row.routeId,
          classification: row.classification,
          disposition: row.disposition,
        })),
      ).toEqual([
        {
          routeId: "M1",
          classification: "source_absent_or_lineage_deferred",
          disposition: "explicit_waiver",
        },
        {
          routeId: "M2",
          classification: "replacement_shuttle_source_absent",
          disposition: "explicit_waiver",
        },
        {
          routeId: "T1",
          classification: "future_or_special_route_source_absent",
          disposition: "explicit_waiver",
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
