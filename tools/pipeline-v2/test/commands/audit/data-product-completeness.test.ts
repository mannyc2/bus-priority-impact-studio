import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DATA_PRODUCT_MANIFEST,
  parseDataProductManifest,
} from "@bp/applied-research/data-products";
import {
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE,
  MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS,
} from "../../../src/commands/audit/analytics-materialization-coverage.ts";
import {
  buildDataProductCompletenessAudit,
  buildSourceMonthCoverageMatrix,
} from "../../../src/commands/audit/data-product-completeness.ts";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/audit/data-product-completeness.ts",
);

function createDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_catalog (
      route_id TEXT NOT NULL
    );
    CREATE TABLE local_route_segment_speed (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_route_scorecard (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_route_observed_reliability_summary (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      run_id TEXT NOT NULL
    );
  `);
  for (const routeId of ["M1", "M2", "M3"]) {
    sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
    sqlite
      .query("INSERT INTO local_route_scorecard (route_id, month) VALUES (?, ?)")
      .run(routeId, "2026-03");
  }
  for (const routeId of ["M1", "M2"]) {
    sqlite
      .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
      .run(routeId, "2026-01");
  }
  sqlite
    .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
    .run("M1", "2026-02");
  sqlite
    .query(
      "INSERT INTO local_route_observed_reliability_summary (route_id, month, run_id) VALUES (?, ?, ?)",
    )
    .run("M1", "2026-03", "test-run");
  sqlite
    .query(
      "INSERT INTO local_route_observed_reliability_summary (route_id, month, run_id) VALUES (?, ?, ?)",
    )
    .run("M2", "2026-03", "other-run");
  return sqlite;
}

function createRouteCatalogDb(routeIds: readonly string[]): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_route_catalog (
      route_id TEXT NOT NULL
    );
  `);
  for (const routeId of routeIds) {
    sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
  }
  return sqlite;
}

async function writeFixture(path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, "{}");
}

