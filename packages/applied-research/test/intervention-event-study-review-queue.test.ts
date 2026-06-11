import { describe, expect, test } from "bun:test";
import {
  buildInterventionEventStudyReviewQueue,
  type InterventionEventStudyReviewCandidateLike,
  type InterventionEventStudyReviewCoverageLike,
  type InterventionEventStudyReviewEvidenceLike,
} from "../src/evaluation/intervention-event-study-review-queue";

const DETECTOR_ID = "intervention_event_study";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly candidateCausalEligible?: boolean;
  readonly associationallyScoreable?: boolean;
  readonly blockingReasons?: string[];
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    treatedScopeId: spec.routeId,
    interventionType: "bus_lane",
    eventStudyEstimate: 1.4,
    controlScopeIds: ["A", "B", "C"],
    gateSummary: {
      associationallyScoreable: spec.associationallyScoreable ?? true,
      candidateCausalEligible: spec.candidateCausalEligible ?? false,
      blockingReasons: spec.blockingReasons ?? [],
    },
    caveats: [
      "The detector may report association, not causation.",
      "Causal or effect language requires human methodology approval.",
    ],
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: InterventionEventStudyReviewCandidateLike[];
  evidence: InterventionEventStudyReviewEvidenceLike[];
  coverage: InterventionEventStudyReviewCoverageLike[];
} {
  const candidates: InterventionEventStudyReviewCandidateLike[] = [];
  const evidence: InterventionEventStudyReviewEvidenceLike[] = [];
  const coverage: InterventionEventStudyReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: { treatedScopeId: spec.routeId, interventionType: "bus_lane" },
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.routeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 80,
      severity: "medium",
      confidence: "low",
      claimText: `Event study panel ${spec.routeId}.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: {
        eventId: spec.routeId,
        caveats: [
          "The detector may report association, not causation.",
          "Causal or effect language requires human methodology approval.",
        ],
      },
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  // method divergence
  {
    routeId: "M15",
    emitted: true,
    detectorScore: 99,
    blockingReasons: ["method_divergence"],
  },
  // pre-trend / placebo risk
  {
    routeId: "B44",
    emitted: true,
    detectorScore: 95,
    blockingReasons: ["pre_trend_failed"],
  },
  // gate pass (causal-eligible)
  { routeId: "Q44", emitted: true, detectorScore: 90, candidateCausalEligible: true },
  // associational only, mid score -> borough_spread or top by rank
  { routeId: "BX12", emitted: true, detectorScore: 78 },
  // near threshold
  { routeId: "S79", emitted: true, detectorScore: 60 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "no_counterfactual",
    reason: "No eligible control or comparison set is available.",
  },
];

describe("intervention event study review queue", () => {
  test("stratifies methodology-gate risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildInterventionEventStudyReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 4,
      quota: {
        top_score: 1,
        near_threshold: 1,
        gate_pass: 1,
        pretrend_or_placebo_risk: 1,
        method_divergence: 1,
        borough_spread: 1,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 5, coverageCount: 7 });
    // production cap 4 => rank 5 (S79, score 60) cap-suppressed
    expect(queue.summary.capSuppressedCount).toBe(1);
    expect(queue.summary.emittedByGateStatus).toEqual({
      associational_only: 4,
      candidate_causal_eligible: 1,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({ no_counterfactual: 1 });

    expect(byScope.get("M15")?.stratum).toBe("method_divergence");
    expect(byScope.get("B44")?.stratum).toBe("pretrend_or_placebo_risk");
    expect(byScope.get("Q44")?.stratum).toBe("gate_pass");
    expect(byScope.get("Q44")?.metrics.candidateCausalEligible).toBe(true);
    expect(byScope.get("S79")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("S79")?.capSuppressed).toBe(true);
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Causal or effect language requires human methodology approval.",
    );
  });
});
