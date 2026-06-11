import { describe, expect, test } from "bun:test";
import {
  buildPermitCorrelatedSlowdownReviewQueue,
  type PermitCorrelatedSlowdownReviewCandidateLike,
  type PermitCorrelatedSlowdownReviewCoverageLike,
  type PermitCorrelatedSlowdownReviewEvidenceLike,
} from "../src/evaluation/permit-correlated-slowdown-review-queue";

const DETECTOR_ID = "permit_correlated_slowdown";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly maxRouteFanout?: number;
  readonly averageMatchWeight?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function buildInputs(specs: readonly CellSpec[]): {
  candidates: PermitCorrelatedSlowdownReviewCandidateLike[];
  evidence: PermitCorrelatedSlowdownReviewEvidenceLike[];
  coverage: PermitCorrelatedSlowdownReviewCoverageLike[];
} {
  const candidates: PermitCorrelatedSlowdownReviewCandidateLike[] = [];
  const evidence: PermitCorrelatedSlowdownReviewEvidenceLike[] = [];
  const coverage: PermitCorrelatedSlowdownReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: JSON.stringify({ routeId: spec.routeId }),
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
      confidence: "medium",
      claimText: `Route ${spec.routeId} permit-correlated slowdown context.`,
    });
    evidence.push({
      candidateId,
      evidenceRole: "primary",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        routeWeightedAverageSpeedMph: 5.1,
        maxHotspotScore: 82,
        permitTouchedEventCount: 60,
        permitRouteCount: spec.maxRouteFanout ?? 6,
      }),
    });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        permitContext: {
          averageMatchWeight: spec.averageMatchWeight ?? 0.8,
          maxRouteFanout: spec.maxRouteFanout ?? 6,
          highConfidenceTouchCount: 30,
        },
        limitation:
          "Permit touches are broad street-work context, not causal evidence by themselves; permit type, route fanout, match weight, and unrelated work must be reviewed.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 95 },
  // high route fanout (weak association)
  { routeId: "Q44", emitted: true, detectorScore: 90, maxRouteFanout: 40 },
  // low match weight
  { routeId: "S79", emitted: true, detectorScore: 88, averageMatchWeight: 0.2 },
  // near threshold
  { routeId: "BX36", emitted: true, detectorScore: 64 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_permit_touches",
    reason: "insufficient_permit_touches",
  },
];

describe("permit correlated slowdown review queue", () => {
  test("stratifies fanout / match-weight association risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildPermitCorrelatedSlowdownReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        high_route_fanout: 1,
        low_match_weight: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 5, coverageCount: 7 });
    expect(queue.summary.capSuppressedCount).toBe(4);
    expect(queue.summary.skippedByReasonCode).toEqual({ insufficient_permit_touches: 1 });

    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("M15")?.capSuppressed).toBe(false);
    expect(byScope.get("B44")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44")?.highRouteFanout).toBe(true);
    expect(byScope.get("Q44")?.metrics.maxRouteFanout).toBe(40);
    expect(byScope.get("S79")?.lowMatchWeight).toBe(true);
    expect(byScope.get("S79")?.metrics.averageMatchWeight).toBe(0.2);
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Permit touches are broad street-work context, not causal evidence by themselves; permit type, route fanout, match weight, and unrelated work must be reviewed.",
    );
  });
});