describe("data product completeness audit", () => {
  test("joins registry expectations to local tables, artifacts, and lifecycle states", async () => {
    const sqlite = createDb();
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-data-products-"));
    try {
      const brief1 = join(artifactRoot, "briefs/routes/M1/2026-03/brief.json");
      const brief2 = join(artifactRoot, "briefs/routes/M2/2026-03/brief.json");
      const staleManifest = join(artifactRoot, "map/2026-03/manifest.json");
      await writeFixture(brief1);
      await writeFixture(brief2);
      await writeFixture(staleManifest);
      await writeFixture(join(artifactRoot, "mirror/2026-03-01/first.json"));
      await writeFixture(join(artifactRoot, "mirror/2026-03-02/second.json"));
      const oldDate = new Date("2026-05-20T00:00:00.000Z");
      utimesSync(staleManifest, oldDate, oldDate);

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "segment_speed_history",
            label: "Segment speed history",
            kind: "local_table",
            owner: "test",
            grain: "route x month",
            producerCommand: "test segment speed",
            expectedUniverse: { description: "three months", months: "history_window" },
            requiredInputs: ["source:speed"],
            downstreamConsumers: ["speed detectors"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "monthly",
                label: "Monthly speed rows",
                type: "month_table_coverage",
                tableName: "local_route_segment_speed",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedMonths: "history_window",
                minRowsPerMonth: 2,
                minRoutesPerMonth: 2,
              },
            ],
          },
          {
            id: "catalog_rows",
            label: "Catalog rows",
            kind: "local_table",
            owner: "test",
            grain: "route",
            producerCommand: "test catalog",
            expectedUniverse: { description: "route catalog", routes: "route_catalog" },
            requiredInputs: ["routes"],
            downstreamConsumers: ["route universe"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "rows",
                label: "Catalog row count",
                type: "table_row_count",
                tableName: "local_route_catalog",
                minRows: 3,
              },
            ],
          },
          {
            id: "observed_reliability",
            label: "Observed reliability",
            kind: "local_table",
            owner: "test",
            grain: "route x month x run",
            producerCommand: "test observed",
            expectedUniverse: {
              description: "run-scoped observed rows",
              routes: "route_catalog",
              months: "release_month",
            },
            requiredInputs: ["headways"],
            downstreamConsumers: ["ewt"],
            freshnessPolicy: { cadence: "run_scoped" },
            checks: [
              {
                id: "run_rows",
                label: "Observed rows for run",
                type: "table_route_coverage",
                tableName: "local_route_observed_reliability_summary",
                monthColumn: "month",
                routeColumn: "route_id",
                runColumn: "run_id",
                expectedRoutes: "route_catalog",
              },
            ],
          },
          {
            id: "route_scorecards",
            label: "Route scorecards",
            kind: "serving_projection",
            owner: "test",
            grain: "route x month",
            producerCommand: "test scorecards",
            expectedUniverse: {
              description: "all routes",
              routes: "route_catalog",
              months: "release_month",
            },
            requiredInputs: ["route metrics"],
            downstreamConsumers: ["route list"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "table",
                label: "Scorecard table",
                type: "table_route_coverage",
                tableName: "local_route_scorecard",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedRoutes: "route_catalog",
              },
            ],
          },
          {
            id: "route_briefs",
            label: "Route briefs",
            kind: "artifact_family",
            owner: "test",
            grain: "route x month",
            producerCommand: "test briefs",
            expectedUniverse: {
              description: "all routes",
              routes: "route_catalog",
              months: "release_month",
            },
            requiredInputs: ["brief model"],
            downstreamConsumers: ["route detail"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "files",
                label: "Brief files",
                type: "route_artifact_coverage",
                pathTemplate: "{artifactRoot}/briefs/routes/{routeId}/{releaseMonth}/brief.json",
                expectedRoutes: "route_catalog",
              },
            ],
          },
          {
            id: "stale_map_manifest",
            label: "Stale map manifest",
            kind: "release_manifest",
            owner: "test",
            grain: "release manifest",
            producerCommand: "test map",
            expectedUniverse: { description: "one manifest", months: "release_month" },
            requiredInputs: ["map layers"],
            downstreamConsumers: ["route map"],
            freshnessPolicy: { cadence: "release_month", staleAfterDays: 1 },
            checks: [
              {
                id: "file",
                label: "Manifest file",
                type: "json_artifact",
                pathTemplate: "{artifactRoot}/map/{releaseMonth}/manifest.json",
              },
            ],
          },
          {
            id: "raw_mirror_manifests",
            label: "Raw mirror manifests",
            kind: "artifact_family",
            owner: "test",
            grain: "snapshot manifest",
            producerCommand: "test mirror",
            expectedUniverse: { description: "two release-month manifests" },
            requiredInputs: ["raw mirror"],
            downstreamConsumers: ["observed imports"],
            freshnessPolicy: { cadence: "append_only" },
            checks: [
              {
                id: "manifests",
                label: "Mirror JSON manifests",
                type: "artifact_glob",
                rootTemplate: "{artifactRoot}/mirror",
                pattern: "{releaseMonth}-*/*.json",
                minFiles: 2,
              },
            ],
          },
          {
            id: "waived_product",
            label: "Waived product",
            kind: "release_manifest",
            owner: "test",
            grain: "release manifest",
            producerCommand: "test waived",
            expectedUniverse: { description: "waived manifest", months: "release_month" },
            requiredInputs: [],
            downstreamConsumers: ["optional page"],
            freshnessPolicy: { cadence: "manual" },
            lifecycle: { status: "waived", reason: "not part of this fixture" },
            checks: [
              {
                id: "file",
                label: "Waived file",
                type: "json_artifact",
                pathTemplate: "{artifactRoot}/waived.json",
              },
            ],
          },
          {
            id: "blocked_product",
            label: "Blocked product",
            kind: "score_vector",
            owner: "test",
            grain: "route x score",
            producerCommand: "test blocked",
            expectedUniverse: { description: "blocked vectors", routes: "route_catalog" },
            requiredInputs: ["missing feature"],
            downstreamConsumers: ["calibration"],
            freshnessPolicy: { cadence: "manual" },
            lifecycle: { status: "blocked", reason: "waiting on feature materialization" },
            checks: [
              {
                id: "file",
                label: "Blocked vector file",
                type: "json_artifact",
                pathTemplate: "{artifactRoot}/blocked.json",
              },
            ],
          },
          {
            id: "fetching_product",
            label: "Fetching product",
            kind: "local_table",
            owner: "test",
            grain: "route x month",
            producerCommand: "test fetching",
            expectedUniverse: { description: "active pull", months: "history_window" },
            requiredInputs: ["source pull"],
            downstreamConsumers: ["profile"],
            freshnessPolicy: { cadence: "historical_window" },
            lifecycle: { status: "fetching", reason: "active backfill" },
            checks: [
              {
                id: "monthly",
                label: "Fetching table",
                type: "month_table_coverage",
                tableName: "missing_fetching_table",
                monthColumn: "month",
                expectedMonths: "history_window",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-05-31T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "completeness.json"),
      });

      expect(audit.summary.productCount).toBe(10);
      expect(audit.summary.completeProductCount).toBe(3);
      expect(audit.summary.partialProductCount).toBe(3);
      expect(audit.summary.staleProductCount).toBe(1);
      expect(audit.summary.waivedProductCount).toBe(1);
      expect(audit.summary.blockedProductCount).toBe(1);
      expect(audit.summary.fetchingProductCount).toBe(1);
      expect(audit.summary.downstreamBlockedProductCount).toBe(6);
      expect(audit.summary.gapClassCounts).toMatchObject({
        none: 3,
        available_not_fetched: 2,
        derived_not_built: 1,
        planned_blocked: 1,
        fetching: 1,
        waived: 1,
        stale: 1,
      });
      expect(audit.coverage.needsFetch.count).toBe(2);
      expect(audit.coverage.needsBuild.count).toBe(1);

      const speed = audit.products.find((product) => product.productId === "segment_speed_history");
      expect(speed?.status).toBe("partial");
      expect(speed?.gapClass).toBe("available_not_fetched");
      expect(speed?.checks[0]?.sampleMissing).toEqual(["2026-03"]);
      expect(speed?.checks[0]?.samplePartial).toEqual([
        "2026-02:below_min_row_count+below_min_route_count",
      ]);

      const briefs = audit.products.find((product) => product.productId === "route_briefs");
      expect(briefs?.status).toBe("partial");
      expect(briefs?.gapClass).toBe("derived_not_built");
      expect(briefs?.checks[0]?.sampleMissing).toEqual(["M3"]);

      const stale = audit.products.find((product) => product.productId === "stale_map_manifest");
      expect(stale?.status).toBe("stale");
      expect(stale?.gapClass).toBe("stale");
      expect(stale?.checks[0]?.reasons).toContain("artifact_stale");

      const mirror = audit.products.find((product) => product.productId === "raw_mirror_manifests");
      expect(mirror?.status).toBe("complete");
      expect(mirror?.checks[0]?.observedCount).toBe(2);
      expect(
        mirror?.checks[0]?.sampleObserved.map((path) => path.slice(path.indexOf("mirror/"))),
      ).toEqual(["mirror/2026-03-01/first.json", "mirror/2026-03-02/second.json"]);

      const observed = audit.products.find(
        (product) => product.productId === "observed_reliability",
      );
      expect(observed?.status).toBe("partial");
      expect(observed?.checks[0]?.sampleMissing).toEqual(["M2", "M3"]);

      const waived = audit.products.find((product) => product.productId === "waived_product");
      expect(waived?.status).toBe("waived");
      expect(waived?.gapClass).toBe("waived");
      expect(audit.downstreamBlockers.map((blocker) => blocker.productId)).not.toContain(
        "waived_product",
      );
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("resolves SBS plus route ids to Studio artifact slugs", async () => {
    const sqlite = createRouteCatalogDb(["B44+"]);
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-data-products-sbs-"));
    try {
      await writeFixture(join(artifactRoot, "studio/v2/routes/b44-sbs/speed-history.json"));
      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "studio_route_speed_history_artifacts",
            label: "Studio route speed history artifacts",
            kind: "artifact_family",
            owner: "test",
            grain: "route x month",
            producerCommand: "test route speed histories",
            expectedUniverse: {
              description: "all catalog routes",
              routes: "route_catalog",
              months: "history_window",
            },
            requiredInputs: ["segment speed history"],
            downstreamConsumers: ["route detail history"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "files",
                label: "Route speed history files",
                type: "route_artifact_coverage",
                pathTemplate: "{artifactRoot}/studio/v2/routes/{routeId}/speed-history.json",
                expectedRoutes: "route_catalog",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "completeness.json"),
      });

      const product = audit.products[0];
      expect(product?.status).toBe("complete");
      expect(product?.checks[0]?.expectedCount).toBe(1);
      expect(product?.checks[0]?.observedCount).toBe(1);
      expect(product?.checks[0]?.missingCount).toBe(0);
      expect(product?.checks[0]?.sampleObserved).toEqual(["B44+"]);
      expect(product?.checks[0]?.sampleMissing).toEqual([]);
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("audits speed-history artifacts against all historical speed routes", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_catalog (
        route_id TEXT NOT NULL
      );
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL
      );
    `);
    sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run("M1");
    sqlite
      .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
      .run("M1", "2026-03");
    sqlite
      .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
      .run("OLD1", "2023-04");

    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-data-products-history-"));
    try {
      await writeFixture(join(artifactRoot, "studio/v2/routes/m1/speed-history.json"));
      await writeFixture(join(artifactRoot, "studio/v2/routes/old1/speed-history.json"));
      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "historical_speed_history_artifacts",
            label: "Historical speed-history artifacts",
            kind: "artifact_family",
            owner: "test",
            grain: "historical route x month",
            producerCommand: "test route speed histories",
            expectedUniverse: {
              description: "all historical speed routes",
              routes: "historical_speed_source_routes",
              months: "history_window",
            },
            requiredInputs: ["segment speed history"],
            downstreamConsumers: ["route history QA"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "files",
                label: "Historical route speed-history files",
                type: "route_artifact_coverage",
                pathTemplate: "{artifactRoot}/studio/v2/routes/{routeId}/speed-history.json",
                expectedRoutes: "historical_speed_source_routes",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "completeness.json"),
      });

      expect(audit.routeUniverses.historical_speed_source_routes.routeCount).toBe(2);
      expect(audit.routeUniverses.speed_source_routes.routeCount).toBe(1);
      expect(audit.routeUniverses.route_catalog.routeCount).toBe(1);
      expect(audit.products[0]?.status).toBe("complete");
      expect(audit.products[0]?.checks[0]?.expectedCount).toBe(2);
      expect(audit.products[0]?.checks[0]?.observedCount).toBe(2);
      expect(audit.products[0]?.checks[0]?.sampleObserved).toEqual(["M1", "OLD1"]);
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("builds a source-month coverage matrix with source and derived statuses", () => {
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

  test("keeps source-month coverage matrix construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/data-products"');
    expect(source).toContain("classifyDataProductCompleteness({");
    expect(source).toContain("dataProductCompletenessPath");
    expect(source).toContain("buildSourceMonthCoverageMatrix({");
    expect(source).not.toContain("function monthStatsFromTable");
    expect(source).not.toContain("function sourceMonthSummary");
    expect(source).not.toContain("historicalGtfsBlockedSource");
    expect(source).not.toContain("source_month_coverage_matrix");
    expect(source).not.toContain("function dataProductCompletenessPath");
    expect(source).not.toContain("function classifyProducts");
    expect(source).not.toContain("function directGapClassification");
    expect(source).not.toContain("const REQUIRED_INPUT_PRODUCT_ALIASES");
  });

  test("keeps data-product registry ownership in applied-research", () => {
    const registrySource = readFileSync(
      join(import.meta.dir, "../../../src/registry/data-products.ts"),
      "utf8",
    );

    expect(registrySource).toContain('from "@bp/applied-research/data-products"');
    expect(registrySource).not.toContain("DataProductManifestSchema = z");
    expect(registrySource).not.toContain("DATA_PRODUCT_MANIFEST: DataProductManifest");
  });

  test("materialization coverage surfaces stay tied to registered data products", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    expect(DATA_PRODUCT_MANIFEST.products.length).toBeGreaterThan(12);
    expect(Object.keys(MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_BY_SURFACE).sort()).toEqual([
      "ewt_route_month_score_vectors",
      "local_route_brief_summary",
      "local_route_hourly_ridership",
      "local_route_observed_reliability_summary",
      "local_route_scorecard",
      "local_route_segment_speed",
      "route_brief_input_slices",
      "route_briefs",
      "stop_direction_hour_ewt_features",
    ]);
    for (const productId of MATERIALIZATION_COVERAGE_REGISTRY_PRODUCT_IDS) {
      expect(productIds.has(productId)).toBe(true);
    }
  });

  test("reports website-facing historical GTFS needs as real upstream blockers", async () => {
    const sqlite = new Database(":memory:");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-website-needs-"));
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
      `);
      sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run("M1");

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "historical_gtfs_static_bundle_snapshots",
            label: "Historical GTFS static bundle snapshots",
            kind: "artifact_family",
            owner: "test",
            grain: "GTFS static bundle x historical service month",
            producerCommand: "test historical gtfs",
            expectedUniverse: {
              description: "month-addressable historical GTFS bundles",
              months: "history_window",
            },
            requiredInputs: ["source_manifest:mta_archived_bus_gtfs_static"],
            downstreamConsumers: ["planned_service_baseline_history"],
            freshnessPolicy: { cadence: "historical_window" },
            lifecycle: {
              status: "blocked",
              gapClass: "upstream_blocked",
              reason: "no audited historical GTFS source",
            },
            checks: [
              {
                id: "bundles",
                label: "Historical GTFS bundles",
                type: "artifact_glob",
                rootTemplate: "{artifactRoot}/historical-gtfs",
                pattern: "*.zip",
              },
            ],
          },
          {
            id: "planned_service_baseline_history",
            label: "Historical planned-service baseline",
            kind: "serving_projection",
            owner: "test",
            grain: "route x month x daypart planned service",
            producerCommand: "test planned service",
            expectedUniverse: {
              description: "website scheduled-service baseline",
              routes: "route_catalog",
              months: "history_window",
            },
            requiredInputs: ["historical_gtfs_static_bundle_snapshots"],
            downstreamConsumers: ["scheduled-speed gap"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "monthly",
                label: "Monthly planned service",
                type: "month_table_coverage",
                tableName: "local_route_planned_service_baseline",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedMonths: "history_window",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      const gtfs = audit.products.find(
        (product) => product.productId === "historical_gtfs_static_bundle_snapshots",
      );
      expect(gtfs?.status).toBe("blocked");
      expect(gtfs?.gapClass).toBe("upstream_blocked");

      const plannedService = audit.products.find(
        (product) => product.productId === "planned_service_baseline_history",
      );
      expect(plannedService?.status).toBe("missing");
      expect(plannedService?.gapClass).toBe("derived_from_upstream_blocked");
      expect(plannedService?.rootCauses.map((rootCause) => rootCause.productId)).toContain(
        "historical_gtfs_static_bundle_snapshots",
      );
      expect(audit.coverage.upstreamBlocked.count).toBe(2);
      expect(audit.coverage.needsBuild.count).toBe(0);
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("classifies speed publication gaps separately from derived downstream gaps", async () => {
    const sqlite = new Database(":memory:");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-gap-classes-"));
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
        CREATE TABLE local_route_segment_speed (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
      `);
      for (const routeId of ["M1", "M2"]) {
        sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
        sqlite
          .query("INSERT INTO local_route_segment_speed (route_id, month) VALUES (?, ?)")
          .run(routeId, "2026-03");
      }

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "local_route_segment_speed_history",
            label: "Route segment speed history",
            kind: "local_table",
            owner: "test",
            grain: "route x month",
            producerCommand: "ingest route-trends",
            expectedUniverse: { description: "speed history", months: "history_window" },
            requiredInputs: ["source_manifest:bus_segment_speeds_2025"],
            downstreamConsumers: ["route brief metrics"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "monthly",
                label: "Monthly speed rows",
                type: "month_table_coverage",
                tableName: "local_route_segment_speed",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedMonths: "history_window",
                minRowsPerMonth: 2,
                minRoutesPerMonth: 2,
              },
            ],
          },
          {
            id: "studio_route_hotspot_summaries",
            label: "Studio route hotspot summaries",
            kind: "serving_projection",
            owner: "test",
            grain: "route x month",
            producerCommand: "build serving snapshot",
            expectedUniverse: {
              description: "route catalog",
              routes: "route_catalog",
              months: "release_month",
            },
            requiredInputs: ["local_route_segment_speed"],
            downstreamConsumers: ["route detail"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "routes",
                label: "Hotspot rows",
                type: "table_route_coverage",
                tableName: "local_route_hotspot_summary",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedRoutes: "route_catalog",
              },
            ],
          },
          {
            id: "studio_route_slowest_windows",
            label: "Studio slowest route windows",
            kind: "serving_projection",
            owner: "test",
            grain: "route x month",
            producerCommand: "build serving snapshot",
            expectedUniverse: {
              description: "speed routes",
              routes: "speed_source_routes",
              months: "release_month",
            },
            requiredInputs: [],
            downstreamConsumers: ["route detail"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "routes",
                label: "Slowest rows",
                type: "table_route_coverage",
                tableName: "local_route_slowest_window",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedRoutes: "speed_source_routes",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-04",
        historyStartMonth: "2026-03",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      const speed = audit.products.find(
        (product) => product.productId === "local_route_segment_speed_history",
      );
      expect(speed?.status).toBe("partial");
      expect(speed?.gapClass).toBe("upstream_blocked");
      expect(speed?.rootCauses[0]?.reasons).toContain("release_month_source_unavailable:2026-04");

      const hotspots = audit.products.find(
        (product) => product.productId === "studio_route_hotspot_summaries",
      );
      expect(hotspots?.status).toBe("missing");
      expect(hotspots?.gapClass).toBe("derived_from_upstream_blocked");
      expect(hotspots?.gapClasses).toContain("derived_not_built");
      expect(hotspots?.rootCauses.map((rootCause) => rootCause.productId)).toContain(
        "local_route_segment_speed_history",
      );

      const slowest = audit.products.find(
        (product) => product.productId === "studio_route_slowest_windows",
      );
      expect(slowest?.status).toBe("blocked");
      expect(slowest?.gapClass).toBe("derived_from_upstream_blocked");
      expect(slowest?.rootCauses.map((rootCause) => rootCause.productId)).toContain(
        "local_route_segment_speed_history",
      );
      expect(audit.summary.gapClassCounts.upstream_blocked).toBe(1);
      expect(audit.summary.gapClassCounts.derived_from_upstream_blocked).toBe(2);
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("classifies fetched zero-row release-month source snapshots as upstream blocked", async () => {
    const sqlite = new Database(":memory:");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-zero-row-sources-"));
    const rawReliabilityRoot = join(artifactRoot, "raw-reliability");
    try {
      mkdirSync(rawReliabilityRoot, { recursive: true });
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
        CREATE TABLE local_bus_wait_assessment (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
        CREATE TABLE local_bus_customer_journey_metric (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL
        );
      `);
      sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run("M1");
      sqlite
        .query("INSERT INTO local_bus_wait_assessment (route_id, month) VALUES (?, ?)")
        .run("M1", "2026-04");
      sqlite
        .query("INSERT INTO local_bus_customer_journey_metric (route_id, month) VALUES (?, ?)")
        .run("M1", "2026-04");

      await Bun.write(
        join(rawReliabilityRoot, "bus-wait-assessment-2026-05.json"),
        JSON.stringify({ sourceId: "bus_wait_assessment", isoMonth: "2026-05", rows: [] }),
      );
      await Bun.write(
        join(rawReliabilityRoot, "bus-customer-journey-metrics-2026-04_to_2026-05.json"),
        JSON.stringify({
          sourceId: "bus_customer_journey_metrics",
          startMonth: "2026-04",
          endMonth: "2026-05",
          rows: [{ month: "2026-04-01T00:00:00.000", route_id: "M1" }],
        }),
      );

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "local_bus_wait_assessment_history",
            label: "Bus Wait Assessment history",
            kind: "local_table",
            owner: "test",
            grain: "route x month",
            producerCommand: "ingest bus-wait-assessment",
            expectedUniverse: { description: "wait history", months: "history_window" },
            requiredInputs: ["source_manifest:bus_wait_assessment"],
            downstreamConsumers: ["reliability context"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "monthly",
                label: "Monthly wait rows",
                type: "month_table_coverage",
                tableName: "local_bus_wait_assessment",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedMonths: "history_window",
                minRowsPerMonth: 1,
                minRoutesPerMonth: 1,
              },
            ],
          },
          {
            id: "local_bus_customer_journey_metrics_history",
            label: "Bus customer journey metric history",
            kind: "local_table",
            owner: "test",
            grain: "route x month",
            producerCommand: "ingest bus-customer-journey-metrics",
            expectedUniverse: { description: "journey history", months: "history_window" },
            requiredInputs: ["source_manifest:bus_customer_journey_metrics"],
            downstreamConsumers: ["reliability context"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "monthly",
                label: "Monthly customer journey rows",
                type: "month_table_coverage",
                tableName: "local_bus_customer_journey_metric",
                monthColumn: "month",
                routeColumn: "route_id",
                expectedMonths: "history_window",
                minRowsPerMonth: 1,
                minRoutesPerMonth: 1,
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-05",
        historyStartMonth: "2026-04",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-05T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
        rawReliabilityRoot,
      });

      expect(audit.summary.gapClassCounts.upstream_blocked).toBe(2);
      expect(audit.summary.gapClassCounts.available_not_fetched).toBe(0);
      for (const product of audit.products) {
        expect(product.status).toBe("partial");
        expect(product.gapClass).toBe("upstream_blocked");
        expect(product.rootCauses[0]?.reasons).toContain("release_month_source_zero_rows:2026-05");
      }
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("fails source-year route coverage when rows are absent or zero-row complete statuses exist", async () => {
    const sqlite = new Database(":memory:");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-source-year-routes-"));
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
        CREATE TABLE local_route_schedule_stop (
          source_year INTEGER NOT NULL,
          route_id TEXT NOT NULL
        );
        CREATE TABLE local_route_schedule_ingest_status (
          source_year INTEGER NOT NULL,
          route_id TEXT NOT NULL,
          status TEXT NOT NULL,
          row_count INTEGER NOT NULL
        );
      `);
      for (const routeId of ["A1", "B2"]) {
        sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
      }
      sqlite
        .query("INSERT INTO local_route_schedule_stop (source_year, route_id) VALUES (?, ?)")
        .run(2026, "A1");
      sqlite
        .query(
          "INSERT INTO local_route_schedule_ingest_status (source_year, route_id, status, row_count) VALUES (?, ?, ?, ?)",
        )
        .run(2026, "B2", "complete", 0);

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "schedule_source_year_routes",
            label: "Schedule source-year routes",
            kind: "local_table",
            owner: "test",
            grain: "source year x route",
            producerCommand: "test schedules",
            expectedUniverse: {
              description: "all catalog routes across source years",
              routes: "route_catalog",
              months: "history_window",
            },
            requiredInputs: ["source:schedules"],
            downstreamConsumers: ["schedule detectors"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "source_year_routes",
                label: "Source-year route coverage",
                type: "source_year_route_coverage",
                tableName: "local_route_schedule_stop",
                sourceYearColumn: "source_year",
                routeColumn: "route_id",
                expectedRoutes: "route_catalog",
                expectedYears: "history_window_years",
                statusTableName: "local_route_schedule_ingest_status",
                statusSourceYearColumn: "source_year",
                statusRouteColumn: "route_id",
                statusColumn: "status",
                statusRowCountColumn: "row_count",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2025-01",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      const product = audit.products[0];
      expect(product?.status).toBe("partial");
      expect(product?.checks[0]?.expectedCount).toBe(4);
      expect(product?.checks[0]?.observedCount).toBe(1);
      expect(product?.checks[0]?.reasons).toContain("missing_route_years:3");
      expect(product?.checks[0]?.reasons).toContain("complete_status_zero_rows:1");
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("accepts explicit source-year route waivers without hiding zero-row status evidence", async () => {
    const sqlite = new Database(":memory:");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-source-year-route-waivers-"));
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);
        CREATE TABLE local_route_schedule_stop (
          source_year INTEGER NOT NULL,
          route_id TEXT NOT NULL
        );
        CREATE TABLE local_route_schedule_ingest_status (
          source_year INTEGER NOT NULL,
          route_id TEXT NOT NULL,
          status TEXT NOT NULL,
          row_count INTEGER NOT NULL
        );
      `);
      for (const routeId of ["A1", "B2"]) {
        sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
      }
      sqlite
        .query("INSERT INTO local_route_schedule_stop (source_year, route_id) VALUES (?, ?)")
        .run(2026, "A1");
      sqlite
        .query(
          "INSERT INTO local_route_schedule_ingest_status (source_year, route_id, status, row_count) VALUES (?, ?, ?, ?)",
        )
        .run(2026, "B2", "complete", 0);

      await Bun.write(
        join(artifactRoot, "waivers.json"),
        JSON.stringify({
          artifactKind: "route_source_reconciliation",
          sourceYearRouteReconciliation: {
            routeYears: [
              {
                sourceYear: 2026,
                routeId: "B2",
                classification: "current_catalog_route_not_in_source_year",
                disposition: "explicit_waiver",
              },
            ],
          },
        }),
      );

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "schedule_source_year_routes",
            label: "Schedule source-year routes",
            kind: "local_table",
            owner: "test",
            grain: "source year x route",
            producerCommand: "test schedules",
            expectedUniverse: {
              description: "all catalog routes across source years",
              routes: "route_catalog",
              months: "history_window",
            },
            requiredInputs: ["source:schedules"],
            downstreamConsumers: ["schedule detectors"],
            freshnessPolicy: { cadence: "historical_window" },
            checks: [
              {
                id: "source_year_routes",
                label: "Source-year route coverage",
                type: "source_year_route_coverage",
                tableName: "local_route_schedule_stop",
                sourceYearColumn: "source_year",
                routeColumn: "route_id",
                expectedRoutes: "route_catalog",
                expectedYears: "history_window_years",
                statusTableName: "local_route_schedule_ingest_status",
                statusSourceYearColumn: "source_year",
                statusRouteColumn: "route_id",
                statusColumn: "status",
                statusRowCountColumn: "row_count",
                waiverArtifactPathTemplate: "{artifactRoot}/waivers.json",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      const product = audit.products[0];
      expect(product?.status).toBe("complete");
      expect(product?.checks[0]?.expectedCount).toBe(2);
      expect(product?.checks[0]?.observedCount).toBe(2);
      expect(product?.checks[0]?.missingCount).toBe(0);
      expect(product?.checks[0]?.samplePartial).toContain(
        "2026:B2:current_catalog_route_not_in_source_year",
      );
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("semantic JSON checks reject wrong release months", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-wrong-month-"));
    try {
      const releasePath = join(artifactRoot, "release.json");
      await writeFixture(releasePath);
      await Bun.write(releasePath, JSON.stringify({ releaseMonth: "2026-02" }));

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "release_manifest",
            label: "Release manifest",
            kind: "release_manifest",
            owner: "test",
            grain: "release",
            producerCommand: "test release",
            expectedUniverse: { description: "release", months: "release_month" },
            requiredInputs: [],
            downstreamConsumers: ["release"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "release_json",
                label: "Release JSON",
                type: "json_artifact",
                pathTemplate: "{artifactRoot}/release.json",
                validateReleaseMonth: true,
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-03",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      expect(audit.products[0]?.status).toBe("partial");
      expect(audit.products[0]?.checks[0]?.reasons).toContain("release_month_mismatch:2026-02");
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("semantic JSON checks accept source availability requestedMonth", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);");
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-requested-month-"));
    try {
      const releasePath = join(artifactRoot, "availability.json");
      await writeFixture(releasePath);
      await Bun.write(releasePath, JSON.stringify({ requestedMonth: "2026-03" }));

      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "source_availability",
            label: "Source availability",
            kind: "release_manifest",
            owner: "test",
            grain: "release",
            producerCommand: "test availability",
            expectedUniverse: { description: "release", months: "release_month" },
            requiredInputs: [],
            downstreamConsumers: ["release"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "availability_json",
                label: "Availability JSON",
                type: "json_artifact",
                pathTemplate: "{artifactRoot}/availability.json",
                validateReleaseMonth: true,
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-03",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      expect(audit.products[0]?.status).toBe("complete");
      expect(audit.products[0]?.checks[0]?.reasons).toEqual([]);
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });

  test("score-vector checks reject duplicate route rows", async () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE local_route_catalog (route_id TEXT NOT NULL);");
    for (const routeId of ["A1", "B2"]) {
      sqlite.query("INSERT INTO local_route_catalog (route_id) VALUES (?)").run(routeId);
    }
    const artifactRoot = mkdtempSync(join(tmpdir(), "bp-score-dupes-"));
    try {
      await Bun.write(
        join(artifactRoot, "scores.json"),
        JSON.stringify({
          releaseMonth: "2026-03",
          scoreVectors: {
            releaseMonth: [
              { routeId: "A1", month: "2026-03", runId: "test-run" },
              { routeId: "B2", month: "2026-03", runId: "test-run" },
              { routeId: "B2", month: "2026-03", runId: "test-run" },
            ],
          },
        }),
      );
      const manifest = parseDataProductManifest({
        version: 1,
        products: [
          {
            id: "score_vectors",
            label: "Score vectors",
            kind: "score_vector",
            owner: "test",
            grain: "route x score",
            producerCommand: "test vectors",
            expectedUniverse: { description: "route catalog", routes: "route_catalog" },
            requiredInputs: [],
            downstreamConsumers: ["detectors"],
            freshnessPolicy: { cadence: "release_month" },
            checks: [
              {
                id: "routes",
                label: "Score vector routes",
                type: "score_vector_routes",
                pathTemplate: "{artifactRoot}/scores.json",
                expectedRoutes: "route_catalog",
              },
            ],
          },
        ],
      });

      const audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth: "2026-03",
        historyStartMonth: "2026-03",
        runId: "test-run",
        gtfsRunId: null,
        artifactRoot,
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: join(artifactRoot, "audit.json"),
      });

      expect(audit.products[0]?.status).toBe("partial");
      expect(audit.products[0]?.checks[0]?.reasons).toContain("duplicate_score_vector_routes:1");
    } finally {
      sqlite.close();
      rmSync(artifactRoot, { recursive: true, force: true });
    }
  });
});
