import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import { type D1SeedOutputResult, estimateD1ExportCost } from "../../../src/commands/export/d1.ts";
import { runVerifyD1Export } from "../../../src/commands/verify/d1.ts";
import {
  collectD1TableCounts,
  verifyD1TableCounts,
} from "../../../src/commands/verify/d1-loaded.ts";
import { runD1ReplayBoundary } from "../../../src/effect/d1-replay.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const commandPath = join(import.meta.dir, "../../../src/commands/verify/d1.ts");
const loadedHelperPath = join(import.meta.dir, "../../../src/commands/verify/d1-loaded.ts");
const publishedAt = "2026-07-19T12:34:56.789Z";

const schemaSql = `
  CREATE TABLE route_catalog (route_id TEXT PRIMARY KEY);
  CREATE TABLE route_catalog_type (route_id TEXT, route_type TEXT);
  CREATE TABLE route_catalog_trip_type (route_id TEXT, trip_type TEXT);
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
  INSERT INTO route_catalog_trip_type (route_id, trip_type) VALUES ('B1', '1');
  INSERT INTO route_brief_summary (route_id, month, public_visible) VALUES ('B1', '2026-03', 1);
  INSERT INTO route_scorecard (route_id, month) VALUES ('B1', '2026-03');
`;

function emptyExportResult(): D1SeedOutputResult {
  const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
    releaseId: releaseIdFromPublishedAt(publishedAt),
    publishedAt,
    coverage: { start: null, end: "2026-03" },
  });
  return {
    schemaVersion: 2,
    ...releaseIdentity,
    generatedAt: publishedAt,
    summaryPath: "/tmp/summary.json",
    schemaPath: "/tmp/schema.sql",
    seedPath: "/tmp/seed.sql",
    plan097RecoverySeedPath: "/tmp/seed.plan097-recovery.sql",
    schemaFile: { path: "/tmp/schema.sql", byteLength: 0, sha256: "x" },
    seedFile: { path: "/tmp/seed.sql", byteLength: 0, sha256: "x" },
    plan097RecoverySeedFile: {
      path: "/tmp/seed.plan097-recovery.sql",
      byteLength: 0,
      sha256: "x",
    },
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
    routeCatalogTripTypeRowCount: 1,
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
    routeCapabilityManifestRouteCount: 0,
    routeDossierSummaryRouteCount: 0,
    exactRouteIdentity: null,
  };
}

describe("verify d1 helpers", () => {
  it("opens the local SQLite database read-only through the Effect layer", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("runPipelineFileSystemBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("routeEvidenceIndexPath");
    expect(source).not.toContain("Bun.file");
    expect(source).not.toContain("Bun.write");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
  });

  it("keeps D1 replay database construction behind the Effect service", () => {
    const source = readFileSync(loadedHelperPath, "utf8");

    expect(source).toContain('import type { Database } from "bun:sqlite"');
    expect(source).not.toContain('import { Database } from "bun:sqlite"');
    expect(source).not.toContain("new Database");
    expect(source).not.toContain("createBunSqliteServingDb");
  });

  it("collectD1TableCounts counts loaded rows including public_visible briefs", async () => {
    const result = await runD1ReplayBoundary({
      command: "test.verify-d1",
      operation: "collectD1TableCounts",
      schemaSql,
      seedSql,
      run: ({ database }) => {
        const routeCatalogTable = "route_catalog";
        const routeCatalogTripTypeTable = "route_catalog_trip_type";
        const routeBriefSummaryTable = "route_brief_summary";
        const routeScorecardTable = "route_scorecard";
        const routeArtifactTable = "route_artifact";
        const { tableCounts, publicTableCounts } = collectD1TableCounts(database);
        return {
          routeCatalogCount: tableCounts[routeCatalogTable],
          routeCatalogTripTypeCount: tableCounts[routeCatalogTripTypeTable],
          routeBriefSummaryCount: tableCounts[routeBriefSummaryTable],
          routeScorecardCount: tableCounts[routeScorecardTable],
          routeArtifactCount: tableCounts[routeArtifactTable],
          publicBriefSummaryCount: publicTableCounts[routeBriefSummaryTable],
        };
      },
    });

    expect(result).toEqual({
      routeCatalogCount: 1,
      routeCatalogTripTypeCount: 1,
      routeBriefSummaryCount: 1,
      routeScorecardCount: 1,
      routeArtifactCount: 0,
      publicBriefSummaryCount: 1,
    });
  });

  it("verifyD1TableCounts records mismatches and stays silent on matches", async () => {
    const { issues, issues2 } = await runD1ReplayBoundary({
      command: "test.verify-d1",
      operation: "verifyD1TableCounts",
      schemaSql,
      seedSql,
      run: ({ database }) => {
        const { tableCounts } = collectD1TableCounts(database);
        const issues: string[] = [];
        verifyD1TableCounts({ issues, tableCounts, exportResult: emptyExportResult() });

        const wrongResult = emptyExportResult();
        wrongResult.routeCatalogRowCount = 99;
        const issues2: string[] = [];
        verifyD1TableCounts({
          issues: issues2,
          tableCounts,
          exportResult: wrongResult,
        });
        return { issues, issues2 };
      },
    });

    expect(issues).toEqual([]);
    expect(issues2).toEqual(["route_catalog:expected_99:actual_1"]);
  });

  it("threads one exact publication identity into the D1 export", async () => {
    const root = mkdtempSync(join(tmpdir(), "verify-d1-release-identity-"));
    const local = await openLocalPipelineDb(join(root, "pipeline.sqlite"));
    try {
      local.sqlite.exec(`
        INSERT INTO local_route_batch_status (
          month,
          generated_at,
          status,
          route_count,
          artifact_count,
          missing_artifact_count,
          hash_mismatch_count,
          byte_length_mismatch_count,
          total_byte_length,
          issue_count
        ) VALUES ('2026-03', '${publishedAt}', 'pass', 0, 0, 0, 0, 0, 0, 0);
      `);
      const releaseIdentity = decodeStrict(ReleaseIdentitySchema)({
        releaseId: releaseIdFromPublishedAt(publishedAt),
        publishedAt,
        coverage: { start: "2025-02", end: "2026-03" },
      });
      const result = await runVerifyD1Export({
        local,
        year: 2026,
        month: 3,
        releaseIdentity,
        exportRoot: join(root, "exports"),
        artifactRoot: join(root, "artifacts"),
      });

      expect(result.releaseId).toBe(releaseIdentity.releaseId);
      expect(result.publishedAt).toBe(releaseIdentity.publishedAt);
      expect(String(result.coverage.start)).toBe("2025-02");
      expect(result.coverage.end as string).toBe("2026-03");

      const exportSummary = JSON.parse(
        await Bun.file(join(dirname(result.seedPath), "export-summary.json")).text(),
      );
      expect(exportSummary).toMatchObject({
        schemaVersion: 2,
        releaseId: releaseIdentity.releaseId,
        publishedAt: releaseIdentity.publishedAt,
        coverage: { start: "2025-02", end: "2026-03" },
        generatedAt: releaseIdentity.publishedAt,
      });
    } finally {
      local.sqlite.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
