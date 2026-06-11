import { describe, expect, test } from "bun:test";
import { listRouteCatalogIds, replaceRouteCatalog } from "../src/local/index.js";
import { createTestLocalDb } from "./local-test-db.js";

describe("local route network repository", () => {
  test("lists route catalog ids in canonical order", async () => {
    const local = createTestLocalDb();
    try {
      replaceRouteCatalog(local.db, [
        {
          routeId: "Q1",
          routeShortName: "Q1",
          routeLongName: "Queens fixture",
          routeTypes: ["local"],
          directions: ["Eastbound", "Westbound"],
          shapeCount: 1,
          stopCount: 2,
          timepointStopCount: 2,
          latitudeMin: null,
          latitudeMax: null,
          longitudeMin: null,
          longitudeMax: null,
        },
        {
          routeId: "B1",
          routeShortName: "B1",
          routeLongName: "Brooklyn fixture",
          routeTypes: ["local"],
          directions: ["Northbound", "Southbound"],
          shapeCount: 1,
          stopCount: 2,
          timepointStopCount: 2,
          latitudeMin: null,
          latitudeMax: null,
          longitudeMin: null,
          longitudeMax: null,
        },
      ]);

      await expect(listRouteCatalogIds(local.db)).resolves.toEqual(["B1", "Q1"]);
    } finally {
      local.sqlite.close();
    }
  });
});
