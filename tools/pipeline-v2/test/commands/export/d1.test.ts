import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceRouteCatalog } from "@bp/db/local";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import {
  earliestRouteTrendMonth,
  estimateD1ExportCost,
  runExportD1AppendixSeed,
  runExportD1Seed,
} from "../../../src/commands/export/d1.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const publishedAt = "2026-07-19T12:34:56.789Z";

describe("runExportD1Seed", () => {
  it("derives coverage start from the earliest loaded route trend month", () => {
    expect(
      earliestRouteTrendMonth({
        routeMonthTrends: [{ month: "2026-03" }, { month: "2024-11" }, { month: "2025-06" }],
      }),
    ).toBe("2024-11");
    expect(earliestRouteTrendMonth({ routeMonthTrends: [] })).toBeNull();
  });

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
    const artifactRoot = join(tmp, "artifacts");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        publishedAt,
        exportRoot,
        artifactRoot,
      });

      expect(result.releaseId).toBe(releaseIdFromPublishedAt(publishedAt));
      expect(result.publishedAt).toBe(publishedAt);
      expect(result.coverage.start).toBeNull();
      expect(result.coverage.end as string).toBe("2026-03");
      expect(result.generatedAt).toBe(publishedAt);
      expect(result.schemaVersion).toBe(2);
      expect(result.routeCount).toBe(0);
      expect(result.comparisonRowCount).toBe(0);
      expect(result.routeCatalogRowCount).toBe(0);

      expect(existsSync(result.schemaPath)).toBe(true);
      expect(existsSync(result.seedPath)).toBe(true);
      expect(existsSync(result.summaryPath)).toBe(true);
      expect(result.summaryPath).toContain("/d1/2026-03/");

      const summary = JSON.parse(await Bun.file(result.summaryPath).text());
      expect(summary.releaseId).toBe(releaseIdFromPublishedAt(publishedAt));
      expect(summary.publishedAt).toBe(publishedAt);
      expect(summary.coverage).toEqual({ start: null, end: "2026-03" });
      expect(summary.generatedAt).toBe(publishedAt);
      expect(summary).not.toHaveProperty("isoMonth");
      expect(summary).not.toHaveProperty("analysisPeriod");
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

      const capability = JSON.parse(
        await Bun.file(
          join(artifactRoot, "studio", "v2", "routes", "route-capability-manifest.json"),
        ).text(),
      );
      expect(capability.schemaVersion).toBe(2);
      expect(capability.releaseId).toBe(releaseIdFromPublishedAt(capability.publishedAt));
      expect(capability.coverage).toEqual({ start: null, end: "2026-03" });

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
        publishedAt,
        exportRoot,
        artifactRoot: join(tmp, "artifacts"),
        routeTimelineProjectionPath: projectionPath,
      });

      expect(result.routeTimelineIndexRowCount).toBe(1);
      expect(result.routeArtifactRowCount).toBe(1);
      expect(result.costEstimate.seedSql.insertStatementCount).toBeGreaterThanOrEqual(2);

      const schemaSql = await Bun.file(result.schemaPath).text();
      const seedSql = await Bun.file(result.seedPath).text();
      expect(seedSql).toContain('insert into "route_timeline_index"');
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

  it("folds detector readiness manifest route refs into canonical seed output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-detector-readiness-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");
    const artifactRoot = join(tmp, "artifacts");
    const manifestPath = join(
      artifactRoot,
      "detector-serving-readiness-manifest",
      "2026-03",
      "route-detector-readiness-manifest.json",
    );

    const manifest = {
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      generatedAt: "2026-06-08T00:00:00.000Z",
      releaseMonth: "2026-03",
      sourceProjections: [],
      sourceEvaluations: [],
      summary: {
        routeCount: 2,
        omittedNoRouteItemCount: 0,
        publicFindingCandidateRefCount: 1,
        routeContextRefCount: 1,
        reviewQueueItemCount: 0,
        suppressedItemCount: 0,
        coverageSkippedCount: 0,
        unreviewedSuppressedCoverageCount: 0,
        byBucket: {
          public_finding_candidate: 1,
          route_context: 1,
          review_queue: 0,
          suppressed: 0,
        },
        byDetector: {},
      },
      routes: [
        {
          routeId: "B46",
          counts: {
            public_finding_candidate: 1,
            route_context: 0,
            review_queue: 0,
            suppressed: 0,
            coverageSkipped: 0,
            unreviewedSuppressedCoverage: 0,
          },
          byDetector: {},
          sourceMonths: [],
          publicFindingCandidateRefs: [],
          routeContextRefs: [],
          reviewQueueCounts: {},
          suppressedCounts: {},
          caveats: [],
        },
        {
          routeId: "M15",
          counts: {
            public_finding_candidate: 0,
            route_context: 1,
            review_queue: 0,
            suppressed: 0,
            coverageSkipped: 0,
            unreviewedSuppressedCoverage: 0,
          },
          byDetector: {},
          sourceMonths: [],
          publicFindingCandidateRefs: [],
          routeContextRefs: [],
          reviewQueueCounts: {},
          suppressedCounts: {},
          caveats: [],
        },
      ],
    };

    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        publishedAt,
        exportRoot,
        artifactRoot,
        detectorReadinessManifestPath: manifestPath,
      });

      expect(result.detectorReadinessManifestAvailable).toBe(true);
      expect(result.routeArtifactRowCount).toBe(2);

      const stagedPath = join(
        artifactRoot,
        "studio",
        "v2",
        "detectors",
        "route-detector-readiness-manifest.json",
      );
      expect(existsSync(stagedPath)).toBe(true);

      const schemaSql = await Bun.file(result.schemaPath).text();
      const seedSql = await Bun.file(result.seedPath).text();
      expect(seedSql).toContain("detector_readiness_manifest");
      expect(seedSql).toContain("studio/v2/detectors/route-detector-readiness-manifest.json");

      const db = new Database(":memory:");
      try {
        db.exec(schemaSql);
        db.exec(seedSql);
        const rows = db
          .query<{ route_id: string; artifact_name: string; artifact_key: string }, []>(
            "SELECT route_id, artifact_name, artifact_key FROM route_artifact ORDER BY route_id",
          )
          .all();
        expect(rows).toEqual([
          {
            route_id: "B46",
            artifact_name: "detector_readiness_manifest",
            artifact_key: "studio/v2/detectors/route-detector-readiness-manifest.json",
          },
          {
            route_id: "M15",
            artifact_name: "detector_readiness_manifest",
            artifact_key: "studio/v2/detectors/route-detector-readiness-manifest.json",
          },
        ]);
        expect(rows.find((row) => row.route_id === "Q99")).toBeUndefined();
      } finally {
        db.close();
      }
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("folds MTA-wiki route evidence index rows into canonical seed output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-route-evidence-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");
    const artifactRoot = join(tmp, "artifacts");
    const indexPath = join(artifactRoot, "studio", "v2", "wiki", "index.json");
    const legacyProjectionPath = join(
      artifactRoot,
      "docs",
      "legacy",
      "route-timeline-serving-projection.json",
    );

    await Bun.write(
      indexPath,
      `${JSON.stringify(
        {
          artifactKind: "bp.studio.route_evidence_index.v1",
          schemaVersion: 1,
          generatedAt: "2026-07-01T00:00:00.000Z",
          sourceArtifactKey: "studio/v2/wiki/route-evidence.json",
          summary: {
            routeCount: 1,
            matchedBusRouteCount: 1,
            citationCount: 2,
            totalByteLength: 456,
          },
          routes: [
            {
              routeId: "M15+",
              routeSlug: "m15-sbs",
              wikiRouteRecordId: "route_m15_sbs",
              artifactName: "route_evidence",
              artifactKey: "studio/v2/wiki/routes/m15-sbs.json",
              contentType: "application/json",
              byteLength: 456,
              sha256: "c".repeat(64),
              coverage: {
                timelineCount: 1,
                interventionCount: 1,
                metricClaimCount: 0,
                projectCount: 0,
                sourceGapCount: 0,
                citationCount: 2,
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    mkdirSync(join(artifactRoot, "docs", "legacy"), { recursive: true });
    await Bun.write(
      legacyProjectionPath,
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
              routeId: "M15",
              month: "2026-03",
              supportLevel: "timeline_ready",
              qualityFlags: [],
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
                  eventId: "m15-launch",
                  displayDate: "2010-10",
                  title: "M15 SBS launched",
                },
              ],
              bundleArtifactKey: "studio/v2/routes/m15/timeline.json",
              bundleArtifactSha256: "d".repeat(64),
              bundleArtifactByteLength: 456,
              sourceBundlePath: "/tmp/m15-timeline.json",
              generatedAt: "2026-06-06T20:10:00.000Z",
            },
          ],
          routeArtifactRows: [
            {
              routeId: "M15",
              month: "2026-03",
              artifactName: "route_timeline_bundle",
              artifactKey: "studio/v2/routes/m15/timeline.json",
              contentType: "application/json",
              byteLength: 456,
              sha256: "d".repeat(64),
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
        publishedAt,
        exportRoot,
        artifactRoot,
        routeEvidenceIndexPath: indexPath,
      });

      expect(result.routeArtifactRowCount).toBe(1);
      expect(result.routeTimelineIndexRowCount).toBe(0);
      const schemaSql = await Bun.file(result.schemaPath).text();
      const seedSql = await Bun.file(result.seedPath).text();
      expect(seedSql).toContain("route_evidence");
      expect(seedSql).toContain("studio/v2/wiki/routes/m15-sbs.json");
      expect(seedSql).not.toContain("route_timeline_bundle");
      expect(seedSql).not.toContain("route_timeline_index");

      const db = new Database(":memory:");
      try {
        db.exec(schemaSql);
        db.exec(seedSql);
        const rows = db
          .query<{ route_id: string; artifact_name: string; artifact_key: string }, []>(
            "SELECT route_id, artifact_name, artifact_key FROM route_artifact",
          )
          .all();
        expect(rows).toEqual([
          {
            route_id: "M15+",
            artifact_name: "route_evidence",
            artifact_key: "studio/v2/wiki/routes/m15-sbs.json",
          },
        ]);
      } finally {
        db.close();
      }
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits and replays a collision-guarded exact-route identity registration from v2 evidence", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-exact-route-identity-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");
    const artifactRoot = join(tmp, "artifacts");
    const indexPath = join(artifactRoot, "studio", "v2", "wiki", "index.json");
    const index = {
      artifactKind: "bp.studio.route_evidence_index.v2",
      schemaVersion: 2,
      generatedAt: "2026-07-18T18:05:27.000Z",
      sourceArtifactKey: "studio/v2/wiki/index.json",
      source: {
        kind: "mta-wiki-immutable-release",
        wikiRelease: "v1-test",
        manifestSha256: "1".repeat(64),
        routeIdentitySha256: "2".repeat(64),
        routeAnchorSha256: "3".repeat(64),
        trackerRouteInputSha256: "4".repeat(64),
        catalogParity: {
          currentBusRoutesSha256: "5".repeat(64),
          effectiveAsOfDate: "2026-07-18",
          currentCatalogRouteCount: 1,
          catalogInEffectIdentityCount: 1,
          gtfsRouteCount: 1,
          descriptorReconciled: true,
          catalogInEffectSetsEqual: true,
          catalogOnlyRouteIds: [],
          gtfsOnlyRouteIds: [],
          rawRouteTypeCounts: { "3": 1 },
          scheduledInWindowCounts: { yes: 1 },
          reliabilityStatusCounts: { reliable: 1 },
          nonBusOrUnknownExtendedRouteTypeCount: 0,
          externalOnlyRouteRecordCount: 0,
        },
      },
      summary: {
        routeCount: 1,
        matchedBusRouteCount: 1,
        citationCount: 0,
        totalByteLength: 100,
      },
      routes: [
        {
          routeId: "M15+",
          routeSlug: "m15-sbs",
          wikiRouteRecordId: "route-m15-sbs",
          artifactName: "route_evidence",
          artifactKey: "studio/v2/wiki/routes/m15-sbs.json",
          contentType: "application/json",
          byteLength: 100,
          sha256: "6".repeat(64),
          coverage: {
            timelineCount: 0,
            interventionCount: 0,
            metricClaimCount: 0,
            projectCount: 0,
            sourceGapCount: 0,
            citationCount: 0,
          },
          bundleSchemaVersion: 2,
          routeIdentity: {
            routeId: "M15+",
            routeFamilyId: "M15",
            displayLabel: "M15-SBS",
            officialLongName: "East Harlem - South Ferry",
            designationLiterals: ["route_type:SBS", "trip_type:14"],
            serviceModes: ["sbs"],
            routeTypes: ["SBS"],
            tripTypes: ["14"],
          },
        },
      ],
    };
    await Bun.write(indexPath, `${JSON.stringify(index, null, 2)}\n`);

    const local = await openLocalPipelineDb(dbPath);
    try {
      replaceRouteCatalog(local.db, [
        {
          routeId: "M15+",
          routeShortName: "M15-SBS",
          routeLongName: "East Harlem - South Ferry",
          routeTypes: ["SBS"],
          tripTypes: [],
          directions: ["Northbound", "Southbound"],
          shapeCount: 1,
          stopCount: 2,
          timepointStopCount: 2,
          latitudeMin: null,
          latitudeMax: null,
          longitudeMin: null,
          longitudeMax: null,
        },
      ]);
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        publishedAt,
        exportRoot,
        artifactRoot,
        routeEvidenceIndexPath: indexPath,
      });

      expect(result.exactRouteIdentity).not.toBeNull();
      const exact = result.exactRouteIdentity;
      if (exact === null) throw new Error("Missing exact-route identity output");
      expect(existsSync(exact.registrationFile.path)).toBe(true);
      expect(existsSync(exact.receiptFile.path)).toBe(true);
      expect(exact.exactRouteCount).toBe(1);
      expect(result.routeCatalogTripTypeRowCount).toBe(1);
      const registrationSql = await Bun.file(exact.registrationFile.path).text();
      expect(registrationSql).not.toContain("INSERT OR REPLACE");
      expect(registrationSql).toContain("metadata_collision");

      const replay = new Database(":memory:");
      try {
        replay.exec(await Bun.file(result.schemaPath).text());
        replay.exec(await Bun.file(result.seedPath).text());
        replay.query(registrationSql).run();
        expect(
          replay
            .query("SELECT release_id, exact_route_count FROM exact_route_identity_release")
            .get(),
        ).toEqual({ release_id: result.releaseId, exact_route_count: 1 });
        expect(
          replay
            .query("SELECT route_id, trip_type_rank, trip_type FROM route_catalog_trip_type")
            .all(),
        ).toEqual([{ route_id: "M15+", trip_type_rank: 1, trip_type: "14" }]);
      } finally {
        replay.close();
      }
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("keeps detector readiness manifest support non-fatal when the manifest is missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "export-d1-detector-readiness-missing-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const exportRoot = join(tmp, "exports");
    const artifactRoot = join(tmp, "artifacts");
    const missingManifestPath = join(tmp, "missing", "route-detector-readiness-manifest.json");

    const local = await openLocalPipelineDb(dbPath);
    try {
      const result = await runExportD1Seed({
        local,
        year: 2026,
        month: 3,
        publishedAt,
        exportRoot,
        artifactRoot,
        detectorReadinessManifestPath: missingManifestPath,
      });

      expect(result.detectorReadinessManifestAvailable).toBe(false);
      expect(result.routeArtifactRowCount).toBe(0);
      expect(
        existsSync(
          join(artifactRoot, "studio", "v2", "detectors", "route-detector-readiness-manifest.json"),
        ),
      ).toBe(false);
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
        publishedAt,
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
          .query<{ implementation_month: string; event_status: string; program: string }, []>(
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
