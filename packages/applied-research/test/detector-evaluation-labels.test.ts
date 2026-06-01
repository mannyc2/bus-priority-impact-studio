import { describe, expect, test } from "bun:test";
import { buildDetectorEvaluationLabelSetArtifact } from "../src/evaluation";

describe("detector evaluation labels", () => {
  test("turns clean no-hit coverage rows into derived negatives and preserves missing-data scopes", () => {
    const artifact = buildDetectorEvaluationLabelSetArtifact({
      rows: [
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M15",
          outcome: "clean_no_hit",
          reason_code: "below_threshold",
          reason: "No finding was emitted.",
          inputs_seen_json: '{"headways":12}',
          inputs_expected_json: '{"headways":10}',
        },
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M16",
          outcome: "skipped_missing_input",
          reason_code: "low_coverage",
          reason: "No observed headways.",
          inputs_seen_json: '{"headways":0}',
          inputs_expected_json: '{"headways":10}',
        },
        {
          detector_id: "observed_reliability",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M17",
          outcome: "hit",
          reason_code: "above_threshold",
          reason: "Finding emitted.",
          inputs_seen_json: null,
          inputs_expected_json: null,
        },
        {
          detector_id: "multi_month_speed_peer",
          month: "2026-03",
          scope_kind: "route",
          scope_id: "M18",
          outcome: "clean_no_hit",
          reason_code: "below_threshold",
          reason: "No finding was emitted.",
          inputs_seen_json: null,
          inputs_expected_json: null,
        },
      ],
      releaseMonth: "2026-03",
      generatedAt: "2026-06-01T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/detector-evaluation-labels.json",
      holdoutModulo: 1,
      maxCleanNoHitPerDetector: null,
      maxMissingDataScopesPerDetector: 5000,
    });

    expect(artifact.summary.confirmedNegativeCount).toBe(2);
    expect(artifact.summary.trainingNegativeCount).toBe(2);
    expect(artifact.summary.holdoutNegativeCount).toBe(0);
    expect(artifact.summary.missingDataScopeCount).toBe(1);
    expect(artifact.summary.detectorNativeOrRouteLevelLabelCount).toBe(1);
    expect(artifact.summary.screeningGrainReviewRequiredLabelCount).toBe(1);
    const observed = artifact.labels.find((label) => label.detectorId === "observed_reliability");
    const routeMonth = artifact.labels.find(
      (label) => label.detectorId === "multi_month_speed_peer",
    );
    expect(observed?.label).toBe("confirmed_negative");
    expect(observed?.grainSafety).toBe("detector_native_or_route_level");
    expect(routeMonth?.grainSafety).toBe("screening_grain_review_required");
    expect(artifact.missingDataScopes[0]?.sourceOutcome).toBe("skipped_missing_input");
    expect(artifact.missingDataScopes[0]?.grainSafety).toBe("detector_native_or_route_level");
  });
});
