import { describe, expect, test } from "bun:test";
import {
  buildObservedReliabilityReviewQueue,
  type ObservedReliabilityReviewCandidateLike,
  type ObservedReliabilityReviewCoverageLike,
  type ObservedReliabilityReviewEvidenceLike,
} from "../src/evaluation/observed-reliability-review-queue";

const DETECTOR_ID = "observed_reliability";
const GENERATED_AT = "2026-06-09T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type RouteSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly severity?: string;
  readonly confidence?: string;
  readonly reliabilityStatus?: "observed" | "insufficient_gtfs_rt_samples" | "missing";
  readonly sampleCount: number;
  readonly scheduledBaselineHeadwaySampleCount: number;
  readonly busWaitAssessmentTripCount: number;
  readonly busWaitAssessment: number | null;
  readonly observedLongGapShare: number | null;
  readonly waitReliabilityRatio: number | null;
  readonly excessWaitMinutes: number | null;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly reasonCode?: string;
  readonly reason?: string;
};

function routeInput(spec: RouteSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    reliabilityStatus: spec.reliabilityStatus ?? "observed",
    sampleCount: spec.sampleCount,
    minSampleThreshold: 100,
    observedLongGapShare: spec.observedLongGapShare,
    waitReliabilityRatio: spec.waitReliabilityRatio,
    excessWaitMinutes: spec.excessWaitMinutes,
    scheduledBaselineHeadwaySampleCount: spec.scheduledBaselineHeadwaySampleCount,
    busWaitAssessmentTripCount: spec.busWaitAssessmentTripCount,
    busWaitAssessment: spec.busWaitAssessment,
  };
}

function candidateId(spec: RouteSpec): string {
  return `candidate-${spec.routeId}`;
}

function primaryRef(spec: RouteSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    month: RELEASE_MONTH,
    sampleCount: spec.sampleCount,
    observedLongGapShare: spec.observedLongGapShare,
    waitReliabilityRatio: spec.waitReliabilityRatio,
    excessWaitMinutes: spec.excessWaitMinutes,
    busWaitAssessmentTripCount: spec.busWaitAssessmentTripCount,
    busWaitAssessment: spec.busWaitAssessment,
  };
}

