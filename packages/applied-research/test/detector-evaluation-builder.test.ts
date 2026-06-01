import { describe, expect, test } from "bun:test";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import { buildDetectorEvaluationArtifact } from "../src/evaluation";

describe("detector evaluation artifact builder", () => {
  test("builds scorecards from review decisions, labels, and queue artifacts", () => {
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
        detectors: [{ detectorId: "observed_reliability", status: "ready" }],
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
          confirmedNegativeCount: 1,
          holdoutNegativeCount: 1,
          missingDataScopeCount: 0,
        },
        labels: [
          {
            labelId: "observed_reliability:2026-03:route:M16",
            detectorId: "observed_reliability",
            month: "2026-03",
            scopeKind: "route",
            scopeId: "M16",
            label: "confirmed_negative",
            set: "holdout",
          },
        ],
        missingDataScopes: [],
      },
      grainAudit: null,
    });

    expect(artifact.summary.detectorCount).toBe(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(artifact.evaluationSets.confirmedPositiveCount).toBe(1);
    expect(artifact.evaluationSets.confirmedNegativeCount).toBe(1);
    expect(artifact.evaluationSets.nearMissCount).toBe(1);
    expect(artifact.evaluationSets.holdoutStatus).toBe("holdout_available");

    const observed = artifact.detectorScorecards.find(
      (scorecard) => scorecard.detectorId === "observed_reliability",
    );
    expect(observed?.flags).not.toContain("positive_only_gold_set");
    expect(observed?.flags).not.toContain("score_vector_unavailable");
  });
});
