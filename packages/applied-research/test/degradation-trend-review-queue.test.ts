import { describe, expect, test } from "bun:test";
import {
  buildDegradationTrendReviewQueue,
  type DegradationTrendReviewCandidateLike,
  type DegradationTrendReviewCoverageLike,
  type DegradationTrendReviewEvidenceLike,
} from "../src/evaluation/degradation-trend-review-queue";

const DETECTOR_ID = "degradation_trend";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly scopeKind?: "route" | "segment";
  readonly supportedPointCount?: number;
  readonly priorBaselinePointCount?: number;
  readonly robustZ?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    scopeKind: spec.scopeKind ?? "route",
    scopeId: spec.scopeId,
    routeId: spec.routeId,
    metricName: "average_speed_mph",
    supportedPointCount: spec.supportedPointCount ?? 14,
    priorBaselinePointCount: spec.priorBaselinePointCount ?? 12,
    robustZ: spec.robustZ ?? 4.2,
    theilSenSlopeWorseOriented: 0.3,
    routeVersionBreaks: [],
    counterEvidence: [
      "Trend evidence is associational and does not identify an external cause.",
      "Seasonality is not modeled by this detector beyond the provided history window.",
    ],
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: DegradationTrendReviewCandidateLike[];
  evidence: DegradationTrendReviewEvidenceLike[];
  coverage: DegradationTrendReviewCoverageLike[];
} {
  const candidates: DegradationTrendReviewCandidateLike[] = [];
  const evidence: DegradationTrendReviewEvidenceLike[] = [];
  const coverage: DegradationTrendReviewCoverageLike[] = [];
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
        metricName: "average_speed_mph",
        historyWindowMonths: 18,
        supportedPointCount: spec.supportedPointCount ?? 14,
        routeVersionBreaks: [],
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
      claimText: `${spec.scopeKind ?? "route"} ${spec.scopeId} worsening trend.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        scopeId: spec.scopeId,
        counterEvidence: [
          "Trend evidence is associational and does not identify an external cause.",
          "Route redesigns, schedule changes, or source coverage changes can create artificial trends.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { scopeId: "M15-dt", routeId: "M15", emitted: true, detectorScore: 99 },
  { scopeId: "B44-dt", routeId: "B44", emitted: true, detectorScore: 95 },
  // thin history
  { scopeId: "Q44-dt", routeId: "Q44", emitted: true, detectorScore: 90, supportedPointCount: 9 },
  // short baseline
  {
    scopeId: "S79-dt",
    routeId: "S79",
    emitted: true,
    detectorScore: 88,
    priorBaselinePointCount: 6,
  },
  // segment scope
  {
    scopeId: "seg-BX12-1",
    routeId: "BX12",
    emitted: true,
    detectorScore: 84,
    scopeKind: "segment",
  },
  // near threshold
  { scopeId: "BX36-dt", routeId: "BX36", emitted: true, detectorScore: 64 },
  // clean control
  { scopeId: "M1-dt", routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped: series break
  {
    scopeId: "B2-dt",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "series_break_versioned",
    reason: "Route or scope version breaks are present in the trend window.",
  },
  // skipped: insufficient history
  {
    scopeId: "Q5-dt",
    routeId: "Q5",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_history",
    reason: "Not enough supported metric-history points are available for trend scoring.",
  },
];

describe("degradation trend review queue", () => {
  test("stratifies history-confidence risks and rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildDegradationTrendReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_history: 1,
        short_baseline: 1,
        segment_scope: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 2,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 6, coverageCount: 9 });
    // production cap of 1 => ranks 2..6 among emitted are cap-suppressed
    expect(queue.summary.capSuppressedCount).toBe(5);
    expect(queue.summary.emittedByScopeKind).toEqual({ route: 5, segment: 1 });
    expect(queue.summary.skippedByReasonCode).toEqual({
      insufficient_history: 1,
      series_break_versioned: 1,
    });

    // M15 is rank 1 (top score) -> not cap suppressed -> top_score
    expect(byScope.get("M15-dt")?.stratum).toBe("top_score");
    expect(byScope.get("M15-dt")?.capSuppressed).toBe(false);
    // others emitted are rank>1 => cap_suppressed_control (cap suppression takes priority)
    expect(byScope.get("B44-dt")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44-dt")?.thinHistory).toBe(true);
    expect(byScope.get("S79-dt")?.shortBaseline).toBe(true);
    expect(byScope.get("seg-BX12-1")?.segmentScope).toBe(true);
    expect(byScope.get("M1-dt")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-dt")?.stratum).toBe("skipped_control");
    expect(byScope.get("Q5-dt")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15-dt")?.counterEvidence).toContain(
      "Route redesigns, schedule changes, or source coverage changes can create artificial trends.",
    );
  });
});
