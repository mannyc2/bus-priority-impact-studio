import { describe, expect, test } from "bun:test";
import {
  routeMapPopupModel,
  routeSegmentAnchor,
  segmentDirectionName,
} from "../../src/components/route/route-map-popup";
import type { StudioSegment } from "../../src/studio/api-contract";

const segment = {
  from: "86 St",
  to: "59 St",
  direction: "NB",
  lane: "partial",
} satisfies Pick<StudioSegment, "from" | "to" | "direction" | "lane">;

describe("route map popup (the one click surface)", () => {
  test("names the segment, its direction, and its observed speed", () => {
    const model = routeMapPopupModel({
      segment,
      speedMph: 4.83,
      periodLabel: "current all day",
      rank: 3,
      rankedCount: 24,
    });

    expect(model.title).toBe("86 St → 59 St");
    expect(model.directionName).toBe("Northbound");
    expect(model.speedValue).toBe("4.8");
    expect(model.speedUnit).toBe("mph, current all day");
    expect(model.rankLine).toBe("#3 slowest of 24");
  });

  test("states a missing speed rather than printing a zero", () => {
    const model = routeMapPopupModel({
      segment,
      speedMph: null,
      periodLabel: "current all day",
      rank: null,
      rankedCount: 24,
    });

    expect(model.speedValue).toBe("—");
    expect(model.speedUnit).toBe("no speed data, current all day");
    // Unranked (the direction filter excludes it) means no rank claim at all.
    expect(model.rankLine).toBeNull();
  });

  test("carries the lane line and tags only real coverage", () => {
    expect(routeMapPopupModel({ ...base(), segment }).laneTagged).toBe(true);
    expect(routeMapPopupModel({ ...base(), segment }).laneLine).toContain(
      "part of this stretch",
    );

    const untagged = routeMapPopupModel({
      ...base(),
      segment: { ...segment, lane: "minimal" },
    });
    // `minimal` is proximity noise; it never earns the "What changed" link.
    expect(untagged.laneTagged).toBe(false);
  });

  test("shows an unmapped direction code as served rather than guessing", () => {
    expect(segmentDirectionName("SB")).toBe("Southbound");
    expect(segmentDirectionName("XX")).toBe("XX");
  });
});

describe("routeSegmentAnchor", () => {
  const collection = {
    features: [
      {
        properties: { studioSegmentId: "seg-1" },
        geometry: {
          coordinates: [
            [-73.95, 40.77],
            [-73.96, 40.76],
            [-73.97, 40.75],
          ] as ReadonlyArray<readonly [number, number]>,
        },
      },
    ],
  };

  test("anchors to the segment's own midpoint, never the pointer", () => {
    expect(routeSegmentAnchor(collection, "seg-1")).toEqual([-73.96, 40.76]);
  });

  test("returns null when the clicked segment has no published geometry", () => {
    expect(routeSegmentAnchor(collection, "seg-missing")).toBeNull();
  });
});

function base(): {
  speedMph: number | null;
  periodLabel: string;
  rank: number | null;
  rankedCount: number;
} {
  return { speedMph: 5, periodLabel: "current all day", rank: 1, rankedCount: 2 };
}
