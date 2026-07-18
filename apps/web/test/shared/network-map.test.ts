import { describe, expect, test } from "bun:test";
import { PERIOD_HOURS, periodSpeed } from "../../src/components/route/NetworkMapLibre";
import {
  badgeFeatures,
  coverageLabel,
  delayLensEligible,
  delayClass,
  deltaClass,
  featureStyle,
  featureValue,
  formatViewValue,
  insightModel,
  legendModel,
  type NetworkView,
  percentileLine,
  slowestWindow,
  sortFeaturesForView,
  speedClass,
  viewEncoding,
} from "../../src/components/route/network-map-model";
import type { NetworkMapFeature } from "../../src/studio/api-client";
import type { StudyIndexRow } from "../../src/studio/api-contract";
import {
  popupStatRows,
  routeStudySummary,
  shortCoverage,
} from "../../src/studio/pages/network-map";

function feature(overrides: {
  routeId?: string;
  label?: string;
  borough?: string;
  currentMph?: number | null;
  hourlySpeedMph?: Array<number | null>;
  hourlyTraversalCount?: number[];
  dailyRiders?: number | null;
  laneCoverage?: number | null;
  riderHoursLost?: number | null;
}): NetworkMapFeature {
  return {
    type: "Feature",
    id: overrides.routeId ?? "R1",
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [-73.95, 40.65],
          [-73.94, 40.66],
          [-73.93, 40.67],
        ],
      ],
    },
    properties: {
      routeId: overrides.routeId ?? "R1",
      label: overrides.label ?? "B1",
      borough: overrides.borough ?? "Brooklyn",
      sbs: false,
      currentMph: overrides.currentMph === undefined ? 8 : overrides.currentMph,
      trend6mPct: null,
      dailyRiders: overrides.dailyRiders === undefined ? 10_000 : overrides.dailyRiders,
      riderHoursLost: overrides.riderHoursLost === undefined ? null : overrides.riderHoursLost,
      laneCoverage: overrides.laneCoverage === undefined ? 40 : overrides.laneCoverage,
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

const SPEED_ALL: NetworkView = { lens: "speed", period: "all", compare: false };
const DELAY: NetworkView = { lens: "delay", period: "all", compare: false };
const DELTA_PM: NetworkView = { lens: "speed", period: "pm", compare: true };

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

  test("insufficient coverage remains unavailable without an all-day fallback", () => {
    const sparse = feature({
      currentMph: 9.2,
      ...hoursWith({ 8: { speed: 6, traversals: 3 } }),
    });
    expect(periodSpeed(sparse, "am")).toEqual({ value: null, observedHours: 1, expectedHours: 3 });
  });
});

describe("attention classes", () => {
  test("speed: color marks only the slow side", () => {
    expect(speedClass(6.9)).toBe(0);
    expect(speedClass(7)).toBe(1);
    expect(speedClass(7.9)).toBe(1);
    expect(speedClass(8)).toBe(2);
    expect(speedClass(14)).toBe(2);
    expect(speedClass(null)).toBeNull();
  });

  test("delay: neutral band under 8k rider-hours", () => {
    expect(delayClass(7_999)).toBe(0);
    expect(delayClass(8_000)).toBe(1);
    expect(delayClass(15_000)).toBe(2);
    expect(delayClass(40_000)).toBe(3);
  });

  test("delta: steady band is symmetric around zero", () => {
    expect(deltaClass(-1.5)).toBe(0);
    expect(deltaClass(-0.75)).toBe(1);
    expect(deltaClass(-0.74)).toBe(2);
    expect(deltaClass(0.74)).toBe(2);
    expect(deltaClass(0.75)).toBe(3);
  });

  test("compare mode only applies to speed at a peak period", () => {
    expect(viewEncoding(DELTA_PM)).toBe("delta");
    expect(viewEncoding({ lens: "speed", period: "all", compare: true })).toBe("speed");
    expect(viewEncoding({ lens: "delay", period: "pm", compare: true })).toBe("delay");
  });
});

describe("featureStyle", () => {
  test("neutral routes paint first, severe paints last", () => {
    const severe = featureStyle(feature({ currentMph: 5 }), SPEED_ALL);
    const slow = featureStyle(feature({ currentMph: 7.5 }), SPEED_ALL);
    const neutral = featureStyle(feature({ currentMph: 11 }), SPEED_ALL);
    expect(severe.sortKey).toBeGreaterThan(slow.sortKey);
    expect(slow.sortKey).toBeGreaterThan(neutral.sortKey);
    expect(new Set([severe.color, slow.color, neutral.color]).size).toBe(3);
  });

  test("missing values encode as dashed no-data, never a class color", () => {
    const style = featureStyle(feature({ currentMph: null }), SPEED_ALL);
    expect(style.noData).toBe(true);
    expect(style.sortKey).toBeLessThan(0);
  });
});

