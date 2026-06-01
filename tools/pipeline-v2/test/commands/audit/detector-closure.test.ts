import { describe, expect, test } from "bun:test";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import {
  analysisDependencyClosureMarkdownPath,
  analysisDependencyClosurePath,
  buildAnalysisDependencyClosure,
  renderAnalysisDependencyClosureMarkdown,
} from "../../../src/commands/audit/detector-closure.ts";

const PATHS = {
  dataProductCompleteness: "data-product-completeness.json",
  detectorReadiness: "readiness.json",
  detectorCorpusGrain: "grain-audit.json",
  reviewPacketCoverage: "review-packet-coverage.json",
  detectorEvaluation: "detector-evaluation.json",
};

function detector(detectorId: string) {
  const found = listAnalyticsDetectors().find((candidate) => candidate.detectorId === detectorId);
  if (found === undefined) throw new Error(`Missing detector ${detectorId}`);
  return found;
}

function productCompleteness(tier2Status: "partial" | "blocked") {
  return {
    products: [
      { productId: "intervention_panel_artifact", status: "complete", reasons: [] },
      {
        productId: "local_route_intervention_comparison_history",
        status: "complete",
        reasons: [],
      },
      { productId: "local_route_month_trends_history", status: "complete", reasons: [] },
      {
        productId: "local_route_observed_reliability_summary_release",
        status: "complete",
        reasons: [],
      },
      {
        productId: "tier2_structured_intervention_extraction_full_corpus",
        status: tier2Status,
        reasons: ["fixture_tier2_structured_extraction_not_publishable"],
      },
      {
        productId: "applied_research_segment_daypart_panel",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_pulse_candidate_set",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_pulse_event_overlap",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_event_effect_contrast",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_mechanism_corroboration",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_event_family_effect_panel",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      {
        productId: "applied_research_event_family_response_drift_study",
        status: "blocked",
        reasons: ["planned_builder_not_implemented"],
      },
      { productId: "segment_daypart_history_artifact", status: "complete", reasons: [] },
    ],
  };
}

function buildFixture(tier2Status: "partial" | "blocked") {
  return buildAnalysisDependencyClosure({
    detectors: [detector("intervention_event_study")],
    releaseMonth: "2026-03",
    historyStartMonth: "2023-04",
    runId: "bus-observatory-2026-03",
    generatedAt: "2026-06-01T00:00:00.000Z",
    artifactPath: "/tmp/detector-closure.json",
    markdownPath: "/tmp/detector-closure.md",
    inputArtifacts: PATHS,
    dataProductCompleteness: productCompleteness(tier2Status),
    detectorReadiness: {
      detectors: [{ detectorId: "intervention_event_study", status: "ready" }],
    },
    detectorCorpusGrain: {
      detectors: [
        {
          detectorId: "intervention_event_study",
          releaseChecks: { releaseGate: { status: "pass", reason: "ok" } },
          featureGrainAudits: [
            {
              products: [
                { productId: "intervention_panel_artifact" },
                { productId: "local_route_intervention_comparison_history" },
              ],
            },
            {
              products: [
                { productId: "local_route_month_trends_history" },
                { productId: "local_route_observed_reliability_summary_release" },
              ],
            },
          ],
        },
      ],
    },
    reviewPacketCoverage: {
      detectors: [
        {
          detectorId: "intervention_event_study",
          status: "complete",
          candidateCount: 1,
          packetCount: 1,
          missingPacketCount: 0,
        },
      ],
    },
    detectorEvaluation: {
      detectorScorecards: [
        {
          detectorId: "intervention_event_study",
          gatedScore: 900,
          recommendation: "keep_current",
        },
      ],
    },
  });
}

describe("analysis dependency closure audit", () => {
  test("ties intervention event-study closure to Tier 2 structured extraction", () => {
    const partial = buildFixture("partial");
    const eventStudy = partial.analysisUnits.find(
      (unit) => unit.analysisId === "intervention_event_study",
    );
    expect(eventStudy?.status).toBe("partial");
    expect(eventStudy?.dependencies).toContainEqual(
      expect.objectContaining({
        dependencyId: "tier2_structured_intervention_extraction_full_corpus",
        kind: "source",
        status: "partial",
      }),
    );

    const blocked = buildFixture("blocked");
    expect(
      blocked.analysisUnits.find((unit) => unit.analysisId === "intervention_event_study")?.status,
    ).toBe("blocked");
  });

  test("includes generalized planned research units with honest blocked statuses", () => {
    const artifact = buildFixture("partial");
    expect(
      artifact.analysisUnits.find((unit) => unit.analysisId === "causal_event_study_workbench")
        ?.analysisKind,
    ).toBe("causal_study");
    expect(
      artifact.analysisUnits.find(
        (unit) => unit.analysisId === "continuous_travel_time_forecasting",
      )?.analysisKind,
    ).toBe("forecasting");
    expect(
      artifact.analysisUnits.find((unit) => unit.analysisId === "event_family_response_drift")
        ?.analysisKind,
    ).toBe("response_drift_study");
    expect(artifact.summary.blockedUnitCount).toBeGreaterThanOrEqual(3);

    const markdown = renderAnalysisDependencyClosureMarkdown(artifact);
    expect(markdown).toContain("# Analysis Dependency Closure");
    expect(markdown).toContain("event_family_response_drift");
  });

  test("uses the detector closure artifact paths", () => {
    expect(analysisDependencyClosurePath("/artifacts", "2023-04", "2026-03")).toBe(
      "/artifacts/detector-closure/2023-04_to_2026-03/2026-03/detector-closure.json",
    );
    expect(analysisDependencyClosureMarkdownPath("/artifacts", "2023-04", "2026-03")).toBe(
      "/artifacts/detector-closure/2023-04_to_2026-03/2026-03/detector-closure.md",
    );
  });
});
