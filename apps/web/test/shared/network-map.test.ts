import { describe, expect, test } from "bun:test";
import type { MapManifestResponse, MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import { networkMapCitationText } from "../../src/components/route/NetworkMapDataNotes";
import {
  routeExplorerSearchForSelection,
  slowestCurrentSegments,
} from "../../src/components/route/NetworkMapInspector";
import { PERIOD_HOURS, periodSpeed } from "../../src/components/route/NetworkMapLibre";
import {
  badgeFeatures,
  coverageLabel,
  createHoverIntent,
  delayClass,
  delayLensEligible,
  deltaClass,
  featureStyle,
  featureValue,
  filterNetworkFeaturesByBorough,
  formatViewValue,
  insightModel,
  legendModel,
  type NetworkView,
  percentileLine,
  periodEligible,
  resolvePreviewRouteId,
  routeSegmentSpineIds,
  slowestWindow,
  sortFeaturesForView,
  speedClass,
  unverifiedBoroughFeatureCount,
  viewEncoding,
} from "../../src/components/route/network-map-model";
import type { NetworkMapFeature } from "../../src/studio/api-client";
import type { StudyIndexRow } from "../../src/studio/api-contract";
import {
  networkMapReleaseKey,
  networkMapSearchStateKey,
  popupStatRows,
  routeStudySummary,
  selectedRouteEvidenceKey,
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
  servedBoroughs?: string[];
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
      month: "2026-03",
      label: overrides.label ?? "B1",
      borough: overrides.borough ?? "Brooklyn",
      sbs: false,
      currentMph: overrides.currentMph === undefined ? 8 : overrides.currentMph,
      trend6mPct: null,
      dailyRiders: overrides.dailyRiders === undefined ? 10_000 : overrides.dailyRiders,
      riderHoursLost: overrides.riderHoursLost === undefined ? null : overrides.riderHoursLost,
      delayCoverage: null,
      laneCoverage: overrides.laneCoverage === undefined ? 40 : overrides.laneCoverage,
      ace: false,
      hourlySpeedMph: overrides.hourlySpeedMph ?? new Array<number | null>(24).fill(null),
      hourlyTraversalCount: overrides.hourlyTraversalCount ?? new Array<number>(24).fill(0),
      servedBoroughs: overrides.servedBoroughs ?? ["Brooklyn"],
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

describe("served borough filtering", () => {
  const fleet = [
    feature({ routeId: "B", servedBoroughs: ["Brooklyn"] }),
    feature({ routeId: "BQ", servedBoroughs: ["Brooklyn", "Queens"] }),
    feature({ routeId: "Q", servedBoroughs: ["Queens"] }),
    feature({ routeId: "UNKNOWN", servedBoroughs: [] }),
  ];

  test("uses exact served membership and keeps cross-borough routes in both views", () => {
    expect(
      filterNetworkFeaturesByBorough(fleet, "Brooklyn").map(
        (candidate) => candidate.properties.routeId,
      ),
    ).toEqual(["B", "BQ"]);
    expect(
      filterNetworkFeaturesByBorough(fleet, "Queens").map(
        (candidate) => candidate.properties.routeId,
      ),
    ).toEqual(["BQ", "Q"]);
  });

  test("keeps unverified routes only in All and reports the gap", () => {
    expect(filterNetworkFeaturesByBorough(fleet, undefined)).toHaveLength(4);
    expect(filterNetworkFeaturesByBorough(fleet, "Manhattan")).toEqual([]);
    expect(unverifiedBoroughFeatureCount(fleet)).toBe(1);
  });
});

describe("transient route preview", () => {
  test("focus and pointer previews clear independently", () => {
    expect(resolvePreviewRouteId(null, "POINTER")).toBe("POINTER");
    expect(resolvePreviewRouteId("FOCUS", "POINTER")).toBe("FOCUS");
    expect(resolvePreviewRouteId("FOCUS", null)).toBe("FOCUS");
    expect(resolvePreviewRouteId(null, null)).toBeNull();
  });
});

describe("network map state identity", () => {
  test("includes unknown runtime keys when comparing a URL to its canonical form", () => {
    expect(networkMapSearchStateKey({ route: "m15-sbs", extra: "remove-me" })).not.toBe(
      networkMapSearchStateKey({ route: "m15-sbs" }),
    );
    expect(networkMapSearchStateKey({ route: "m15-sbs", period: "am" })).toBe(
      networkMapSearchStateKey({ period: "am", route: "m15-sbs" }),
    );
  });

  test("changes when the manifest release identity changes", () => {
    const base = {
      schemaVersion: 2,
      releaseId: "pub-a",
      publishedAt: "2026-04-01T00:00:00.000Z",
      coverage: { start: "2026-01", end: "2026-03" },
    } as unknown as MapManifestResponse;
    const next = { ...base, releaseId: "pub-b" } as MapManifestResponse;
    expect(networkMapReleaseKey(base)).not.toBe(networkMapReleaseKey(next));
  });

  test("invalidates selected evidence when a same-release segment object changes", () => {
    const artifact = {
      artifactKind: "map_route_segments_geojson",
      artifactKey: "map/routes/m15-a.geojson",
      sha256: "a".repeat(64),
      routeId: "M15+",
    };
    const manifest = {
      schemaVersion: 2,
      releaseId: "pub-a",
      publishedAt: "2026-04-01T00:00:00.000Z",
      coverage: { start: "2026-01", end: "2026-03" },
      artifacts: [artifact],
    } as unknown as MapManifestResponse;
    expect(selectedRouteEvidenceKey(manifest, "M15+")).not.toBe(
      selectedRouteEvidenceKey(
        {
          ...manifest,
          artifacts: [{ ...artifact, sha256: "b".repeat(64) }],
        } as unknown as MapManifestResponse,
        "M15+",
      ),
    );
  });
});

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

  test("peak eligibility requires complete mapped-universe coverage", () => {
    const complete = feature({
      ...hoursWith({
        7: { speed: 6, traversals: 2 },
        8: { speed: 7, traversals: 2 },
      }),
    });
    const sparse = feature({ ...hoursWith({ 7: { speed: 6, traversals: 2 } }) });
    expect(periodEligible([complete], "am")).toBe(true);
    expect(periodEligible([complete, sparse], "am")).toBe(false);
    expect(periodEligible([], "am")).toBe(false);
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
    expect(legend?.bands.map((band) => band.count)).toEqual([1, 1, 2]);
    expect(legend?.noDataCount).toBe(1);
    expect(legend?.bands[2]?.darkText).toBe(true);
  });

  test("a legend with nothing in any band does not render", () => {
    /* Every band at (0) asserts that the colours exist, not that any route is
       in them. Facts absent -> no legend; facts present -> unchanged. */
    const blank = [feature({ routeId: "GAP", currentMph: null, riderHoursLost: null })];
    expect(legendModel(blank, SPEED_ALL, "March 2026")).toBeNull();
    expect(legendModel(blank, DELAY, "March 2026")).toBeNull();
    expect(legendModel(fleet, SPEED_ALL, "March 2026")).not.toBeNull();
  });

  test("delay bands order worst first", () => {
    const legend = legendModel(fleet, DELAY, "March 2026");
    expect(legend?.subtitle).toBe("March 2026");
    expect(legend?.bands.map((band) => band.label)).toEqual([
      "40k or more",
      "15 to 40k",
      "8 to 15k",
      "under 8k",
    ]);
    expect(legend?.bands.map((band) => band.count)).toEqual([1, 1, 1, 1]);
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
    expect(insight).toEqual({
      lead: "Rider delay is unavailable.",
      rest: "",
      hint: "Click a route to see its delay exposure.",
    });
  });

  test("every encoding carries one standing interaction hint", () => {
    const fleet = [feature({ routeId: "A", currentMph: 5, riderHoursLost: 50_000 })];
    expect(insightModel(fleet, SPEED_ALL, "March 2026").hint).toBe(
      "Click a route for its numbers; pin it to compare.",
    );
    expect(insightModel(fleet, DELAY, "March 2026").hint).toBe(
      "Click a route to see its delay exposure.",
    );
    expect(
      insightModel(fleet, { lens: "speed", period: "am", compare: true }, "March 2026").hint,
    ).toBe("Click a route to compare peak against all day.");
  });
});

