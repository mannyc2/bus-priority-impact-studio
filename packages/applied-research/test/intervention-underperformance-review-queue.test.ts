import { describe, expect, test } from "bun:test";
import {
  buildInterventionUnderperformanceReviewQueue,
  type InterventionUnderperformanceReviewCandidateLike,
  type InterventionUnderperformanceReviewCoverageLike,
  type InterventionUnderperformanceReviewEvidenceLike,
} from "../src/evaluation/intervention-underperformance-review-queue";

const DETECTOR_ID = "intervention_underperformance";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly comparisonRouteCount?: number;
  readonly treatmentSourceRefCount?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): string {
  return JSON.stringify({
    routeId: spec.routeId,
    speedPainScore: 90,
    adjustedSpeedDeltaMph: -1.5,
    comparisonRouteCount: spec.comparisonRouteCount ?? 5,
    routeTreatmentEvidenceCount: 4,
    treatmentSourceRefCount: spec.treatmentSourceRefCount ?? 3,
  });
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: InterventionUnderperformanceReviewCandidateLike[];
  evidence: InterventionUnderperformanceReviewEvidenceLike[];
  coverage: InterventionUnderperformanceReviewCoverageLike[];
} {
  const candidates: InterventionUnderperformanceReviewCandidateLike[] = [];
  const evidence: InterventionUnderperformanceReviewEvidenceLike[] = [];
  const coverage: InterventionUnderperformanceReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: JSON.stringify({ routeId: spec.routeId, speedPainScore: 90 }),
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.routeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 92,
      severity: "medium",
      confidence: "low",
      claimText: `Route ${spec.routeId} treatment underperformance.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        limitation:
          "Peer-adjusted speed deltas are descriptive, not causal by themselves; route changes, window choice, and peer comparability can weaken an underperformance claim.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 96 },
  // thin comparison peers
  { routeId: "Q44", emitted: true, detectorScore: 94, comparisonRouteCount: 1 },
  // thin/undated treatment evidence
  { routeId: "S79", emitted: true, detectorScore: 93, treatmentSourceRefCount: 0 },
  // near threshold
  { routeId: "BX36", emitted: true, detectorScore: 86 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped: missing pain signal
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "missing_pain_signal",
    reason: "Intervention underperformance detector input was incomplete.",
  },
  // skipped: missing evaluated intervention
  {
    routeId: "Q5",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "missing_evaluated_intervention",
    reason: "Intervention underperformance detector input was incomplete.",
  },
];

describe("intervention underperformance review queue", () => {
  test("stratifies peer-comparison + treatment-evidence risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildInterventionUnderperformanceReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_comparison_peers: 1,
        thin_treatment_evidence: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 2,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 5, coverageCount: 8 });
    expect(queue.summary.capSuppressedCount).toBe(4);
    expect(queue.summary.skippedByReasonCode).toEqual({
      missing_evaluated_intervention: 1,
      missing_pain_signal: 1,
    });

    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("M15")?.capSuppressed).toBe(false);
    expect(byScope.get("B44")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44")?.thinComparisonPeers).toBe(true);
    expect(byScope.get("S79")?.thinTreatmentEvidence).toBe(true);
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("Q5")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Peer-adjusted speed deltas are descriptive, not causal by themselves; route changes, window choice, and peer comparability can weaken an underperformance claim.",
    );
  });
});
