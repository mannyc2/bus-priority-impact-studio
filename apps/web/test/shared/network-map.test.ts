import { describe, expect, test } from "bun:test";
import { PERIOD_HOURS, periodSpeed } from "../../src/components/route/NetworkMapLibre";
import type { NetworkMapFeature } from "../../src/studio/api-client";
import { compareRankedRoutes, rankSubline, rankValue } from "../../src/studio/pages/network-map";

function feature(overrides: {
  routeId?: string;
  label?: string;
  currentMph?: number;
  hours?: number[];
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
      scheduledMph: 9,
      currentMph: overrides.currentMph ?? 8,
      trend6mPct: null,
      dailyRiders: overrides.dailyRiders ?? 10_000,
      riderHoursLost: null,
      laneCoverage: overrides.laneCoverage ?? 40,
      ace: false,
      hotspotCount: 2,
      segmentCount: 12,
      hours: overrides.hours ?? [],
    },
  };
}

function hoursWith(values: Record<number, number>): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const [hour, value] of Object.entries(values)) hours[Number(hour)] = value;
  return hours;
}

describe("periodSpeed", () => {
  test("all-day returns currentMph", () => {
    const f = feature({ currentMph: 7.5, hours: hoursWith({ 8: 5 }) });
    expect(periodSpeed(f, "all")).toBe(7.5);
  });

  test("am averages hours 7-9", () => {
    expect(PERIOD_HOURS.am).toEqual([7, 8, 9]);
    const f = feature({ hours: hoursWith({ 7: 4, 8: 6, 9: 8 }) });
    expect(periodSpeed(f, "am")).toBe(6);
  });

  test("pm averages hours 16-19", () => {
    expect(PERIOD_HOURS.pm).toEqual([16, 17, 18, 19]);
    const f = feature({ hours: hoursWith({ 16: 4, 17: 4, 18: 6, 19: 6 }) });
    expect(periodSpeed(f, "pm")).toBe(5);
  });

  test("zero or missing hour values fall back to currentMph", () => {
    const zeroed = feature({ currentMph: 9.2, hours: hoursWith({ 7: 0, 8: 0, 9: 0 }) });
    expect(periodSpeed(zeroed, "am")).toBe(9.2);
    const empty = feature({ currentMph: 6.1, hours: [] });
    expect(periodSpeed(empty, "am")).toBe(6.1);
  });

  test("mixed present and missing hours average only the present ones", () => {
    const f = feature({ currentMph: 9, hours: hoursWith({ 7: 4, 9: 8 }) });
    expect(periodSpeed(f, "am")).toBe(6);
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
