import { describe, expect, test } from "bun:test";
import {
  buildMultiMonthSpeedPeerReviewQueue,
  type MultiMonthSpeedPeerReviewCandidateLike,
  type MultiMonthSpeedPeerReviewCoverageLike,
  type MultiMonthSpeedPeerReviewEvidenceLike,
} from "../src/evaluation/multi-month-speed-peer-review-queue";

const DETECTOR_ID = "multi_month_speed_peer";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly observedMonthCount?: number;
  readonly peerGroupMethods?: string[];
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): string {
  return JSON.stringify({
    routeId: spec.routeId,
    observedMonthCount: spec.observedMonthCount ?? 9,
    averageSpeedMph: 5.2,
    averagePeerMedianSpeedMph: 7.4,
    averagePeerDeficitMph: 2.2,
    peerGroupMethods: spec.peerGroupMethods ?? ["route_family_type", "route_family_type_spatial"],
  });
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: MultiMonthSpeedPeerReviewCandidateLike[];
  evidence: MultiMonthSpeedPeerReviewEvidenceLike[];
  coverage: MultiMonthSpeedPeerReviewCoverageLike[];
} {
  const candidates: MultiMonthSpeedPeerReviewCandidateLike[] = [];
  const evidence: MultiMonthSpeedPeerReviewEvidenceLike[] = [];
  const coverage: MultiMonthSpeedPeerReviewCoverageLike[] = [];
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
        observedMonthCount: spec.observedMonthCount ?? 9,
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
      confidence: "low",
      claimText: `Route ${spec.routeId} below peer median.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        limitation:
          "Matched peer groups are descriptive comparisons, not causal controls; reviewers should inspect route geometry, service pattern, construction, and seasonal differences before promotion.",
        peerGroupDescription:
          "Peers are selected by route family, route type, and geography when enough supported routes exist; fallback groups are recorded per month.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 95 },
  // fallback peers (weak method present)
  {
    routeId: "Q44",
    emitted: true,
    detectorScore: 90,
    peerGroupMethods: ["route_family", "system"],
  },
  // thin months
  { routeId: "S79", emitted: true, detectorScore: 88, observedMonthCount: 4 },
  // near threshold
  { routeId: "BX36", emitted: true, detectorScore: 60 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped: insufficient months
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_trend_months",
    reason: "Multi-month route trend or peer support was incomplete.",
  },
  // skipped: missing current month
  {
    routeId: "Q5",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "missing_current_trend_month",
    reason: "Multi-month route trend or peer support was incomplete.",
  },
];

describe("multi-month speed peer review queue", () => {
  test("stratifies fallback peers / thin months and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildMultiMonthSpeedPeerReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        fallback_peers: 1,
        thin_months: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 2,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 5, coverageCount: 8 });
    // production cap of 1 => ranks 2..5 among emitted are cap-suppressed
    expect(queue.summary.capSuppressedCount).toBe(4);
    expect(queue.summary.skippedByReasonCode).toEqual({
      insufficient_trend_months: 1,
      missing_current_trend_month: 1,
    });

    // M15 rank 1 -> top_score; the rest are cap-suppressed (cap takes priority)
    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("M15")?.capSuppressed).toBe(false);
    expect(byScope.get("B44")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44")?.fallbackPeers).toBe(true);
    expect(byScope.get("Q44")?.metrics.hasStrongPeerGroup).toBe(false);
    expect(byScope.get("S79")?.thinMonths).toBe(true);
    expect(byScope.get("M15")?.metrics.hasStrongPeerGroup).toBe(true);
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("Q5")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Matched peer groups are descriptive comparisons, not causal controls; reviewers should inspect route geometry, service pattern, construction, and seasonal differences before promotion.",
    );
  });
});