describe("createHoverIntent", () => {
  function harness() {
    const calls: string[] = [];
    const intent = createHoverIntent({
      applyActive: (previous, next) => calls.push(`active:${previous ?? "-"}>${next ?? "-"}`),
    });
    return { calls, intent };
  }

  test("sweeping across routes swaps the light highlight without dimming", () => {
    const { calls, intent } = harness();
    intent.move(["A"]);
    intent.move(["B"]);
    intent.move(["C"]);
    expect(calls).toEqual(["active:->A", "active:A>B", "active:B>C"]);
  });

  test("keeps the hovered route while it is still under the cursor", () => {
    const { calls, intent } = harness();
    intent.move(["A"]);
    intent.move(["B", "A"]);
    expect(calls).toEqual(["active:->A"]);
    expect(intent.hovered()).toBe("A");
  });

  test("resting on one route never escalates into a network-wide dim", () => {
    const { calls, intent } = harness();
    intent.move(["A"]);
    intent.move(["A"]);
    intent.move(["A"]);
    expect(calls).toEqual(["active:->A"]);
    expect(intent.hovered()).toBe("A");
  });

  test("leaving releases the highlight", () => {
    const { calls, intent } = harness();
    intent.move(["A"]);
    intent.leave();
    expect(calls).toEqual(["active:->A", "active:A>-"]);
    expect(intent.hovered()).toBeNull();
  });

  test("leaving with nothing hovered is inert", () => {
    const { calls, intent } = harness();
    intent.leave();
    expect(calls).toEqual([]);
  });

  test("dispose drops the hovered route", () => {
    const { calls, intent } = harness();
    intent.move(["A"]);
    intent.dispose();
    expect(calls).toEqual(["active:->A"]);
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
      "speed",
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
      "speed",
    );
    expect(rows.map((row) => row.value)).toEqual(["No data", "No data", "No data"]);
  });

  test("a delay hero swaps the middle slot to Speed so no metric repeats", () => {
    const rows = popupStatRows(
      feature({ currentMph: 8.25, riderHoursLost: 101_000 }),
      "Mar 2026",
      "delay",
    );
    expect(rows.map((row) => row.label)).toEqual(["Riders", "Speed", "Bus lanes"]);
    expect(rows[1]).toEqual({ label: "Speed", value: "8.3", sub: "mph, all day" });
    expect(popupStatRows(feature({ currentMph: null }), null, "delay")[1]?.value).toBe("No data");
    expect(popupStatRows(feature({}), "Mar 2026", "delta")[1]?.label).toBe("Delay");
  });
});

