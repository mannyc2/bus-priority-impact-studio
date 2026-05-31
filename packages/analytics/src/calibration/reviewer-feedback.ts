export type ReviewerDecisionSummaryInput = {
  detectorId: string;
  decision: "approved" | "rejected" | "needs_changes" | "deferred";
};

export type ReviewerDecisionSummary = {
  detectorId: string;
  reviewedCount: number;
  approvedCount: number;
  approvalShare: number | null;
};

export function summarizeReviewerDecisions(
  decisions: readonly ReviewerDecisionSummaryInput[],
): ReviewerDecisionSummary[] {
  const byDetector = new Map<string, { reviewed: number; approved: number }>();
  for (const decision of decisions) {
    const current = byDetector.get(decision.detectorId) ?? { reviewed: 0, approved: 0 };
    current.reviewed += 1;
    if (decision.decision === "approved") current.approved += 1;
    byDetector.set(decision.detectorId, current);
  }

  return [...byDetector.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([detectorId, counts]) => ({
      detectorId,
      reviewedCount: counts.reviewed,
      approvedCount: counts.approved,
      approvalShare: counts.reviewed === 0 ? null : counts.approved / counts.reviewed,
    }));
}
