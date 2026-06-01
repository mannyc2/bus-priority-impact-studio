import { describe, expect, test } from "bun:test";
import {
  buildSocrataRowsUrl,
  fetchAllSocrataRows,
  SocrataClient,
  SocrataDatasetIdSchema,
} from "../src/index.js";

describe("Socrata row queries", () => {
  test("builds official resource API URLs with SoQL query parameters", () => {
    const url = buildSocrataRowsUrl("data.ny.gov", SocrataDatasetIdSchema.parse("kufs-yh3x"), {
      select: "route_id,month,count(*)",
      where: "route_id='M1'",
      group: "route_id,month",
      order: "month DESC",
      limit: 10,
      offset: 20,
    });

    expect(url.toString()).toBe(
      "https://data.ny.gov/resource/kufs-yh3x.json?%24select=route_id%2Cmonth%2Ccount%28*%29&%24where=route_id%3D%27M1%27&%24group=route_id%2Cmonth&%24order=month+DESC&%24limit=10&%24offset=20",
    );
  });

  test("fetches rows across pages and stops on a short page", async () => {
    const requestedOffsets: number[] = [];

    const rows = await fetchAllSocrataRows({
      domain: "data.ny.gov",
      datasetId: SocrataDatasetIdSchema.parse("kufs-yh3x"),
      pageSize: 2,
      fetcher: async (input) => {
        const url = new URL(String(input));
        requestedOffsets.push(Number(url.searchParams.get("$offset")));

        if (url.searchParams.get("$offset") === "0") {
          return Response.json([{ route_id: "M1" }, { route_id: "M1" }]);
        }

        return Response.json([{ route_id: "M1" }]);
      },
    });

    expect(rows).toEqual([{ route_id: "M1" }, { route_id: "M1" }, { route_id: "M1" }]);
    expect(requestedOffsets).toEqual([0, 2]);
  });

  test("retries transient Socrata page failures", async () => {
    const requestedOffsets: number[] = [];
    let failedFirstPage = false;

    const rows = await fetchAllSocrataRows({
      domain: "data.ny.gov",
      datasetId: SocrataDatasetIdSchema.parse("4fnn-qsea"),
      pageSize: 2,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async (input) => {
        const url = new URL(String(input));
        const offset = Number(url.searchParams.get("$offset"));
        requestedOffsets.push(offset);

        if (offset === 0 && !failedFirstPage) {
          failedFirstPage = true;
          return new Response("temporary Socrata failure", { status: 500 });
        }

        if (offset === 0) {
          return Response.json([{ route_id: "B61" }, { route_id: "B61" }]);
        }

        return Response.json([]);
      },
    });

    expect(rows).toEqual([{ route_id: "B61" }, { route_id: "B61" }]);
    expect(requestedOffsets).toEqual([0, 0, 2]);
  });

  test("retries thrown Socrata transport failures", async () => {
    const requestedOffsets: number[] = [];
    let failedFirstPage = false;

    const rows = await fetchAllSocrataRows({
      domain: "data.ny.gov",
      datasetId: SocrataDatasetIdSchema.parse("4fnn-qsea"),
      pageSize: 2,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async (input) => {
        const url = new URL(String(input));
        const offset = Number(url.searchParams.get("$offset"));
        requestedOffsets.push(offset);

        if (offset === 0 && !failedFirstPage) {
          failedFirstPage = true;
          throw new Error("ECONNRESET");
        }

        if (offset === 0) {
          return Response.json([{ route_id: "B61" }, { route_id: "B61" }]);
        }

        return Response.json([]);
      },
    });

    expect(rows).toEqual([{ route_id: "B61" }, { route_id: "B61" }]);
    expect(requestedOffsets).toEqual([0, 0, 2]);
  });

  test("client binds a dataset endpoint for rows, metadata, columns, and counts", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const requestedPaths: string[] = [];
    const client = new SocrataClient(
      { domain: "data.ny.gov", datasetId },
      {
        fetcher: async (input) => {
          const url = new URL(String(input));
          requestedPaths.push(`${url.pathname}${url.search}`);

          if (url.pathname === "/api/views/kufs-yh3x") {
            return Response.json({ id: "kufs-yh3x", name: "MTA Bus Speeds", columns: [] });
          }

          if (url.pathname === "/api/views/kufs-yh3x/columns.json") {
            return Response.json([{ name: "route_id", fieldName: "route_id" }]);
          }

          if (url.searchParams.get("$select") === "count(*)") {
            return Response.json([{ count: "42" }]);
          }

          return Response.json([{ route_id: "M1" }]);
        },
      },
    );

    await expect(client.rows({ where: "route_id='M1'", limit: 1 })).resolves.toEqual([
      { route_id: "M1" },
    ]);
    await expect(client.metadata()).resolves.toMatchObject({
      id: datasetId,
      name: "MTA Bus Speeds",
    });
    await expect(client.columns()).resolves.toHaveLength(1);
    await expect(client.rowCount()).resolves.toBe(42);
    expect(requestedPaths).toContain(
      "/resource/kufs-yh3x.json?%24where=route_id%3D%27M1%27&%24limit=1&%24offset=0",
    );
  });
});
