import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateD1ExportCost,
  runExportD1AppendixSeed,
  runExportD1Seed,
} from "../../../src/commands/export/d1.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

describe("runExportD1Seed", () => {
  it("estimates D1 seed publish cost from SQL statement counts", () => {
    const estimate = estimateD1ExportCost({
      seedPath: "/tmp/seed.sql",
      seedSql: [
        `delete from "route_scorecard" where "month" = '2099-01';`,
        `insert into "route_scorecard" ("route_id", "month") values ('M1', '2099-01');`,
        `insert into "route_scorecard" ("route_id", "month") values ('M2', '2099-01');`,
      ].join("\n"),
      schemaPath: "/tmp/schema.sql",
      schemaSql: `create table "route_scorecard" ("route_id" text);`,
    });

    expect(estimate.seedSql.insertStatementCount).toBe(2);
    expect(estimate.seedSql.deleteStatementCount).toBe(1);
    expect(estimate.schemaSql.ddlStatementCount).toBe(1);
    expect(estimate.usageEstimate.freshRowsWrittenLowerBound).toBe(2);
    expect(estimate.usageEstimate.replacementRowsWrittenEstimate).toBe(4);
    expect(estimate.usageEstimate.indexedRowsWrittenEstimate).toBe(4);
    expect(estimate.usageEstimate.replacementIndexedRowsWrittenEstimate).toBe(8);
    expect(estimate.usageEstimate.freshWithinWorkersFreeDailyLimit).toBe(true);
    expect(
      estimate.paidPlanCost.replacement.lines.find((line) => line.metric === "d1_rows_written")
        ?.quantity,
    ).toBe(4);
  });

  it("writes schema, seed, and summary files against an empty local DB", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
        artifactRoot: join(tmp, "artifacts"),
      });

      expect(result.isoMonth).toBe("2026-03");
      expect(result.analysisPeriod).toBe("2026-03");
      expect(result.schemaVersion).toBe(1);
      expect(result.routeCount).toBe(0);
      expect(result.comparisonRowCount).toBe(0);
      expect(result.routeCatalogRowCount).toBe(0);

      expect(existsSync(result.schemaPath)).toBe(true);
      expect(existsSync(result.seedPath)).toBe(true);
      expect(existsSync(result.summaryPath)).toBe(true);

      const summary = JSON.parse(await Bun.file(result.summaryPath).text());
      expect(summary.isoMonth).toBe("2026-03");
      expect(summary.schemaFile.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(summary.seedFile.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(summary.costEstimate.operation).toBe("d1-seed-export");
      expect(summary.costEstimate.exactRowsWrittenKnownBeforeExecution).toBe(false);
      expect(summary.costEstimate.seedSql.deleteStatementCount).toBeGreaterThan(0);
      expect(summary.costEstimate.schemaSql.ddlStatementCount).toBeGreaterThan(0);
      expect(summary.costEstimate.paidPlanCost.replacementIndexed.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: "d1_rows_written",
          }),
        ]),
      );

      const schemaSql = await Bun.file(result.schemaPath).text();
      expect(schemaSql.length).toBeGreaterThan(0);
      expect(schemaSql).toContain("CREATE TABLE");
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("folds route timeline serving projection rows into canonical seed output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-timeline-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");
    const projectionPath = join(tmp, "route-timeline-serving-projection.json");
    const hash = "a".repeat(64);

    await Bun.write(
      projectionPath,
      `${JSON.stringify(
        {
          artifactKind: "bp.tier2_route_timeline_serving_projection.v1",
          schemaVersion: 1,
          generatedAt: "2026-06-06T20:14:00.000Z",
          sourceIndexPath: "/tmp/route-timeline-bundle-index.json",
          releaseMonth: "2026-03",
          r2Prefix: "studio/v2/routes",
          summary: {},
          routeTimelineIndexRows: [
            {
              routeId: "B46",
              month: "2026-03",
              supportLevel: "timeline_ready",
              qualityFlags: ["has_unresolved_dates"],
              defaultEventCount: 1,
              secondaryEventCount: 0,
              reviewOnlyEventCount: 0,
              eventCount: 1,
              sourceBackedEventCount: 1,
              dateAssertionBackedEventCount: 1,
              unresolvedDateEventCount: 0,
              lowConfidenceEventCount: 0,
              unaccountedCandidateCount: 0,
              validationErrorCount: 0,
              validationWarningCount: 0,
              totalTokens: 123,
              defaultEvents: [
                {
                  eventId: "b46-launch",
                  displayDate: "2016-07",
                  title: "B46 SBS launched",
                },
              ],
              bundleArtifactKey: "studio/v2/routes/b46/timeline.json",
              bundleArtifactSha256: hash,
              bundleArtifactByteLength: 456,
              sourceBundlePath: "/tmp/b46-timeline.json",
              generatedAt: "2026-06-06T20:10:00.000Z",
            },
          ],
          routeArtifactRows: [
            {
              routeId: "B46",
              month: "2026-03",
              artifactName: "route_timeline_bundle",
              artifactKey: "studio/v2/routes/b46/timeline.json",
              contentType: "application/json",
              byteLength: 456,
              sha256: hash,
            },
          ],
          copyPlan: [],
        },
        null,
        2,
      )}\n`,
    );

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
        artifactRoot: join(tmp, "artifacts"),
        routeTimelineProjectionPath: projectionPath,
      });

      expect(result.routeTimelineIndexRowCount).toBe(1);
      expect(result.routeArtifactRowCount).toBe(1);
      expect(result.costEstimate.seedSql.insertStatementCount).toBeGreaterThanOrEqual(2);

      const schemaSql = await Bun.file(result.schemaPath).text();
      const seedSql = await Bun.file(result.seedPath).text();
      expect(seedSql).toContain("insert into \"route_timeline_index\"");
      expect(seedSql).toContain("route_timeline_bundle");

      const db = new Database(":memory:");
      try {
        db.exec(schemaSql);
        db.exec(seedSql);
        const timelineCount = db
          .query<{ count: number }, []>("SELECT count(*) AS count FROM route_timeline_index")
          .get();
        const artifactCount = db
          .query<{ count: number }, []>("SELECT count(*) AS count FROM route_artifact")
          .get();
        expect(timelineCount?.count).toBe(1);
        expect(artifactCount?.count).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("synthesizes missing source-gap intervention events for month-scoped comparisons", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-source-gap-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");

    const local = await openLocalPipelineDb(dbPath);
    try {
      local.sqlite.exec(`
        INSERT INTO local_route_intervention_comparison (
          route_id,
          month,
          event_id,
          intervention_type,
          source_id,
          evaluation_level,
          comparison_status,
          pre_start_month,
          pre_end_month,
          post_start_month,
          post_end_month,
          requested_pre_month_count,
          requested_post_month_count,
          pre_sample_month_count,
          post_sample_month_count,
          pre_speed_observation_count,
          post_speed_observation_count,
          pre_average_speed_mph,
          post_average_speed_mph,
          speed_delta_mph,
          pre_average_monthly_ridership,
          post_average_monthly_ridership,
          ridership_delta,
          comparison_route_count,
          comparison_route_ids,
          comparison_pre_average_speed_mph,
          comparison_post_average_speed_mph,
          comparison_speed_delta_mph,
          adjusted_speed_delta_mph,
          comparison_pre_average_monthly_ridership,
          comparison_post_average_monthly_ridership,
          comparison_ridership_delta,
          adjusted_ridership_delta,
          caveat
        )
        VALUES (
          'B1',
          '2026-03',
          'bus-lane-source-gap:B1:2026-03',
          'bus_lane_infrastructure',
          'nyc_dot_bus_lanes',
          'not_evaluated_source_gap',
          'source_gap_missing_implementation_date',
          NULL,
          NULL,
          NULL,
          NULL,
          0,
          0,
          0,
          0,
          0,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          0,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          'NYC DOT bus lane geometry is matched to the route, but this pipeline has no route-level implementation date for a before/after comparison.'
        );
      `);

      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
        artifactRoot: join(tmp, "artifacts"),
      });

      expect(result.interventionEventRowCount).toBe(1);
      expect(result.routeInterventionComparisonRowCount).toBe(1);

      const schemaSql = await Bun.file(result.schemaPath).text();
      const seedSql = await Bun.file(result.seedPath).text();
      const db = new Database(":memory:");
      try {
        db.exec(schemaSql);
        db.exec(seedSql);
        const event = db
          .query<
            { implementation_month: string; event_status: string; program: string },
            []
          >(
            `
              SELECT implementation_month, event_status, program
              FROM intervention_event
              WHERE event_id = 'bus-lane-source-gap:B1:2026-03'
            `,
          )
          .get();
        expect(event).toEqual({
          implementation_month: "2026-03",
          event_status: "source_gap",
          program: "NYC DOT Bus Lanes",
        });
      } finally {
        db.close();
      }
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("writes appendix-only files in appendix mode", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-appendix-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1AppendixSeed({
        local,
        year: 2026,
        month: 3,
        exportRoot,
      });

      expect(result.mode).toBe("appendix");
      expect(result.isoMonth).toBe("2026-03");
      expect(result.routeObservedReliabilitySummaryRowCount).toBe(0);
      expect(result.routeMonthSourceStatusRowCount).toBe(0);
      expect(existsSync(result.seedPath)).toBe(true);
      expect(existsSync(result.summaryPath)).toBe(true);
      expect(result.seedPath.endsWith("seed.appendix.sql")).toBe(true);

      const summary = JSON.parse(await Bun.file(result.summaryPath).text());
      expect(summary.costEstimate.operation).toBe("d1-seed-export");
      expect(summary.costEstimate.seedSql.deleteStatementCount).toBe(2);
      expect(summary.costEstimate.usageEstimate.freshWithinWorkersFreeDailyLimit).toBe(true);
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
