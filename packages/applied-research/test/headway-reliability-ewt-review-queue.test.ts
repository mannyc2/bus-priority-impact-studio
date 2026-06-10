import { describe, expect, test } from "bun:test";
import {
  buildHeadwayReliabilityEwtReviewQueue,
  type HeadwayReliabilityEwtReviewCandidateLike,
  type HeadwayReliabilityEwtReviewCoverageLike,
  type HeadwayReliabilityEwtReviewEvidenceLike,
} from "../src/evaluation/headway-reliability-ewt-review-queue";

const DETECTOR_ID = "headway_reliability_ewt";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly los?: string;
  readonly observedHeadwayCount?: number;
  readonly scheduledBusesPerHour?: number;
  readonly excessWaitTimeMinutes?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly reasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    stopId: `${spec.routeId}-stop`,
    stopName: `${spec.routeId} & Main`,
    direction: "0",
    localHour: 8,
    excessWaitTimeMinutes: spec.excessWaitTimeMinutes ?? 5,
    averageWaitTimeMinutes: 9,
    scheduledWaitTimeMinutes: 4,
    coefficientOfVariation: spec.los === "F" ? 1.2 : 0.8,
    los: spec.los ?? "E",
    observedHeadwayCount: spec.observedHeadwayCount ?? 40,
    scheduledBusesPerHour: spec.scheduledBusesPerHour ?? 8,
    scheduledHeadwayMinutes: 7.5,
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: HeadwayReliabilityEwtReviewCandidateLike[];
  evidence: HeadwayReliabilityEwtReviewEvidenceLike[];
  coverage: HeadwayReliabilityEwtReviewCoverageLike[];
} {
  const candidates: HeadwayReliabilityEwtReviewCandidateLike[] = [];
  const evidence: HeadwayReliabilityEwtReviewEvidenceLike[] = [];
  const coverage: HeadwayReliabilityEwtReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.scopeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.reasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: {
        routeId: spec.routeId,
        observedHeadwayCount: spec.observedHeadwayCount ?? 40,
        scheduledBusesPerHour: spec.scheduledBusesPerHour ?? 8,
      },
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.scopeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.scopeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 90,
      severity: "medium",
      confidence: "medium",
      claimText: `Route ${spec.routeId} excess wait at ${spec.scopeId}.`,
    });
    evidence.push({
      candidateId,
      evidenceRole: "primary",
      evidenceRef: primaryRef(spec),
    });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        counterEvidence: [
          "EWT is descriptive and does not identify the operational cause.",
          "This stop-direction-hour cell should not be generalized to the whole route without broader evidence.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { scopeId: "M15-cell", routeId: "M15", emitted: true, detectorScore: 99, los: "F" },
  { scopeId: "B44-cell", routeId: "B44", emitted: true, detectorScore: 95, los: "E" },
  {
    scopeId: "Q44-cell",
    routeId: "Q44",
    emitted: true,
    detectorScore: 92,
    los: "E",
    observedHeadwayCount: 12,
  },
  {
    scopeId: "S79-cell",
    routeId: "S79",
    emitted: true,
    detectorScore: 90,
    los: "E",
    scheduledBusesPerHour: 5,
  },
  { scopeId: "BX12-cell", routeId: "BX12", emitted: true, detectorScore: 82, los: "E" },
  { scopeId: "BX10-cell", routeId: "BX10", emitted: true, detectorScore: 80, los: "E" },
  { scopeId: "Q5-cell", routeId: "Q5", emitted: true, detectorScore: 78, los: "E" },
  { scopeId: "M1-cell", routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  {
    scopeId: "B2-cell",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    reasonCode: "insufficient_headways",
    reason: "Observed headway count is below the detector minimum.",
  },
];

describe("headway reliability ewt review queue", () => {
  test("derives cell-risk strata, cap suppression by rank, and reviewer selection", () => {
    const input = buildInputs(SPECS);
    const queue = buildHeadwayReliabilityEwtReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 5,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_headway_samples: 1,
        borderline_frequency: 1,
        extreme_variability: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({
      emittedCount: 7,
      coverageCount: 9,
      capSuppressedCount: 2,
      selectedForReviewCount: 9,
    });
    expect(queue.summary.byStratum).toMatchObject({
      top_score: 1,
      near_threshold: 1,
      thin_headway_samples: 1,
      borderline_frequency: 1,
      extreme_variability: 1,
      borough_spread: 0,
      cap_suppressed_control: 2,
      clean_control: 1,
      skipped_control: 1,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({ insufficient_headways: 1 });
    expect(queue.summary.capSuppressedByBoroughPrefix).toEqual({ BX: 1, Q: 1 });

    expect(byScope.get("M15-cell")?.stratum).toBe("extreme_variability");
    expect(byScope.get("B44-cell")?.stratum).toBe("top_score");
    expect(byScope.get("Q44-cell")?.stratum).toBe("thin_headway_samples");
    expect(byScope.get("S79-cell")?.stratum).toBe("borderline_frequency");
    expect(byScope.get("BX12-cell")?.stratum).toBe("near_threshold");
    expect(byScope.get("BX10-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q5-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("M1-cell")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-cell")?.stratum).toBe("skipped_control");

    expect(byScope.get("BX10-cell")?.capSuppressed).toBe(true);
    expect(byScope.get("B44-cell")?.capSuppressed).toBe(false);
    expect(byScope.get("M15-cell")?.extremeVariability).toBe(true);
    expect(byScope.get("Q44-cell")?.thinHeadwaySamples).toBe(true);
    expect(byScope.get("S79-cell")?.borderlineFrequency).toBe(true);
    expect(byScope.get("M15-cell")?.counterEvidence).toContain(
      "This stop-direction-hour cell should not be generalized to the whole route without broader evidence.",
    );
    expect(queue.items.every((item) => item.selectedForReview)).toBe(true);
  });
});
