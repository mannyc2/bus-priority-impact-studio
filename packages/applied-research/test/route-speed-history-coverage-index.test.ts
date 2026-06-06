import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  materializeRouteSpeedHistoryCoverageIndex,
  normalizeRouteSpeedHistoryRouteId,
} from "../src/local-db";

describe("route speed-history coverage index local DB materializer", () => {
  test("normalizes route ids and replaces rows for one release month", () => {
    const sqlite = new Database(":memory:");
    try {
      expect(normalizeRouteSpeedHistoryRouteId(" b41 ")).toBe("B41");

      const first = materializeRouteSpeedHistoryCoverageIndex({
        local: { sqlite },
        releaseMonth: "2026-03",
        historyStartMonth: "2026-01",
        historyEndMonth: "2026-03",
        expectedRouteCount: 2,
        generatedAt: "2026-06-06T00:00:00.000Z",
        routes: [
          {
            routeId: " b41 ",
            routeSlug: "b41",
            artifactPath: "data/artifacts/studio/v2/routes/b41/speed-history.json",
            artifactStatus: "written",
            monthCount: 3,
            segmentCount: 2,
            cellCount: 24,
            availableCellCount: 20,
            missingCellCount: 4,
          },
        ],
      });

      expect(first).toEqual({
        releaseMonth: "2026-03",
        expectedRouteCount: 2,
        availableRouteCount: 1,
        missingRouteCount: 1,
        tableRowCount: 1,
      });

      const second = materializeRouteSpeedHistoryCoverageIndex({
        local: { sqlite },
        releaseMonth: "2026-03",
        historyStartMonth: "2026-02",
        historyEndMonth: "2026-03",
        expectedRouteCount: 1,
        generatedAt: "2026-06-07T00:00:00.000Z",
        routes: [
          {
            routeId: "M1",
            routeSlug: "m1",
            artifactPath: "data/artifacts/studio/v2/routes/m1/speed-history.json",
            artifactStatus: "skipped_existing",
            monthCount: null,
            segmentCount: null,
            cellCount: null,
            availableCellCount: null,
            missingCellCount: null,
          },
        ],
      });

      expect(second).toEqual({
        releaseMonth: "2026-03",
        expectedRouteCount: 1,
        availableRouteCount: 1,
        missingRouteCount: 0,
        tableRowCount: 1,
      });
      expect(
        sqlite
          .query(
            `
              SELECT route_id, month, route_slug, history_start_month, history_end_month,
                artifact_status, month_count, segment_count, cell_count,
                available_cell_count, missing_cell_count
              FROM local_route_speed_history_coverage
              ORDER BY route_id
            `,
          )
          .all(),
      ).toEqual([
        {
          route_id: "M1",
          month: "2026-03",
          route_slug: "m1",
          history_start_month: "2026-02",
          history_end_month: "2026-03",
          artifact_status: "skipped_existing",
          month_count: 0,
          segment_count: 0,
          cell_count: 0,
          available_cell_count: 0,
          missing_cell_count: 0,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
