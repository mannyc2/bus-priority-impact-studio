import type { DetectorEvaluationArtifact } from "./detector-artifact";

export function detectorEvaluationMarkdownReport(artifact: DetectorEvaluationArtifact): string {
  const lines = [
    "# Detector Evaluation",
    "",
    `Release month: ${artifact.releaseMonth}`,
    `History window: ${artifact.historyWindow.startMonth} to ${artifact.historyWindow.endMonth}`,
    `Run id: ${artifact.runId}`,
    "",
    "## Summary",
    "",
    `- Detectors scored: ${artifact.summary.scorecardCount}/${artifact.summary.detectorCount}`,
    `- Portfolio pre-gate score: ${artifact.summary.portfolioPreGateScore ?? "n/a"}`,
    `- Portfolio gated score: ${artifact.summary.portfolioGatedScore ?? "n/a"}`,
    `- Positive-only gold set: ${artifact.summary.positiveOnlyGoldSet ? "yes" : "no"}`,
    `- Confirmed positives / negatives: ${artifact.evaluationSets.confirmedPositiveCount} / ${artifact.evaluationSets.confirmedNegativeCount}`,
    `- Holdout status: ${artifact.evaluationSets.holdoutStatus}`,
    `- Near-miss scopes: ${artifact.evaluationSets.nearMissCount}`,
    `- Missing-data scopes: ${artifact.evaluationSets.missingDataScopeCount}`,
    `- Packet-covered detectors: ${
      artifact.packetCoverage.filter((coverage) => coverage.status === "available").length
    }/${artifact.packetCoverage.length}`,
    `- Claim-discipline violations: ${artifact.claimsDiscipline.violationCount}`,
    `- Insufficient-label detectors: ${artifact.summary.insufficientLabelDetectorCount}`,
    `- Hard-gate blocked detectors: ${artifact.summary.hardGateBlockedDetectorCount}`,
    `- Grain-policy warning detectors: ${artifact.summary.grainPolicyWarningDetectorCount}`,
    `- Clean no-hit grain review required: ${artifact.summary.cleanNoHitGrainReviewRequiredDetectorCount}`,
    `- False-negative shadow audits unavailable: ${artifact.summary.falseNegativeShadowAuditUnavailableDetectorCount}`,
    "",
    "## Detector Scorecards",
    "",
    "| Detector | Pre-gate | Gated | Recommendation | Flags |",
    "|---|---:|---:|---|---|",
  ];

  for (const scorecard of artifact.detectorScorecards) {
    lines.push(
      `| ${scorecard.detectorId} | ${scorecard.preGateScore ?? "n/a"} | ${
        scorecard.gatedScore ?? "n/a"
      } | ${scorecard.recommendation} | ${scorecard.flags.join(", ") || "none"} |`,
    );
  }

  lines.push("", "## Residual Risks", "");
  for (const risk of artifact.residualRisks) {
    lines.push(`- ${risk}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}
