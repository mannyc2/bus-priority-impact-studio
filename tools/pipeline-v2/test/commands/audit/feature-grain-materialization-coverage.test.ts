import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFeatureContracts } from "@bp/analytics/features";
import featureGrainMaterializationCoverageCommand from "../../../src/commands/audit/feature-grain-materialization-coverage.ts";

const runCommand = featureGrainMaterializationCoverageCommand.run;
if (runCommand === undefined) {
  throw new Error("feature-grain materialization coverage command has no run handler");
}

type ArtifactRow = {
  readonly featureGrain: string;
  readonly scopesMaterialized: number;
  readonly fleetUniverse: number | null;
  readonly coverageShare: number | null;
  readonly status: "complete" | "partial" | "sparse" | "missing";
  readonly note: string | null;
};

type Artifact = {
  readonly artifactKind: string;
  readonly schemaVersion: number;
  readonly releaseMonth: string;
  readonly rows: readonly ArtifactRow[];
};

type CommandResult = {
  readonly outputPath: string;
  readonly grainCount: number;
  readonly fleetUniverseKnownCount: number;
};

function seedFixtureDb(dbPath: string): void {
  const sqlite = new Database(dbPath);
  try {
    sqlite.exec(`
      CREATE TABLE local_route_catalog (route_id TEXT);
      INSERT INTO local_route_catalog VALUES ('M1'), ('M2'), ('M3');

      CREATE TABLE local_route_month_coverage (route_id TEXT, month TEXT);
      INSERT INTO local_route_month_coverage VALUES
        ('M1', '2026-03'),
        ('M2', '2026-03'),
        ('M3', '2026-03');

      CREATE TABLE local_route_month_trend (route_id TEXT, month TEXT);
      INSERT INTO local_route_month_trend VALUES
        ('M1', '2026-03'),
        ('M2', '2026-03'),
        ('M3', '2026-03');

      CREATE TABLE local_route_observed_reliability_summary (
        route_id TEXT,
        month TEXT,
        run_id TEXT
      );
      INSERT INTO local_route_observed_reliability_summary VALUES
        ('M1', '2026-03', 'test-run'),
        ('M2', '2026-03', 'other-run');

      CREATE TABLE local_route_segment_speed (
        route_id TEXT,
        month TEXT,
        direction TEXT,
        timepoint_stop_id TEXT,
        next_timepoint_stop_id TEXT,
        hour_of_day INTEGER
      );
      INSERT INTO local_route_segment_speed VALUES
        ('M1', '2026-03', 'N', 'S1', 'S2', 8),
        ('M1', '2026-03', 'N', 'S1', 'S2', 11);

      CREATE TABLE local_observed_headway_sample (
        run_id TEXT,
        route_id TEXT,
        direction_id INTEGER,
        stop_id TEXT,
        observed_timestamp INTEGER
      );
      INSERT INTO local_observed_headway_sample VALUES
        ('test-run', 'M1', 0, 'S1', 0),
        ('test-run', 'M1', 0, 'S1', 3600),
        ('other-run', 'M2', 0, 'S1', 0);

      CREATE TABLE local_route_hourly_ridership (route_id TEXT, month TEXT);
      INSERT INTO local_route_hourly_ridership VALUES ('M1', '2026-03');

      CREATE TABLE local_route_intervention_comparison (
        route_id TEXT,
        month TEXT,
        event_id TEXT
      );
      INSERT INTO local_route_intervention_comparison VALUES ('M1', '2026-03', 'event-1');

      CREATE TABLE local_context_event_route_touch (
        route_id TEXT,
        source_id TEXT,
        event_kind TEXT,
        occurred_at TEXT
      );
      INSERT INTO local_context_event_route_touch VALUES
        ('M1', 'nyc_311_service_request', 'curb_friction', '2026-03-03T00:00:00.000Z');

      CREATE TABLE local_route_month_source_status (
        route_id TEXT,
        month TEXT,
        source_scope TEXT,
        source_id TEXT
      );
      INSERT INTO local_route_month_source_status VALUES
        ('M1', '2026-03', 'route', 'local_route_segment_speed');

      CREATE TABLE local_bus_customer_journey_metric (
        month TEXT,
        route_id TEXT,
        trip_type TEXT,
        period TEXT
      );
      INSERT INTO local_bus_customer_journey_metric VALUES
        ('2026-03', 'M1', 'weekday', 'am_peak');

      CREATE TABLE local_finding_coverage_audit (
        detector_id TEXT,
        month TEXT,
        scope_kind TEXT,
        scope_id TEXT
      );
      INSERT INTO local_finding_coverage_audit VALUES
        ('persistent_speed', '2026-03', 'route', 'M1');
    `);
  } finally {
    sqlite.close();
  }
}

describe("audit feature-grain-materialization-coverage", () => {
  test("writes feature-grain coverage from local DB support counts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "feature-grain-coverage-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const outputPath = join(tmp, "feature-grain-materialization-coverage.json");

    try {
      seedFixtureDb(dbPath);

      const result = (await runCommand({
        ctx: {},
        input: {
          options: {
            db: dbPath,
            year: 2026,
            month: 3,
            runId: "test-run",
            output: outputPath,
          },
        },
      } as never)) as CommandResult;

      expect(result.outputPath).toBe(outputPath);
      expect(result.grainCount).toBe(listFeatureContracts().length);
      expect(result.fleetUniverseKnownCount).toBeGreaterThanOrEqual(4);

      const artifact = (await Bun.file(outputPath).json()) as Artifact;
      expect(artifact).toMatchObject({
        artifactKind: "feature_grain_materialization_coverage",
        schemaVersion: 1,
        releaseMonth: "2026-03",
      });

      const byGrain = new Map<string, ArtifactRow>(
        artifact.rows.map((row) => [row.featureGrain, row]),
      );
      expect(byGrain.get("route_month")).toMatchObject({
        scopesMaterialized: 3,
        fleetUniverse: 3,
        coverageShare: 1,
        status: "complete",
      });
      expect(byGrain.get("route_reliability_month")).toMatchObject({
        scopesMaterialized: 1,
        fleetUniverse: 3,
        status: "sparse",
      });
      expect(byGrain.get("route_segment_month")).toMatchObject({
        scopesMaterialized: 1,
        fleetUniverse: null,
        status: "partial",
      });
      expect(byGrain.get("segment_daypart")).toMatchObject({
        scopesMaterialized: 2,
        fleetUniverse: null,
        status: "partial",
      });
      expect(byGrain.get("stop_direction_hour")).toMatchObject({
        scopesMaterialized: 2,
        fleetUniverse: null,
        status: "partial",
      });
      expect(byGrain.get("route_direction_daypart")).toMatchObject({
        scopesMaterialized: 0,
        fleetUniverse: null,
        status: "missing",
      });
      expect(byGrain.get("route_direction_daypart")?.note).toContain("No DB count spec");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
