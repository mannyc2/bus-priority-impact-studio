import { describe, expect, test } from "bun:test";
import { PERIOD_HOURS, periodSpeed } from "../../src/components/route/NetworkMapLibre";
import type { NetworkMapFeature } from "../../src/studio/api-client";
import { compareRankedRoutes, rankSubline, rankValue } from "../../src/studio/pages/network-map";

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

describe("compareRankedRoutes", () => {
  const slow = feature({ routeId: "S", label: "B slow", currentMph: 4 });
  const fast = feature({ routeId: "F", label: "B fast", currentMph: 10 });
  const busy = feature({ routeId: "B", label: "B busy", dailyRiders: 40_000, laneCoverage: 80 });
  const quiet = feature({ routeId: "Q", label: "B quiet", dailyRiders: 2_000, laneCoverage: 10 });

  test("speed lens ranks slowest first", () => {
    expect([fast, slow].sort((l, r) => compareRankedRoutes(l, r, "all", "speed"))[0]).toBe(slow);
  });

  test("riders lens ranks highest ridership first", () => {
    expect([quiet, busy].sort((l, r) => compareRankedRoutes(l, r, "all", "riders"))[0]).toBe(busy);
  });

  test("lanes lens ranks lowest coverage first", () => {
    expect([busy, quiet].sort((l, r) => compareRankedRoutes(l, r, "all", "lanes"))[0]).toBe(quiet);
  });
});

describe("rankValue and rankSubline", () => {
  const f = feature({ currentMph: 5.4, dailyRiders: 12_400, laneCoverage: 63 });

  test("rankValue per lens", () => {
    expect(rankValue(f, "all", "speed")).toBe("5.4 mph");
    expect(rankValue(f, "all", "riders")).toBe("12k");
    expect(rankValue(f, "all", "lanes")).toBe("63%");
  });

  test("sublines avoid interpunct styling", () => {
    for (const lens of ["speed", "riders", "lanes"] as const) {
      const subline = rankSubline(f, "all", lens);
      expect(subline).not.toContain("·");
      expect(rankValue(f, "all", lens)).not.toContain("·");
    }
    expect(rankSubline(f, "all", "speed")).toBe("Brooklyn / 12k riders");
    expect(rankSubline(f, "all", "riders")).toBe("Brooklyn / 5.4 mph");
  });
});
