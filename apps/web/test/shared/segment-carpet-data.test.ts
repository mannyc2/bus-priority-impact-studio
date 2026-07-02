import { describe, expect, test } from "bun:test";
import { buildSegmentCarpetModel } from "../../src/components/route/segment-carpet-data";
import type {
  StudioRouteSpeedHistoryCell,
  StudioRouteSpeedHistoryResponse,
  StudioSegment,
} from "../../src/studio/api-contract";

function cell(
  input: Pick<StudioRouteSpeedHistoryCell, "segmentId" | "month" | "daypart" | "status"> &
    Partial<StudioRouteSpeedHistoryCell>,
): StudioRouteSpeedHistoryCell {
  return {
    observationCount: 0,
    traversalCount: 0,
    averageSpeedMph: null,
    averageTravelTimeMinutes: null,
    averageRoadDistanceMiles: null,
    segmentDaypartMeanSpeedMph: null,
    deltaFromSegmentDaypartMeanMph: null,
    pctFromSegmentDaypartMean: null,
    ...input,
  };
}

function segment(input: Partial<StudioSegment> & Pick<StudioSegment, "id">): StudioSegment {
  const { id, ...rest } = input;
  return {
    id,
    routeSlug: "b48",
    direction: "NB",
    from: "Classon Av",
    to: "Flushing Av",
    speedMph: 6.4,
    scheduledMph: 8,
    riderHours: 100,
    lane: "none",
    ace: false,
    tsp: false,
    hours: [],
    ...rest,
  };
}

function history(cells: StudioRouteSpeedHistoryCell[]): StudioRouteSpeedHistoryResponse {
  return {
    artifactKind: "studio_route_speed_history",
    schemaVersion: 1,
    generatedAt: "2026-06-01T00:00:00.000Z",
    routeId: "B48",
    routeSlug: "b48",
    source: {
      table: "local_route_segment_speed",
      dbPath: "data/local/pipeline.sqlite",
      speedSpinePath: "data/artifacts/studio/v2/routes/b48/speed-spine.json",
      startMonth: "2026-01",
      endMonth: "2026-02",
      artifactPath: "data/artifacts/studio/v2/routes/b48/speed-history.json",
    },
    dimensions: {
      months: ["2026-01", "2026-02"],
      dayparts: ["am_peak", "pm_peak"],
      segments: [
        {
          segmentId: "seg-b",
          direction: "N",
          displayOrder: 2,
          label: "History B",
          fromNodeId: "node-2",
          toNodeId: "node-3",
        },
        {
          segmentId: "seg-a",
          direction: "N",
          displayOrder: 1,
          label: "History A",
          fromNodeId: "node-1",
          toNodeId: "node-2",
        },
      ],
    },
    summary: {
      monthCount: 2,
      segmentCount: 2,
      daypartCount: 2,
      cellCount: cells.length,
      availableCellCount: cells.filter((item) => item.status === "available").length,
      missingCellCount: cells.filter((item) => item.status !== "available").length,
      sourceObservationCount: 0,
      traversalCount: 0,
      unmappedRawKeyCount: 0,
    },
    unmappedRawKeys: [],
    cells,
  };
}

describe("buildSegmentCarpetModel", () => {
  test("returns an empty model when speed history is absent", () => {
    expect(buildSegmentCarpetModel(null, [])).toEqual({
      months: [],
      rows: [],
      availableCellCount: 0,
      missingCellCount: 0,
      latestMonth: null,
    });
  });

  test("aggregates dayparts into one weighted monthly cell per segment", () => {
    const model = buildSegmentCarpetModel(
      history([
        cell({
          segmentId: "seg-a",
          month: "2026-01",
          daypart: "am_peak",
          status: "available",
          observationCount: 10,
          averageSpeedMph: 4,
        }),
        cell({
          segmentId: "seg-a",
          month: "2026-01",
          daypart: "pm_peak",
          status: "available",
          observationCount: 30,
          averageSpeedMph: 8,
        }),
        cell({
          segmentId: "seg-a",
          month: "2026-02",
          daypart: "am_peak",
          status: "missing",
        }),
        cell({
          segmentId: "seg-b",
          month: "2026-01",
          daypart: "am_peak",
          status: "source_missing",
        }),
        cell({
          segmentId: "seg-b",
          month: "2026-02",
          daypart: "pm_peak",
          status: "available",
          traversalCount: 6,
          averageSpeedMph: 9,
        }),
      ]),
      [segment({ id: "seg-a", from: "Detail A", to: "Detail B" })],
    );

    expect(model.months).toEqual(["2026-01", "2026-02"]);
    expect(model.latestMonth).toBe("2026-02");
    expect(model.availableCellCount).toBe(2);
    expect(model.missingCellCount).toBe(2);
    expect(model.rows.map((row) => row.segmentId)).toEqual(["seg-a", "seg-b"]);
    expect(model.rows[0]?.label).toBe("Detail A to Detail B");
    expect(model.rows[0]?.cells[0]?.speedMph).toBe(7);
    expect(model.rows[0]?.cells[0]?.observationCount).toBe(40);
    expect(model.rows[0]?.cells[1]?.status).toBe("missing");
    expect(model.rows[1]?.label).toBe("History B");
    expect(model.rows[1]?.cells[1]?.speedMph).toBe(9);
  });
});
