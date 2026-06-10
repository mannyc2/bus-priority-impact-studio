import { describe, expect, test } from "bun:test";
import {
  buildServiceRequestContextReviewQueue,
  type ServiceRequestContextReviewCandidateLike,
  type ServiceRequestContextReviewCoverageLike,
  type ServiceRequestContextReviewEvidenceLike,
} from "../src/evaluation/service-request-context-review-queue";

const DETECTOR_ID = "service_request_context";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly maxRouteFanout?: number;
  readonly averageMatchWeight?: number;
  readonly highConfidenceTouchCount?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function serviceRequestContext(spec: CellSpec): Record<string, unknown> {
  return {
    touchedEventCount: 60,
    averageMatchWeight: spec.averageMatchWeight ?? 0.6,
    maxRouteFanout: spec.maxRouteFanout ?? 6,
    highConfidenceTouchCount: spec.highConfidenceTouchCount ?? 12,
    eventKinds: ["311_complaint"],
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: ServiceRequestContextReviewCandidateLike[];
  evidence: ServiceRequestContextReviewEvidenceLike[];
  coverage: ServiceRequestContextReviewCoverageLike[];
} {
  const candidates: ServiceRequestContextReviewCandidateLike[] = [];
  const evidence: ServiceRequestContextReviewEvidenceLike[] = [];
  const coverage: ServiceRequestContextReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: JSON.stringify({
        routeId: spec.routeId,
        routeWeightedAverageSpeedMph: 5.1,
        maxHotspotScore: 82,
        serviceRequestContext: serviceRequestContext(spec),
      }),
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
      claimText: `Route ${spec.routeId} 311-context slowdown.`,
    });
    evidence.push({
      candidateId,
      evidenceRole: "context",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        serviceRequestContext: serviceRequestContext(spec),
      }),
    });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        serviceRequestContext: serviceRequestContext(spec),
        limitation:
          "311 complaint context can reflect broad street conditions, reporting behavior, or fanout across nearby routes.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 95 },
  // high route fanout
  { routeId: "Q44", emitted: true, detectorScore: 90, maxRouteFanout: 40 },
  // low match weight (< 0.35 default min)
  { routeId: "S79", emitted: true, detectorScore: 88, averageMatchWeight: 0.2 },
  // thin high-confidence touches (< 5 default min)
  { routeId: "BX12", emitted: true, detectorScore: 84, highConfidenceTouchCount: 2 },
  // near threshold
  { routeId: "BX36", emitted: true, detectorScore: 60 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_service_request_context",
    reason: "insufficient_service_request_context",
  },
];

describe("service request context review queue", () => {
  test("stratifies 311-association risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildServiceRequestContextReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        high_route_fanout: 1,
        low_match_weight: 1,
        thin_high_confidence_touches: 1,
        borough_spread: 0,
        cap_suppressed_control: 3,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 6, coverageCount: 8 });
    expect(queue.summary.capSuppressedCount).toBe(5);
    expect(queue.summary.skippedByReasonCode).toEqual({
      insufficient_service_request_context: 1,
    });

    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("M15")?.capSuppressed).toBe(false);
    expect(byScope.get("B44")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44")?.highRouteFanout).toBe(true);
    expect(byScope.get("Q44")?.metrics.maxRouteFanout).toBe(40);
    expect(byScope.get("S79")?.lowMatchWeight).toBe(true);
    expect(byScope.get("BX12")?.thinHighConfidenceTouches).toBe(true);
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "311 complaint context can reflect broad street conditions, reporting behavior, or fanout across nearby routes.",
    );
  });
});
