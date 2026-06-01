import { describe, expect, test } from "bun:test";
import {
  buildSocrataCatalogSearchUrl,
  parseSocrataCatalogSearchResponse,
  SocrataDatasetIdSchema,
  SocrataCatalogClient,
} from "../src/index.js";

const expressCapacityCatalogResult = {
  resource: {
    name: "MTA Express Bus Capacity: April 2023 - September 2023",
    id: "4tpr-3bvc",
    description:
      "This dataset provides the load percentage for each express bus route at its maximum load point.",
    attribution: "Metropolitan Transportation Authority",
    type: "dataset",
    updatedAt: "2024-07-29T22:55:33.000Z",
    data_updated_at: "2023-10-13T19:45:19.000Z",
    publication_date: "2023-10-13T19:45:32.000Z",
    columns_field_name: ["direction", "trips_with_apc", "hour", "week"],
    columns_name: ["Direction", "Trips with APC", "Hour", "Week"],
  },
  classification: {
    domain_category: "Transportation",
    domain_tags: ["mtabc", "bus", "express bus"],
    domain_metadata: [
      { key: "Dataset-Summary_Dataset-Owner", value: "Metropolitan Transportation Authority" },
      { key: "Dataset-Summary_Granularity", value: "Bus route, hour, direction" },
      { key: "Dataset-Summary_Coverage", value: "New York City" },
      { key: "Dataset-Summary_Posting-Frequency", value: "Static - Not Updated" },
      { key: "Dataset-Summary_Time-Period", value: "April 2023 to September 2023" },
      { key: "Dataset-Information_Agency", value: "Metropolitan Transportation Authority" },
    ],
  },
  metadata: {
    domain: "data.ny.gov",
  },
  permalink: "https://data.ny.gov/d/4tpr-3bvc",
  link: "https://data.ny.gov/Transportation/MTA-Express-Bus-Capacity-April-2023-September-2023/4tpr-3bvc",
};

describe("Socrata catalog search", () => {
  test("builds data.ny.gov catalog URLs from the captured Open Data HAR shape", () => {
    const url = buildSocrataCatalogSearchUrl({
      query: "Express Bus Capacity dataset",
      category: "Transportation",
      agency: "Metropolitan Transportation Authority",
      limit: 10,
    });

    expect(url.origin).toBe("https://data.ny.gov");
    expect(url.pathname).toBe("/api/catalog/v1");
    expect(url.searchParams.get("q")).toBe("Express Bus Capacity dataset");
    expect(url.searchParams.get("search_context")).toBe("data.ny.gov");
    expect(url.searchParams.get("published")).toBe("true");
    expect(url.searchParams.get("approval_status")).toBe("approved");
    expect(url.searchParams.get("audience")).toBe("public");
    expect(url.searchParams.get("categories")).toBe("Transportation");
    expect(url.searchParams.get("Dataset-Information_Agency")).toBe(
      "Metropolitan Transportation Authority",
    );
    expect(url.searchParams.get("boostDomains[data.cityofnewyork.us]")).toBe("0.6");
  });

  test("normalizes catalog response metadata used for source discovery", () => {
    const response = parseSocrataCatalogSearchResponse({
      results: [expressCapacityCatalogResult],
      resultSetSize: 151,
      warnings: [],
    });

    expect(response).toMatchObject({
      resultSetSize: 151,
      returned: 1,
      results: [
        {
          datasetId: "4tpr-3bvc",
          name: "MTA Express Bus Capacity: April 2023 - September 2023",
          domain: "data.ny.gov",
          category: "Transportation",
          agency: "Metropolitan Transportation Authority",
          postingFrequency: "Static - Not Updated",
          timePeriod: "April 2023 to September 2023",
          granularity: "Bus route, hour, direction",
          columnFieldNames: ["direction", "trips_with_apc", "hour", "week"],
        },
      ],
    });
  });

  test("client searches with injectable fetch for pipeline commands", async () => {
    const requestedUrls: URL[] = [];
    const client = new SocrataCatalogClient({
      fetcher: async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url);
        return Response.json({
          results: [expressCapacityCatalogResult],
          resultSetSize: 1,
        });
      },
    });

    const response = await client.search({
      query: "MTA Express Bus Capacity",
      category: "Transportation",
      limit: 1,
    });

    expect(response.url).toContain("/api/catalog/v1?");
    expect(response.results[0]?.datasetId).toBe(SocrataDatasetIdSchema.parse("4tpr-3bvc"));
    expect(requestedUrls[0]?.searchParams.get("q")).toBe("MTA Express Bus Capacity");
    expect(requestedUrls[0]?.searchParams.get("limit")).toBe("1");
  });
});
