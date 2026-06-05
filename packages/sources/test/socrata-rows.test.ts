import { describe, expect, test } from "bun:test";
import {
  buildSoda3ExportUrl,
  buildSoda3QueryUrl,
  buildSoda3SoqlQuery,
  createSoda3Client,
  SocrataDatasetIdSchema,
  soda3RangeHeader,
} from "@bp/sources/clients/socrata";

describe("SODA3 Socrata queries", () => {
  test("builds SODA3 query URLs and SoQL request bodies", () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const url = buildSoda3QueryUrl("data.ny.gov", datasetId);
    const query = buildSoda3SoqlQuery({
      select: "route_id,month,count(*)",
      where: "route_id='M1'",
      group: "route_id,month",
      order: "month DESC",
      limit: 10,
      offset: 20,
    });

    expect(url.toString()).toBe("https://data.ny.gov/api/v3/views/kufs-yh3x/query.json");
    expect(query).toBe(
      "SELECT route_id,month,count(*) WHERE route_id='M1' GROUP BY route_id,month ORDER BY month DESC LIMIT 10 OFFSET 20",
    );
  });

  test("fetches SODA3 rows across pages and stops on a short page", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const requestedPages: number[] = [];
    const client = createSoda3Client({
      domain: "data.ny.gov",
      pageSize: 2,
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe("/api/v3/views/kufs-yh3x/query.json");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        requestedPages.push(body.page.pageNumber);

        if (body.page.pageNumber === 1) {
          return Response.json([{ route_id: "M1" }, { route_id: "M1" }]);
        }

        return Response.json([{ route_id: "M1" }]);
      },
    });

    const rows = await client.queryAllRows({
      datasetId,
      body: { query: "SELECT route_id", includeSynthetic: false },
    });

    expect(rows).toEqual([{ route_id: "M1" }, { route_id: "M1" }, { route_id: "M1" }]);
    expect(requestedPages).toEqual([1, 2]);
  });

  test("retries transient SODA3 failures", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("4fnn-qsea");
    let attempt = 0;
    const client = createSoda3Client({
      domain: "data.ny.gov",
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async () => {
        attempt += 1;
        if (attempt === 1) {
          return new Response("temporary Socrata failure", { status: 500 });
        }
        return Response.json([{ route_id: "B61" }]);
      },
    });

    await expect(
      client.queryRows({
        datasetId,
        body: { query: "SELECT route_id", includeSynthetic: false },
      }),
    ).resolves.toEqual([{ route_id: "B61" }]);
    expect(attempt).toBe(2);
  });

  test("posts SODA3 exports with app token and byte range headers", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const requestedPaths: string[] = [];
    const client = createSoda3Client({
      domain: "data.ny.gov",
      appToken: "app-token",
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);
        expect(url.toString()).toBe(buildSoda3ExportUrl("data.ny.gov", datasetId, "csv").href);
        expect(init?.method).toBe("POST");
        const headers = new Headers(init?.headers);
        expect(headers.get("X-App-Token")).toBe("app-token");
        expect(headers.get("Range")).toBe(soda3RangeHeader({ start: 0, endInclusive: 99 }));
        expect(JSON.parse(String(init?.body))).toEqual({ query: "SELECT * LIMIT 10" });
        return new Response("route_id\nM1\n");
      },
    });

    const response = await client.export({
      datasetId,
      format: "csv",
      body: { query: "SELECT * LIMIT 10" },
      byteRange: { start: 0, endInclusive: 99 },
    });

    await expect(response.text()).resolves.toContain("M1");
    expect(requestedPaths).toEqual(["/api/v3/views/kufs-yh3x/export.csv"]);
  });

  test("posts SODA3 GeoJSON exports with JSON accept headers", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const client = createSoda3Client({
      domain: "data.ny.gov",
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        expect(url.toString()).toBe(buildSoda3ExportUrl("data.ny.gov", datasetId, "geojson").href);
        const headers = new Headers(init?.headers);
        expect(headers.get("Accept")).toBe("application/geo+json, application/json");
        expect(JSON.parse(String(init?.body))).toEqual({
          query: "SELECT the_geom,route_id LIMIT 1",
          serializationOptions: { bom: false },
        });
        return Response.json({ type: "FeatureCollection", features: [] });
      },
    });

    const response = await client.export({
      datasetId,
      format: "geojson",
      body: {
        query: "SELECT the_geom,route_id LIMIT 1",
        serializationOptions: { bom: false },
      },
    });

    await expect(response.json()).resolves.toEqual({ type: "FeatureCollection", features: [] });
  });

  test("client binds metadata, columns, row counts, and query rows", async () => {
    const datasetId = SocrataDatasetIdSchema.parse("kufs-yh3x");
    const requestedPaths: string[] = [];
    const client = createSoda3Client({
      domain: "data.ny.gov",
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        requestedPaths.push(url.pathname);

        if (url.pathname === "/api/views/kufs-yh3x") {
          return Response.json({ id: "kufs-yh3x", name: "MTA Bus Speeds", columns: [] });
        }

        if (url.pathname === "/api/views/kufs-yh3x/columns.json") {
          return Response.json([{ name: "route_id", fieldName: "route_id" }]);
        }

        const body = JSON.parse(String(init?.body));
        if (body.query === "SELECT count(*) WHERE route_id='M1'") {
          return Response.json([{ count: "42" }]);
        }

        return Response.json([{ route_id: "M1" }]);
      },
    });

    await expect(
      client.queryRows({
        datasetId,
        body: { query: "SELECT * WHERE route_id='M1' LIMIT 1", includeSynthetic: false },
      }),
    ).resolves.toEqual([{ route_id: "M1" }]);
    await expect(client.metadata(datasetId)).resolves.toMatchObject({
      id: datasetId,
      name: "MTA Bus Speeds",
    });
    await expect(client.columns(datasetId)).resolves.toHaveLength(1);
    await expect(client.rowCount(datasetId, "route_id='M1'")).resolves.toBe(42);
    expect(requestedPaths).toEqual([
      "/api/v3/views/kufs-yh3x/query.json",
      "/api/views/kufs-yh3x",
      "/api/views/kufs-yh3x/columns.json",
      "/api/v3/views/kufs-yh3x/query.json",
    ]);
  });
});
