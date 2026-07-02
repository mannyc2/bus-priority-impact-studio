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
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
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

type Soda3TestRequest = {
  query: string;
  offset: number;
  limit: number;
};

function parseSoda3TestRequest(input: string | URL, init?: RequestInit): Soda3TestRequest {
  const url = new URL(input);
  expect(url.pathname).toBe("/api/v3/views/4fnn-qsea/query.json");
  expect(init?.method).toBe("POST");
  const body = JSON.parse(String(init?.body ?? "{}"));
  const query = String(body.query ?? "");
  const queryLimit = / LIMIT (\d+)/.exec(query);
  const queryOffset = / OFFSET (\d+)/.exec(query);
  const limit = Number(queryLimit?.[1] ?? body.page?.pageSize ?? 5000);
  return {
    query,
    offset:
      queryOffset?.[1] === undefined
        ? (Number(body.page?.pageNumber ?? 1) - 1) * limit
        : Number(queryOffset[1]),
    limit,
  };
}

function page<T>(rows: readonly T[], request: Soda3TestRequest): readonly T[] {
  const { offset, limit } = request;
  return rows.slice(offset, offset + limit);
}

describe("runRouteSchedulesIngest", () => {
  test("command wrapper uses the Effect local DB boundary", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/ingest/route-schedules.ts", import.meta.url),
    ).text();

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("runRouteSchedulesIngest({");
    expect(source).toContain('import type { Database } from "bun:sqlite"');
    expect(source).not.toContain("Database as BunDatabase");
    expect(source).not.toContain("new BunDatabase");
  });

  test("fetches route-level schedule stop rows and skips already staged routes", async () => {
    const sqlite = new Database(":memory:");
    const routeFetches: string[] = [];
    try {
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = parseSoda3TestRequest(input, init);
        if (request.query.includes("GROUP BY route_id")) {
          return Response.json(page([{ route_id: "B1" }, { route_id: "M15" }], request));
        }

        if (request.query.includes("SELECT count(*)") && request.query.includes("'M15'")) {
          return Response.json([{ count: m15Rows.length }]);
        }
        if (request.query.includes("SELECT count(*)") && request.query.includes("'B1'")) {
          return Response.json([{ count: 0 }]);
        }

        if (request.query.includes("'M15'")) {
          routeFetches.push("M15");
          return Response.json(page(m15Rows, request));
        }

        if (request.query.includes("'B1'")) {
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
        failedRouteCount: 0,
        failedRoutes: [],
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
        failedRouteCount: 0,
        failedRoutes: [],
      });
      expect(routeFetches).toEqual(["M15"]);
    } finally {
      sqlite.close();
    }
  });

  test("marks no-row route fetches as source_absent so later imports can repair them", async () => {
    const sqlite = new Database(":memory:");
    try {
      let hasRows = false;
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = parseSoda3TestRequest(input, init);
        if (request.query.includes("SELECT count(*)")) {
          return Response.json([{ count: hasRows ? m15Rows.length : 0 }]);
        }
        return Response.json(hasRows ? page(m15Rows, request) : []);
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
      expect(first).toMatchObject({
        routeCount: 1,
        fetchedRowCount: 0,
        writtenRowCount: 0,
      });
      expect(
        sqlite
          .query(
            "SELECT status, row_count, error FROM local_route_schedule_ingest_status WHERE source_year = 2026 AND route_id = 'M15'",
          )
          .get(),
      ).toEqual({
        status: "source_absent",
        row_count: 0,
        error: "no_source_rows_for_requested_route",
      });

      hasRows = true;
      const second = await runRouteSchedulesIngest({
        sqlite,
        sourceYear: 2026,
        routes: ["M15"],
        routeConcurrency: 1,
        skipExisting: true,
        fetcher,
        manifestText,
      });
      expect(second).toMatchObject({
        skippedRouteCount: 0,
        fetchedRowCount: 2,
        writtenRowCount: 2,
      });
      expect(
        sqlite
          .query(
            "SELECT status, row_count, error FROM local_route_schedule_ingest_status WHERE source_year = 2026 AND route_id = 'M15'",
          )
          .get(),
      ).toEqual({
        status: "complete",
        row_count: 2,
        error: null,
      });
    } finally {
      sqlite.close();
    }
  });

  test("fetches large routes in deterministic concurrent pages", async () => {
    const sqlite = new Database(":memory:");
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...m15Rows[0],
      stop_sequence: String(index + 1),
      stop_id: `40${String(index).padStart(4, "0")}`,
      schedule_time: `07:${String(index).padStart(2, "0")}:00`,
    }));
    const routeOffsets: number[] = [];
    try {
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = parseSoda3TestRequest(input, init);
        if (request.query.includes("GROUP BY route_id")) {
          return Response.json(page([{ route_id: "M15" }], request));
        }
        if (request.query.includes("SELECT count(*)")) {
          return Response.json([{ count: rows.length }]);
        }

        routeOffsets.push(request.offset);
        return Response.json(page(rows, request));
      };

      const result = await runRouteSchedulesIngest({
        sqlite,
        sourceYear: 2026,
        routes: ["M15"],
        routeConcurrency: 1,
        routePageConcurrency: 3,
        pageSize: 5,
        skipExisting: false,
        fetcher,
        manifestText,
      });

      expect(result.fetchedRowCount).toBe(12);
      expect(result.writtenRowCount).toBe(12);
      expect(routeOffsets.sort((a, b) => a - b)).toEqual([0, 5, 10]);
      expect(
        sqlite
          .query(
            `
              SELECT row_rank, stop_id
              FROM local_route_schedule_stop
              WHERE source_year = 2026 AND route_id = 'M15'
              ORDER BY row_rank
            `,
          )
          .all(),
      ).toEqual(
        rows.map((row, index) => ({
          row_rank: index + 1,
          stop_id: row.stop_id,
        })),
      );
    } finally {
      sqlite.close();
    }
  });

  test("continues writing later routes before reporting route fetch failures", async () => {
    const sqlite = new Database(":memory:");
    const progressEvents: string[] = [];
    try {
      const fetcher = async (input: string | URL, init?: RequestInit) => {
        const request = parseSoda3TestRequest(input, init);

        if (request.query.includes("SELECT count(*)") && request.query.includes("'B1'")) {
          return Response.json([{ count: 2 }]);
        }
        if (request.query.includes("SELECT count(*)") && request.query.includes("'M15'")) {
          return Response.json([{ count: m15Rows.length }]);
        }

        if (request.query.includes("'B1'")) {
          throw new Error("socket closed");
        }
        if (request.query.includes("'M15'")) {
          return Response.json(page(m15Rows, request));
        }

        return Response.json([]);
      };

      await expect(
        runRouteSchedulesIngest({
          sqlite,
          sourceYear: 2026,
          routes: ["B1", "M15"],
          routeConcurrency: 1,
          fetchRetryCount: 0,
          skipExisting: false,
          fetcher,
          manifestText,
          progress: (event) => progressEvents.push(`${event.kind}:${event.routeId}`),
        }),
      ).rejects.toThrow("Failed to fetch 1 route schedule(s) for 2026: B1");

      expect(progressEvents).toEqual([
        "route_fetching:B1",
        "route_failed:B1",
        "route_fetching:M15",
        "route_page_written:M15",
        "route_written:M15",
      ]);
      expect(
        sqlite
          .query(
            `
              SELECT route_id, COUNT(*) AS row_count
              FROM local_route_schedule_stop
              WHERE source_year = 2026
              GROUP BY route_id
            `,
          )
          .all(),
      ).toEqual([{ route_id: "M15", row_count: 2 }]);
    } finally {
      sqlite.close();
    }
  });
});
