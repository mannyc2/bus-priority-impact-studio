import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildDetectorCorpusGrainAudit,
  detectorCorpusGrainAuditMarkdownPath,
  detectorCorpusGrainAuditPath,
  renderDetectorCorpusGrainAuditMarkdown,
} from "../../../src/commands/audit/detector-corpus-grain.ts";

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
  ],
};

describe("detector corpus grain audit", () => {
  test("joins detector grains to data products and release coverage rows", () => {
    const sqlite = createDb();
    try {
      const audit = buildDetectorCorpusGrainAudit({
        sqlite,
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

  test("uses the phase-0 artifact paths from the audit plan", () => {
    expect(detectorCorpusGrainAuditPath("/artifacts", "2023-04", "2026-03")).toBe(
      "/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.json",
    );
    expect(detectorCorpusGrainAuditMarkdownPath("/artifacts", "2023-04", "2026-03")).toBe(
      "/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.md",
    );
  });
});
