import { describe, expect, test } from "bun:test";
import {
  buildCensusAcsProfileUrl,
  normalizeCensusTractEquityRows,
  nycCountyCodes,
} from "../src/index.js";

describe("Census ACS equity context", () => {
  test("builds an ACS 5-year profile URL for NYC tracts", () => {
    const url = buildCensusAcsProfileUrl({ year: 2024 });

    expect(url.origin).toBe("https://api.census.gov");
    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("tract:*");
    expect(url.searchParams.getAll("in")).toEqual([
      "state:36",
      `county:${nycCountyCodes.join(",")}`,
    ]);
    expect(url.searchParams.get("get")).toContain("DP04_0058E");
  });

  test("adds an API key when provided", () => {
    const url = buildCensusAcsProfileUrl({ year: 2024, apiKey: "test-key" });

    expect(url.searchParams.get("key")).toBe("test-key");
  });

  test("normalizes tract demographics and low-car household fields", () => {
    const rows = normalizeCensusTractEquityRows(
      [
        [
          "NAME",
          "DP05_0001E",
          "DP03_0062E",
          "DP03_0128PE",
          "DP03_0021E",
          "DP03_0021PE",
          "DP04_0045E",
          "DP04_0058E",
          "DP04_0058PE",
          "DP05_0090PE",
          "DP05_0096PE",
          "DP05_0097PE",
          "DP05_0099PE",
          "state",
          "county",
          "tract",
        ],
        [
          "Census Tract 1; Bronx County; New York",
          "2950",
          "-666666666",
          "28.5",
          "120",
          "45.3",
          "1000",
          "650",
          "65",
          "70.5",
          "5.1",
          "19.2",
          "2.3",
          "36",
          "005",
          "000100",
        ],
      ],
      2024,
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        acsYear: 2024,
        geoid: "36005000100",
        countyName: "Bronx County",
        totalPopulation: 2950,
        medianHouseholdIncome: null,
        noVehicleHouseholds: 650,
        noVehicleHouseholdShare: 65,
        publicTransitCommuterShare: 45.3,
      }),
    );
    expect(rows[0]?.raceEthnicityShare).toEqual(
      expect.objectContaining({
        hispanic: 70.5,
        nonHispanicBlack: 19.2,
      }),
    );
  });
});
