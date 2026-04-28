import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  listRouteEquityContexts,
  listRouteMonthSourceStatuses,
  replaceCensusTractEquityContext,
  replaceRouteCatalog,
} from "@bp/db/local";
import { buildRouteEquityContext } from "../src/jobs/build/route-equity-context.js";
import { openLocalPipelineDb } from "../src/lib/local-db.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const fixtureDir = fromRepoRoot(join("data/working/test-route-equity-context"));
const dbPath = join(fixtureDir, "pipeline.sqlite");
const isoMonth = "2026-03";

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("route equity context", () => {
  test("assigns route rows to county-level ACS proxy context", async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    const local = await openLocalPipelineDb(dbPath);
    try {
      await replaceRouteCatalog(local.db, [
        {
          routeId: "M1",
          routeShortName: "M1",
          routeLongName: "Harlem - East Village",
          routeTypes: ["local"],
          directions: ["northbound", "southbound"],
          shapeCount: 1,
          stopCount: 2,
          timepointStopCount: 2,
          latitudeMin: 40.1,
          latitudeMax: 40.9,
          longitudeMin: -74,
          longitudeMax: -73.8,
        },
        {
          routeId: "BX2",
          routeShortName: "Bx2",
          routeLongName: "Kingsbridge Heights - Mott Haven",
          routeTypes: ["local"],
          directions: ["northbound", "southbound"],
          shapeCount: 1,
          stopCount: 2,
          timepointStopCount: 2,
          latitudeMin: 40.8,
          latitudeMax: 40.9,
          longitudeMin: -73.95,
          longitudeMax: -73.85,
        },
        {
          routeId: "ZZ1",
          routeShortName: "ZZ1",
          routeLongName: null,
          routeTypes: [],
          directions: [],
          shapeCount: 0,
          stopCount: 0,
          timepointStopCount: 0,
          latitudeMin: null,
          latitudeMax: null,
          longitudeMin: null,
          longitudeMax: null,
        },
      ]);
      await replaceCensusTractEquityContext(local.db, 2024, [
        {
          acsYear: 2024,
          geoid: "36061000100",
          stateFips: "36",
          countyFips: "061",
          tractCode: "000100",
          countyName: "New York County",
          tractName: "Census Tract 1",
          totalPopulation: 100,
          occupiedHousingUnits: 50,
          noVehicleHouseholds: 20,
          noVehicleHouseholdShare: 0.4,
          medianHouseholdIncome: 80_000,
          povertyRate: 10,
          publicTransitCommuters: 60,
          publicTransitCommuterShare: 60,
          raceEthnicityShare: {
            hispanic: 20,
            nonHispanicWhite: 40,
            nonHispanicBlack: 20,
            nonHispanicAsian: 15,
          },
        },
        {
          acsYear: 2024,
          geoid: "36061000200",
          stateFips: "36",
          countyFips: "061",
          tractCode: "000200",
          countyName: "New York County",
          tractName: "Census Tract 2",
          totalPopulation: 300,
          occupiedHousingUnits: 150,
          noVehicleHouseholds: 90,
          noVehicleHouseholdShare: 0.6,
          medianHouseholdIncome: 100_000,
          povertyRate: 20,
          publicTransitCommuters: 210,
          publicTransitCommuterShare: 70,
          raceEthnicityShare: {
            hispanic: 30,
            nonHispanicWhite: 30,
            nonHispanicBlack: 25,
            nonHispanicAsian: 10,
          },
        },
        {
          acsYear: 2024,
          geoid: "36005000100",
          stateFips: "36",
          countyFips: "005",
          tractCode: "000100",
          countyName: "Bronx County",
          tractName: "Census Tract 1",
          totalPopulation: 200,
          occupiedHousingUnits: 100,
          noVehicleHouseholds: 70,
          noVehicleHouseholdShare: 0.7,
          medianHouseholdIncome: 50_000,
          povertyRate: 30,
          publicTransitCommuters: 130,
          publicTransitCommuterShare: 65,
          raceEthnicityShare: {
            hispanic: 55,
            nonHispanicWhite: 10,
            nonHispanicBlack: 30,
            nonHispanicAsian: 3,
          },
        },
      ]);
    } finally {
      local.sqlite.close();
    }

    const result = await buildRouteEquityContext({
      year: 2026,
      month: 3,
      acsYear: 2024,
      dbPath,
    });
    const readLocal = await openLocalPipelineDb(dbPath);
    const rows = await listRouteEquityContexts(readLocal.db, isoMonth);
    const sourceStatuses = await listRouteMonthSourceStatuses(readLocal.db, isoMonth);
    readLocal.sqlite.close();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 3,
        assignedRouteCount: 2,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        routeId: "M1",
        assignedCountyName: "New York County",
        totalPopulation: 400,
        noVehicleHouseholds: 110,
        noVehicleHouseholdShare: 0.55,
        medianHouseholdIncome: 95000,
        povertyRate: 17.5,
        publicTransitCommuterShare: 67.5,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        routeId: "BX2",
        assignedCountyName: "Bronx County",
        noVehicleHouseholdShare: 0.7,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        routeId: "ZZ1",
        assignedCountyName: null,
        assignmentMethod: "unassigned",
        totalPopulation: null,
      }),
    );
    expect(sourceStatuses).toContainEqual(
      expect.objectContaining({
        routeId: "M1",
        sourceScope: "equity_context",
        sourceId: "routeSpatialJoin",
        status: "pending_tract_geometry_join",
      }),
    );
  });
});
