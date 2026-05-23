import { describe, expect, test } from "bun:test";
import {
  detectPersistentSpeedHotspots,
  type PersistentSpeedHotspotInput,
  type PersistentSpeedHotspotRouteInput,
} from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "hotspot0123456789abcdef0123456789";

function baseHotspot(over: Partial<PersistentSpeedHotspotInput> = {}): PersistentSpeedHotspotInput {
  return {
    segmentId: "M15:0:1",
    hotspotRank: 1,
    direction: "Northbound",
    stopOrder: 1,
    timepointStopName: "South Ferry",
    nextTimepointStopName: "Houston St",
    observationCount: 60,
    busTripCount: 200,
    weightedAverageSpeedMph: 5.2,
    slowWindowShare: 0.9,
    speedSeverity: 0.35,
    hotspotScore: 82,
    riderImpactScore: 88,
    ridershipExposure: 1200,
    ...over,
  };
}

function baseRoute(over: Partial<PersistentSpeedHotspotRouteInput> = {}) {
  return {
    routeId: "M15",
    hasSpeedData: true,
    speedObservationCount: 500,
    segmentCount: 2,
    hotspots: [baseHotspot()],
    ...over,
  } satisfies PersistentSpeedHotspotRouteInput;
}

describe("detectPersistentSpeedHotspots", () => {
  test("emits a segment candidate for a high-scoring route hotspot", () => {
    const out = detectPersistentSpeedHotspots({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("persistent_speed_hotspot");
    expect(out.candidates[0]?.scopeKind as string).toBe("segment");
    expect(out.candidates[0]?.routeId as string).toBe("M15");
    expect(out.candidates[0]?.reasonCode as string).toBe("persistent_low_speed");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("issue_needs_review");
    expect(out.evidence).toHaveLength(2);
    expect(out.evidence[0]?.evidenceKind as string).toBe("metric");
    expect(out.evidence.map((link) => link.evidenceRole as string)).toContain("counter_evidence");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("emits clean coverage when speed data exists but no hotspot crosses threshold", () => {
    const out = detectPersistentSpeedHotspots({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          hotspots: [
            baseHotspot({
              hotspotScore: 42,
              riderImpactScore: 45,
            }),
          ],
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.evidence).toHaveLength(0);
    expect(out.coverage).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
  });

  test("skips routes without speed input instead of treating silence as clean", () => {
    const out = detectPersistentSpeedHotspots({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          hasSpeedData: false,
          speedObservationCount: 0,
          hotspots: [],
        }),
      ],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("missing_speed");
  });

  test("limits candidates per route and ranks by rider impact when present", () => {
    const out = detectPersistentSpeedHotspots({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          hotspots: [
            baseHotspot({ segmentId: "low-rider", hotspotRank: 1, riderImpactScore: 70 }),
            baseHotspot({ segmentId: "high-rider", hotspotRank: 2, riderImpactScore: 95 }),
          ],
        }),
      ],
      thresholds: { candidateLimitPerRoute: 1 },
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.scopeId).toBe("high-rider");
    expect(out.candidates[0]?.detectorScore).toBe(95);
  });
});
