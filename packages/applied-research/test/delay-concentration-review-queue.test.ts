import { describe, expect, test } from "bun:test";
import {
  buildDelayConcentrationReviewQueue,
  type DelayConcentrationReviewCandidateLike,
  type DelayConcentrationReviewCoverageLike,
  type DelayConcentrationReviewEvidenceLike,
} from "../src/evaluation/delay-concentration-review-queue";

const DETECTOR_ID = "delay_concentration";
const GENERATED_AT = "2026-06-11T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type RouteSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly eligibleSegmentCount?: number;
  readonly segmentCount?: number;
  readonly gini?: number;
  readonly giniFleetPercentile?: number;
  readonly delayFleetPercentile?: number;
  readonly minSegmentsToReadoutShare?: number;
  readonly topSegmentsShare?: number;
  readonly topSegmentShare?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function topSegments(spec: RouteSpec): Record<string, unknown>[] {
  const share = spec.topSegmentShare ?? 0.28;
  return [
    {
      segmentId: `${spec.routeId}:1`,
      from: "A",
      to: "B",
      direction: "Northbound",
      excessDelayMin: 1200,
      share,
      weightedAverageSpeedMph: 3.4,
    },
    {
      segmentId: `${spec.routeId}:2`,
      from: "B",
      to: "C",
      direction: "Northbound",
      excessDelayMin: 700,
      share: Math.max(0, (spec.topSegmentsShare ?? 0.72) - share),
      weightedAverageSpeedMph: 4.8,
    },
  ];
}

function primaryRef(spec: RouteSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    month: RELEASE_MONTH,
    gini: spec.gini ?? 0.64,
    giniFleetPercentile: spec.giniFleetPercentile ?? 0.98,
    delayFleetPercentile: spec.delayFleetPercentile ?? 0.88,
    referenceSpeedMph: 11.2,
    referenceSpeedPercentile: 0.85,
    eligibleSegmentCount: spec.eligibleSegmentCount ?? 18,
    totalExcessDelayMin: 4200,
    minSegmentsToReadoutShare: spec.minSegmentsToReadoutShare ?? 4,
    readoutShare: 0.9,
    topSegmentsShare: spec.topSegmentsShare ?? 0.72,
    topSegments: topSegments(spec),
  };
}

function buildInputs(specs: readonly RouteSpec[]): {
  candidates: DelayConcentrationReviewCandidateLike[];
  evidence: DelayConcentrationReviewEvidenceLike[];
  coverage: DelayConcentrationReviewCoverageLike[];
} {
  const candidates: DelayConcentrationReviewCandidateLike[] = [];
  const evidence: DelayConcentrationReviewEvidenceLike[] = [];
  const coverage: DelayConcentrationReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: {
        hasSpeedData: true,
        speedObservationCount: 1200,
        segmentCount: spec.segmentCount ?? spec.eligibleSegmentCount ?? 18,
        eligibleSegmentCount: spec.eligibleSegmentCount ?? 18,
        gini: spec.gini ?? 0.64,
        totalExcessDelayMin: 4200,
        giniFleetPercentile: spec.giniFleetPercentile ?? 0.98,
        benchmarkRouteCount: 278,
      },
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.routeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 90,
      severity: "medium",
      confidence: "medium",
      claimText: `On route ${spec.routeId}, avoidable delay is concentrated.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        limitation:
          "Concentration locates where avoidable delay sits; it is not a causal claim and Gini is sensitive to segment count.",
        benchmarkRouteCount: 278,
        fleetMedianGini: 0.41,
        absoluteDelayFloor: 1600,
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly RouteSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 92, eligibleSegmentCount: 9 },
  {
    routeId: "Q44",
    emitted: true,
    detectorScore: 91,
    eligibleSegmentCount: 18,
    topSegmentShare: 0.58,
  },
  {
    routeId: "B6",
    emitted: true,
    detectorScore: 90,
    eligibleSegmentCount: 20,
    minSegmentsToReadoutShare: 2,
  },
  { routeId: "Q17", emitted: true, detectorScore: 80, eligibleSegmentCount: 16 },
  { routeId: "M1", emitted: false, outcome: "clean_no_hit", eligibleSegmentCount: 24 },
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_speed_observations",
    reason: "Route lacked enough clean segment-speed observations for concentration analysis.",
  },
];

describe("delay concentration review queue", () => {
  test("stratifies segment-count sensitivity and clean/skipped controls", () => {
    const input = buildInputs(SPECS);
    const queue = buildDelayConcentrationReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      quota: {
        top_score: 1,
        low_eligible_segments: 1,
        single_segment_dominant: 1,
        segment_count_sensitive: 1,
        near_threshold: 1,
        borough_spread: 0,
        cap_suppressed_control: 0,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 5, coverageCount: 7 });
    expect(queue.summary.capSuppressedCount).toBe(0);
    expect(queue.summary.emittedByBoroughPrefix).toEqual({ B: 2, M: 1, Q: 2 });
    expect(queue.summary.skippedByReasonCode).toEqual({
      insufficient_speed_observations: 1,
    });

    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("B44")?.stratum).toBe("low_eligible_segments");
    expect(byScope.get("B44")?.lowEligibleSegments).toBe(true);
    expect(byScope.get("Q44")?.stratum).toBe("single_segment_dominant");
    expect(byScope.get("Q44")?.singleSegmentDominant).toBe(true);
    expect(byScope.get("B6")?.stratum).toBe("segment_count_sensitive");
    expect(byScope.get("B6")?.segmentCountSensitive).toBe(true);
    expect(byScope.get("Q17")?.stratum).toBe("near_threshold");
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Concentration locates where avoidable delay sits; it is not a causal claim and Gini is sensitive to segment count.",
    );
  });
});
