import { describe, expect, test } from "bun:test";
import {
  coverageThroughLabel,
  deltaBarShare,
  directionOptions,
  EXPLORER_COLLAPSED_ROW_COUNT,
  laneReadoutLine,
  latestPeakWindow,
  latestSlowestWindow,
  rankSegmentsSlowestFirst,
  resolvePinnedSegment,
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
    expect(laneReadoutLine("none")).toBe("No DOT bus lane along this stretch");
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
