import { describe, expect, test } from "bun:test";
import {
  detectDelayConcentration,
  type DelayConcentrationRouteInput,
  type DelayConcentrationSegmentInput,
} from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "delayconc0123456789abcdef0123456";

function seg(
  index: number,
  speedMph: number,
  over: Partial<DelayConcentrationSegmentInput> = {},
): DelayConcentrationSegmentInput {
  return {
    segmentId: `S:${index}`,
    direction: "Northbound",
    stopOrder: index,
    timepointStopName: `Stop ${index}`,
    nextTimepointStopName: `Stop ${index + 1}`,
    observationCount: 30,
    busTripCount: 100,
    weightedAverageSpeedMph: speedMph,
    weightedAverageTravelTimeMinutes: (1 / speedMph) * 60,
    averageRoadDistanceMiles: 1,
    ...over,
  };
}

// 24 free-flow segments + 6 crawling segments: all avoidable delay sits in 6 of 30.
function concentratedRoute(routeId: string): DelayConcentrationRouteInput {
  return {
    routeId,
    hasSpeedData: true,
    speedObservationCount: 900,
    segments: [
      ...Array.from({ length: 24 }, (_, i) => seg(i, 12)),
      ...Array.from({ length: 6 }, (_, i) => seg(24 + i, 3)),
    ],
  };
}

// Gentle speed gradient: avoidable delay is spread across segments -> low Gini.
function diffuseRoute(routeId: string): DelayConcentrationRouteInput {
  return {
    routeId,
    hasSpeedData: true,
    speedObservationCount: 900,
    segments: Array.from({ length: 30 }, (_, i) => seg(i, 7 + (i % 5))),
  };
}

const DIFFUSE = ["B41", "B6", "B12", "B35", "B82"];

describe("detectDelayConcentration", () => {
  test("flags only the route whose avoidable delay is a fleet outlier in concentration", () => {
    const out = detectDelayConcentration({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [concentratedRoute("B44"), ...DIFFUSE.map(diffuseRoute)],
    });

    expect(out.candidates).toHaveLength(1);
    const candidate = out.candidates[0]!;
    expect(candidate.detectorId as string).toBe("delay_concentration");
    expect(candidate.scopeKind as string).toBe("route");
    expect(candidate.routeId as string).toBe("B44");
    expect(candidate.reasonCode as string).toBe("delay_concentrated");
    expect(candidate.category as string).toBe("speed");
    expect(candidate.claimText).toContain("6 of 30");

    // One coverage row per route considered; B44 hit, the rest clean.
    expect(out.coverage).toHaveLength(6);
    const b44 = out.coverage.find((row) => (row.scopeId as string) === "B44")!;
    expect(b44.outcome as string).toBe("hit");
    expect(
      out.coverage.filter((row) => (row.outcome as string) === "clean_no_hit"),
    ).toHaveLength(5);

    // Evidence: primary metric + counter-evidence; primary carries the computed Gini.
    expect(out.evidence).toHaveLength(2);
    const roles = out.evidence.map((link) => link.evidenceRole as string);
    expect(roles).toContain("primary");
    expect(roles).toContain("counter_evidence");
    const primary = out.evidence.find((link) => (link.evidenceRole as string) === "primary")!;
    const ref = JSON.parse(primary.evidenceRef) as { gini: number; topSegmentsShare: number };
    expect(ref.gini).toBeCloseTo(0.8, 10);
    expect(ref.topSegmentsShare).toBeCloseTo(1, 10);
  });

  test("does not flag without a minimum fleet to benchmark against", () => {
    const out = detectDelayConcentration({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [concentratedRoute("B44")],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips routes without enough clean segments", () => {
    const tiny: DelayConcentrationRouteInput = {
      routeId: "B99",
      hasSpeedData: true,
      speedObservationCount: 90,
      segments: Array.from({ length: 3 }, (_, i) => seg(i, 4)),
    };
    const out = detectDelayConcentration({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [concentratedRoute("B44"), ...DIFFUSE.map(diffuseRoute), tiny],
    });

    const tinyRow = out.coverage.find((row) => (row.scopeId as string) === "B99")!;
    expect(tinyRow.outcome as string).toBe("skipped_missing_input");
    expect(out.candidates.map((candidate) => candidate.scopeId as string)).not.toContain("B99");
  });
});
