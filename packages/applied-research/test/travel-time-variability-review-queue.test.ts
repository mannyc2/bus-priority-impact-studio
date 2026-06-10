import { describe, expect, test } from "bun:test";
import {
  buildTravelTimeVariabilityReviewQueue,
  type TravelTimeVariabilityReviewCandidateLike,
  type TravelTimeVariabilityReviewCoverageLike,
  type TravelTimeVariabilityReviewEvidenceLike,
} from "../src/evaluation/travel-time-variability-review-queue";

const DETECTOR_ID = "travel_time_variability";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly p50?: number;
  readonly p95?: number;
  readonly tripCount?: number;
  readonly servicePatternVersion?: string | null;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    direction: "0",
    daypart: "am_peak",
    observedRuntimeP50Minutes: spec.p50 ?? 20,
    observedRuntimeP95Minutes: spec.p95 ?? 30,
    bufferIndex: ((spec.p95 ?? 30) - (spec.p50 ?? 20)) / (spec.p50 ?? 20),
    observedTripCount: spec.tripCount ?? 80,
    servicePatternVersion:
      spec.servicePatternVersion === undefined ? "v2026-03" : spec.servicePatternVersion,
    counterEvidence: [
      "Runtime variability is descriptive and does not identify cause.",
      "Incident-driven outliers can inflate P95 runtime.",
    ],
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: TravelTimeVariabilityReviewCandidateLike[];
  evidence: TravelTimeVariabilityReviewEvidenceLike[];
  coverage: TravelTimeVariabilityReviewCoverageLike[];
} {
  const candidates: TravelTimeVariabilityReviewCandidateLike[] = [];
  const evidence: TravelTimeVariabilityReviewEvidenceLike[] = [];
  const coverage: TravelTimeVariabilityReviewCoverageLike[] = [];
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
        observedTripCount: spec.tripCount ?? 80,
        observedRuntimeP50Minutes: spec.p50 ?? 20,
        observedRuntimeP95Minutes: spec.p95 ?? 30,
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
      claimText: `Route ${spec.routeId} travel time is variable at ${spec.scopeId}.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        counterEvidence: [
          "Runtime variability is descriptive and does not identify cause.",
          "Route or service-pattern changes can break comparability across periods.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  // incident outlier: bufferIndex 1.0 (P95 double P50)
  { scopeId: "M15-cell", routeId: "M15", emitted: true, detectorScore: 100, p50: 20, p95: 40 },
  // top score, healthy support
  { scopeId: "B44-cell", routeId: "B44", emitted: true, detectorScore: 92, p50: 20, p95: 36 },
  // thin trip support
  {
    scopeId: "Q44-cell",
    routeId: "Q44",
    emitted: true,
    detectorScore: 88,
    p50: 20,
    p95: 35,
    tripCount: 35,
  },
  // service-pattern caveat (missing version)
  {
    scopeId: "S79-cell",
    routeId: "S79",
    emitted: true,
    detectorScore: 84,
    p50: 20,
    p95: 33,
    servicePatternVersion: null,
  },
  // near threshold
  { scopeId: "BX12-cell", routeId: "BX12", emitted: true, detectorScore: 64, p50: 20, p95: 31 },
  // borough spread (mid score, healthy)
  { scopeId: "BX36-cell", routeId: "BX36", emitted: true, detectorScore: 78, p50: 20, p95: 34 },
  // cap-suppressed control: not emitted but clean_no_hit with bufferIndex >= 0.5
  { scopeId: "Q5-cell", routeId: "Q5", emitted: false, outcome: "clean_no_hit", p50: 20, p95: 32 },
  // genuinely clean: bufferIndex below 0.5
  { scopeId: "M1-cell", routeId: "M1", emitted: false, outcome: "clean_no_hit", p50: 20, p95: 26 },
  // skipped
  {
    scopeId: "B2-cell",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_runtime_observations",
    reason: "Observed trip count is below the detector minimum.",
  },
];

describe("travel time variability review queue", () => {
  test("stratifies incident/thin/service-pattern risks and cap suppression from coverage", () => {
    const input = buildInputs(SPECS);
    const queue = buildTravelTimeVariabilityReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      quota: {
        top_score: 2,
        near_threshold: 1,
        low_trip_support: 1,
        incident_outlier_suspect: 1,
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
      low_trip_support: 1,
      incident_outlier_suspect: 1,
      service_pattern_caveat: 1,
      borough_spread: 0,
      cap_suppressed_control: 1,
      clean_control: 1,
      skipped_control: 1,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({ insufficient_runtime_observations: 1 });
    expect(queue.summary.capSuppressedByBoroughPrefix).toEqual({ Q: 1 });

    expect(byScope.get("M15-cell")?.stratum).toBe("incident_outlier_suspect");
    expect(byScope.get("B44-cell")?.stratum).toBe("top_score");
    expect(byScope.get("Q44-cell")?.stratum).toBe("low_trip_support");
    expect(byScope.get("S79-cell")?.stratum).toBe("service_pattern_caveat");
    expect(byScope.get("BX12-cell")?.stratum).toBe("near_threshold");
    expect(byScope.get("BX36-cell")?.stratum).toBe("top_score");
    expect(byScope.get("Q5-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("M1-cell")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-cell")?.stratum).toBe("skipped_control");

    expect(byScope.get("Q5-cell")?.capSuppressed).toBe(true);
    expect(byScope.get("M1-cell")?.capSuppressed).toBe(false);
    expect(byScope.get("M15-cell")?.incidentOutlierSuspect).toBe(true);
    expect(byScope.get("Q44-cell")?.lowTripSupport).toBe(true);
    expect(byScope.get("S79-cell")?.servicePatternCaveat).toBe(true);
    expect(byScope.get("M15-cell")?.metrics.bufferIndex).toBeCloseTo(1, 5);
    expect(byScope.get("M15-cell")?.counterEvidence).toContain(
      "Route or service-pattern changes can break comparability across periods.",
    );
    expect(queue.items.every((item) => item.selectedForReview)).toBe(true);
  });
});
