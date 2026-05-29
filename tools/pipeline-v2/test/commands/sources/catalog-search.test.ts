import { describe, expect, test } from "bun:test";
import { searchSourceCatalog } from "../../../src/commands/sources/catalog-search.ts";

describe("sources:catalog-search", () => {
  test("uses the Socrata catalog client and returns source-discovery fields", async () => {
    const requestedUrls: URL[] = [];
    const result = await searchSourceCatalog({
      query: "MTA Express Bus Capacity",
      category: "Transportation",
      agency: "Metropolitan Transportation Authority",
      limit: 3,
      fetcher: async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url);

        return Response.json({
          resultSetSize: 1,
          results: [
            {
              resource: {
                name: "MTA Express Bus Capacity: April 2023 - September 2023",
                id: "4tpr-3bvc",
                type: "dataset",
                data_updated_at: "2023-10-13T19:45:19.000Z",
              },
              classification: {
                domain_category: "Transportation",
                domain_metadata: [
                  {
                    key: "Dataset-Summary_Posting-Frequency",
                    value: "Static - Not Updated",
                  },
                  {
                    key: "Dataset-Summary_Time-Period",
                    value: "April 2023 to September 2023",
                  },
                  {
                    key: "Dataset-Information_Agency",
                    value: "Metropolitan Transportation Authority",
                  },
                ],
              },
              metadata: {
                domain: "data.ny.gov",
              },
              permalink: "https://data.ny.gov/d/4tpr-3bvc",
            },
          ],
        });
      },
    });

    expect(result.command).toBe("sources:catalog-search");
    expect(result.resultSetSize).toBe(1);
    expect(result.results[0]).toMatchObject({
      datasetId: "4tpr-3bvc",
      postingFrequency: "Static - Not Updated",
      timePeriod: "April 2023 to September 2023",
    });
    expect(requestedUrls[0]?.searchParams.get("q")).toBe("MTA Express Bus Capacity");
    expect(requestedUrls[0]?.searchParams.get("categories")).toBe("Transportation");
    expect(requestedUrls[0]?.searchParams.get("Dataset-Information_Agency")).toBe(
      "Metropolitan Transportation Authority",
    );
  });
});
