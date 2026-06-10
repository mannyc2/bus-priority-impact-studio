import { describe, expect, test } from "bun:test";
import {
  buildInterventionGapReviewQueue,
  type InterventionGapReviewCandidateLike,
  type InterventionGapReviewCoverageLike,
  type InterventionGapReviewEvidenceLike,
} from "../src/evaluation/intervention-gap-review-queue";

const DETECTOR_ID = "intervention_gap";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly evidenceStatus?: "absent" | "thin_source_gap";
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): string {
  return JSON.stringify({
    routeId: spec.routeId,
    speedPainScore: spec.detectorScore ?? 90,
    reliabilityPainScore: 80,
    interventionEvidenceStatus: spec.evidenceStatus ?? "absent",
    interventionEvidenceCount: spec.evidenceStatus === "thin_source_gap" ? 1 : 0,
  });
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: InterventionGapReviewCandidateLike[];
  evidence: InterventionGapReviewEvidenceLike[];
  coverage: InterventionGapReviewCoverageLike[];
} {
  const candidates: InterventionGapReviewCandidateLike[] = [];
  const evidence: InterventionGapReviewEvidenceLike[] = [];
  const coverage: InterventionGapReviewCoverageLike[] = [];
  for (const spec of specs) {
    coverage.push({
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      outcome: spec.outcome ?? (spec.emitted ? "hit" : "clean_no_hit"),
      reasonCode: spec.skipReasonCode ?? null,
      reason: spec.reason ?? null,
      inputsSeenJson: JSON.stringify({ routeId: spec.routeId, speedPainScore: 90 }),
    });
    if (!spec.emitted) continue;
    const candidateId = `candidate-${spec.routeId}`;
    candidates.push({
      candidateId,
      detectorId: DETECTOR_ID,
      scopeId: spec.routeId,
      routeId: spec.routeId,
      detectorScore: spec.detectorScore ?? 92,
      severity: "medium",
      confidence: spec.evidenceStatus === "thin_source_gap" ? "low" : "medium",
      claimText: `Route ${spec.routeId} intervention gap.`,
    });
    evidence.push({ candidateId, evidenceRole: "primary", evidenceRef: primaryRef(spec) });
    evidence.push({
      candidateId,
      evidenceRole: "counter_evidence",
      evidenceRef: JSON.stringify({
        routeId: spec.routeId,
        limitation:
          "Absent or thin local intervention evidence is not proof no treatment exists; undated, future-only, or source-gap interventions can hide a relevant treatment.",
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { routeId: "M15", emitted: true, detectorScore: 99 },
  { routeId: "B44", emitted: true, detectorScore: 96 },
  // thin source gap evidence class
  { routeId: "Q44", emitted: true, detectorScore: 94, evidenceStatus: "thin_source_gap" },
  // near threshold
  { routeId: "BX36", emitted: true, detectorScore: 86 },
  // clean control
  { routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  // skipped: missing pain signal
  {
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "missing_pain_signal",
    reason: "No speed or observed-reliability pain signal was available.",
  },
];

describe("intervention gap review queue", () => {
  test("forces thin-source-gap class, records evidence-status mix, rank-based cap suppression", () => {
    const input = buildInputs(SPECS);
    const queue = buildInterventionGapReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 1,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_source_gap: 1,
        borough_spread: 0,
        cap_suppressed_control: 2,
        clean_control: 1,
        skipped_control: 1,
      },
    });
    const byScope = new Map(queue.items.map((item) => [item.scopeId, item]));

    expect(queue.summary).toMatchObject({ emittedCount: 4, coverageCount: 6 });
    expect(queue.summary.capSuppressedCount).toBe(3);
    expect(queue.summary.emittedByEvidenceStatus).toEqual({ absent: 3, thin_source_gap: 1 });
    expect(queue.summary.skippedByReasonCode).toEqual({ missing_pain_signal: 1 });

    expect(byScope.get("M15")?.stratum).toBe("top_score");
    expect(byScope.get("M15")?.capSuppressed).toBe(false);
    expect(byScope.get("B44")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q44")?.thinSourceGap).toBe(true);
    expect(byScope.get("Q44")?.metrics.interventionEvidenceStatus).toBe("thin_source_gap");
    expect(byScope.get("M1")?.stratum).toBe("clean_control");
    expect(byScope.get("B2")?.stratum).toBe("skipped_control");
    expect(byScope.get("M15")?.counterEvidence).toContain(
      "Absent or thin local intervention evidence is not proof no treatment exists; undated, future-only, or source-gap interventions can hide a relevant treatment.",
    );
  });
});