describe("selected-route segment context", () => {
  test("deep-links M15 SBS only with one unique matched stable spine", () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "slow",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.9, 40.7],
              [-73.8, 40.8],
            ],
          },
          properties: {
            segmentId: "slow",
            sourceSegmentId: "source-slow",
            studioSegmentId: "studio-slow",
            spineSegmentId: "spine-slow",
            spineJoinStatus: "matched",
            routeId: "M15+",
            directionId: "0",
            month: "2026-03",
            hourOfDay: null,
            averageSpeedMph: 4,
            hotspotScore: 90,
            rankOnRoute: 1,
            startStopName: "A",
            endStopName: "B",
          },
        },
        {
          type: "Feature",
          id: "duplicate-a",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.8, 40.8],
              [-73.7, 40.9],
            ],
          },
          properties: {
            segmentId: "duplicate-a",
            sourceSegmentId: "source-a",
            studioSegmentId: "studio-a",
            spineSegmentId: "spine-duplicate",
            spineJoinStatus: "matched",
            routeId: "M15+",
            directionId: "0",
            month: "2026-03",
            hourOfDay: null,
            averageSpeedMph: 5,
            hotspotScore: 80,
            rankOnRoute: 2,
            startStopName: "B",
            endStopName: "C",
          },
        },
        {
          type: "Feature",
          id: "duplicate-b",
          geometry: {
            type: "LineString",
            coordinates: [
              [-73.7, 40.9],
              [-73.6, 41],
            ],
          },
          properties: {
            segmentId: "duplicate-b",
            sourceSegmentId: "source-b",
            studioSegmentId: "studio-b",
            spineSegmentId: "spine-duplicate",
            spineJoinStatus: "matched",
            routeId: "M15+",
            directionId: "1",
            month: "2026-03",
            hourOfDay: null,
            averageSpeedMph: 6,
            hotspotScore: 70,
            rankOnRoute: 3,
            startStopName: "C",
            endStopName: "D",
          },
        },
      ],
    } as unknown as MapRouteSegmentFeatureCollection;

    const rows = slowestCurrentSegments(collection, 3);
    expect(rows.map((row) => row.feature.id)).toEqual(["slow", "duplicate-a", "duplicate-b"]);
    expect(rows.map((row) => row.durableSpineId)).toEqual(["spine-slow", null, null]);
    expect(routeExplorerSearchForSelection("spine-slow", collection)).toEqual({
      tab: "segments",
      segment: "spine-slow",
    });
    expect(routeExplorerSearchForSelection("spine-duplicate", collection)).toEqual({
      tab: "segments",
    });
    expect(routeExplorerSearchForSelection("studio-a", collection)).toEqual({ tab: "segments" });
    expect(routeExplorerSearchForSelection("spine-slow", null)).toEqual({ tab: "segments" });

    const [slow, duplicateA, duplicateB] = collection.features;
    if (slow === undefined || duplicateA === undefined || duplicateB === undefined) {
      throw new Error("Expected three segment fixtures.");
    }
    const mixedJoinCollection = {
      ...collection,
      features: [
        slow,
        duplicateA,
        {
          ...duplicateB,
          properties: { ...duplicateB.properties, spineJoinStatus: "ambiguous" },
        },
      ],
    } as MapRouteSegmentFeatureCollection;
    expect(routeSegmentSpineIds(mixedJoinCollection)).toEqual([
      "spine-slow",
      "spine-duplicate",
      null,
    ]);
    expect(slowestCurrentSegments(mixedJoinCollection).map((row) => row.durableSpineId)).toEqual([
      "spine-slow",
      "spine-duplicate",
      null,
    ]);
  });
});

