import { describe, expect, test } from "bun:test";
import type { LocalCensusTractEquityContext, LocalRouteCatalogEntry } from "@bp/db/local";
import {
  assignRouteCounty,
  buildCountyAggregates,
  buildRouteEquityContextRows,
} from "../src/local-db";

function route(overrides: Partial<LocalRouteCatalogEntry>): LocalRouteCatalogEntry {
  return {
    routeId: "M15",
    routeShortName: "M15",
    routeLongName: "Select Bus Service",
    routeTypes: ["local"],
    directions: ["0", "1"],
    shapeCount: 2,
    stopCount: 20,
    timepointStopCount: 8,
    latitudeMin: null,
    latitudeMax: null,
    longitudeMin: null,
    longitudeMax: null,
    ...overrides,
  };
}

function tract(overrides: Partial<LocalCensusTractEquityContext>): LocalCensusTractEquityContext {
  return {
    acsYear: 2024,
    geoid: "36061000100",
    stateFips: "36",
    countyFips: "061",
    tractCode: "000100",
    countyName: "New York County",
    tractName: "Census Tract 1",
    totalPopulation: 100,
    occupiedHousingUnits: 40,
    noVehicleHouseholds: 20,
    noVehicleHouseholdShare: 0.5,
    medianHouseholdIncome: 80_000,
    povertyRate: 0.1,
    publicTransitCommuters: 30,
    publicTransitCommuterShare: 0.6,
    raceEthnicityShare: {
      hispanic: 0.2,
      nonHispanicWhite: 0.4,
      nonHispanicBlack: 0.2,
      nonHispanicAsian: 0.2,
    },
    ...overrides,
  };
}

describe("route equity context", () => {
  test("assigns route prefixes to county proxies", () => {
    expect(assignRouteCounty(route({ routeId: "M15" }))).toMatchObject({
      countyFips: "061",
      countyName: "New York County",
    });
    expect(assignRouteCounty(route({ routeId: "Bx12" }))).toMatchObject({
      countyFips: "005",
      countyName: "Bronx County",
    });
    expect(assignRouteCounty(route({ routeId: "X27" }))).toBeNull();
  });

  test("builds weighted county aggregates and route rows", () => {
    const aggregates = buildCountyAggregates([
      tract({ totalPopulation: 100, occupiedHousingUnits: 40, noVehicleHouseholds: 20 }),
      tract({
        geoid: "36061000200",
        tractCode: "000200",
        totalPopulation: 300,
        occupiedHousingUnits: 60,
        noVehicleHouseholds: 15,
        medianHouseholdIncome: 40_000,
        povertyRate: 0.3,
        publicTransitCommuterShare: 0.8,
        raceEthnicityShare: {
          hispanic: 0.4,
          nonHispanicWhite: 0.2,
          nonHispanicBlack: 0.2,
          nonHispanicAsian: 0.2,
        },
      }),
    ]);

    expect(aggregates.get("061")).toMatchObject({
      tractCount: 2,
      totalPopulation: 400,
      occupiedHousingUnits: 100,
      noVehicleHouseholds: 35,
      noVehicleHouseholdShare: 0.35,
      medianHouseholdIncome: 50_000,
      povertyRate: 0.25,
      publicTransitCommuterShare: 0.75,
      raceEthnicityShare: {
        hispanic: 0.35,
        nonHispanicWhite: 0.25,
      },
    });

    const rows = buildRouteEquityContextRows({
      routeCatalog: [route({ routeId: "M15" }), route({ routeId: "X27" })],
      tractRows: [...aggregates.values()].flatMap(() => [
        tract({ totalPopulation: 100, occupiedHousingUnits: 40, noVehicleHouseholds: 20 }),
      ]),
      month: "2026-03",
      acsYear: 2024,
    });

    expect(rows[0]).toMatchObject({
      routeId: "M15",
      assignedCountyFips: "061",
      assignmentMethod: "route_id_prefix",
      sourceStatus: {
        demographics: "county_proxy_available",
        routeSpatialJoin: "pending_tract_geometry_join",
      },
    });
    expect(rows[1]).toMatchObject({
      routeId: "X27",
      assignedCountyFips: null,
      assignmentMethod: "unassigned",
      totalPopulation: null,
      sourceStatus: {
        demographics: "unassigned",
      },
    });
  });
});