describe("featureValue and formatting", () => {
  test("delta is the period speed minus all-day, rounded to 0.1", () => {
    const f = feature({
      currentMph: 8,
      ...hoursWith({
        16: { speed: 6, traversals: 1 },
        17: { speed: 6, traversals: 1 },
        18: { speed: 6, traversals: 1 },
        19: { speed: 6, traversals: 1 },
      }),
    });
    expect(featureValue(f, DELTA_PM)).toBe(-2);
    expect(formatViewValue(f, DELTA_PM)).toBe("-2.0");
  });

  test("values format without interpunct styling", () => {
    const f = feature({ currentMph: 5.4, riderHoursLost: 101_000 });
    expect(formatViewValue(f, SPEED_ALL)).toBe("5.4");
    expect(formatViewValue(f, DELAY)).toBe("101k");
    for (const view of [SPEED_ALL, DELAY]) {
      expect(formatViewValue(f, view)).not.toContain("·");
    }
  });
});

describe("legendModel", () => {
  const fleet = [
    feature({ routeId: "A", currentMph: 5, riderHoursLost: 50_000 }),
    feature({ routeId: "B", currentMph: 7.5, riderHoursLost: 9_000 }),
    feature({ routeId: "C", currentMph: 9, riderHoursLost: 1_000 }),
    feature({ routeId: "D", currentMph: 12, riderHoursLost: 20_000 }),
    feature({ routeId: "E", currentMph: null, riderHoursLost: null }),
  ];

  test("speed bands carry live counts and one no-data chip", () => {
    const legend = legendModel(fleet, SPEED_ALL, "March 2026");
    expect(legend.bands.map((band) => band.count)).toEqual([1, 1, 2]);
    expect(legend.noDataCount).toBe(1);
    expect(legend.bands[2]?.darkText).toBe(true);
  });

  test("delay bands order worst first", () => {
    const legend = legendModel(fleet, DELAY, "March 2026");
    expect(legend.subtitle).toBe("March 2026");
    expect(legend.bands.map((band) => band.label)).toEqual([
      "40k or more",
      "15 to 40k",
      "8 to 15k",
      "under 8k",
    ]);
    expect(legend.bands.map((band) => band.count)).toEqual([1, 1, 1, 1]);
  });
});

describe("insightModel", () => {
  test("all-day speed insight counts each band", () => {
    const fleet = [
      feature({ routeId: "A", currentMph: 5 }),
      feature({ routeId: "B", currentMph: 7.5 }),
      feature({ routeId: "C", currentMph: 9 }),
    ];
    const insight = insightModel(fleet, SPEED_ALL, "March 2026");
    expect(insight.lead).toBe("Color marks slow routes.");
    expect(insight.rest).toContain("1 run under 7 mph and 1 more under 8");
    expect(insight.rest).toContain("the other 1 ride neutral ink");
  });

  test("delay insight names the heaviest route from data", () => {
    const fleet = [
      feature({ routeId: "B6", label: "B6", riderHoursLost: 140_000, currentMph: 7.9 }),
      feature({ routeId: "Q1", label: "Q1", borough: "Queens", riderHoursLost: 90_000 }),
    ];
    const insight = insightModel(fleet, DELAY, "March 2026");
    expect(insight.lead).toBe("B6 leads the city:");
    expect(insight.rest).toContain("140k rider-hours of delay in March 2026");
  });

  test("delay insight remains unavailable when every route is no-data", () => {
    const insight = insightModel(
      [feature({ routeId: "GAP", riderHoursLost: null })],
      DELAY,
      "March 2026",
    );
    expect(insight).toEqual({ lead: "Rider delay is unavailable.", rest: "" });
  });
});

describe("delayLensEligible", () => {
  test("requires an explicit coverage label and complete route values", () => {
    const complete = [feature({ routeId: "A", riderHoursLost: 10_000 })];
    const partial = [...complete, feature({ routeId: "GAP", riderHoursLost: null })];
    expect(delayLensEligible(complete, "March 2026")).toBe(true);
    expect(delayLensEligible(complete, null)).toBe(false);
    expect(delayLensEligible(partial, "March 2026")).toBe(false);
    expect(delayLensEligible([], "March 2026")).toBe(false);
  });
});

