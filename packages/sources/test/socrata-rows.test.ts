import { describe, expect, test } from "bun:test";
import { buildSocrataRowsUrl, fetchAllSocrataRows, SocrataDatasetIdSchema } from "../src/index.js";

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
});
