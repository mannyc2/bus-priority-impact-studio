import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type D1SeedOutputResult, estimateD1ExportCost } from "../../../src/commands/export/d1.ts";
import {
  collectD1TableCounts,
  loadD1Database,
  verifyD1TableCounts,
} from "../../../src/commands/verify/d1-loaded.ts";

const commandPath = join(import.meta.dir, "../../../src/commands/verify/d1.ts");

const schemaSql = `
  CREATE TABLE route_catalog (route_id TEXT PRIMARY KEY);
  CREATE TABLE route_catalog_type (route_id TEXT, route_type TEXT);
  CREATE TABLE route_direction (route_id TEXT, direction_id INTEGER);
  CREATE TABLE route_month_coverage (route_id TEXT, month TEXT);
  CREATE TABLE route_readiness (route_id TEXT, month TEXT);
  CREATE TABLE route_readiness_missing_input (route_id TEXT, month TEXT, input TEXT);
  CREATE TABLE route_build_plan (route_id TEXT, month TEXT);
  CREATE TABLE route_reliability_baseline (route_id TEXT, month TEXT);
  CREATE TABLE route_reliability_gap_window (route_id TEXT, month TEXT);
  CREATE TABLE route_observed_reliability_summary (route_id TEXT, month TEXT);
  CREATE TABLE intervention_event (event_id TEXT PRIMARY KEY);
  CREATE TABLE route_intervention_comparison (route_id TEXT, month TEXT);
  CREATE TABLE route_artifact (route_id TEXT, month TEXT);
  CREATE TABLE corridor (corridor_id TEXT PRIMARY KEY);
  CREATE TABLE corridor_artifact (corridor_id TEXT, month TEXT);
  CREATE TABLE corridor_route_member (corridor_id TEXT, route_id TEXT);
  CREATE TABLE corridor_month_summary (corridor_id TEXT, month TEXT);
  CREATE TABLE corridor_intervention_context (corridor_id TEXT, month TEXT);
  CREATE TABLE corridor_hotspot (corridor_id TEXT, month TEXT);
  CREATE TABLE route_month_source_status (route_id TEXT, month TEXT, source_id TEXT);
  CREATE TABLE route_month_trend (route_id TEXT);
  CREATE TABLE route_timeline_index (route_id TEXT, month TEXT);
  CREATE TABLE route_speed_history_coverage (route_id TEXT, month TEXT);
  CREATE TABLE source_month_coverage (source_id TEXT, month TEXT);
  CREATE TABLE route_equity_context (route_id TEXT, month TEXT);
  CREATE TABLE route_scorecard (route_id TEXT, month TEXT);
  CREATE TABLE route_scorecard_citation (route_id TEXT, month TEXT, claim TEXT);
  CREATE TABLE route_brief_summary (route_id TEXT, month TEXT, public_visible INTEGER);
  CREATE TABLE route_brief_peak_window (route_id TEXT, month TEXT);
  CREATE TABLE route_brief_slowest_window (route_id TEXT, month TEXT);
  CREATE TABLE route_comparison_rank (route_id TEXT, month TEXT);
  CREATE TABLE route_batch_status (month TEXT PRIMARY KEY, status TEXT);
  CREATE TABLE route_batch_built_route (month TEXT, route_id TEXT);
  CREATE TABLE route_batch_issue (month TEXT, route_id TEXT, issue TEXT);
`;

const seedSql = `
  INSERT INTO route_catalog (route_id) VALUES ('B1');
  INSERT INTO route_brief_summary (route_id, month, public_visible) VALUES ('B1', '2026-03', 1);
  INSERT INTO route_scorecard (route_id, month) VALUES ('B1', '2026-03');
`;

function emptyExportResult(): D1SeedOutputResult {
  return {
    schemaVersion: 1,
    isoMonth: "2026-03",
    analysisPeriod: "2026-03",
    generatedAt: "2026-05-29T00:00:00.000Z",
    summaryPath: "/tmp/summary.json",
    schemaPath: "/tmp/schema.sql",
    seedPath: "/tmp/seed.sql",
    schemaFile: { path: "/tmp/schema.sql", byteLength: 0, sha256: "x" },
    seedFile: { path: "/tmp/seed.sql", byteLength: 0, sha256: "x" },
    costEstimate: estimateD1ExportCost({
      schemaPath: "/tmp/schema.sql",
      schemaSql,
      seedPath: "/tmp/seed.sql",
      seedSql,
    }),
    routeCount: 1,
    comparisonRowCount: 0,
    routeCatalogRowCount: 1,
    routeCatalogTypeRowCount: 0,
    routeDirectionRowCount: 0,
    routeCoverageRowCount: 0,
    routeReadinessRowCount: 0,
    routeReadinessMissingInputRowCount: 0,
    routeBuildPlanRowCount: 0,
    routeReliabilityBaselineRowCount: 0,
    routeReliabilityGapWindowRowCount: 0,
    routeObservedReliabilitySummaryRowCount: 0,
    interventionEventRowCount: 0,
    routeInterventionComparisonRowCount: 0,
    routeArtifactRowCount: 0,
    corridorRowCount: 0,
    corridorArtifactRowCount: 0,
    corridorRouteMemberRowCount: 0,
    corridorMonthSummaryRowCount: 0,
    corridorInterventionContextRowCount: 0,
    corridorHotspotRowCount: 0,
    routeMonthSourceStatusRowCount: 0,
    routeMonthTrendRowCount: 0,
    routeTimelineIndexRowCount: 0,
    routeSpeedHistoryCoverageRowCount: 0,
    sourceMonthCoverageRowCount: 0,
    routeEquityContextRowCount: 0,
    routeBatchStatusRowCount: 0,
    routeBatchBuiltRouteRowCount: 0,
    routeBatchIssueRowCount: 0,
    routeBriefPeakWindowRowCount: 0,
    routeBriefSlowestWindowRowCount: 0,
    routeScorecardCitationRowCount: 0,
    detectorReadinessManifestAvailable: false,
  };
}

describe("verify d1 helpers", () => {
  it("opens the local SQLite database read-only", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain("withLocalDb({ readonly: true })");
  });

  it("collectD1TableCounts counts loaded rows including public_visible briefs", () => {
    const { database } = loadD1Database(schemaSql, seedSql);
    const routeCatalogTable = "route_catalog";
    const routeBriefSummaryTable = "route_brief_summary";
    const routeScorecardTable = "route_scorecard";
    const routeArtifactTable = "route_artifact";
    try {
      const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
      expect(tableCounts[routeCatalogTable]).toBe(1);
      expect(tableCounts[routeBriefSummaryTable]).toBe(1);
      expect(tableCounts[routeScorecardTable]).toBe(1);
      expect(tableCounts[routeArtifactTable]).toBe(0);
      expect(publicTableCounts[routeBriefSummaryTable]).toBe(1);
    } finally {
      database.close();
    }
  });

  it("verifyD1TableCounts records mismatches and stays silent on matches", () => {
    const { database } = loadD1Database(schemaSql, seedSql);
    try {
      const { tableCounts } = collectD1TableCounts(database);
      const issues: string[] = [];
      verifyD1TableCounts({ issues, tableCounts, exportResult: emptyExportResult() });
      expect(issues).toEqual([]);

      const wrongResult = emptyExportResult();
      wrongResult.routeCatalogRowCount = 99;
      const issues2: string[] = [];
      verifyD1TableCounts({
        issues: issues2,
        tableCounts,
        exportResult: wrongResult,
      });
      expect(issues2).toEqual(["route_catalog:expected_99:actual_1"]);
    } finally {
      database.close();
    }
  });
});
