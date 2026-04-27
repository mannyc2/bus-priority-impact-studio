import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteEquityContext } from "../src/jobs/build/route-equity-context.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const fixtureDir = fromRepoRoot(join("data/fixtures/route-equity-context"));
const networkDir = join(fixtureDir, "network");
const equityDir = join(fixtureDir, "equity");
const outputDir = join(fixtureDir, "out");

async function writeJson(path: string, data: unknown): Promise<number> {
  return Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}

describe("route equity context", () => {
  test("assigns route rows to county-level ACS proxy context", async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    await Promise.all([
      mkdir(networkDir, { recursive: true }),
      mkdir(equityDir, { recursive: true }),
      mkdir(outputDir, { recursive: true }),
    ]);
    await writeJson(join(networkDir, "route-catalog.json"), {
      schemaVersion: 1,
      rows: [
        {
          routeId: "M1",
          routeShortName: "M1",
          routeLongName: "Harlem - East Village",
          latitudeMin: 40.1,
          latitudeMax: 40.9,
          longitudeMin: -74,
          longitudeMax: -73.8,
        },
        {
          routeId: "BX2",
          routeShortName: "Bx2",
          routeLongName: "Kingsbridge Heights - Mott Haven",
          latitudeMin: 40.8,
          latitudeMax: 40.9,
          longitudeMin: -73.95,
          longitudeMax: -73.85,
        },
        {
          routeId: "ZZ1",
          routeShortName: "ZZ1",
          routeLongName: null,
          latitudeMin: null,
          latitudeMax: null,
          longitudeMin: null,
          longitudeMax: null,
        },
      ],
    });
    await writeJson(join(equityDir, "nyc-tract-equity-context-2024.json"), {
      schemaVersion: 1,
      acsYear: 2024,
      rows: [
        {
          countyFips: "061",
          countyName: "New York County",
          totalPopulation: 100,
          occupiedHousingUnits: 50,
          noVehicleHouseholds: 20,
          medianHouseholdIncome: 80_000,
          povertyRate: 10,
          publicTransitCommuterShare: 60,
          raceEthnicityShare: {
            hispanic: 20,
            nonHispanicWhite: 40,
            nonHispanicBlack: 20,
            nonHispanicAsian: 15,
          },
        },
        {
          countyFips: "061",
          countyName: "New York County",
          totalPopulation: 300,
          occupiedHousingUnits: 150,
          noVehicleHouseholds: 90,
          medianHouseholdIncome: 100_000,
          povertyRate: 20,
          publicTransitCommuterShare: 70,
          raceEthnicityShare: {
            hispanic: 30,
            nonHispanicWhite: 30,
            nonHispanicBlack: 25,
            nonHispanicAsian: 10,
          },
        },
        {
          countyFips: "005",
          countyName: "Bronx County",
          totalPopulation: 200,
          occupiedHousingUnits: 100,
          noVehicleHouseholds: 70,
          medianHouseholdIncome: 50_000,
          povertyRate: 30,
          publicTransitCommuterShare: 65,
          raceEthnicityShare: {
            hispanic: 55,
            nonHispanicWhite: 10,
            nonHispanicBlack: 30,
            nonHispanicAsian: 3,
          },
        },
      ],
    });

    const result = await buildRouteEquityContext({
      year: 2026,
      month: 3,
      acsYear: 2024,
      generatedAt: new Date("2026-04-27T00:00:00.000Z"),
      networkDir,
      equityDir,
      outputDir,
    });
    const output = await Bun.file(result.outputPath).json();
    const summary = await Bun.file(result.summaryPath).json();

    expect(result).toEqual(
      expect.objectContaining({
        routeCount: 3,
        assignedRouteCount: 2,
      }),
    );
    expect(output.rows).toEqual([
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
      expect.objectContaining({
        routeId: "BX2",
        assignedCountyName: "Bronx County",
        noVehicleHouseholdShare: 0.7,
      }),
      expect.objectContaining({
        routeId: "ZZ1",
        assignedCountyName: null,
        assignmentMethod: "unassigned",
        totalPopulation: null,
      }),
    ]);
    expect(summary).toEqual(
      expect.objectContaining({
        routeCount: 3,
        assignedRouteCount: 2,
        unassignedRouteCount: 1,
      }),
    );
  });
});
