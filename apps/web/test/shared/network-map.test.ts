import { describe, expect, test } from "bun:test";
import { PERIOD_HOURS, periodSpeed } from "../../src/components/route/NetworkMapLibre";
import type { NetworkMapFeature } from "../../src/studio/api-client";
import type { StudyIndexRow } from "../../src/studio/api-contract";
import { lensValue, popupStats, routeStudySummary } from "../../src/studio/pages/network-map";

function feature(overrides: {
  routeId?: string;
  label?: string;
  currentMph?: number;
  hourlySpeedMph?: Array<number | null>;
  hourlyTraversalCount?: number[];
  dailyRiders?: number;
  laneCoverage?: number;
}): NetworkMapFeature {
  return {
    type: "Feature",
    id: overrides.routeId ?? "R1",
    geometry: { type: "MultiLineString", coordinates: [] },
    properties: {
      routeId: overrides.routeId ?? "R1",
      label: overrides.label ?? "B1",
      borough: "Brooklyn",
      sbs: false,
      currentMph: overrides.currentMph ?? 8,
      trend6mPct: null,
      dailyRiders: overrides.dailyRiders ?? 10_000,
      riderHoursLost: null,
      laneCoverage: overrides.laneCoverage ?? 40,
      ace: false,
      hourlySpeedMph: overrides.hourlySpeedMph ?? new Array<number | null>(24).fill(null),
      hourlyTraversalCount: overrides.hourlyTraversalCount ?? new Array<number>(24).fill(0),
      servedBoroughs: ["Brooklyn"],
      factsStatus: "ready",
    },
  };
}

function hoursWith(values: Record<number, { speed: number; traversals: number }>): {
  hourlySpeedMph: Array<number | null>;
  hourlyTraversalCount: number[];
} {
  const hourlySpeedMph = new Array<number | null>(24).fill(null);
  const hourlyTraversalCount = new Array<number>(24).fill(0);
  for (const [hour, value] of Object.entries(values)) {
    hourlySpeedMph[Number(hour)] = value.speed;
    hourlyTraversalCount[Number(hour)] = value.traversals;
  }
  return { hourlySpeedMph, hourlyTraversalCount };
}

describe("periodSpeed", () => {
  test("all-day returns currentMph", () => {
    const f = feature({
      currentMph: 7.5,
      ...hoursWith({ 8: { speed: 5, traversals: 1 } }),
    });
    expect(periodSpeed(f, "all")).toEqual({ value: 7.5, observedHours: 1, expectedHours: 1 });
  });

  test("am averages hours 7-9", () => {
    expect(PERIOD_HOURS.am).toEqual([7, 8, 9]);
    const f = feature({
      ...hoursWith({
        7: { speed: 4, traversals: 1 },
        8: { speed: 6, traversals: 2 },
        9: { speed: 8, traversals: 1 },
      }),
    });
    expect(periodSpeed(f, "am")).toEqual({ value: 6, observedHours: 3, expectedHours: 3 });
  });

  test("pm averages hours 16-19", () => {
    expect(PERIOD_HOURS.pm).toEqual([16, 17, 18, 19]);
    const f = feature({
      ...hoursWith({
        16: { speed: 4, traversals: 1 },
        17: { speed: 4, traversals: 1 },
        18: { speed: 6, traversals: 1 },
        19: { speed: 6, traversals: 1 },
      }),
    });
    expect(periodSpeed(f, "pm")).toEqual({ value: 5, observedHours: 4, expectedHours: 4 });
  });

  test("insufficient coverage remains unavailable without an all-day fallback", () => {
    const sparse = feature({
      currentMph: 9.2,
      ...hoursWith({ 8: { speed: 6, traversals: 3 } }),
    });
    expect(periodSpeed(sparse, "am")).toEqual({ value: null, observedHours: 1, expectedHours: 3 });
  });

  test("weights qualifying hours by traversal count", () => {
    const f = feature({
      currentMph: 9,
      ...hoursWith({
        7: { speed: 4, traversals: 1 },
        9: { speed: 8, traversals: 3 },
      }),
    });
    expect(periodSpeed(f, "am")).toEqual({ value: 7, observedHours: 2, expectedHours: 3 });
  });
});

describe("lensValue", () => {
  const f = feature({ currentMph: 5.4, dailyRiders: 12_400, laneCoverage: 63 });

  test("formats per lens without interpunct styling", () => {
    expect(lensValue(f, "all", "speed")).toBe("5.4 mph");
    expect(lensValue(f, "all", "riders")).toBe("12k");
    expect(lensValue(f, "all", "lanes")).toBe("63%");
    for (const lens of ["speed", "riders", "lanes"] as const) {
      expect(lensValue(f, "all", lens)).not.toContain("·");
    }
  });
});

describe("popupStats", () => {
  const f = feature({ currentMph: 5.4, dailyRiders: 12_400, laneCoverage: 63 });

  test("drops the active lens and keeps the other three measures", () => {
    expect(popupStats(f, "all", "speed")).toEqual([
      { label: "Riders", value: "12k" },
      { label: "Lanes", value: "63%" },
      { label: "Delay", value: "No data" },
    ]);
    expect(popupStats(f, "all", "riders").map((stat) => stat.label)).toEqual([
      "Speed",
      "Lanes",
      "Delay",
    ]);
    expect(popupStats(f, "all", "lanes").map((stat) => stat.label)).toEqual([
      "Speed",
      "Riders",
      "Delay",
    ]);
  });

  test("formats rider-hours of delay when available", () => {
    const withDelay: NetworkMapFeature = {
      ...f,
      properties: { ...f.properties, riderHoursLost: 3_400 },
    };
    expect(popupStats(withDelay, "all", "speed")[2]).toEqual({ label: "Delay", value: "3k hr" });
  });
});

describe("routeStudySummary", () => {
  const row = (eventKey: string): StudyIndexRow => ({
    eventKey,
    routeId: "BX28",
    routeSlug: "bx28",
    treatmentFamily: "automated_bus_lane_enforcement",
    implementationMonth: "2024-09",
    effectMph: -0.04,
    confidenceInterval: null,
    evaluationLevel: "segment_matched_did",
    claimTier: "gated_estimate",
    direction: "no_detectable_change",
  });

  test("no studies yields no deep link", () => {
    expect(routeStudySummary([])).toEqual({ count: 0, eventKey: null });
  });

  test("a single study deep-links by event key", () => {
    expect(routeStudySummary([row("study-event-a")])).toEqual({
      count: 1,
      eventKey: "study-event-a",
    });
  });

  test("multiple studies link to the history tab without a key", () => {
    expect(routeStudySummary([row("study-event-a"), row("study-event-b")])).toEqual({
      count: 2,
      eventKey: null,
    });
  });
});
