import { describe, expect, test } from "bun:test";
import {
  canonicalizeRouteDetailSearch,
  coverageThroughLabel,
  deltaBarShare,
  directionOptions,
  EXPLORER_COLLAPSED_ROW_COUNT,
  laneReadoutLine,
  latestPeakWindow,
  latestSlowestWindow,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
  routeDetailSearchEquals,
  SEGMENT_LANE_TAG,
  segmentCarriesLaneTag,
  validateRouteDetailSearch,
  visibleSegments,
} from "../../src/components/route/route-segment-explorer";

const seg = (
  id: string,
  direction: string,
  speedMph: number | null,
  spineSegmentId: string | null = null,
) => ({ id, direction, speedMph, spineSegmentId });

describe("rankSegmentsSlowestFirst", () => {
  test("ranks by speed ascending; rider-hours never involved", () => {
    const ranked = rankSegmentsSlowestFirst(
      [seg("a", "NB", 7.1), seg("b", "SB", 5.3), seg("c", "NB", 6.4)],
      "all",
    );
    expect(ranked.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  test("nulls sort last; ties break by direction then id", () => {
    const ranked = rankSegmentsSlowestFirst(
      [seg("z", "SB", null), seg("b", "SB", 6.0), seg("a", "NB", 6.0)],
      "all",
    );
    expect(ranked.map((s) => s.id)).toEqual(["a", "b", "z"]);
  });

  test("direction filter narrows without re-sorting semantics", () => {
    const ranked = rankSegmentsSlowestFirst(
      [seg("a", "NB", 7.1), seg("b", "SB", 5.3), seg("c", "NB", 6.4)],
      "NB",
    );
    expect(ranked.map((s) => s.id)).toEqual(["c", "a"]);
  });

  test("ties use direction, display order, then stable identity", () => {
    const ranked = rankSegmentsSlowestFirst(
      [
        { ...seg("z", "NB", 6, "spine-z"), displayOrder: 4 },
        { ...seg("a", "NB", 6, "spine-a"), displayOrder: 2 },
        { ...seg("b", "NB", 6, "spine-b"), displayOrder: 2 },
      ],
      "all",
    );
    expect(ranked.map((segment) => segment.id)).toEqual(["a", "b", "z"]);
  });
});

describe("route detail search", () => {
  test("keeps bounded segment controls and drops impossible combinations/defaults", () => {
    expect(
      validateRouteDetailSearch({
        tab: "segments",
        segment: "stable-1",
        direction: "EB",
        month: "2026-02",
        daypart: "pm_peak",
        lanes: true,
        study: "wrong-tab",
      }),
    ).toEqual({
      tab: "segments",
      segment: "stable-1",
      direction: "EB",
      month: "2026-02",
      daypart: "pm_peak",
      lanes: true,
    });
    expect(
      validateRouteDetailSearch({ tab: "segments", month: "2026-13", daypart: "midday" }),
    ).toEqual({ tab: "segments" });
    expect(validateRouteDetailSearch({ tab: "riders", segment: "stable-1", lanes: true })).toEqual({
      tab: "riders",
    });
    expect(validateRouteDetailSearch({ tab: "overview" })).toEqual({});
  });

  test("a unique incoming pin wins a conflicting direction; an unknown pin is dropped", () => {
    const history = { status: "pending" } as const;
    const segments = [
      { direction: "NB" as const, spineSegmentId: "north" },
      { direction: "SB" as const, spineSegmentId: "south" },
    ];
    expect(
      canonicalizeRouteDetailSearch(
        { tab: "segments", segment: "south", direction: "NB", month: "2026-02" },
        { segments, history },
      ),
    ).toMatchObject({
      search: { tab: "segments", segment: "south", direction: "SB", month: "2026-02" },
      segmentState: "valid",
      historicalState: "pending",
    });
    expect(
      canonicalizeRouteDetailSearch(
        { tab: "segments", segment: "missing", direction: "NB" },
        { segments, history },
      ),
    ).toMatchObject({ search: { tab: "segments", direction: "NB" }, segmentState: "invalid" });
  });

  test("ready evidence removes only unsupported periods; pending/error preserve shared history", () => {
    const segments = [
      { direction: "NB" as const, spineSegmentId: "north" },
      { direction: "SB" as const, spineSegmentId: "south" },
    ];
    const data = {
      spineReadiness: "series_ready",
      dimensions: { months: ["2026-01"], dayparts: ["am_peak"] },
    } as never;
    const incoming = {
      tab: "segments" as const,
      month: "2026-01",
      daypart: "pm_peak" as const,
    };
    expect(
      canonicalizeRouteDetailSearch(incoming, { segments, history: { status: "ready", data } })
        .search,
    ).toEqual({ tab: "segments", month: "2026-01" });
    expect(
      canonicalizeRouteDetailSearch(incoming, { segments, history: { status: "pending" } }).search,
    ).toEqual(incoming);
    expect(
      canonicalizeRouteDetailSearch(incoming, { segments, history: { status: "unavailable" } })
        .search,
    ).toEqual(incoming);
  });

  test("pattern-review history cannot activate coloring and unavailable lanes canonicalize off", () => {
    const result = canonicalizeRouteDetailSearch(
      { tab: "segments", month: "2026-01", lanes: true },
      {
        segments: [],
        history: {
          status: "ready",
          data: { spineReadiness: "needs_pattern_review", dimensions: { months: [] } } as never,
        },
        lanes: "unavailable",
      },
    );
    expect(result.search).toEqual({ tab: "segments" });
    expect(result.historicalState).toBe("blocked");
    expect(routeDetailSearchEquals(result.search, { tab: "segments" })).toBe(true);
  });
});

describe("directionOptions", () => {
  test("derives from served segments — east-west routes get EB/WB", () => {
    expect(directionOptions([{ direction: "EB" }, { direction: "WB" }])).toEqual([
      "all",
      "EB",
      "WB",
    ]);
  });

  test("single-direction routes collapse to All only", () => {
    expect(directionOptions([{ direction: "NB" }])).toEqual(["all"]);
  });
});

describe("visibleSegments", () => {
  const ranked = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}` }));

  test("collapsed to eight rows by default", () => {
    const { rows, expanded } = visibleSegments(ranked, false, null);
    expect(rows).toHaveLength(EXPLORER_COLLAPSED_ROW_COUNT);
    expect(expanded).toBe(false);
  });

  test("pinning below the fold auto-expands", () => {
    const { rows, expanded } = visibleSegments(ranked, false, "s10");
    expect(expanded).toBe(true);
    expect(rows).toHaveLength(12);
  });

  test("pinning inside the fold stays collapsed", () => {
    const { expanded } = visibleSegments(ranked, false, "s3");
    expect(expanded).toBe(false);
  });
});

describe("resolvePinnedSegment", () => {
  const segments = [seg("a", "NB", 6, "spine-a"), seg("b", "SB", 7, null)];

  test("resolves a known stable spine id", () => {
    expect(resolvePinnedSegment(segments, "spine-a")?.id).toBe("a");
  });

  test("unknown spine ids are dropped, never positional", () => {
    expect(resolvePinnedSegment(segments, "spine-zzz")).toBeNull();
    expect(resolvePinnedSegment(segments, null)).toBeNull();
  });
});

describe("deltaBarShare", () => {
  test("clamps at ±2.5 mph so outlier schedules cannot flatten the rest", () => {
    expect(deltaBarShare(-17.1)).toBe(1);
    expect(deltaBarShare(-1.25)).toBeCloseTo(0.5);
  });
});

describe("laneReadoutLine", () => {
  test("plain phrases, proxy-labeled", () => {
    expect(laneReadoutLine("none")).toBe("No DOT bus-lane proximity signal for this stretch");
    expect(laneReadoutLine("partial")).toContain("part of this stretch");
    expect(laneReadoutLine("partial")).toContain("(proximity)");
  });
});

describe("coverage + window helpers", () => {
  test("coverageThroughLabel prefers speed-history months", () => {
    const history = { dimensions: { months: ["2025-01", "2026-03"] } } as never;
    expect(coverageThroughLabel(history, null)).toBe("coverage through Mar 2026");
    expect(coverageThroughLabel(null, null)).toBeNull();
  });

  test("latest windows pick the newest month", () => {
    const profile = {
      slowestWindows: [
        { month: "2025-01", dayOfWeek: "Friday", hourOfDay: 15, weightedAverageSpeedMph: 5.2 },
        { month: "2026-03", dayOfWeek: "Thursday", hourOfDay: 16, weightedAverageSpeedMph: 5.83 },
      ],
      peakWindows: [
        { month: "2026-02", dayOfWeek: "Thursday", hourOfDay: 17, ridership: 3332 },
        { month: "2026-03", dayOfWeek: "Tuesday", hourOfDay: 17, ridership: 4777 },
      ],
    } as never;
    expect(latestSlowestWindow(profile)).toEqual({
      hourOfDay: 16,
      label: "slowest Thu 4P — 5.8 mph",
    });
    expect(latestPeakWindow(profile)).toEqual({
      hourOfDay: 17,
      label: "busiest Tue 5P — 4.8K riders",
    });
    expect(latestSlowestWindow(null)).toBeNull();
  });
});

describe("segment lane tag", () => {
  test("only real coverage earns the tag", () => {
    expect(segmentCarriesLaneTag("yes")).toBe(true);
    expect(segmentCarriesLaneTag("partial")).toBe(true);
    expect(segmentCarriesLaneTag("minimal")).toBe(false);
    expect(segmentCarriesLaneTag("none")).toBe(false);
  });

  test("the tag is four plain words and carries no date", () => {
    expect(SEGMENT_LANE_TAG).toBe("In the bus lane");
    expect(SEGMENT_LANE_TAG).not.toMatch(/\d/);
  });
});
