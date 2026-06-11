import { describe, expect, test } from "bun:test";
import {
  detectorEvaluationArtifactPath,
  detectorEvaluationInputArtifactPaths,
  detectorEvaluationMarkdownPath,
} from "../src/artifacts";

describe("detector evaluation artifact paths", () => {
  test("owns output and input path conventions for detector evaluation", () => {
    const input = {
      artifactRoot: "data/artifacts",
      historyStartMonth: "2023-04",
      releaseMonth: "2026-03",
    };
    const jsonPath = detectorEvaluationArtifactPath(input);

    expect(jsonPath).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.json",
    );
    expect(detectorEvaluationMarkdownPath(jsonPath)).toBe(
      "data/artifacts/detector-evaluation/2023-04_to_2026-03/2026-03/detector-evaluation.md",
    );
    expect(detectorEvaluationInputArtifactPaths(input)).toEqual({
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
      segmentSpeedResiduals:
        "data/artifacts/analytics-models/segment-speed-residuals-v1/2023-04_to_2026-03/2026-03/segment-speed-residuals.json",
      segmentDaypartResiduals:
        "data/artifacts/analytics-models/segment-daypart-residuals-v1/2023-04_to_2026-03/2026-03/segment-daypart-residuals.json",
      routePeerResiduals:
        "data/artifacts/analytics-models/route-peer-residuals-v1/2023-04_to_2026-03/2026-03/route-peer-residuals.json",
      reliabilityExposurePanel:
        "data/artifacts/analytics-models/reliability-exposure-panel-v1/2026-03/bus-observatory-2026-03/reliability-exposure-panel.json",
      interventionScopeFit:
        "data/artifacts/analytics-models/intervention-scope-fit-v1/2026-03/intervention-scope-fit.json",
      sourceGapModel: "data/artifacts/analytics-models/source-gap-model-v1/2026-03/source-gap-model.json",
      treatmentEventPanel:
        "data/artifacts/analytics-models/treatment-event-panel-v1/2023-04_to_2026-03/2026-03/treatment-event-panel.json",
      pulseFingerprint:
        "data/artifacts/analytics-models/pulse-fingerprint-v1/2023-04_to_2026-03/2026-03/pulse-fingerprint.json",
      decouplingQuadrants:
        "data/artifacts/analytics-models/decoupling-quadrants-v1/2023-04_to_2026-03/2026-03/decoupling-quadrants.json",
    });
  });
});
