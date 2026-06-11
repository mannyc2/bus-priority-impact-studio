import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildSourceMonthCoverageMatrix } from "../src/local-db";

describe("source month coverage matrix local DB builder", () => {
  test("builds source and derived statuses over a history window", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_segment_speed (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
        CREATE TABLE local_route_hourly_ridership (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
        CREATE TABLE local_route_month_trend (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
        CREATE TABLE local_route_schedule_stop (
          source_year INTEGER NOT NULL,
          route_id TEXT NOT NULL
        );
      `);
      sqlite
        .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
        .run("M1", "2026-01");
      sqlite
        .query("INSERT INTO local_route_hourly_ridership (route_id, month) VALUES (?, ?)")
        .run("M1", "2026-01");
      sqlite
        .query("INSERT INTO local_route_month_trend (route_id, month) VALUES (?, ?)")
        .run("M1", "2026-01");
      sqlite
        .query("INSERT INTO local_route_schedule_stop (source_year, route_id) VALUES (?, ?)")
        .run(2026, "M1");

      const matrix = buildSourceMonthCoverageMatrix({
        sqlite,
        historyStartMonth: "2026-01",
        releaseMonth: "2026-02",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: "coverage-matrix.json",
      });

      expect(matrix.summary).toMatchObject({
        sourceCount: 6,
        cellCount: 12,
      });
      const speed = matrix.sources.find(
        (source) => source.sourceId === "local_route_segment_speed",
      );
      expect(speed?.months.map((month) => [month.month, month.status])).toEqual([
        ["2026-01", "available"],
        ["2026-02", "available_not_fetched"],
      ]);
      const routeTrend = matrix.sources.find(
        (source) => source.sourceId === "local_route_month_trend",
      );
      expect(routeTrend?.months.map((month) => [month.month, month.status])).toEqual([
        ["2026-01", "available"],
        ["2026-02", "derived_not_built"],
      ]);
      const sourceStatusRows = matrix.sources.find(
        (source) => source.sourceId === "local_route_month_source_status",
      );
      expect(sourceStatusRows?.months.map((month) => month.status)).toEqual([
        "source_absent",
        "source_absent",
      ]);
      const gtfs = matrix.sources.find(
        (source) => source.sourceId === "historical_gtfs_static_bundle_snapshots",
      );
      expect(gtfs?.months.map((month) => month.status)).toEqual([
        "upstream_blocked",
        "upstream_blocked",
      ]);
    } finally {
      sqlite.close();
    }
  });
});
