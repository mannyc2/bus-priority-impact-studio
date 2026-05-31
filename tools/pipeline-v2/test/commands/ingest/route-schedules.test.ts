import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { runRouteSchedulesIngest } from "../../../src/commands/ingest/route-schedules.ts";

const manifestText = `
verified_at: "2026-05-31T00:00:00.000Z"
sources:
  - id: bus_schedules_2026
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: 4fnn-qsea
    url: https://data.ny.gov/Transportation/MTA-Bus-Schedules-2026/4fnn-qsea
    api_json: https://data.ny.gov/resource/4fnn-qsea.json
    columns_json: https://data.ny.gov/api/views/4fnn-qsea/columns.json
    rows_csv: https://data.ny.gov/api/views/4fnn-qsea/rows.csv?accessType=DOWNLOAD
    purpose: Test source.
    status: active
`;

const m15Rows = [
  {
    schedule_date: "2026-03-02T00:00:00.000",
    day_type: "Weekday",
    direction: "Northbound",
    shape_id: "M150123",
    route_id: "M15",
    stop_sequence: "1",
    stop_id: "401234",
    stop_name: "1 Av/E 1 St",
    schedule_time: "07:00:00",
    distance_from_start: "0",
    trip_headsign: "East Harlem",
    block_id: "M15-1",
    bundle: "2026-03",
    timepoint: "1",
    revenue_stop: "1",
    origin: "1",
    destination: "0",
  },
  {
    schedule_date: "2026-03-02T00:00:00.000",
    day_type: "Weekday",
    direction: "Northbound",
    shape_id: "M150123",
    route_id: "M15",
    stop_sequence: "2",
    stop_id: "401235",
    stop_name: "1 Av/E 2 St",
    schedule_time: "07:02:00",
    distance_from_start: "0.2",
    trip_headsign: "East Harlem",
    block_id: "M15-1",
    bundle: "2026-03",
    timepoint: "0",
    revenue_stop: "1",
    origin: "0",
    destination: "0",
  },
];

function page<T>(rows: readonly T[], url: URL): readonly T[] {
  const offset = Number(url.searchParams.get("$offset") ?? "0");
  const limit = Number(url.searchParams.get("$limit") ?? "5000");
  return rows.slice(offset, offset + limit);
}

describe("runRouteSchedulesIngest", () => {
  test("fetches route-level schedule stop rows and skips already staged routes", async () => {
    const sqlite = new Database(":memory:");
    const routeFetches: string[] = [];
    try {
      const fetcher = async (input: string | URL) => {
        const url = new URL(input);
        const group = url.searchParams.get("$group");
        if (group === "route_id") {
          return Response.json(page([{ route_id: "B1" }, { route_id: "M15" }], url));
        }

        const where = url.searchParams.get("$where") ?? "";
        if (where.includes("'M15'")) {
          routeFetches.push("M15");
          return Response.json(page(m15Rows, url));
        }

        if (where.includes("'B1'")) {
          routeFetches.push("B1");
          return Response.json([]);
        }

        return Response.json([]);
      };

      const first = await runRouteSchedulesIngest({
        sqlite,
        sourceYear: 2026,
        routes: ["M15"],
        routeConcurrency: 1,
        skipExisting: false,
        fetcher,
        manifestText,
      });

      expect(first).toEqual({
        sourceYear: 2026,
        sourceId: "bus_schedules_2026",
        routeCount: 1,
        skippedRouteCount: 0,
        fetchedRowCount: 2,
        writtenRowCount: 2,
      });

      expect(
        sqlite
          .query(
            `
              SELECT route_id, COUNT(*) AS row_count, COUNT(DISTINCT stop_id) AS stop_count
              FROM local_route_schedule_stop
              WHERE source_year = 2026
              GROUP BY route_id
            `,
          )
          .all(),
      ).toEqual([{ route_id: "M15", row_count: 2, stop_count: 2 }]);

      const second = await runRouteSchedulesIngest({
        sqlite,
        sourceYear: 2026,
        routes: [],
        routeConcurrency: 2,
        skipExisting: true,
        fetcher,
        manifestText,
      });

      expect(second).toEqual({
        sourceYear: 2026,
        sourceId: "bus_schedules_2026",
        routeCount: 2,
        skippedRouteCount: 1,
        fetchedRowCount: 0,
        writtenRowCount: 0,
      });
      expect(routeFetches).toEqual(["M15", "B1"]);
    } finally {
      sqlite.close();
    }
  });
});
