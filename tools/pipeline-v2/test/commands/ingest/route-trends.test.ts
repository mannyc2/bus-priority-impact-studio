import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type LocalRouteSegmentSpeedCell,
  listRouteMonthTrends,
  replaceRouteSegmentSpeedCells,
} from "@bp/db/local";
import { runRouteTrendsIngest } from "../../../src/commands/ingest/route-trends.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const manifestYaml = `verified_at: 2026-01-01
sources:
  - id: bus_hourly_ridership_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: gxb3-akrn
    url: https://data.ny.gov/x
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
    purpose: test
    status: active
`;

function cell(overrides: Partial<LocalRouteSegmentSpeedCell>): LocalRouteSegmentSpeedCell {
  return {
    routeId: "Q63",
    isoMonth: "2026-02",
    timestamp: "2026-02-01T08:00:00.000",
    dayOfWeek: "Friday",
    hourOfDay: 8,
    direction: "N",
    borough: "Queens",
    routeType: "Local",
    stopOrder: 1,
    timepointStopId: "921855",
    timepointStopName: "39 AV/MAIN ST",
    timepointStopLatitude: 40.7601,
    timepointStopLongitude: -73.8301,
    nextTimepointStopId: "982491",
    nextTimepointStopName: null,
    nextTimepointStopLatitude: null,
    nextTimepointStopLongitude: null,
    roadDistanceMiles: 0.52,
    averageTravelTimeMinutes: 4.2,
    averageRoadSpeedMph: 7.4,
    busTripCount: 6,
    ...overrides,
  };
}

describe("runRouteTrendsIngest", () => {
  it("derives speed trends from the local cell table and reports uncovered months", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "route-trends-"));
    const local = await openLocalPipelineDb(join(tmp, "pipeline.sqlite"));
    try {
      replaceRouteSegmentSpeedCells(local.db, "Q63", "2026-02", [
        cell({}),
        cell({ hourOfDay: 9, averageRoadSpeedMph: 6.123456, busTripCount: 3 }),
      ]);

      const result = await runRouteTrendsIngest({
        local,
        startYear: 2026,
        startMonth: 1,
        endYear: 2026,
        endMonth: 2,
        routes: ["Q63"],
        includeRidership: false,
        manifestText: manifestYaml,
      });

      expect(result).toMatchObject({
        startMonth: "2026-01",
        endMonth: "2026-02",
        rowCount: 1,
        speedRowCount: 1,
        ridershipRowCount: 0,
        monthsWithoutCellSpeedCoverage: ["2026-01"],
      });

      const trends = await listRouteMonthTrends(local.db);
      expect(trends).toEqual([
        expect.objectContaining({
          month: "2026-02",
          speedObservationCount: 2,
          speedBusTripCount: 9,
          averageSpeedMph: Math.round(((7.4 + 6.123456) / 2) * 10_000) / 10_000,
          hasSpeedTrend: true,
          hasRidershipTrend: false,
        }),
      ]);
    } finally {
      local.sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
