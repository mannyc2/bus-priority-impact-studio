import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DataProduct, DataProductCheck } from "../src/data-products";
import {
  type DataProductRouteUniverseSets,
  evaluateDataProductArtifactGlobCheck,
  evaluateDataProductJsonOrFileArtifactCheck,
  evaluateDataProductMonthTableCoverageCheck,
  evaluateDataProductRouteArtifactCoverageCheck,
  evaluateDataProductScoreVectorRoutesCheck,
  evaluateDataProductSourceYearRouteCoverageCheck,
  evaluateDataProductTableRouteCoverageCheck,
  evaluateDataProductTableRowCountCheck,
} from "../src/local-db";

function routeUniverses(routes: readonly string[]): DataProductRouteUniverseSets {
  const routeSet = new Set(routes);
  return {
    route_catalog: routeSet,
    coverage_source_routes: routeSet,
    schedule_source_routes: routeSet,
    speed_source_routes: routeSet,
    historical_speed_source_routes: routeSet,
    ridership_source_routes: routeSet,
    speed_ridership_source_routes: routeSet,
    observed_headway_routes: new Set(),
    observed_reliability_routes: new Set(),
    ewt_eligible_routes: new Set(),
    public_visible_routes: routeSet,
  };
}

function artifactProduct(check: DataProductCheck): DataProduct {
  return {
    id: "artifact_product",
    label: "Artifact product",
    kind: "artifact_family",
    owner: "test",
    grain: "release",
    producerCommand: "test",
    expectedUniverse: { description: "test artifact" },
    requiredInputs: [],
    downstreamConsumers: [],
    freshnessPolicy: { cadence: "run_scoped" },
    lifecycle: { status: "expected" },
    checks: [check],
  };
}