describe("network map citation", () => {
  test("copies release identity, evidence hashes, and the mutable-alias caveat", () => {
    const manifest = {
      releaseId: "pub_20260401T000000000Z",
      publishedAt: "2026-04-01T00:00:00.000Z",
      coverage: { start: "2026-01", end: "2026-03" },
      verificationStatus: "pass",
      routeFacts: {
        status: "available",
        artifactKey: "map/releases/pub/map-route-facts.json",
        sha256: "b".repeat(64),
      },
      artifacts: [
        {
          artifactKind: "map_network_simplified_geojson",
          artifactKey: "map/releases/pub/network.geojson",
          sha256: "a".repeat(64),
        },
      ],
    } as unknown as MapManifestResponse;
    const citation = networkMapCitationText({
      url: "https://example.test/map?route=m15-sbs",
      manifest,
      view: SPEED_ALL,
      coverage: "March 2026",
      completeFactCount: 2,
      mappedRouteCount: 2,
      factsStatus: "coverage_mismatch",
      joinMessage: "Network release pub-old does not match manifest release pub-new.",
    });
    expect(citation).toContain("pub_20260401T000000000Z");
    expect(citation).toContain("map/releases/pub/network.geojson");
    expect(citation).toContain("a".repeat(64));
    expect(citation).toContain("map/releases/pub/map-route-facts.json");
    expect(citation).toContain("current-alias URL is not an immutable archive");
    expect(citation).toContain("/api/v1/map/manifest");
    expect(citation).toContain("hashes cover only the network and route-facts objects");
    expect(citation).toContain("manifest has no exposed hash");
    expect(citation).toContain("coverage mismatch detected");
    expect(citation).toContain("route facts were not applied");
    expect(citation).toContain("Manifest release");
    expect(citation).toContain("manifest-declared verification");
    expect(citation).toContain("pub-old does not match manifest release pub-new");
    expect(citation.toLowerCase()).not.toContain("baseline");

    const unavailableCitation = networkMapCitationText({
      url: "https://example.test/map",
      manifest,
      view: SPEED_ALL,
      coverage: "March 2026",
      completeFactCount: 0,
      mappedRouteCount: 2,
      factsStatus: "unavailable",
      joinMessage: "Route facts failed SHA-256 integrity verification.",
    });
    expect(unavailableCitation).toContain("route facts were not applied");
    expect(unavailableCitation).toContain("failed SHA-256 integrity verification");
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
