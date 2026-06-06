import { describe, expect, test } from "bun:test";
import { dataProductCompletenessPath } from "../src/artifacts";
import {
  classifyDataProductCompleteness,
  DATA_PRODUCT_MANIFEST,
  type DataProductCheckAudit,
  type DataProductCompletenessProductAuditBase,
  dataProductCoverageSummary,
  dataProductGapClassCounts,
  dataProductJsonSemanticReasons,
  dataProductReasons,
  dataProductScoreVectorRouteIds,
  dataProductStatus,
  dataProductStatusCounts,
  parseDataProductManifest,
  parseDataProductManifestText,
} from "../src/data-products";

describe("data product registry", () => {
  test("publishes the release data-product manifest from applied research", () => {
    const productIds = new Set(DATA_PRODUCT_MANIFEST.products.map((product) => product.id));

    expect(DATA_PRODUCT_MANIFEST.version).toBe(1);
    expect(DATA_PRODUCT_MANIFEST.products.length).toBeGreaterThan(12);
    expect(productIds.has("local_route_catalog_release")).toBe(true);
    expect(productIds.has("ewt_route_month_score_vectors")).toBe(true);
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