function buildInputs(specs: readonly RouteSpec[]): {
  candidates: ObservedReliabilityReviewCandidateLike[];
  evidence: ObservedReliabilityReviewEvidenceLike[];
  coverage: ObservedReliabilityReviewCoverageLike[];
} {
  const candidates: ObservedReliabilityReviewCandidateLike[] = [];
  const evidence: ObservedReliabilityReviewEvidenceLike[] = [];
  const coverage: ObservedReliabilityReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.reasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: routeInput(spec),
    });
    if (!spec.emitted) continue;
    candidates.push({
      candidateId: candidateId(spec),
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 80,
      severity: spec.severity ?? "medium",
      confidence: spec.confidence ?? "medium",
      claimText: `Route ${spec.routeId} has high observed long-gap reliability risk.`,
    });
    evidence.push({
      candidateId: candidateId(spec),
      evidenceRole: "primary",
      evidenceRef: primaryRef(spec),
    });
    evidence.push({
      candidateId: candidateId(spec),
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        month: RELEASE_MONTH,
        sampleCount: spec.sampleCount,
        configuredMinGtfsRtHeadwaySamples: 100,
        scheduledBaselineHeadwaySampleCount: spec.scheduledBaselineHeadwaySampleCount,
        configuredMinScheduledBaselineSamples: 1,
        busWaitAssessmentTripCount: spec.busWaitAssessmentTripCount,
        configuredMinBusWaitAssessmentTrips: 1,
        limitation: "Route-month rollup can hide direction or time-window differences.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly RouteSpec[] = [
  {
    routeId: "B1",
    emitted: true,
    detectorScore: 96,
    sampleCount: 1200,
    scheduledBaselineHeadwaySampleCount: 20,
    busWaitAssessmentTripCount: 35,
    busWaitAssessment: 0.52,
    observedLongGapShare: 0.5,
    waitReliabilityRatio: 3.4,
    excessWaitMinutes: 9,
  },
  {
    routeId: "B2",
    emitted: true,
    detectorScore: 88,
    sampleCount: 140,
    scheduledBaselineHeadwaySampleCount: 20,
    busWaitAssessmentTripCount: 35,
    busWaitAssessment: 0.54,
    observedLongGapShare: 0.42,
    waitReliabilityRatio: 2.9,
    excessWaitMinutes: 7,
  },
  {
    routeId: "Q44",
    emitted: true,
    detectorScore: 86,
    sampleCount: 900,
    scheduledBaselineHeadwaySampleCount: 1,
    busWaitAssessmentTripCount: 22,
    busWaitAssessment: 0.55,
    observedLongGapShare: 0.4,
    waitReliabilityRatio: 2.6,
    excessWaitMinutes: 6,
  },
  {
    routeId: "Q52",
    emitted: true,
    detectorScore: 84,
    sampleCount: 950,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 2,
    busWaitAssessment: 0.56,
    observedLongGapShare: 0.38,
    waitReliabilityRatio: 2.5,
    excessWaitMinutes: 5,
  },
  {
    routeId: "M15",
    emitted: true,
    detectorScore: 83,
    sampleCount: 1000,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 30,
    busWaitAssessment: 0.74,
    observedLongGapShare: 0.35,
    waitReliabilityRatio: 2.2,
    excessWaitMinutes: 4,
  },
  {
    routeId: "S79",
    emitted: true,
    detectorScore: 68,
    sampleCount: 1000,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 30,
    busWaitAssessment: 0.6,
    observedLongGapShare: 0.24,
    waitReliabilityRatio: 1.7,
    excessWaitMinutes: 2,
  },
  {
    routeId: "X1",
    emitted: false,
    sampleCount: 1000,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 30,
    busWaitAssessment: 0.9,
    observedLongGapShare: 0.1,
    waitReliabilityRatio: 1.1,
    excessWaitMinutes: 0,
  },
  {
    routeId: "S53",
    emitted: false,
    sampleCount: 1000,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 30,
    busWaitAssessment: 0.58,
    observedLongGapShare: 0.33,
    waitReliabilityRatio: 2.4,
    excessWaitMinutes: 4,
  },
  {
    routeId: "M8",
    emitted: false,
    sampleCount: 1000,
    scheduledBaselineHeadwaySampleCount: 18,
    busWaitAssessmentTripCount: 0,
    busWaitAssessment: null,
    observedLongGapShare: 0.3,
    waitReliabilityRatio: 2,
    excessWaitMinutes: 3,
    outcome: "skipped_missing_input",
    reasonCode: "missing_bus_wait_assessment",
    reason: "Observed reliability detector input was incomplete.",
  },
];

describe("observed reliability review queue", () => {
  test("derives support-risk strata, cap suppression, and reviewer batch selection", () => {
    const input = buildInputs(SPECS);
    const queue = buildObservedReliabilityReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      quota: {
        top_score: 1,
        near_threshold: 1,
        low_gtfs_rt_samples: 1,
        weak_schedule_baseline: 1,
        weak_bwa_support: 1,
        bwa_conflict: 1,
        borough_spread: 0,
        cap_suppressed_control: 1,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({
      emittedCount: 6,
      coverageCount: 9,
      capSuppressedCount: 1,
      selectedForReviewCount: 9,
    });
    expect(queue.summary.byStratum).toMatchObject({
      top_score: 1,
      near_threshold: 1,
      low_gtfs_rt_samples: 1,
      weak_schedule_baseline: 1,
      weak_bwa_support: 1,
      bwa_conflict: 1,
      cap_suppressed_control: 1,
      clean_control: 1,
      skipped_control: 1,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({
      missing_bus_wait_assessment: 1,
    });
    expect(queue.summary.emittedByBoroughPrefix).toMatchObject({ B: 2, M: 1, Q: 2, S: 1 });
    expect(queue.summary.capSuppressedByBoroughPrefix).toEqual({ S: 1 });

    expect(byScope.get("B1")?.stratum).toBe("top_score");
    expect(byScope.get("B2")?.stratum).toBe("low_gtfs_rt_samples");
    expect(byScope.get("Q44")?.stratum).toBe("weak_schedule_baseline");
    expect(byScope.get("Q52")?.stratum).toBe("weak_bwa_support");
    expect(byScope.get("M15")?.stratum).toBe("bwa_conflict");
    expect(byScope.get("S79")?.stratum).toBe("near_threshold");
    expect(byScope.get("S53")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("X1")?.stratum).toBe("clean_control");
    expect(byScope.get("M8")?.stratum).toBe("skipped_control");
    expect(byScope.get("S53")?.capSuppressed).toBe(true);
    expect(byScope.get("X1")?.capSuppressed).toBe(false);
    expect(byScope.get("M15")?.busWaitAssessmentConflict).toBe(true);
    expect(byScope.get("Q44")?.metrics.scheduledBaselineHeadwaySampleCount).toBe(1);
    expect(byScope.get("B1")?.counterEvidence).toContain(
      "Route-month rollup can hide direction or time-window differences.",
    );
    expect(queue.items.every((item) => item.selectedForReview)).toBe(true);
  });
});
