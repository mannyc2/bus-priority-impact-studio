import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { analyticsCorpusProfilePath } from "../src/artifacts";
import { buildAnalyticsCorpusProfile } from "../src/evaluation";
import { loadAnalyticsCorpusProfileLocalDbRows } from "../src/local-db";

function createProfileDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_month_trend (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      speed_observation_count INTEGER NOT NULL,
      has_speed_trend INTEGER NOT NULL,
      has_ridership_trend INTEGER NOT NULL
    );
    CREATE TABLE local_route_hourly_ridership (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      hour_of_day INTEGER NOT NULL,
      ridership REAL NOT NULL
    );
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      bus_trip_count INTEGER NOT NULL
    );
    CREATE TABLE local_route_observed_reliability_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      sample_count INTEGER NOT NULL
    );
    CREATE TABLE local_observed_headway_sample (
      route_id TEXT NOT NULL,
      observed_timestamp INTEGER NOT NULL
    );
    CREATE TABLE local_bus_wait_assessment (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      scheduled_trips INTEGER NOT NULL
    );
    CREATE TABLE local_route_intervention_comparison (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_context_event (
      route_id TEXT,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE local_context_event_route_touch (
      route_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
  `);
  return sqlite;
}

describe("analytics corpus profile", () => {
  test("loads route/month observations and summarizes historical readiness", () => {
    const sqlite = createProfileDb();
    try {
      for (const month of [
        "2025-04",
        "2025-05",
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
        "2026-03",
      ]) {
        sqlite
          .query(
            "INSERT INTO local_route_month_trend (route_id, month, speed_observation_count, has_speed_trend, has_ridership_trend) VALUES (?, ?, ?, 1, 1)",
          )
          .run("M15", month, 100);
      }
      sqlite
        .query(
          "INSERT INTO local_route_observed_reliability_summary (route_id, month, sample_count) VALUES (?, ?, ?)",
        )
        .run("M15", "2026-03", 40);
      sqlite
        .query(
          "INSERT INTO local_observed_headway_sample (route_id, observed_timestamp) VALUES (?, ?)",
        )
        .run("M15", Math.floor(Date.parse("2026-03-01T12:00:00Z") / 1000));

      const observations = loadAnalyticsCorpusProfileLocalDbRows({ sqlite });
      expect(
        observations.some((observation) => observation.sourceId === "route_month_trends_speed"),
      ).toBe(true);
      expect(
        observations.some((observation) => observation.sourceId === "observed_headway_samples"),
      ).toBe(true);

      const artifactPath = analyticsCorpusProfilePath({
        artifactRoot: "/tmp/artifacts",
        releaseMonth: "2026-03",
      });
      const profile = buildAnalyticsCorpusProfile({
        releaseMonth: "2026-03",
        historyStartMonth: "2025-04",
        observations,
        minHistoricalMonths: 6,
        generatedAt: "2026-05-30T00:00:00.000Z",
        dbPath: ":memory:",
        artifactPath,
      });

      expect(artifactPath).toBe("/tmp/artifacts/analytics-corpus-profile/2026-03/profile.json");
      expect(profile.summary.historicalReadySourceCount).toBe(2);
      expect(profile.summary.releaseOnlySourceCount).toBeGreaterThanOrEqual(1);
      expect(profile.doctrine.historicalCorpusUse).toContain("baselines");
    } finally {
      sqlite.close();
    }
  });
});
