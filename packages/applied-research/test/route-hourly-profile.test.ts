import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { routeHourlyProfileArtifactPath } from "../src/artifacts";
import { buildRouteHourlyProfileArtifact } from "../src/feature-history";
import { loadRouteHourlyProfileLocalDbRows } from "../src/local-db";

describe("route hourly profile feature history", () => {
  test("builds compact route-month hourly profile artifacts", () => {
    const artifact = buildRouteHourlyProfileArtifact({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          hourly_row_count: 2,
          total_ridership: 150,
          total_transfers: 15,
          peak_day_of_week: "weekday",
          peak_hour_of_day: 8,
          peak_ridership: 100,
        },
        {
          route_id: "B1",
          month: "2026-03",
          hourly_row_count: 1,
          total_ridership: 40,
          total_transfers: 4,
          peak_day_of_week: null,
          peak_hour_of_day: null,
          peak_ridership: null,
        },
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/route-hourly-profile.json",
    });

    expect(artifact.summary).toEqual({
      profileCount: 2,
      routeCount: 2,
      grain: "route_month_compact_hourly_profile",
      sourceGrain: "route_month_day_of_week_hour",
    });
    expect(artifact.window.monthCount).toBe(1);
    expect(artifact.profiles[0]).toMatchObject({
      routeId: "M15",
      totalRidership: 150,
      peakWindow: { dayOfWeek: "weekday", hourOfDay: 8, ridership: 100 },
    });
    expect(artifact.profiles[1]?.peakWindow).toBeNull();
  });

  test("loads route-month profile rows from local SQLite with deterministic peak selection", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_hourly_ridership (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL,
          day_of_week TEXT NOT NULL,
          hour_of_day INTEGER NOT NULL,
          ridership REAL NOT NULL,
          transfers REAL NOT NULL
        );
        INSERT INTO local_route_hourly_ridership VALUES
          ('M15', '2026-03', 'weekday', 8, 100, 10),
          ('M15', '2026-03', 'weekday', 9, 100, 11),
          ('M15', '2026-03', 'saturday', 12, 50, 5),
          ('B1', '2026-02', 'weekday', 7, 40, 4),
          ('Q44', '2025-12', 'weekday', 7, 99, 9);
      `);

      const rows = loadRouteHourlyProfileLocalDbRows({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-03",
      });

      expect(rows.map((row) => [row.month, row.route_id])).toEqual([
        ["2026-02", "B1"],
        ["2026-03", "M15"],
      ]);
      expect(rows.find((row) => row.route_id === "M15")).toMatchObject({
        hourly_row_count: 3,
        total_ridership: 250,
        total_transfers: 26,
        peak_day_of_week: "weekday",
        peak_hour_of_day: 9,
        peak_ridership: 100,
      });
    } finally {
      sqlite.close();
    }
  });

  test("owns the route hourly profile artifact path", () => {
    expect(
      routeHourlyProfileArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
      }),
    ).toBe("data/artifacts/analytics-feature-history/2023-04_to_2026-03/route-hourly-profile.json");
  });
});
