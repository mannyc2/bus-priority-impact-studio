import { describe, expect, test } from "bun:test";
import {
  buildPositiveDevianceReviewQueue,
  type PositiveDevianceReviewCandidateLike,
  type PositiveDevianceReviewCoverageLike,
  type PositiveDevianceReviewEvidenceLike,
} from "../src/evaluation/positive-deviance-review-queue";

const DETECTOR_ID = "positive_deviance";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly scopeKind?: "route" | "segment";
  readonly peerCount?: number;
  readonly periodCount?: number;
  readonly qualifyingPeriodCount?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    scopeKind: spec.scopeKind ?? "route",
    scopeId: spec.scopeId,
    routeId: spec.routeId,
    metricName: "avg_speed_mph",
    peerGroupLabel: "borough-frequency peers",
    peerCount: spec.peerCount ?? 20,
    qualifyingPeriods: Array.from({ length: spec.qualifyingPeriodCount ?? 4 }, (_, i) => ({
      period: `2026-0${i + 1}`,
      value: 9 + i,
      performancePercentile: 0.95,
      adjustedResidual: 1.2,
    })),
    counterEvidence: [
      "Positive deviance is a learning candidate, not proof of best practice.",
      "Peer covariates and residuals must be reviewed before attributing why performance is better.",
    ],
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: PositiveDevianceReviewCandidateLike[];
  evidence: PositiveDevianceReviewEvidenceLike[];
  coverage: PositiveDevianceReviewCoverageLike[];
} {
  const candidates: PositiveDevianceReviewCandidateLike[] = [];
  const evidence: PositiveDevianceReviewEvidenceLike[] = [];
  const coverage: PositiveDevianceReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.scopeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: {
        scopeKind: spec.scopeKind ?? "route",
        scopeId: spec.scopeId,
        routeId: spec.routeId,
        metricName: "avg_speed_mph",
        peerCount: spec.peerCount ?? 20,
        periodCount: spec.periodCount ?? 6,
        qualifyingPeriodCount: spec.qualifyingPeriodCount ?? 4,
        reciprocalMetricWarnings: spec.skipReasonCode === "reciprocal_metric_warning"
          ? ["reliability_worse_than_peers"]
          : [],
      },
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.scopeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.scopeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 80,
      severity: "medium",
      confidence: "medium",
      claimText: `${spec.scopeKind ?? "route"} ${spec.scopeId} outperforms peers.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        scopeId: spec.scopeId,
        counterEvidence: [
          "Positive deviance is a learning candidate, not proof of best practice.",
          "A reciprocal worst-practice metric blocks auto-scoring.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { scopeId: "M15-pd", routeId: "M15", emitted: true, detectorScore: 99 },
  { scopeId: "B44-pd", routeId: "B44", emitted: true, detectorScore: 95 },
  // thin peers
  { scopeId: "Q44-pd", routeId: "Q44", emitted: true, detectorScore: 90, peerCount: 9 },
  // fragile persistence (exactly minStablePeriods=2)
  { scopeId: "S79-pd", routeId: "S79", emitted: true, detectorScore: 88, qualifyingPeriodCount: 2 },
  // segment scope
  {
    scopeId: "seg-BX12-1",
    routeId: "BX12",
    emitted: true,
    detectorScore: 84,
    scopeKind: "segment",
  },
  // near threshold
  { scopeId: "BX36-pd", routeId: "BX36", emitted: true, detectorScore: 64 },
  // clean control
  { scopeId: "M1-pd", routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped: reciprocal warning (skip gate, not emitted)
  {
    scopeId: "B2-pd",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "reciprocal_metric_warning",
    reason: "A reciprocal metric warning blocks positive-deviance scoring.",
  },
  // skipped: insufficient peers
  {
    scopeId: "Q5-pd",
    routeId: "Q5",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_peers",
    reason: "Peer group support is below the positive-deviance minimum.",
  },
];

describe("positive deviance review queue", () => {
  test("stratifies peer/persistence/segment risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildPositiveDevianceReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_peers: 1,
        fragile_persistence: 1,
        segment_scope: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 2,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({
      emittedCount: 6,
      coverageCount: 9,
    });
    // production cap of 1 => ranks 2..6 among emitted are cap-suppressed
    expect(queue.summary.capSuppressedCount).toBe(5);
    expect(queue.summary.emittedByScopeKind).toEqual({ route: 5, segment: 1 });
    expect(queue.summary.skippedByReasonCode).toEqual({
      insufficient_peers: 1,
      reciprocal_metric_warning: 1,
    });

    // M15 is rank 1 (top score) -> not cap suppressed -> top_score
    expect(byScope.get("M15-pd")?.stratum).toBe("top_score");
    expect(byScope.get("M15-pd")?.capSuppressed).toBe(false);
    // all others emitted are rank>1 => cap_suppressed_control (cap suppression takes priority)
    expect(byScope.get("B44-pd")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44-pd")?.thinPeers).toBe(true);
    expect(byScope.get("S79-pd")?.fragilePersistence).toBe(true);
    expect(byScope.get("seg-BX12-1")?.segmentScope).toBe(true);
    expect(byScope.get("M1-pd")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-pd")?.stratum).toBe("skipped_control");
    expect(byScope.get("Q5-pd")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15-pd")?.counterEvidence).toContain(
      "A reciprocal worst-practice metric blocks auto-scoring.",
    );
  });
});