describe("data product local DB check evaluators", () => {
  test("evaluates month table coverage with missing and thin months", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL
      );
      INSERT INTO local_route_segment_speed VALUES ('M1', '2026-01');
      INSERT INTO local_route_segment_speed VALUES ('M2', '2026-01');
      INSERT INTO local_route_segment_speed VALUES ('M1', '2026-02');
    `);
    const check: Extract<DataProductCheck, { type: "month_table_coverage" }> = {
      id: "speed_months",
      label: "Speed months",
      type: "month_table_coverage",
      tableName: "local_route_segment_speed",
      monthColumn: "month",
      routeColumn: "route_id",
      expectedMonths: "history_window",
      minRowsPerMonth: 2,
      minRoutesPerMonth: 2,
    };

    const audit = evaluateDataProductMonthTableCoverageCheck({
      sqlite,
      check,
      months: ["2026-01", "2026-02", "2026-03"],
    });

    expect(audit.status).toBe("partial");
    expect(audit.expectedCount).toBe(3);
    expect(audit.observedCount).toBe(2);
    expect(audit.sampleMissing).toEqual(["2026-03"]);
    expect(audit.samplePartial).toEqual(["2026-02:below_min_row_count+below_min_route_count"]);
    expect(audit.reasons).toEqual(["missing_months:1", "thin_months:1"]);
  });

  test("evaluates route table coverage against an expected route universe", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_brief_summary (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        run_id TEXT NOT NULL
      );
      INSERT INTO local_route_brief_summary VALUES ('M1', '2026-03', 'run-1');
      INSERT INTO local_route_brief_summary VALUES ('M2', '2026-03', 'other-run');
    `);
    const check: Extract<DataProductCheck, { type: "table_route_coverage" }> = {
      id: "brief_routes",
      label: "Brief routes",
      type: "table_route_coverage",
      tableName: "local_route_brief_summary",
      routeColumn: "route_id",
      monthColumn: "month",
      runColumn: "run_id",
      expectedRoutes: "public_visible_routes",
    };

    const audit = evaluateDataProductTableRouteCoverageCheck({
      sqlite,
      check,
      routeUniverses: routeUniverses(["M1", "M2"]),
      releaseMonth: "2026-03",
      runId: "run-1",
    });

    expect(audit.status).toBe("partial");
    expect(audit.observedCount).toBe(1);
    expect(audit.sampleObserved).toEqual(["M1"]);
    expect(audit.sampleMissing).toEqual(["M2"]);
    expect(audit.reasons).toEqual(["missing_routes:1"]);
  });

  test("evaluates table row counts and missing tables", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
      INSERT INTO local_route_catalog VALUES ('M1');
    `);
    const rowCountCheck: Extract<DataProductCheck, { type: "table_row_count" }> = {
      id: "catalog_rows",
      label: "Catalog rows",
      type: "table_row_count",
      tableName: "local_route_catalog",
      minRows: 2,
    };
    const missingCheck: Extract<DataProductCheck, { type: "table_row_count" }> = {
      ...rowCountCheck,
      tableName: "missing_table",
    };

    const partial = evaluateDataProductTableRowCountCheck({ sqlite, check: rowCountCheck });
    const missing = evaluateDataProductTableRowCountCheck({ sqlite, check: missingCheck });

    expect(partial.status).toBe("partial");
    expect(partial.samplePartial).toEqual(["rows:1"]);
    expect(partial.reasons).toEqual(["below_min_rows:1/2"]);
    expect(missing.status).toBe("missing");
    expect(missing.reasons).toEqual(["table_missing"]);
  });

  test("evaluates source-year route coverage with waiver and status-only diagnostics", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE historical_schedule (
        source_year INTEGER NOT NULL,
        route_id TEXT NOT NULL
      );
      CREATE TABLE historical_schedule_status (
        source_year INTEGER NOT NULL,
        route_id TEXT NOT NULL,
        status TEXT NOT NULL,
        row_count INTEGER NOT NULL
      );
      INSERT INTO historical_schedule VALUES (2025, 'M1');
      INSERT INTO historical_schedule VALUES (2026, 'M1');
      INSERT INTO historical_schedule_status VALUES (2026, 'M2', 'complete', 0);
    `);
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-data-product-checks-"));
    writeFileSync(
      join(artifactRoot, "waivers.json"),
      JSON.stringify({
        sourceYearRouteReconciliation: {
          routeYears: [
            {
              sourceYear: 2025,
              routeId: "M2",
              disposition: "explicit_waiver",
              classification: "legacy_source_gap",
            },
          ],
        },
      }),
    );
    const check: Extract<DataProductCheck, { type: "source_year_route_coverage" }> = {
      id: "schedule_source_year_routes",
      label: "Schedule source-year routes",
      type: "source_year_route_coverage",
      tableName: "historical_schedule",
      sourceYearColumn: "source_year",
      routeColumn: "route_id",
      expectedRoutes: "public_visible_routes",
      expectedYears: "history_window_years",
      statusTableName: "historical_schedule_status",
      statusSourceYearColumn: "source_year",
      statusRouteColumn: "route_id",
      statusColumn: "status",
      statusRowCountColumn: "row_count",
      waiverArtifactPathTemplate: "{artifactRoot}/waivers.json",
    };

    const audit = await evaluateDataProductSourceYearRouteCoverageCheck({
      sqlite,
      check,
      routeUniverses: routeUniverses(["M1", "M2"]),
      months: ["2025-12", "2026-01"],
      templateValues: {
        repoRoot: "/repo",
        artifactRoot,
        releaseMonth: "2026-01",
        historyStartMonth: "2025-12",
        runId: "run-1",
        gtfsRunId: null,
      },
      displayPath: (path) => path.replace(artifactRoot, "artifact-root"),
    });

    expect(audit.status).toBe("partial");
    expect(audit.expectedCount).toBe(4);
    expect(audit.observedCount).toBe(3);
    expect(audit.sampleMissing).toEqual(["2026:M2"]);
    expect(audit.samplePartial).toEqual(["2025:M2:legacy_source_gap", "2026:M2:complete"]);
    expect(audit.reasons).toEqual([
      "missing_route_years:1",
      "waived_route_years:1",
      "status_without_rows:1",
      "complete_status_zero_rows:1",
    ]);
    expect(audit.path).toBe("artifact-root/waivers.json");
  });

  test("evaluates route artifact coverage using route-id filename variants", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-route-artifacts-"));
    writeFileSync(join(artifactRoot, "m1.json"), "{}");
    const check: Extract<DataProductCheck, { type: "route_artifact_coverage" }> = {
      id: "route_briefs",
      label: "Route briefs",
      type: "route_artifact_coverage",
      pathTemplate: "{artifactRoot}/{routeId}.json",
      expectedRoutes: "public_visible_routes",
    };

    const audit = await evaluateDataProductRouteArtifactCoverageCheck({
      check,
      routeUniverses: routeUniverses(["M1", "M2"]),
      templateValues: {
        repoRoot: "/repo",
        artifactRoot,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "run-1",
        gtfsRunId: null,
      },
      displayPath: (path) => path.replace(artifactRoot, "artifact-root"),
    });

    expect(audit.status).toBe("partial");
    expect(audit.sampleObserved).toEqual(["M1"]);
    expect(audit.sampleMissing).toEqual(["M2"]);
    expect(audit.path).toBe("artifact-root/{routeId}.json");
  });

  test("evaluates score-vector route coverage and semantic route diagnostics", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-score-vectors-"));
    writeFileSync(
      join(artifactRoot, "score-vectors.json"),
      JSON.stringify({
        releaseMonth: "2026-03",
        scoreVectors: {
          releaseMonth: [
            { routeId: "M1", month: "2026-03", runId: "run-1" },
            { routeId: "M1", month: "2026-03", runId: "run-2" },
            { routeId: "M2", month: "2026-02", runId: "run-1" },
          ],
        },
      }),
    );
    const check: Extract<DataProductCheck, { type: "score_vector_routes" }> = {
      id: "score_vector_routes",
      label: "Score-vector routes",
      type: "score_vector_routes",
      pathTemplate: "{artifactRoot}/score-vectors.json",
      expectedRoutes: "public_visible_routes",
    };

    const audit = await evaluateDataProductScoreVectorRoutesCheck({
      check,
      routeUniverses: routeUniverses(["M1", "M2", "M3"]),
      templateValues: {
        repoRoot: "/repo",
        artifactRoot,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "run-1",
        gtfsRunId: null,
      },
      displayPath: (path) => path.replace(artifactRoot, "artifact-root"),
    });

    expect(audit.status).toBe("partial");
    expect(audit.sampleObserved).toEqual(["M1", "M2"]);
    expect(audit.sampleMissing).toEqual(["M3"]);
    expect(audit.samplePartial).toEqual([
      "duplicate:M1",
      "wrong_month:M2:2026-02",
      "wrong_run:M1:run-2",
    ]);
    expect(audit.reasons).toEqual([
      "missing_routes:1",
      "duplicate_score_vector_routes:1",
      "wrong_release_month_rows:1",
      "wrong_run_id_rows:1",
    ]);
    expect(audit.path).toBe("artifact-root/score-vectors.json");
  });

  test("evaluates JSON artifact existence and semantic validation", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-json-artifact-"));
    writeFileSync(
      join(artifactRoot, "manifest.json"),
      JSON.stringify({
        releaseMonth: "2026-02",
        runId: "wrong-run",
        summary: { status: "warn" },
      }),
    );
    const check: Extract<DataProductCheck, { type: "json_artifact" }> = {
      id: "manifest_json",
      label: "Manifest JSON",
      type: "json_artifact",
      pathTemplate: "{artifactRoot}/manifest.json",
      validateReleaseMonth: true,
      validateRunId: true,
      requiredJsonValues: [{ path: "summary.status", equals: "pass" }],
    };

    const audit = await evaluateDataProductJsonOrFileArtifactCheck({
      product: artifactProduct(check),
      check,
      templateValues: {
        repoRoot: "/repo",
        artifactRoot,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "run-1",
        gtfsRunId: null,
      },
      generatedAt: "2026-03-15T00:00:00.000Z",
      displayPath: (path) => path.replace(artifactRoot, "artifact-root"),
    });

    expect(audit.status).toBe("partial");
    expect(audit.path).toBe("artifact-root/manifest.json");
    expect(audit.sampleObserved).toEqual(["artifact-root/manifest.json"]);
    expect(audit.reasons).toEqual([
      "release_month_mismatch:2026-02",
      "run_id_mismatch:wrong-run",
      "json_value_mismatch:summary.status",
    ]);
  });

  test("evaluates artifact glob minimum file coverage", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-artifact-glob-"));
    writeFileSync(join(artifactRoot, "one.json"), "{}");
    writeFileSync(join(artifactRoot, "two.json"), "{}");
    const check: Extract<DataProductCheck, { type: "artifact_glob" }> = {
      id: "artifact_glob",
      label: "Artifact glob",
      type: "artifact_glob",
      rootTemplate: "{artifactRoot}",
      pattern: "*.json",
      minFiles: 3,
    };

    const audit = await evaluateDataProductArtifactGlobCheck({
      check,
      templateValues: {
        repoRoot: "/repo",
        artifactRoot,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "run-1",
        gtfsRunId: null,
      },
      displayPath: (path) => path.replace(artifactRoot, "artifact-root"),
    });

    expect(audit.status).toBe("partial");
    expect(audit.observedCount).toBe(2);
    expect(audit.sampleObserved).toEqual(["artifact-root/one.json", "artifact-root/two.json"]);
    expect(audit.sampleMissing).toEqual(["artifact-root/*.json"]);
    expect(audit.reasons).toEqual(["below_min_files:2/3"]);
  });
});
