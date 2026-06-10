import { describe, expect, test } from "bun:test";
import {
  buildBunchingHotspotsReviewQueue,
  type BunchingHotspotsReviewCandidateLike,
  type BunchingHotspotsReviewCoverageLike,
  type BunchingHotspotsReviewEvidenceLike,
} from "../src/evaluation/bunching-hotspots-review-queue";

const DETECTOR_ID = "bunching_hotspots";
const GENERATED_AT = "2026-06-10T00:00:00.000Z";
const RELEASE_MONTH = "2026-03";

type CellSpec = {
  readonly scopeId: string;
  readonly routeId: string;
  readonly emitted: boolean;
  readonly detectorScore?: number;
  readonly reasonCode?: "bunching_hotspot" | "headway_gap_hotspot";
  readonly bunchingShare?: number;
  readonly gapShare?: number;
  readonly pairCount?: number;
  readonly outcome?: "hit" | "clean_no_hit" | "skipped_missing_input";
  readonly skipReasonCode?: string;
  readonly reason?: string;
};

function primaryRef(spec: CellSpec): Record<string, unknown> {
  return {
    routeId: spec.routeId,
    stopId: `${spec.routeId}-stop`,
    stopName: `${spec.routeId} & Main`,
    direction: "0",
    localHour: 8,
    pairCount: spec.pairCount ?? 60,
    bunchingShare: spec.bunchingShare ?? 0.4,
    gapShare: spec.gapShare ?? 0.1,
    scheduledHeadwayMinutes: 7.5,
  };
}

function buildInputs(specs: readonly CellSpec[]): {
  candidates: BunchingHotspotsReviewCandidateLike[];
  evidence: BunchingHotspotsReviewEvidenceLike[];
  coverage: BunchingHotspotsReviewCoverageLike[];
} {
  const candidates: BunchingHotspotsReviewCandidateLike[] = [];
  const evidence: BunchingHotspotsReviewEvidenceLike[] = [];
  const coverage: BunchingHotspotsReviewCoverageLike[] = [];
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
        observedHeadwayPairCount: spec.pairCount ?? 60,
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
      reasonCode: spec.reasonCode ?? "bunching_hotspot",
      claimText: `Route ${spec.routeId} bunching at ${spec.scopeId}.`,
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
          "GPS arrival noise can inflate short-headway counts at closely spaced stops.",
          "Terminal dispatch irregularity should be checked before assigning a mid-route location.",
        ],
      }),
    });
  }
  return { candidates, evidence, coverage };
}

const SPECS: readonly CellSpec[] = [
  { scopeId: "M15-cell", routeId: "M15", emitted: true, detectorScore: 99, bunchingShare: 0.8 },
  { scopeId: "B44-cell", routeId: "B44", emitted: true, detectorScore: 95, bunchingShare: 0.4 },
  {
    scopeId: "Q44-cell",
    routeId: "Q44",
    emitted: true,
    detectorScore: 92,
    bunchingShare: 0.4,
    pairCount: 30,
  },
  {
    scopeId: "S79-cell",
    routeId: "S79",
    emitted: true,
    detectorScore: 90,
    reasonCode: "headway_gap_hotspot",
    bunchingShare: 0.1,
    gapShare: 0.5,
  },
  { scopeId: "BX12-cell", routeId: "BX12", emitted: true, detectorScore: 66, bunchingShare: 0.3 },
  { scopeId: "BX10-cell", routeId: "BX10", emitted: true, detectorScore: 64, bunchingShare: 0.3 },
  { scopeId: "Q5-cell", routeId: "Q5", emitted: true, detectorScore: 62, bunchingShare: 0.3 },
  { scopeId: "M1-cell", routeId: "M1", emitted: false, outcome: "clean_no_hit" },
  {
    scopeId: "B2-cell",
    routeId: "B2",
    emitted: false,
    outcome: "skipped_missing_input",
    skipReasonCode: "insufficient_headway_pairs",
    reason: "Observed headway pair count is below the detector minimum.",
  },
];

describe("bunching hotspots review queue", () => {
  test("stratifies bunching/gap classes, cap suppression by rank, and reviewer selection", () => {
    const input = buildInputs(SPECS);
    const queue = buildBunchingHotspotsReviewQueue({
      generatedAt: GENERATED_AT,
      releaseMonth: RELEASE_MONTH,
      ...input,
      productionCandidateLimit: 5,
      quota: {
        top_score: 1,
        near_threshold: 1,
        thin_pair_support: 1,
        gap_dominant: 1,
        extreme_share: 1,
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
      thin_pair_support: 1,
      gap_dominant: 1,
      extreme_share: 1,
      borough_spread: 0,
      cap_suppressed_control: 2,
      clean_control: 1,
      skipped_control: 1,
    });
    expect(queue.summary.skippedByReasonCode).toEqual({ insufficient_headway_pairs: 1 });
    expect(queue.summary.emittedByReasonCode).toEqual({
      bunching_hotspot: 6,
      headway_gap_hotspot: 1,
    });
    expect(queue.summary.capSuppressedByBoroughPrefix).toEqual({ BX: 1, Q: 1 });

    expect(byScope.get("M15-cell")?.stratum).toBe("extreme_share");
    expect(byScope.get("B44-cell")?.stratum).toBe("top_score");
    expect(byScope.get("Q44-cell")?.stratum).toBe("thin_pair_support");
    expect(byScope.get("S79-cell")?.stratum).toBe("gap_dominant");
    expect(byScope.get("BX12-cell")?.stratum).toBe("near_threshold");
    expect(byScope.get("BX10-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("Q5-cell")?.stratum).toBe("cap_suppressed_control");
    expect(byScope.get("M1-cell")?.stratum).toBe("clean_control");
    expect(byScope.get("B2-cell")?.stratum).toBe("skipped_control");

    expect(byScope.get("BX10-cell")?.capSuppressed).toBe(true);
    expect(byScope.get("B44-cell")?.capSuppressed).toBe(false);
    expect(byScope.get("M15-cell")?.extremeShare).toBe(true);
    expect(byScope.get("Q44-cell")?.thinPairSupport).toBe(true);
    expect(byScope.get("S79-cell")?.gapDominant).toBe(true);
    expect(byScope.get("S79-cell")?.metrics.dominantShare).toBe(0.5);
    expect(byScope.get("M15-cell")?.counterEvidence).toContain(
      "GPS arrival noise can inflate short-headway counts at closely spaced stops.",
    );
    expect(queue.items.every((item) => item.selectedForReview)).toBe(true);
  });
});
