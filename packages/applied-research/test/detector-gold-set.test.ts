import { describe, expect, test } from "bun:test";
import { detectorGoldSetEvaluationPath } from "../src/artifacts";
import { buildDetectorGoldSetEvaluationArtifact } from "../src/evaluation";

describe("detector gold-set evaluation", () => {
  test("builds expectations, flagged scopes, and discovery scopes from release artifacts", () => {
    const artifact = buildDetectorGoldSetEvaluationArtifact({
      generatedAt: "2026-06-06T00:00:00.000Z",
      releaseMonth: "2026-03",
      reviewDecisionsArtifactPath: "findings/2026-03/review-decisions.json",
      promotedFindingsArtifactPath: "findings/2026-03/promoted-findings.json",
      promotionQueueArtifactPath: "findings/2026-03/promotion-queue.json",
      evaluationLabelsArtifactPath: "detector-evaluation/labels.json",
      artifactPath: "findings/2026-03/gold-set-evaluation.json",
      reviewDecisions: {
        decisions: [
          {
            candidateId: "cand-1",
            detectorId: "speed_pace_hotspot",
            routeId: "M15",
            decision: "approve",
          },
          {
            candidateId: "cand-2",
            detectorId: "speed_pace_hotspot",
            routeId: "M15",
            decision: "reject",
          },
        ],
      },
      promotedFindings: {
        findings: [
          {
            sourceCandidateId: "cand-1",
            detectorId: "speed_pace_hotspot",
            routeId: "M15",
          },
        ],
      },
      evaluationLabels: {
        labels: [
          {
            labelId: "neg-1",
            detectorId: "speed_pace_hotspot",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M15",
            label: "confirmed_negative",
            set: "holdout",
          },
        ],
        missingDataScopes: [
          {
            detectorId: "headway_reliability_ewt",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M31",
            sourceOutcome: "skipped_missing_input",
          },
        ],
        summary: {
          holdoutNegativeCount: 1,
          missingDataScopeCount: 1,
        },
      },
      promotionQueue: {
        candidates: [
          {
            candidate: {
              candidateId: "cand-2",
              detectorId: "speed_pace_hotspot",
              routeId: "M15",
            },
          },
          {
            candidateId: "cand-3",
            detectorId: "schedule_mismatch",
            scopeId: "M31:0:AM",
          },
        ],
      },
    });

    expect(artifact.summary).toMatchObject({
      expectationCount: 3,
      negativeExpectationCount: 2,
      flaggedScopeCount: 1,
      truePositive: 1,
      falsePositive: 0,
      trueNegative: 2,
      falseNegative: 0,
      precision: 1,
      recall: 1,
      falseNegativeDiscoveryScopeCount: 3,
    });
    expect(artifact.flaggedScopes).toEqual(["speed_pace_hotspot:M15:cand-1"]);
    expect(artifact.falseNegativeDiscoveryScopes.map((scope) => scope.source).sort()).toEqual([
      "missing_data_scope",
      "unpromoted_promotion_queue_candidate",
      "unpromoted_promotion_queue_candidate",
    ]);
  });

  test("owns the detector gold-set evaluation artifact path", () => {
    expect(
      detectorGoldSetEvaluationPath({
        artifactRoot: "/artifacts",
        releaseMonth: "2026-03",
      }),
    ).toBe("/artifacts/findings/2026-03/gold-set-evaluation.json");
  });
});
