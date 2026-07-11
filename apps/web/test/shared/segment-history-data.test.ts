import { describe, expect, test } from "bun:test";
import { segmentHistorySeries } from "../../src/components/route/segment-history-data.ts";
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
      segments: [
        { segmentId: "b41-s-node-011-node-012" },
        { segmentId: "b41-s-node-010-node-011" },
      ],
    },
    cells: [
      {
        segmentId: "b41-s-node-010-node-011",
        month: "2026-01",
        status: "available",
        averageSpeedMph: 7,
        observationCount: 2,
        traversalCount: 2,
      },
      {
        segmentId: "b41-s-node-010-node-011",
        month: "2026-02",
        status: "missing",
        averageSpeedMph: null,
        observationCount: 0,
        traversalCount: 0,
      },
      {
        segmentId: "b41-s-node-011-node-012",
        month: "2026-01",
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
