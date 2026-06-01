import { describe, expect, test } from "bun:test";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import { buildDetectorEvaluationArtifact } from "@bp/applied-research/evaluation";
import {
  detectorEvaluationArtifactPath,
  detectorEvaluationMarkdownPath,
} from "../../../src/commands/evaluate/detectors.ts";

describe("evaluate detectors", () => {
  test("emits scorecards for every registered detector and flags positive-only labels", () => {
    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      generatedAt: "2026-06-01T00:00:00.000Z",
      runId: "test-run",
      inputArtifacts: {
        reviewDecisions: "data/artifacts/findings/2026-03/review-decisions.json",
        promotedFindings: "data/artifacts/findings/2026-03/promoted-findings.json",
        reviewPackets: "data/artifacts/findings/2026-03/review-packets.json",
        reviewPacketCoverage: "data/artifacts/findings/2026-03/review-packet-coverage.json",
        reviewQueue: "data/artifacts/findings/2026-03/review-queue.json",
        promotionQueue: "data/artifacts/findings/2026-03/promotion-queue.json",
        goldSetEvaluation: "data/artifacts/findings/2026-03/gold-set-evaluation.json",
        readiness: "data/artifacts/analytics-detector-readiness/2023-04_to_2026-03/readiness.json",
        detectorCoverageAudit: "data/artifacts/findings/2026-03/detector-coverage-audit.json",
        ewtScoreVectors:
          "data/artifacts/analytics-ewt-score-vectors/2023-04_to_2026-03/2026-03/ewt-route-month-score-vectors.json",
        speedPaceScoreVectors:
          "data/artifacts/speed-pace-score-vectors/2023-04_to_2026-03/2026-03/speed-pace-score-vectors.json",
        runtimeTrendScoreVectors:
          "data/artifacts/runtime-trend-score-vectors/2023-04_to_2026-03/2026-03/runtime-trend-score-vectors.json",
        detectorScoreVectors:
          "data/artifacts/detector-score-vectors/2023-04_to_2026-03/2026-03/detector-score-vectors.json",
        evaluationLabels:
          "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation-labels.json",
        grainAudit:
          "data/artifacts/detector-corpus-grain/2023-04_to_2026-03/2026-03/grain-audit.json",
      },
      reviewDecisions: {
        decisions: [
          {
            candidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
            decision: "approve_with_revisions",
          },
        ],
      },
      promotedFindings: {
        findings: [
          {
            sourceCandidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
          },
        ],
      },
      reviewPackets: null,
      reviewPacketCoverage: null,
      reviewQueue: null,
      promotionQueue: null,
      goldSetEvaluation: {
        summary: {
          truePositive: 1,
          falsePositive: 0,
          trueNegative: 0,
          falseNegative: 0,
          precision: 1,
          recall: 1,
        },
      },
      readiness: {
        detectors: [
          {
            detectorId: "observed_reliability",
            status: "ready",
          },
        ],
      },
      detectorCoverageAudit: null,
      ewtScoreVectors: null,
      speedPaceScoreVectors: null,
      runtimeTrendScoreVectors: null,
      detectorScoreVectors: null,
      evaluationLabels: null,
      grainAudit: null,
    });

    expect(artifact.artifactKind).toBe("detector_evaluation_harness");
    expect(artifact.summary.detectorCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(artifact.summary.scorecardCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(artifact.summary.positiveOnlyGoldSet).toBe(true);
    expect(artifact.summary.qualityOverclaimedDetectorCount).toBe(0);

    const observed = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "observed_reliability",
    );
    expect(observed?.flags).toContain("positive_only_gold_set");
    expect(observed?.hardGateMultiplier).toBe(0);
    expect(observed?.gatedScore).toBeNull();
    expect(observed?.recommendation).toBe("watch");

    const unlabeled = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId !== "observed_reliability",
    );
    expect(unlabeled?.flags).toContain("insufficient_labels");
    expect(unlabeled?.preGateScore).toBeNull();
    expect(unlabeled?.gatedScore).toBeNull();
  });

  test("uses queued unpromoted candidates as near-miss scopes", () => {
    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      generatedAt: "2026-06-01T00:00:00.000Z",
      runId: "test-run",
      inputArtifacts: {
        reviewDecisions: "review-decisions.json",
        promotedFindings: "promoted-findings.json",
        reviewPackets: "review-packets.json",
        reviewPacketCoverage: "review-packet-coverage.json",
        reviewQueue: "review-queue.json",
        promotionQueue: "promotion-queue.json",
        goldSetEvaluation: "gold-set-evaluation.json",
        readiness: "readiness.json",
        detectorCoverageAudit: "detector-coverage-audit.json",
        ewtScoreVectors: "ewt-route-month-score-vectors.json",
        speedPaceScoreVectors: "speed-pace-score-vectors.json",
        runtimeTrendScoreVectors: "runtime-trend-score-vectors.json",
        detectorScoreVectors: "detector-score-vectors.json",
        evaluationLabels: "detector-evaluation-labels.json",
        grainAudit: "grain-audit.json",
      },
      reviewDecisions: {
        decisions: [
          {
            candidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
            decision: "approve_with_revisions",
          },
        ],
      },
      promotedFindings: {
        findings: [
          {
            sourceCandidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
          },
        ],
      },
      reviewPackets: {
        packets: [
          {
            candidate: {
              candidateId: "c1",
              detectorId: "observed_reliability",
              routeId: "M15",
              claimText: "Route M15 has observed reliability evidence.",
            },
            packetCompleteness: {
              hasPrimaryEvidence: true,
              hasCounterEvidence: true,
              hasCoverageAudit: true,
              hasDetectorSpec: true,
              hasReviewChecklist: true,
            },
          },
        ],
      },
      reviewPacketCoverage: null,
      reviewQueue: null,
      promotionQueue: {
        candidates: [
          {
            candidate: {
              candidateId: "c1",
              detectorId: "observed_reliability",
              routeId: "M15",
            },
            readiness: "ready_for_review",
          },
          {
            candidate: {
              candidateId: "c2",
              detectorId: "observed_reliability",
              routeId: "M16",
            },
            readiness: "ready_for_review",
          },
        ],
      },
      goldSetEvaluation: null,
      readiness: {
        detectors: [
          {
            detectorId: "observed_reliability",
            status: "ready",
          },
        ],
      },
      detectorCoverageAudit: {
        detectors: [
          {
            detectorId: "observed_reliability",
            coverageCount: 2,
            outcomeCounts: {
              hit: 1,
              clean_no_hit: 1,
              skipped_missing_input: 0,
            },
          },
        ],
      },
      ewtScoreVectors: null,
      speedPaceScoreVectors: null,
      runtimeTrendScoreVectors: null,
      detectorScoreVectors: null,
      evaluationLabels: null,
      grainAudit: null,
    });

    const observed = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "observed_reliability",
    );
    expect(artifact.evaluationSets.nearMissCount).toBe(1);
    expect(observed?.flags).toContain("positive_only_gold_set");
    expect(observed?.hardGateMultiplier).toBe(0);
    expect(observed?.gatedScore).toBeNull();
    expect(
      observed?.components.find((component) => component.componentId === "evidence_quality")?.score,
    ).toBe(1000);
  });

  test("uses derived clean-no-hit labels as confirmed negatives and exposes holdout coverage", () => {
    const artifact = buildDetectorEvaluationArtifact({
      releaseMonth: "2026-03",
      historyStartMonth: "2023-04",
      generatedAt: "2026-06-01T00:00:00.000Z",
      runId: "test-run",
      inputArtifacts: {
        reviewDecisions: "review-decisions.json",
        promotedFindings: "promoted-findings.json",
        reviewPackets: "review-packets.json",
        reviewPacketCoverage: "review-packet-coverage.json",
        reviewQueue: "review-queue.json",
        promotionQueue: "promotion-queue.json",
        goldSetEvaluation: "gold-set-evaluation.json",
        readiness: "readiness.json",
        detectorCoverageAudit: "detector-coverage-audit.json",
        ewtScoreVectors: "ewt-route-month-score-vectors.json",
        speedPaceScoreVectors: "speed-pace-score-vectors.json",
        runtimeTrendScoreVectors: "runtime-trend-score-vectors.json",
        detectorScoreVectors: "detector-score-vectors.json",
        evaluationLabels: "detector-evaluation-labels.json",
        grainAudit: "grain-audit.json",
      },
      reviewDecisions: {
        decisions: [
          {
            candidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
            decision: "approve_with_revisions",
          },
        ],
      },
      promotedFindings: {
        findings: [
          {
            sourceCandidateId: "c1",
            detectorId: "observed_reliability",
            routeId: "M15",
          },
        ],
      },
      reviewPackets: null,
      reviewPacketCoverage: {
        detectors: [
          {
            detectorId: "observed_reliability",
            candidateCount: 1,
            packetCount: 1,
            status: "partial",
            packetsWithoutCoverage: 1,
          },
        ],
      },
      reviewQueue: null,
      promotionQueue: null,
      goldSetEvaluation: null,
      readiness: {
        detectors: [
          {
            detectorId: "observed_reliability",
            status: "ready",
          },
        ],
      },
      detectorCoverageAudit: null,
      ewtScoreVectors: null,
      runtimeTrendScoreVectors: null,
      speedPaceScoreVectors: {
        artifactKind: "speed_pace_hotspot_score_vectors",
        schemaVersion: 1,
        detectorId: "speed_pace_hotspot",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: null,
        artifactPath: "speed-pace-score-vectors.json",
        window: {
          startMonth: "2023-04",
          endMonth: "2026-03",
        },
        summary: {
          usableMonthCount: 24,
          totalFeatureCount: 120_000,
          totalCandidateCount: 500,
          totalSkippedCount: 1_200,
          routeCount: 300,
          releaseFeatureCount: 9_000,
          releaseCandidateCount: 30,
          releaseSkippedCount: 80,
        },
        monthly: [],
        releaseTopCandidates: [],
      },
      detectorScoreVectors: {
        detectors: [
          {
            detectorId: "observed_reliability",
            summary: {
              scopeCount: 100,
              flaggedCount: 10,
              cleanNoHitCount: 90,
              skippedCount: 0,
              monthCount: 12,
              flaggedShare: 0.1,
            },
            entries: [],
          },
        ],
      },
      evaluationLabels: {
        summary: {
          confirmedNegativeCount: 2,
          holdoutNegativeCount: 1,
          missingDataScopeCount: 1,
        },
        labels: [
          {
            labelId: "observed_reliability:2026-03:route:M16",
            detectorId: "observed_reliability",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M16",
            label: "confirmed_negative",
            set: "training",
          },
          {
            labelId: "observed_reliability:2026-03:route:M17",
            detectorId: "observed_reliability",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M17",
            label: "confirmed_negative",
            set: "holdout",
          },
        ],
        missingDataScopes: [
          {
            detectorId: "observed_reliability",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M18",
            sourceOutcome: "skipped_missing_input",
          },
        ],
      },
      grainAudit: {
        detectors: [
          {
            detectorId: "multi_month_speed_peer",
            releaseChecks: {
              routeMonthPolicy: {
                status: "warn",
                classification: "route_level_allowed_with_shadow_audit",
              },
              cleanNoHitGrain: { status: "pass" },
              scoreVectorExpectation: { status: "warn" },
              falseNegativeShadowAudit: { required: true, status: "warn" },
              releaseGate: {
                status: "warn",
                reason: "Segment/daypart shadow audit is required.",
              },
            },
          },
        ],
      },
    });

    expect(artifact.evaluationSets.confirmedPositiveCount).toBe(1);
    expect(artifact.evaluationSets.confirmedNegativeCount).toBe(2);
    expect(artifact.evaluationSets.holdoutStatus).toBe("holdout_available");
    expect(artifact.evaluationSets.missingDataScopeCount).toBe(1);
    expect(artifact.summary.positiveOnlyGoldSet).toBe(false);
    expect(artifact.summary.grainPolicyWarningDetectorCount).toBe(1);
    expect(artifact.summary.falseNegativeShadowAuditUnavailableDetectorCount).toBe(1);

    const observed = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "observed_reliability",
    );
    expect(observed?.flags).not.toContain("positive_only_gold_set");
    expect(observed?.flags).not.toContain("score_vector_unavailable");
    expect(
      artifact.packetCoverage.find((coverage) => coverage.detectorId === "observed_reliability")
        ?.status,
    ).toBe("partial");
    const speedPace = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "speed_pace_hotspot",
    );
    expect(speedPace?.flags).not.toContain("score_vector_unavailable");
    const multiMonth = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "multi_month_speed_peer",
    );
    expect(multiMonth?.flags).toContain("grain_policy_warning");
    expect(multiMonth?.flags).toContain("false_negative_shadow_audit_unavailable");
  });

  test("places default artifacts under the detector-evaluation namespace", () => {
    const jsonPath = detectorEvaluationArtifactPath("data/artifacts", "2023-04", "2026-03");
    expect(jsonPath).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json",
    );
    expect(detectorEvaluationMarkdownPath(jsonPath)).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.md",
    );
  });
});
