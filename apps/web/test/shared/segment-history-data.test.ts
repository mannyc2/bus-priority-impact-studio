import { describe, expect, test } from "bun:test";
import {
  historicalSegmentValues,
  historicalSpeedForCells,
  segmentHistorySeries,
} from "../../src/components/route/segment-history-data.ts";
import type {
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "../../src/studio/api-contract.ts";

function segment(id: string, spineSegmentId: string | null): StudioSegment {
  return { id, spineSegmentId } as unknown as StudioSegment;
}

function history(
  readiness: StudioRouteSpeedHistoryResponse["spineReadiness"],
): StudioRouteSpeedHistoryResponse {
  return {
    spineReadiness: readiness,
    dimensions: {
      months: ["2026-01", "2026-02"],
      dayparts: ["am_peak"],
      segments: [
        { segmentId: "b41-s-node-011-node-012", displayOrder: 2 },
        { segmentId: "b41-s-node-010-node-011", displayOrder: 1 },
      ],
    },
    cells: [
      {
        segmentId: "b41-s-node-010-node-011",
        month: "2026-01",
        daypart: "am_peak",
        status: "available",
        averageSpeedMph: 7,
        observationCount: 2,
        traversalCount: 2,
      },
      {
        segmentId: "b41-s-node-010-node-011",
        month: "2026-02",
        daypart: "am_peak",
        status: "missing",
        averageSpeedMph: null,
        observationCount: 0,
        traversalCount: 0,
      },
      {
        segmentId: "b41-s-node-011-node-012",
        month: "2026-01",
        daypart: "am_peak",
        status: "available",
        averageSpeedMph: 9,
        observationCount: 1,
        traversalCount: 1,
      },
    ],
  } as unknown as StudioRouteSpeedHistoryResponse;
}

describe("segment history identity", () => {
  test("joins reordered detail records by stable spine ID and reports unmatched detail", () => {
    const result = segmentHistorySeries(history("series_ready_with_gaps"), [
      segment("B41:2026-03:S:34:303324:901681", "b41-s-node-011-node-012"),
      segment("B41:2026-03:S:30:303310:303324", "b41-s-node-010-node-011"),
      segment("B41:2026-03:S:32:303324:801144", null),
    ]);

    expect(result.readiness).toBe("partial");
    expect(result.series.get("B41:2026-03:S:34:303324:901681")?.speeds).toEqual([9, null]);
    expect(result.series.get("B41:2026-03:S:30:303310:303324")?.speeds).toEqual([7, null]);
    expect(result.unmatchedDetailSegmentIds).toEqual(["B41:2026-03:S:32:303324:801144"]);
  });

  test("keeps an all-null joined series distinct from an unmatched segment", () => {
    const input = { ...history("series_ready"), cells: [] };
    const result = segmentHistorySeries(input, [segment("current", "b41-s-node-010-node-011")]);

    expect(result.readiness).toBe("ready");
    expect(result.series.get("current")?.speeds).toEqual([null, null]);
    expect(result.unmatchedDetailSegmentIds).toEqual([]);
  });

  test("does not enable stable joins while the spine needs pattern review", () => {
    const result = segmentHistorySeries(history("needs_pattern_review"), [
      segment("current", "b41-s-node-010-node-011"),
    ]);

    expect(result.readiness).toBe("unavailable");
    expect(result.series.size).toBe(0);
    expect(result.unmatchedDetailSegmentIds).toEqual(["current"]);
  });
});

describe("historical segment values", () => {
  const cell = (
    daypart: "am_peak" | "midday" | "pm_peak" | "off_peak",
    status: "available" | "missing" | "not_expected" | "source_missing",
    speed: number | null,
    traversals: number,
    observations: number,
  ) =>
    ({
      segmentId: "stable",
      month: "2026-01",
      daypart,
      status,
      averageSpeedMph: speed,
      traversalCount: traversals,
      observationCount: observations,
    }) as never;

  test("all-day is traversal-first and falls back to observations only at zero traversals", () => {
    expect(
      historicalSpeedForCells(
        [cell("am_peak", "available", 4, 9, 100), cell("midday", "available", 10, 1, 100)],
        ["am_peak", "midday"],
      ),
    ).toBeCloseTo(4.6);
    expect(
      historicalSpeedForCells(
        [cell("am_peak", "available", 4, 0, 3), cell("midday", "available", 10, 0, 1)],
        ["am_peak", "midday"],
      ),
    ).toBeCloseTo(5.5);
  });

  test("not-expected is excluded, but any missing expected daypart makes all-day unavailable", () => {
    expect(
      historicalSpeedForCells(
        [cell("am_peak", "available", 6, 2, 2), cell("midday", "not_expected", null, 0, 0)],
        ["am_peak", "midday"],
      ),
    ).toBe(6);
    expect(
      historicalSpeedForCells(
        [cell("am_peak", "available", 6, 2, 2), cell("midday", "missing", null, 0, 0)],
        ["am_peak", "midday"],
      ),
    ).toBeNull();
    expect(
      historicalSpeedForCells([cell("am_peak", "missing", null, 0, 0)], ["am_peak"]),
    ).toBeNull();
  });

  test("an explicit daypart uses only its available non-null cell", () => {
    const cells = [
      cell("am_peak", "available", 4.2, 10, 10),
      cell("midday", "available", 8.8, 10, 10),
    ];
    expect(historicalSpeedForCells(cells, ["am_peak", "midday"], "midday")).toBe(8.8);
    expect(historicalSpeedForCells(cells, ["am_peak", "midday"], "pm_peak")).toBeNull();
  });

  test("joins selected history by stable spine and preserves nulls", () => {
    const input = {
      ...history("series_ready_with_gaps"),
      dimensions: {
        ...history("series_ready_with_gaps").dimensions,
        months: ["2026-01"],
      },
    };
    const result = historicalSegmentValues(
      input,
      [
        segment("current-a", "b41-s-node-010-node-011"),
        segment("current-b", "b41-s-node-011-node-012"),
        segment("current-only", null),
      ],
      { month: "2026-01", daypart: "am_peak" },
    );
    expect(result.speeds.get("current-a")).toBe(7);
    expect(result.speeds.get("current-b")).toBe(9);
    expect(result.speeds.get("current-only")).toBeNull();
    expect(result.missingSegmentCount).toBe(1);
    expect(result.displayOrders.get("current-a")).toBe(1);
  });
});

describe("why a history series is unavailable", () => {
  test("says which of the four reasons it is", () => {
    /* Collapsing all four into "unavailable" is what let the page print "No
       month history for this segment." over 36 served months. */
    const segments = [segment("seg-1", "spine-1")];
    expect(segmentHistorySeries(null, segments).reason).toBe("missing");
    expect(segmentHistorySeries(history(null), segments).reason).toBe("spine_unclassified");
    expect(segmentHistorySeries(history("needs_pattern_review"), segments).reason).toBe(
      "needs_pattern_review",
    );
    expect(segmentHistorySeries(history("failed"), segments).reason).toBe("failed");
  });

  test("a ready series carries no reason", () => {
    const result = segmentHistorySeries(history("series_ready"), [segment("seg-1", "spine-1")]);
    expect(result.reason).toBeNull();
  });
});
