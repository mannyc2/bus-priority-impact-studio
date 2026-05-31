import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildAnalyticsMaterializationCoverageAudit } from "../../../src/commands/audit/analytics-materialization-coverage.ts";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("audit analytics-materialization-coverage", () => {
  test("separates source eligibility from per-route derived artifact coverage", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "bp-materialization-coverage-"));
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id text primary key);
        INSERT INTO local_route_catalog (route_id) VALUES ('M15'), ('B1'), ('Q1');

        CREATE TABLE local_gtfs_static_bundle (run_id text, ingested_at text);
        INSERT INTO local_gtfs_static_bundle VALUES ('gtfs-test', '2026-05-31T00:00:00.000Z');
        CREATE TABLE local_gtfs_static_route (run_id text, route_id text);
        INSERT INTO local_gtfs_static_route VALUES ('gtfs-test', 'M15'), ('gtfs-test', 'B1');

        CREATE TABLE local_observed_headway_sample (run_id text, route_id text);
        INSERT INTO local_observed_headway_sample VALUES
          ('bus-observatory-2026-05', 'M15'),
          ('bus-observatory-2026-05', 'B1');

        CREATE TABLE local_route_brief_summary (route_id text, month text);
        INSERT INTO local_route_brief_summary VALUES ('M15', '2026-05'), ('B1', '2026-05');
        CREATE TABLE local_route_scorecard (route_id text, month text);
        INSERT INTO local_route_scorecard VALUES ('M15', '2026-05'), ('B1', '2026-05'), ('Q1', '2026-05');
        CREATE TABLE local_route_segment_speed (route_id text, month text);
        INSERT INTO local_route_segment_speed VALUES ('M15', '2026-05');
        CREATE TABLE local_route_hourly_ridership (route_id text, month text);
        INSERT INTO local_route_hourly_ridership VALUES ('M15', '2026-05'), ('B1', '2026-05'), ('Q1', '2026-05');
        CREATE TABLE local_route_observed_reliability_summary (route_id text, month text, run_id text);
        INSERT INTO local_route_observed_reliability_summary VALUES ('M15', '2026-05', 'bus-observatory-2026-05');
      `);

      await writeJson(
        join(
          artifactRoot,
          "analytics-stop-direction-hour-ewt",
          "2026-05",
          "bus-observatory-2026-05",
          "m15",
          "stop-direction-hour-ewt-features.json",
        ),
        { routeId: "M15" },
      );
      for (const routeId of ["m15", "b1", "q1"]) {
        await writeJson(
          join(artifactRoot, "route-slices", `${routeId}-2026-05`, "route-brief-input.json"),
          { routeId },
        );
      }
      await writeJson(join(artifactRoot, "briefs", "routes", "m15", "2026-05", "brief.json"), {
        routeId: "M15",
      });
      await writeJson(
        join(
          artifactRoot,
          "analytics-ewt-score-vectors",
          "2023-04_to_2026-05",
          "2026-05",
          "ewt-route-month-score-vectors.json",
        ),
        {
          scoreVectors: {
            releaseMonth: [{ routeId: "M15" }, { routeId: "B1" }],
          },
        },
      );

      const audit = await buildAnalyticsMaterializationCoverageAudit({
        sqlite,
        month: "2026-05",
        runId: "bus-observatory-2026-05",
        gtfsRunId: "gtfs-test",
        artifactRoot,
        generatedAt: "2026-05-31T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "coverage.json"),
        historyStartMonth: "2023-04",
      });

      expect(audit.routeUniverse).toEqual({
        routeCatalogCount: 3,
        gtfsStaticRouteCount: 2,
        observedHeadwayRouteCount: 2,
        ewtEligibleRouteCount: 2,
      });

      const bySurface = new Map(audit.surfaces.map((surface) => [surface.surfaceId, surface]));
      expect(bySurface.get("stop_direction_hour_ewt_features")).toMatchObject({
        expectedRouteCount: 2,
        materializedRouteCount: 1,
        missingRouteCount: 1,
        status: "partial",
        sampleMissingRoutes: ["B1"],
      });
      expect(bySurface.get("route_brief_input_slices")).toMatchObject({
        expectedRouteCount: 3,
        materializedRouteCount: 3,
        status: "complete",
      });
      expect(bySurface.get("route_briefs")).toMatchObject({
        expectedRouteCount: 3,
        materializedRouteCount: 1,
        status: "partial",
      });
      expect(bySurface.get("local_route_segment_speed")).toMatchObject({
        expectedRouteCount: 3,
        materializedRouteCount: 1,
        status: "partial",
      });
      expect(bySurface.get("local_route_observed_reliability_summary")).toMatchObject({
        expectedRouteCount: 2,
        materializedRouteCount: 1,
        status: "partial",
      });
    } finally {
      sqlite.close();
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
