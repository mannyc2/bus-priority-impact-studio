import { describe, expect, test } from "bun:test";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { dataProductCompletenessPath } from "../src/artifacts";
import {
  classifyDataProductCompleteness,
  DATA_PRODUCT_MANIFEST,
  DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS,
  DATA_PRODUCT_REQUIRED_INPUT_PRODUCT_ALIASES,
  type DataProductCheckAudit,
  type DataProductCompletenessProductAuditBase,
  dataProductCoverageSummary,
  dataProductGapClassCounts,
  dataProductJsonSemanticReasons,
  dataProductReasons,
  dataProductScoreVectorRouteIds,
  dataProductStatus,
  dataProductStatusCounts,
  parseDataProductCompletenessArtifact,
  parseDataProductManifest,
  parseDataProductManifestText,
  resolveDataProductRequiredInput,
} from "../src/data-products";
import {
  BUILT_IN_MODEL_ARTIFACT_IDS_V1,
  builtInPanelModelSpecsV1,
  parsePanelSpec,
} from "../src/feature-resolvers";

describe("data product registry", () => {
  test("publishes the release data-product manifest from applied research", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));

    expect(DATA_PRODUCT_MANIFEST.version).toBe(1);
    expect(DATA_PRODUCT_MANIFEST.products.length).toBeGreaterThan(12);
    expect(productIds.has("local_route_catalog_release")).toBe(true);
    expect(productIds.has("ewt_route_month_score_vectors")).toBe(true);
    expect(productIds.has("local_intervention_events_release")).toBe(true);
    expect(productIds.has("route_treatment_summary_artifact")).toBe(true);
  });

  test("keeps built-in panel/model specs tied to the product manifest", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    const panelModels = builtInPanelModelSpecsV1({
      historyStartMonth: "2026-01",
      releaseMonth: "2026-03",
      minHistoryMonths: 2,
      minCellHistoryMonths: 2,
      minReleaseTripCount: 10,
    });

    expect(panelModels.map((model) => model.modelArtifactId)).toEqual([
      ...BUILT_IN_MODEL_ARTIFACT_IDS_V1,
    ]);
    expect(new Set(panelModels.map((model) => model.modelArtifactId)).size).toBe(
      panelModels.length,
    );
    expect(new Set(panelModels.map((model) => model.panelId)).size).toBe(panelModels.length);

    for (const model of panelModels) {
      const spec = parsePanelSpec(model.spec);
      expect(spec.panelId).toBe(model.panelId);
      expect(spec.grain.length).toBeGreaterThan(0);
      expect(spec.timeKey.length).toBeGreaterThan(0);
      expect(spec.entityKeys.length).toBeGreaterThan(0);
      expect(spec.measures.length).toBeGreaterThan(0);
      expect(spec.coverage.length).toBeGreaterThan(0);
      expect(spec.negativeMeaning.length).toBeGreaterThan(20);
      expect(spec.requiredProducts.length).toBeGreaterThan(0);
      for (const product of spec.requiredProducts) {
        expect(productIds.has(product.productId)).toBe(true);
      }
    }
  });

  test("keeps analytics detector required data products tied to the product manifest", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    for (const detector of listAnalyticsDetectors()) {
      expect(detector.requiredDataProducts.length).toBeGreaterThan(0);
      for (const productId of detector.requiredDataProducts) {
        expect(productIds.has(productId)).toBe(true);
      }
    }
  });

  test("route and month coverage checks declare concrete product universes", () => {
    const routeBearingCheckTypes = new Set([
      "table_route_coverage",
      "source_year_route_coverage",
      "route_artifact_coverage",
      "score_vector_routes",
    ]);
    const monthBearingCheckTypes = new Set(["month_table_coverage"]);

    const missingRouteUniverses: string[] = [];
    const missingMonthUniverses: string[] = [];

    for (const product of DATA_PRODUCT_MANIFEST.products) {
      for (const check of product.checks) {
        const hasRouteColumn = "routeColumn" in check && check.routeColumn !== undefined;
        const hasExpectedRoutes = "expectedRoutes" in check && check.expectedRoutes !== undefined;
        if (
          (hasRouteColumn || hasExpectedRoutes || routeBearingCheckTypes.has(check.type)) &&
          product.expectedUniverse.routes === undefined
        ) {
          missingRouteUniverses.push(`${product.id}:${check.id}`);
        }
        const hasMonthColumn = "monthColumn" in check && check.monthColumn !== undefined;
        if (
          (hasMonthColumn || monthBearingCheckTypes.has(check.type)) &&
          product.expectedUniverse.months === undefined
        ) {
          missingMonthUniverses.push(`${product.id}:${check.id}`);
        }
      }
    }

    expect(missingRouteUniverses).toEqual([]);
    expect(missingMonthUniverses).toEqual([]);
  });

  test("required inputs resolve to product dependencies or explicit external refs", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));
    const unresolvedInputs: string[] = [];
    const danglingAliases: string[] = [];

    for (const [alias, resolvedProductIds] of Object.entries(
      DATA_PRODUCT_REQUIRED_INPUT_PRODUCT_ALIASES,
    )) {
      for (const productId of resolvedProductIds) {
        if (!productIds.has(productId)) danglingAliases.push(`${alias}->${productId}`);
      }
    }

    for (const product of DATA_PRODUCT_MANIFEST.products) {
      for (const requiredInput of product.requiredInputs) {
        const resolution = resolveDataProductRequiredInput(requiredInput, productIds);
        if (resolution.kind === "unresolved") {
          unresolvedInputs.push(`${product.id}:${requiredInput}`);
        }
      }
    }

    expect(danglingAliases).toEqual([]);
    expect(new Set(DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS).size).toBe(
      DATA_PRODUCT_REQUIRED_INPUT_EXTERNAL_REFS.length,
    );
    expect(unresolvedInputs).toEqual([]);
  });

  test("parses custom manifests through the package schema", () => {
    const manifest = parseDataProductManifest({
      version: 1,
      products: [
        {
          id: "fixture_rows",
          label: "Fixture rows",
          kind: "local_table",
          owner: "test",
          grain: "route",
          producerCommand: "fixture build",
          expectedUniverse: {
            description: "fixture route catalog",
            routes: "route_catalog",
          },
          requiredInputs: ["fixture"],
          downstreamConsumers: ["fixture audit"],
          freshnessPolicy: { cadence: "release_month" },
          checks: [
            {
              id: "rows",
              label: "Rows",
              type: "table_row_count",
              tableName: "fixture_rows",
              minRows: 1,
            },
          ],
        },
      ],
    });

    expect(manifest.products[0]?.lifecycle.status).toBe("expected");
    expect(parseDataProductManifestText(JSON.stringify(manifest))).toEqual(manifest);
  });

  test("owns the data-product completeness artifact path", () => {
    expect(
      dataProductCompletenessPath({
        artifactRoot: "/tmp/artifacts",
        historyStartMonth: "2026-01",
        releaseMonth: "2026-03",
        runId: "test-run",
      }),
    ).toBe(
      "/tmp/artifacts/data-product-completeness/2026-01_to_2026-03/test-run/completeness.json",
    );
  });

  test("validates data-product completeness artifacts before publication", () => {
    const artifact = {
      artifactKind: "data_product_completeness",
      generatedAt: "2026-06-07T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/data-product-completeness/completeness.json",
      manifestVersion: 1,
      releaseMonth: "2026-03",
      runId: "bus-observatory-2026-03",
      gtfsRunId: null,
      historyWindow: {
        startMonth: "2023-04",
        endMonth: "2026-03",
        monthCount: 36,
      },
      routeUniverses: {
        route_catalog: { routeCount: 1, sampleRoutes: ["B41"] },
      },
      summary: {
        productCount: 1,
        checkCount: 1,
        completeProductCount: 1,
        partialProductCount: 0,
        missingProductCount: 0,
        staleProductCount: 0,
        waivedProductCount: 0,
        blockedProductCount: 0,
        fetchingProductCount: 0,
        downstreamBlockedProductCount: 0,
        gapClassCounts: {
          none: 1,
          upstream_blocked: 0,
          downstream_blocked: 0,
          available_not_fetched: 0,
          source_absent: 0,
          derived_not_built: 0,
          derived_from_available_not_fetched: 0,
          derived_from_upstream_blocked: 0,
          planned_blocked: 0,
          fetching: 0,
          waived: 0,
          stale: 0,
          unknown: 0,
        },
      },
      coverage: {
        complete: { count: 1, products: [] },
        needsFetch: { count: 0, products: [] },
        needsBuild: { count: 0, products: [] },
        upstreamBlocked: { count: 0, products: [] },
        downstreamBlocked: { count: 0, products: [] },
        plannedBlocked: { count: 0, products: [] },
        fetching: { count: 0, products: [] },
        stale: { count: 0, products: [] },
        waived: { count: 0, products: [] },
        unknown: { count: 0, products: [] },
        sourceAbsent: { count: 0, products: [] },
      },
      products: [
        {
          productId: "local_route_catalog_release",
          label: "Release route catalog",
          kind: "local_table",
          owner: "test",
          grain: "route",
          producerCommand: "test catalog",
          expectedUniverse: {
            description: "Catalog routes",
            routes: "route_catalog",
            months: "release_month",
          },
          requiredInputs: ["source_manifest:current_bus_routes"],
          downstreamConsumers: ["route list"],
          freshnessPolicy: { cadence: "release_month" },
          lifecycle: { status: "expected" },
          status: "complete",
          checks: [
            {
              checkId: "rows",
              label: "Rows",
              type: "table_row_count",
              status: "complete",
              tableName: "local_route_catalog",
              path: null,
              expectedCount: 1,
              observedCount: 1,
              missingCount: 0,
              observedShare: 1,
              sampleObserved: ["B41"],
              sampleMissing: [],
              samplePartial: [],
              reasons: [],
            },
          ],
          reasons: [],
          gapClass: "none",
          gapClasses: ["none"],
          rootCauses: [],
        },
      ],
      downstreamBlockers: [],
      nextActions: ["No derived data-product completeness blockers found for the audited scope."],
    };

    expect(parseDataProductCompletenessArtifact(artifact)).toEqual(artifact);
    expect(() =>
      parseDataProductCompletenessArtifact({
        ...artifact,
        releaseMonth: "March 2026",
      }),
    ).toThrow();
  });

  test("classifies completeness gaps and dependency root causes", () => {
    const manifest = parseDataProductManifest({
      version: 1,
      products: [
        {
          id: "local_route_segment_speed_history",
          label: "Segment speed history",
          kind: "local_table",
          owner: "test",
          grain: "route x month",
          producerCommand: "test speed",
          expectedUniverse: {
            description: "speed history",
            routes: "speed_source_routes",
            months: "history_window",
          },
          requiredInputs: ["source_manifest:bus_speeds"],
          downstreamConsumers: ["speed score vectors"],
          freshnessPolicy: { cadence: "historical_window" },
          checks: [
            {
              id: "monthly",
              label: "Monthly",
              type: "month_table_coverage",
              tableName: "local_route_segment_speed",
              monthColumn: "month",
              expectedMonths: "history_window",
            },
          ],
        },
        {
          id: "speed_vectors",
          label: "Speed vectors",
          kind: "score_vector",
          owner: "test",
          grain: "route x month",
          producerCommand: "test vectors",
          expectedUniverse: {
            description: "speed vectors",
            routes: "speed_source_routes",
            months: "history_window",
          },
          requiredInputs: ["local_route_segment_speed"],
          downstreamConsumers: ["detectors"],
          freshnessPolicy: { cadence: "historical_window" },
          checks: [
            {
              id: "artifact",
              label: "Artifact",
              type: "file_artifact",
              pathTemplate: "{artifactRoot}/scores.json",
            },
          ],
        },
      ],
    });
    const speedProduct = manifest.products[0];
    const vectorProduct = manifest.products[1];
    expect(speedProduct).toBeDefined();
    expect(vectorProduct).toBeDefined();
    if (speedProduct === undefined || vectorProduct === undefined)
      throw new Error("fixture broken");

    const missingSpeedCheck: DataProductCheckAudit = {
      checkId: "monthly",
      label: "Monthly",
      type: "month_table_coverage",
      status: "partial",
      tableName: "local_route_segment_speed",
      path: null,
      expectedCount: 3,
      observedCount: 2,
      missingCount: 1,
      observedShare: 2 / 3,
      sampleObserved: ["2026-01", "2026-02"],
      sampleMissing: ["2026-03"],
      samplePartial: [],
      reasons: ["missing_month:2026-03"],
    };
    const missingVectorCheck: DataProductCheckAudit = {
      checkId: "artifact",
      label: "Artifact",
      type: "file_artifact",
      status: "missing",
      tableName: null,
      path: "/tmp/scores.json",
      expectedCount: 1,
      observedCount: 0,
      missingCount: 1,
      observedShare: 0,
      sampleObserved: [],
      sampleMissing: ["/tmp/scores.json"],
      samplePartial: [],
      reasons: ["artifact_missing"],
    };

    const baseProducts: DataProductCompletenessProductAuditBase[] = [
      {
        productId: speedProduct.id,
        label: speedProduct.label,
        kind: speedProduct.kind,
        owner: speedProduct.owner,
        grain: speedProduct.grain,
        producerCommand: speedProduct.producerCommand,
        expectedUniverse: speedProduct.expectedUniverse,
        requiredInputs: speedProduct.requiredInputs,
        downstreamConsumers: speedProduct.downstreamConsumers,
        freshnessPolicy: speedProduct.freshnessPolicy,
        lifecycle: speedProduct.lifecycle,
        status: dataProductStatus(speedProduct, [missingSpeedCheck]),
        checks: [missingSpeedCheck],
        reasons: dataProductReasons(speedProduct, [missingSpeedCheck]),
      },
      {
        productId: vectorProduct.id,
        label: vectorProduct.label,
        kind: vectorProduct.kind,
        owner: vectorProduct.owner,
        grain: vectorProduct.grain,
        producerCommand: vectorProduct.producerCommand,
        expectedUniverse: vectorProduct.expectedUniverse,
        requiredInputs: vectorProduct.requiredInputs,
        downstreamConsumers: vectorProduct.downstreamConsumers,
        freshnessPolicy: vectorProduct.freshnessPolicy,
        lifecycle: vectorProduct.lifecycle,
        status: dataProductStatus(vectorProduct, [missingVectorCheck]),
        checks: [missingVectorCheck],
        reasons: dataProductReasons(vectorProduct, [missingVectorCheck]),
      },
    ];

    const products = classifyDataProductCompleteness({
      products: baseProducts,
      releaseMonth: "2026-03",
      routeUniverses: {
        route_catalog: { size: 1 },
        coverage_source_routes: { size: 1 },
        schedule_source_routes: { size: 1 },
        speed_source_routes: { size: 0 },
        historical_speed_source_routes: { size: 1 },
        ridership_source_routes: { size: 0 },
        speed_ridership_source_routes: { size: 0 },
        observed_headway_routes: { size: 0 },
        observed_reliability_routes: { size: 0 },
        ewt_eligible_routes: { size: 0 },
        public_visible_routes: { size: 0 },
      },
    });

    const speed = products.find(
      (product) => product.productId === "local_route_segment_speed_history",
    );
    const vectors = products.find((product) => product.productId === "speed_vectors");

    expect(speed?.gapClass).toBe("upstream_blocked");
    expect(speed?.rootCauses[0]?.reasons).toContain("release_month_source_unavailable:2026-03");
    expect(vectors?.gapClass).toBe("derived_from_upstream_blocked");
    expect(vectors?.rootCauses.map((rootCause) => rootCause.productId)).toContain(
      "local_route_segment_speed_history",
    );
    expect(dataProductStatusCounts(products).partialProductCount).toBe(1);
    expect(dataProductStatusCounts(products).missingProductCount).toBe(1);
    expect(dataProductGapClassCounts(products).upstream_blocked).toBe(1);
    expect(dataProductCoverageSummary(products).upstreamBlocked.count).toBe(2);
  });

  test("preserves explicit source-absent lifecycle gaps", () => {
    const manifest = parseDataProductManifest({
      version: 1,
      products: [
        {
          id: "historical_schedule_for_absent_route",
          label: "Historical schedule for absent route",
          kind: "local_table",
          owner: "test",
          grain: "source year x route",
          producerCommand: "test schedules",
          expectedUniverse: {
            description: "A route/source-year pair that the upstream archive explicitly lacks.",
            routes: "route_catalog",
            months: "history_window",
          },
          requiredInputs: ["source_manifest:historical_gtfs"],
          downstreamConsumers: ["schedule denominator"],
          freshnessPolicy: { cadence: "historical_window" },
          lifecycle: {
            status: "blocked",
            gapClass: "source_absent",
            reason: "upstream archive has no release for this route/source year",
          },
          checks: [
            {
              id: "rows",
              label: "Rows",
              type: "table_row_count",
              tableName: "fixture_rows",
              minRows: 1,
            },
          ],
        },
      ],
    });
    const product = manifest.products[0];
    if (product === undefined) throw new Error("fixture broken");

    const products = classifyDataProductCompleteness({
      products: [
        {
          productId: product.id,
          label: product.label,
          kind: product.kind,
          owner: product.owner,
          grain: product.grain,
          producerCommand: product.producerCommand,
          expectedUniverse: product.expectedUniverse,
          requiredInputs: product.requiredInputs,
          downstreamConsumers: product.downstreamConsumers,
          freshnessPolicy: product.freshnessPolicy,
          lifecycle: product.lifecycle,
          status: "blocked",
          checks: [],
          reasons: ["fixture_missing"],
        },
      ],
      releaseMonth: "2026-03",
      routeUniverses: {
        route_catalog: { size: 1 },
        coverage_source_routes: { size: 1 },
        schedule_source_routes: { size: 1 },
        speed_source_routes: { size: 1 },
        historical_speed_source_routes: { size: 1 },
        ridership_source_routes: { size: 1 },
        speed_ridership_source_routes: { size: 1 },
        observed_headway_routes: { size: 1 },
        observed_reliability_routes: { size: 1 },
        ewt_eligible_routes: { size: 1 },
        public_visible_routes: { size: 1 },
      },
    });

    expect(products[0]?.gapClass).toBe("source_absent");
    expect(dataProductGapClassCounts(products).source_absent).toBe(1);
    expect(dataProductCoverageSummary(products).sourceAbsent.count).toBe(1);
    expect(dataProductCoverageSummary(products).upstreamBlocked.count).toBe(1);
  });

  test("parses score-vector artifact route coverage semantics", () => {
    const parsed = dataProductScoreVectorRouteIds(
      {
        releaseMonth: "2026-02",
        scoreVectors: {
          releaseMonth: [
            { routeId: "m1", month: "2026-03", runId: "run-1" },
            { routeId: "M1", month: "2026-03", runId: "run-2" },
            { routeId: "Q1", month: "2026-01", runId: "run-1" },
          ],
        },
      },
      { releaseMonth: "2026-03", runId: "run-1" },
    );

    expect([...parsed.routes].sort()).toEqual(["M1", "Q1"]);
    expect(parsed.duplicateRoutes).toEqual(["M1"]);
    expect(parsed.wrongMonthRoutes).toEqual(["Q1:2026-01", "artifact:2026-02"]);
    expect(parsed.wrongRunRoutes).toEqual(["M1:run-2"]);
  });

  test("classifies JSON artifact semantic reasons", () => {
    const baseCheck = {
      id: "artifact",
      label: "Artifact",
      type: "json_artifact",
      pathTemplate: "/tmp/artifact.json",
      validateReleaseMonth: true,
      validateRunId: true,
      requiredJsonValues: [{ path: "summary.status", equals: "pass" }],
    } as const;

    expect(
      dataProductJsonSemanticReasons({
        value: {
          releaseMonth: "2026-02",
          runId: "wrong-run",
          summary: { status: "warn" },
        },
        check: baseCheck,
        releaseMonth: "2026-03",
        runId: "run-1",
      }),
    ).toEqual([
      "release_month_mismatch:2026-02",
      "run_id_mismatch:wrong-run",
      "json_value_mismatch:summary.status",
    ]);

    expect(
      dataProductJsonSemanticReasons({
        value: {
          summary: {
            publishableTotal: 0,
            recordsWithoutReview: ["record-1"],
            dispositionVsRecordKindConflicts: ["record-2"],
          },
        },
        check: { ...baseCheck, semantic: "tier2_publishable_ready" },
        releaseMonth: "2026-03",
        runId: "run-1",
      }),
    ).toContain("tier2_publishable_total_zero");

    expect(
      dataProductJsonSemanticReasons({
        value: {
          summary: { trueNegative: 0, falsePositive: 0, falseNegative: 0 },
          expectations: [{ shouldFlag: true }],
          falseNegativeDiscoveryScopes: [],
        },
        check: { ...baseCheck, semantic: "detector_gold_set_quality" },
        releaseMonth: "2026-03",
        runId: "run-1",
      }),
    ).toEqual(
      expect.arrayContaining([
        "detector_gold_set_has_no_negative_labels",
        "detector_gold_set_has_no_false_negative_pool",
      ]),
    );
  });
});
