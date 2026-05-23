import { describe, expect, test } from "bun:test";
import { detectInterventionGaps, type InterventionGapRouteInput } from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "intervention0123456789abcdef0123";

function baseRoute(over: Partial<InterventionGapRouteInput> = {}): InterventionGapRouteInput {
  return {
    routeId: "M15",
    speedPainScore: 92,
    reliabilityPainScore: 80,
    interventionEvidenceStatus: "absent",
    interventionEvidenceCount: 0,
    ...over,
  };
}

describe("detectInterventionGaps", () => {
  test("emits a route candidate when high pain has no intervention evidence", () => {
    const out = detectInterventionGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("intervention_gap");
    expect(out.candidates[0]?.category as string).toBe("intervention");
    expect(out.candidates[0]?.reasonCode as string).toBe("intervention_gap");
    expect(out.evidence).toHaveLength(2);
    expect(out.evidence[0]?.evidenceKind as string).toBe("metric");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("treats dated or evaluated intervention evidence as clean", () => {
    const out = detectInterventionGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          interventionEvidenceStatus: "dated_or_evaluated",
          interventionEvidenceCount: 2,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("does not flag low-pain routes without treatment", () => {
    const out = detectInterventionGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ speedPainScore: 40, reliabilityPainScore: 50 })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips when neither speed nor reliability pain is available", () => {
    const out = detectInterventionGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ speedPainScore: null, reliabilityPainScore: null })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_pain_signal");
  });
});
