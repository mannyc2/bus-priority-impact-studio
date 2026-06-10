import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRouteSegmentSpeedCells, listRouteSegmentSpeeds } from "@bp/db/local";
import { runRouteSegmentSpeedsIngest } from "../../../src/commands/ingest/route-segment-speeds.ts";
import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

const manifestYaml = `verified_at: 2026-01-01
sources:
  - id: bus_segment_speeds_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: kufs-yh3x
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
  - id: bus_segment_speeds_2023_2024
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: 58t6-89vi
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

function segmentRow(year: string, month: string, overrides: Record<string, string>) {
  return {
    year,
    month,
    timestamp: `${year}-${month.padStart(2, "0")}-01T08:00:00.000`,
    day_of_week: "Friday",
    hour_of_day: "8",
    route_id: "Q63",
    direction: "N",
    borough: "Queens",
    route_type: "Local",
    stop_order: "1",
    timepoint_stop_id: "921855",
    timepoint_stop_name: "39 AV/MAIN ST",
    timepoint_stop_latitude: "40.7601",
    timepoint_stop_longitude: "-73.8301",
    next_timepoint_stop_id: "982491",
    next_timepoint_stop_name: "MAIN ST/ROOSEVELT AV",
    next_timepoint_stop_latitude: "40.7591",
    next_timepoint_stop_longitude: "-73.8311",
    road_distance: "0.52",
    average_travel_time: "4.2",
    average_road_speed: "7.4",
    bus_trip_count: "6",
    ...overrides,
  };
}

function terminalRow(year: string, month: string) {
  const row: Record<string, string> = segmentRow(year, month, {
    stop_order: "22",
    hour_of_day: "9",
    average_road_speed: "6.1",
    bus_trip_count: "3",
  });
  delete row["next_timepoint_stop_name"];
  delete row["next_timepoint_stop_latitude"];
  delete row["next_timepoint_stop_longitude"];
  return row;
}

function fakeFetcher(rows: readonly unknown[]) {
  return async (_input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const limit = Number(body.page?.pageSize ?? 5000);
    const offset = (Number(body.page?.pageNumber ?? 1) - 1) * limit;
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
      headers: { "content-type": "application/json" },
    });
  };
}

describe("runRouteSegmentSpeedsIngest", () => {
  const cases = [
    { era: "2023-2024 dataset", year: 2024, month: 6, sourceId: "bus_segment_speeds_2023_2024" },
    { era: "2025+ dataset", year: 2025, month: 3, sourceId: "bus_segment_speeds_2025" },
  ] as const;

  for (const testCase of cases) {
    it(`writes filtered legacy rows and unfiltered cell rows (${testCase.era})`, async () => {
      const tmp = mkdtempSync(join(tmpdir(), "segment-speeds-"));
      const local = await openLocalPipelineDb(join(tmp, "pipeline.sqlite"));
      const year = String(testCase.year);
      const month = String(testCase.month);
      const isoMonth = `${year}-${month.padStart(2, "0")}`;
      try {
        const result = await runRouteSegmentSpeedsIngest({
          local,
          year: testCase.year,
          month: testCase.month,
          routes: ["Q63"],
          fetcher: fakeFetcher([segmentRow(year, month, {}), terminalRow(year, month)]),
          manifestText: manifestYaml,
        });

        expect(result.sourceId).toBe(testCase.sourceId);
        expect(result.fetchedRowCount).toBe(2);
        expect(result.normalizedRowCount).toBe(1);
        expect(result.cellRowCount).toBe(2);
        expect(result.routeCount).toBe(1);

        const legacyRows = await listRouteSegmentSpeeds(local.db, "Q63", isoMonth);
        expect(legacyRows).toHaveLength(1);
        expect(legacyRows[0]?.nextTimepointStopName).toBe("MAIN ST/ROOSEVELT AV");

        const cellRows = await listRouteSegmentSpeedCells(local.db, "Q63", isoMonth);
        expect(cellRows).toHaveLength(2);
        const terminal = cellRows.find((row) => row.stopOrder === 22);
        expect(terminal).toMatchObject({
          nextTimepointStopId: "982491",
          nextTimepointStopName: null,
          nextTimepointStopLatitude: null,
          averageRoadSpeedMph: 6.1,
          busTripCount: 3,
        });
      } finally {
        local.sqlite.close();
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
