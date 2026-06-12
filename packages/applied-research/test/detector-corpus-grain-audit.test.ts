import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildDetectorCorpusGrainAudit,
  type DetectorCorpusDataProductManifest,
  renderDetectorCorpusGrainAuditMarkdown,
} from "../src/evaluation";
import { loadDetectorCorpusGrainLocalDbRows } from "../src/local-db";

function createDb(): Database {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE local_finding_candidate (
      detector_id TEXT NOT NULL,
      month TEXT NOT NULL
    );
    CREATE TABLE local_finding_coverage_audit (
      detector_id TEXT NOT NULL,
      month TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reason_code TEXT
    );
  `);
  sqlite
    .query("INSERT INTO local_finding_candidate (detector_id, month) VALUES (?, ?)")
    .run("persistent_speed_hotspot", "2026-03");
  const insertCoverage = sqlite.query(
    "INSERT INTO local_finding_coverage_audit (detector_id, month, outcome, reason_code) VALUES (?, ?, ?, ?)",
  );
  insertCoverage.run("persistent_speed_hotspot", "2026-03", "hit", null);
  insertCoverage.run("persistent_speed_hotspot", "2026-03", "clean_no_hit", null);
  insertCoverage.run(
    "persistent_speed_hotspot",
    "2026-03",
    "skipped_missing_input",
    "missing_speed",
  );
  insertCoverage.run("observed_reliability", "2026-03", "clean_no_hit", null);
  insertCoverage.run("observed_reliability", "2026-03", "source_lag", "source_lag");
  return sqlite;
}

const MANIFEST: DetectorCorpusDataProductManifest = {
  version: 1,
  products: [
    {
      id: "local_route_segment_speed_history",
      label: "Route segment speed history",
      kind: "local_table",
      grain: "route x segment x month",
      lifecycle: { status: "expected" },
    },
    {
      id: "studio_route_hotspot_summaries",
      label: "Studio route hotspot summaries",
      kind: "serving_projection",
      grain: "route x release month",
      lifecycle: { status: "expected" },
    },
    {
      id: "local_route_month_coverage_release",
      label: "Route-month coverage",
      kind: "local_table",
      grain: "route x release month",
      lifecycle: { status: "expected" },
    },
    {
      id: "local_route_month_trends_history",
      label: "Route monthly trends",
      kind: "local_table",
      grain: "route x month",
      lifecycle: { status: "expected" },
    },
    {
      id: "analytics_corpus_profile_artifact",
      label: "Analytics corpus profile",
      kind: "artifact_family",
      grain: "release",
      lifecycle: { status: "expected" },
    },
    {
      id: "local_bus_customer_journey_metrics_history",
      label: "Bus customer journey metrics history",
      kind: "local_table",
      grain: "route x month x trip type x period",
      lifecycle: { status: "expected" },
    },
    {
      id: "route_treatment_summary_artifact",
      label: "Route treatment summary",
      kind: "artifact_family",
      grain: "route x month x treatment source/segment/source-gap summary",
      lifecycle: { status: "expected" },
    },
  ],
};

const PRODUCT_COMPLETENESS = {
  products: [
    { productId: "local_route_segment_speed_history", status: "complete", reasons: [] },
    { productId: "studio_route_hotspot_summaries", status: "complete", reasons: [] },
    { productId: "local_route_month_coverage_release", status: "complete", reasons: [] },
    { productId: "local_route_month_trends_history", status: "complete", reasons: [] },
    {
      productId: "analytics_corpus_profile_artifact",
      status: "missing",
      reasons: ["fixture_missing"],
    },
    {
      productId: "local_bus_customer_journey_metrics_history",
      status: "complete",
      reasons: [],
    },
    { productId: "route_treatment_summary_artifact", status: "complete", reasons: [] },
  ],
};

describe("detector corpus grain audit", () => {
  test("joins detector grains to data products and release coverage rows", () => {
    const sqlite = createDb();
    try {
      const localRows = loadDetectorCorpusGrainLocalDbRows({
        sqlite,
        releaseMonth: "2026-03",
      });
      const audit = buildDetectorCorpusGrainAudit({
        candidateCounts: localRows.candidateCounts,
        coverageCounts: localRows.coverageCounts,
        manifest: MANIFEST,
        productCompleteness: PRODUCT_COMPLETENESS,
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        runId: "test-run",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: "/tmp/grain-audit.json",
        markdownPath: "/tmp/grain-audit.md",
        dataProductCompletenessPath: "/tmp/completeness.json",
        routeMonthShadowAuditPath: "/tmp/route-month-shadow.json",
        routeMonthShadowAudit: {
          artifactKind: "route_month_false_negative_shadow_audit",
          schemaVersion: 1,
          generatedAt: "2026-06-01T00:00:00.000Z",
          releaseMonth: "2026-03",
          dbPath: null,
          artifactPath: "/tmp/route-month-shadow.json",
          baselineDetectorIds: ["multi_month_speed_peer"],
          richerGrainDetectorIds: ["speed_pace_hotspot"],
          summary: {
            baselineDetectorCount: 1,
            richerGrainDetectorCount: 1,
            routeMonthCleanNoHitRouteCount: 2,
            hiddenRouteCount: 1,
            hiddenCandidateCount: 3,
            maxHiddenDetectorScore: 0.91,
          },
          baselineDetectors: [
            {
              detectorId: "multi_month_speed_peer",
              cleanNoHitRouteCount: 2,
              hiddenRouteCount: 1,
              hiddenCandidateCount: 3,
              hiddenCandidateDetectorCounts: { speed_pace_hotspot: 3 },
              maxHiddenDetectorScore: 0.91,
              hiddenRoutes: [],
            },
          ],
        },
        detectorSpecificScoreVectorIds: new Set(["speed_pace_hotspot"]),
      });

      expect(audit.artifactKind).toBe("detector_corpus_grain_audit");
      expect(audit.summary.detectorCount).toBeGreaterThan(10);
      expect(audit.summary.detectorsUsingScreeningFeatureCount).toBeGreaterThan(0);
      expect(audit.summary.highGranularityRiskDetectorCount).toBeGreaterThan(0);
      expect(audit.summary.grainPolicyWarningDetectorCount).toBeGreaterThan(0);
      expect(audit.summary.releaseGateWarnDetectorCount).toBeGreaterThan(0);
      expect(audit.summary.falseNegativeShadowAuditRequiredDetectorCount).toBeGreaterThan(0);

      const persistent = audit.detectors.find(
        (detector) => detector.detectorId === "persistent_speed_hotspot",
      );
      expect(persistent?.featureGrains).toEqual(["route_segment_month"]);
      expect(
        persistent?.featureGrainAudits[0]?.products.map((product) => product.productId),
      ).toEqual(["local_route_segment_speed_history", "studio_route_hotspot_summaries"]);
      expect(persistent?.coverage.expectedUniverseCount).toBe(3);
      expect(persistent?.coverage.materializedUniverseCount).toBe(2);
      expect(persistent?.coverage.candidateCount).toBe(1);
      expect(persistent?.coverage.missingDataCount).toBe(1);
      expect(persistent?.coverage.missingReasonCounts).toEqual({ missing_speed: 1 });
      expect(persistent?.releaseChecks.routeMonthPolicy.status).toBe("pass");
      expect(persistent?.releaseChecks.executionCoverage.status).toBe("pass");
      expect(persistent?.releaseChecks.falseNegativeShadowAudit.required).toBe(true);

      const multiMonth = audit.detectors.find(
        (detector) => detector.detectorId === "multi_month_speed_peer",
      );
      expect(multiMonth?.releaseChecks.routeMonthPolicy.classification).toBe(
        "route_level_allowed_with_shadow_audit",
      );
      expect(multiMonth?.releaseChecks.falseNegativeShadowAudit.required).toBe(false);
      expect(multiMonth?.releaseChecks.falseNegativeShadowAudit.status).toBe("pass");
      expect(multiMonth?.releaseChecks.falseNegativeShadowAudit.reason).toContain(
        "3 hidden richer-grain candidate",
      );

      const customerJourney = audit.featureGrains.find(
        (feature) => feature.featureGrain === "customer_journey",
      );
      expect(customerJourney).toMatchObject({
        kind: "detector_native",
        status: "complete",
      });
      expect(customerJourney?.products.map((product) => product.productId)).toEqual([
        "local_bus_customer_journey_metrics_history",
      ]);

      const treatmentScopeGap = audit.detectors.find(
        (detector) => detector.detectorId === "treatment_scope_gap",
      );
      expect(treatmentScopeGap?.missingFeatureGrains).not.toContain("route_treatment_summary");
      expect(treatmentScopeGap?.missingFeatureGrains).not.toContain(
        "route_segment_treatment_summary",
      );
      expect(
        treatmentScopeGap?.featureGrainAudits
          .flatMap((feature) => feature.products.map((product) => product.productId))
          .filter((productId, index, productIds) => productIds.indexOf(productId) === index),
      ).toContain("route_treatment_summary_artifact");

      const sourceGap = audit.detectors.find((detector) => detector.detectorId === "source_gap");
      expect(sourceGap?.missingFeatureGrains).not.toContain("route_treatment_source_gap");

      const interventionUnderperformance = audit.detectors.find(
        (detector) => detector.detectorId === "intervention_underperformance",
      );
      expect(interventionUnderperformance?.releaseChecks.routeMonthPolicy.classification).toBe(
        "replace_primary_route_month_grain",
      );

      const routeMonthFeature = audit.featureGrains.find(
        (feature) => feature.featureGrain === "route_month",
      );
      expect(routeMonthFeature?.kind).toBe("screening");
      expect(routeMonthFeature?.granularityRisk).toBe("high");
      expect(routeMonthFeature?.reasons).toContain(
        "screening_grain_collapses_detector_relevant_axes",
      );

      const speedPace = audit.detectors.find(
        (detector) => detector.detectorId === "speed_pace_hotspot",
      );
      expect(speedPace?.releaseChecks.scoreVectorExpectation.status).toBe("pass");

      const markdown = renderDetectorCorpusGrainAuditMarkdown(audit);
      expect(markdown).toContain("# Detector Corpus Grain Audit");
      expect(markdown).toContain("## Release Checks");
      expect(markdown).toContain("persistent_speed_hotspot");
    } finally {
      sqlite.close();
    }
  });
});
