import { describe, expect, test } from "bun:test";
import {
  detectInterventionUnderperformance,
  type InterventionUnderperformanceComparisonInput,
  type InterventionUnderperformanceRouteInput,
} from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "underperformance0123456789abc";

function baseComparison(
  over: Partial<InterventionUnderperformanceComparisonInput> = {},
): InterventionUnderperformanceComparisonInput {
  return {
    eventId: "ace:M15:2025-01",
    interventionType: "automated_bus_lane_enforcement",
    comparisonStatus: "evaluated",
    adjustedSpeedDeltaMph: -1.2,
    comparisonRouteCount: 4,
    ...over,
  };
}

function baseRoute(
  over: Partial<InterventionUnderperformanceRouteInput> = {},
): InterventionUnderperformanceRouteInput {
  return {
    routeId: "M15",
    speedPainScore: 90,
    reliabilityPainScore: 88,
    comparisons: [baseComparison()],
    ...over,
  };
}

describe("detectInterventionUnderperformance", () => {
  test("emits a route candidate when evaluated treatment has non-positive peer-adjusted speed delta and speed score remains high", () => {
    const out = detectInterventionUnderperformance({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("intervention_underperformance");
    expect(out.candidates[0]?.reasonCode as string).toBe("negative_peer_adjusted_delta");
    expect(out.evidence).toHaveLength(2);
    expect(out.evidence[0]?.evidenceKind as string).toBe("metric");
    expect(out.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("treats positive peer-adjusted treatment evidence as clean", () => {
    const out = detectInterventionUnderperformance({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          comparisons: [baseComparison({ adjustedSpeedDeltaMph: 1.1 })],
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips routes without evaluated intervention evidence", () => {
    const out = detectInterventionUnderperformance({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ comparisons: [] })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_evaluated_intervention");
  });

  test("skips when current speed score is unavailable", () => {
    const out = detectInterventionUnderperformance({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ speedPainScore: null, reliabilityPainScore: null })],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_pain_signal");
  });

  test("does not emit speed-delta underperformance from reliability pain alone", () => {
    const out = detectInterventionUnderperformance({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          speedPainScore: null,
          reliabilityPainScore: 97,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_pain_signal");
  });
});