describe("ranking and badges", () => {
  const fleet = [
    feature({ routeId: "FAST", currentMph: 12, riderHoursLost: 1_000 }),
    feature({ routeId: "SLOW", currentMph: 5, riderHoursLost: 50_000 }),
    feature({ routeId: "MID", currentMph: 8, riderHoursLost: 9_000 }),
    feature({ routeId: "GAP", currentMph: null, riderHoursLost: null }),
  ];

  test("speed ranks slowest first and keeps no-data rows last", () => {
    expect(sortFeaturesForView(fleet, SPEED_ALL).map((f) => f.properties.routeId)).toEqual([
      "SLOW",
      "MID",
      "FAST",
      "GAP",
    ]);
  });

  test("delay ranks heaviest first", () => {
    expect(sortFeaturesForView(fleet, DELAY).map((f) => f.properties.routeId)).toEqual([
      "SLOW",
      "MID",
      "FAST",
      "GAP",
    ]);
  });

  test("badges take the worst N for the active view", () => {
    expect(badgeFeatures(fleet, SPEED_ALL, 2).map((f) => f.properties.routeId)).toEqual([
      "SLOW",
      "MID",
    ]);
  });
});

describe("percentileLine", () => {
  const fleet = [
    feature({ routeId: "A", currentMph: 5, riderHoursLost: 140_000 }),
    feature({ routeId: "B", currentMph: 7, riderHoursLost: 9_000 }),
    feature({ routeId: "C", currentMph: 9, riderHoursLost: 5_000 }),
    feature({ routeId: "D", currentMph: 12, riderHoursLost: 1_000 }),
  ];

  test("the unique extremes get plain-language sentences", () => {
    expect(percentileLine(fleet[0] as NetworkMapFeature, fleet, SPEED_ALL)?.strong).toBe(
      "the slowest route citywide",
    );
    expect(percentileLine(fleet[3] as NetworkMapFeature, fleet, SPEED_ALL)?.strong).toBe(
      "the fastest route citywide",
    );
    expect(percentileLine(fleet[0] as NetworkMapFeature, fleet, DELAY)?.strong).toBe(
      "the most rider delay citywide",
    );
  });

  test("mid-pack routes read as slower-than or faster-than", () => {
    const slower = percentileLine(fleet[1] as NetworkMapFeature, fleet, SPEED_ALL);
    expect(slower?.pre).toBe("slower than ");
    expect(slower?.strong).toBe("50%");
    const faster = percentileLine(fleet[2] as NetworkMapFeature, fleet, SPEED_ALL);
    expect(faster?.pre).toBe("faster than ");
  });
});

describe("slowestWindow", () => {
  test("expands around the slowest hour within 0.4 mph", () => {
    const hours = new Array<number | null>(24).fill(9);
    hours[14] = 6.2;
    hours[15] = 6.4;
    hours[16] = 6.5;
    hours[17] = 8.9;
    const window = slowestWindow(hours);
    expect(window?.label).toBe("2 PM–5 PM");
    expect(window?.worstMph).toBe(6.2);
  });

  test("returns null when no hours observed", () => {
    expect(slowestWindow(new Array<number | null>(24).fill(null))).toBeNull();
  });
});

describe("coverage labels", () => {
  test("formats an ISO month as coverage prose", () => {
    expect(coverageLabel("2026-03")).toBe("March 2026");
    expect(shortCoverage("March 2026")).toBe("Mar 2026");
    expect(shortCoverage(null)).toBeNull();
  });
});

describe("popupStatRows", () => {
  test("spells out the trio with units and windows, no interpunct", () => {
    const rows = popupStatRows(
      feature({ dailyRiders: 10_156, riderHoursLost: 101_000, laneCoverage: 17 }),
      "Mar 2026",
    );
    expect(rows).toEqual([
      { label: "Riders", value: "10k", sub: "per day" },
      { label: "Delay", value: "101k", sub: "rider-hrs, Mar 2026" },
      { label: "Bus lanes", value: "17%", sub: "of route" },
    ]);
    for (const row of rows) {
      expect(`${row.label}${row.value}${row.sub}`).not.toContain("·");
    }
  });

  test("missing facts stay explicit", () => {
    const rows = popupStatRows(
      feature({ dailyRiders: null, riderHoursLost: null, laneCoverage: null }),
      null,
    );
    expect(rows.map((row) => row.value)).toEqual(["No data", "No data", "No data"]);
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
