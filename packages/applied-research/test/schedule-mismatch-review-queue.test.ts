import { describe, expect, test } from "bun:test";
import {
  buildScheduleMismatchReviewQueue,
  type ScheduleMismatchReviewCandidateLike,
  type ScheduleMismatchReviewCoverageLike,
  type ScheduleMismatchReviewEvidenceLike,
} from "../src/evaluation/schedule-mismatch-review-queue";

const DETECTOR_ID = "schedule_mismatch";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly reasonCode?: "schedule_too_tight" | "schedule_padding_review";
  readonly scheduled?: number;
  readonly observedP50?: number;
  readonly tripCount?: number;
  readonly servicePatternVersion?: string | null;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  const scheduled = spec.scheduled ?? 20;
  const observedP50 = spec.observedP50 ?? 26;
  return {
    routeId: spec.routeId,
    direction: "0",
    daypart: "am_peak",
    scheduledRuntimeMinutes: scheduled,
    observedRuntimeP50Minutes: observedP50,
    signedPercent: observedP50 / scheduled - 1,
    observedTripCount: spec.tripCount ?? 80,
    servicePatternVersion:
      spec.servicePatternVersion === undefined ? "v2026-03" : spec.servicePatternVersion,
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: ScheduleMismatchReviewCandidateLike[];
  evidence: ScheduleMismatchReviewEvidenceLike[];
  coverage: ScheduleMismatchReviewCoverageLike[];
} {
  const candidates: ScheduleMismatchReviewCandidateLike[] = [];
  const evidence: ScheduleMismatchReviewEvidenceLike[] = [];
  const coverage: ScheduleMismatchReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.scopeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: {
        routeId: spec.routeId,
        direction: "0",
        daypart: "am_peak",
        scheduledRuntimeMinutes: spec.scheduled ?? 20,
        observedRuntimeP50Minutes: spec.observedP50 ?? 26,
        observedTripCount: spec.tripCount ?? 80,
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
      reasonCode: spec.reasonCode ?? "schedule_too_tight",
      claimText: `Scheduled runtime for route ${spec.routeId} differs from observed at ${spec.scopeId}.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        counterEvidence: [
          "Runtime deviation is descriptive and does not assign blame for schedule mismatch.",
          "Congestion, incidents, seasonality, and service-pattern changes can affect observed runtime.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  // padding review (observed faster than scheduled): forced into review
  {
    scopeId: "M15-cell",
    routeId: "M15",
    emitted: true,
    detectorScore: 95,
    reasonCode: "schedule_padding_review",
    scheduled: 30,
    observedP50: 22,
  },
  // top score, too tight
  { scopeId: "B44-cell", routeId: "B44", emitted: true, detectorScore: 92, scheduled: 20, observedP50: 28 },
  { scopeId: "B46-cell", routeId: "B46", emitted: true, detectorScore: 90, scheduled: 20, observedP50: 27 },
  // thin trip support
  {
    scopeId: "Q44-cell",
    routeId: "Q44",
    emitted: true,
    detectorScore: 85,
    scheduled: 20,
    observedP50: 26,
    tripCount: 15,
  },
  // service-pattern caveat
  {
    scopeId: "S79-cell",
    routeId: "S79",
    emitted: true,
    detectorScore: 82,
    scheduled: 20,
    observedP50: 25,
    servicePatternVersion: null,
  },
  // near threshold
  { scopeId: "BX12-cell", routeId: "BX12", emitted: true, detectorScore: 64, scheduled: 20, observedP50: 24 },
  // cap-suppressed control: not emitted clean_no_hit with |signedPercent| >= 0.15
  { scopeId: "Q5-cell", routeId: "Q5", emitted: false, outcome: "clean_no_hit", scheduled: 20, observedP50: 25 },
  // genuinely clean: |signedPercent| below 0.15
  { scopeId: "M1-cell", routeId: "M1", emitted: false, outcome: "clean_no_hit", scheduled: 20, observedP50: 21 },
  // skipped
  {
    scopeId: "B2-cell",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "baseline_unavailable",
    reason: "Scheduled runtime baseline is unavailable.",
  },
];

describe("schedule mismatch review queue", () => {
  test("forces padding class, stratifies thin/service-pattern risks, computes cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildScheduleMismatchReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      quota: {
        top_score: 2,
        near_threshold: 1,
        padding_review: 1,
        thin_trip_support: 1,
        service_pattern_caveat: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({
      emittedCount: 6,
      coverageCount: 9,
      capSuppressedCount: 1,
    });
    expect(queue.summary.byStratum).toMatchObject({
      top_score: 2,
      near_threshold: 1,
      padding_review: 1,
      thin_trip_support: 1,
      service_pattern_caveat: 1,
      borough_spread: 0,
      cap_suppressed_control: 1,
      clean_control: 1,
      skipped_control: 1,
    });
    expect(queue.summary.emittedByReasonCode).toEqual({
      schedule_padding_review: 1,
      schedule_too_tight: 5,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({ baseline_unavailable: 1 });
    expect(queue.summary.capSuppressedByBoroughPrefix).toEqual({ Q: 1 });

    expect(byScope.get("M15-cell")?.stratum).toBe("padding_review");
    expect(byScope.get("B44-cell")?.stratum).toBe("top_score");
    expect(byScope.get("Q44-cell")?.stratum).toBe("thin_trip_support");
    expect(byScope.get("S79-cell")?.stratum).toBe("service_pattern_caveat");
    expect(byScope.get("BX12-cell")?.stratum).toBe("near_threshold");
    expect(byScope.get("Q5-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("M1-cell")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-cell")?.stratum).toBe("skipped_control");

    expect(byScope.get("Q5-cell")?.capSuppressed).toBe(true);
    expect(byScope.get("M1-cell")?.capSuppressed).toBe(false);
    expect(byScope.get("M15-cell")?.paddingReview).toBe(true);
    expect(byScope.get("M15-cell")?.metrics.signedPercent).toBeCloseTo(-0.2667, 3);
    expect(byScope.get("Q44-cell")?.thinTripSupport).toBe(true);
    expect(byScope.get("S79-cell")?.servicePatternCaveat).toBe(true);
    expect(queue.items.every((item) => item.selectedForReview)).toBe(true);
  });
});
