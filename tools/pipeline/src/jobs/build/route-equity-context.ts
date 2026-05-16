import {
  type LocalCensusTractEquityContext,
  type LocalRouteCatalogEntry,
  listCensusTractEquityContext,
  listRouteCatalog,
  replaceRouteEquityRows,
} from "@bp/db/local";
import { numberOption } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type TractEquityRow = LocalCensusTractEquityContext;
type RouteCatalogRow = LocalRouteCatalogEntry;

type CountyAggregate = {
  countyFips: string;
  countyName: string;
  tractCount: number;
  totalPopulation: number;
  occupiedHousingUnits: number;
  noVehicleHouseholds: number;
  noVehicleHouseholdShare: number | null;
  medianHouseholdIncome: number | null;
  povertyRate: number | null;
  publicTransitCommuterShare: number | null;
  raceEthnicityShare: {
    hispanic: number | null;
    nonHispanicWhite: number | null;
    nonHispanicBlack: number | null;
    nonHispanicAsian: number | null;
  };
};

type AssignedCounty = {
  countyFips: string;
  countyName: string;
  method: "route_id_prefix";
};

type RouteEquityContextArgs = {
  year?: number;
  month?: number;
  acsYear?: number;
  dbPath?: string;
};

type RouteEquityContextResult = {
  analysisPeriod: string;
  acsYear: number;
  routeCount: number;
  assignedRouteCount: number;
};

const routePrefixCountyRules: readonly [RegExp, AssignedCounty][] = [
  [/^BX/i, { countyFips: "005", countyName: "Bronx County", method: "route_id_prefix" }],
  [/^BM/i, { countyFips: "047", countyName: "Kings County", method: "route_id_prefix" }],
  [/^B/i, { countyFips: "047", countyName: "Kings County", method: "route_id_prefix" }],
  [/^M/i, { countyFips: "061", countyName: "New York County", method: "route_id_prefix" }],
  [/^QM/i, { countyFips: "081", countyName: "Queens County", method: "route_id_prefix" }],
  [/^Q/i, { countyFips: "081", countyName: "Queens County", method: "route_id_prefix" }],
  [/^SIM/i, { countyFips: "085", countyName: "Richmond County", method: "route_id_prefix" }],
  [/^S/i, { countyFips: "085", countyName: "Richmond County", method: "route_id_prefix" }],
];

function parseCliArgs(args: string[]): RouteEquityContextArgs {
  return parseMonthDbCliArgs(args, {} as RouteEquityContextArgs, [
    numberOption(["--acs-year"], (output, value) => {
      output.acsYear = value;
    }),
  ]);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sumDefined(rows: TractEquityRow[], readValue: (row: TractEquityRow) => number | null) {
  return rows.reduce((sum, row) => sum + (readValue(row) ?? 0), 0);
}

function weightedMean(
  rows: TractEquityRow[],
  readValue: (row: TractEquityRow) => number | null,
): number | null {
  let weightedSum = 0;
  let weightSum = 0;

  for (const row of rows) {
    const value = readValue(row);
    const weight = row.totalPopulation ?? 0;
    if (value === null || weight <= 0) {
      continue;
    }
    weightedSum += value * weight;
    weightSum += weight;
  }

  return weightSum === 0 ? null : round(weightedSum / weightSum);
}

function assignCounty(route: RouteCatalogRow): AssignedCounty | null {
  for (const [pattern, county] of routePrefixCountyRules) {
    if (pattern.test(route.routeId)) {
      return county;
    }
  }

  return null;
}

function buildCountyAggregates(rows: TractEquityRow[]): Map<string, CountyAggregate> {
  const rowsByCounty = new Map<string, TractEquityRow[]>();
  for (const row of rows) {
    rowsByCounty.set(row.countyFips, [...(rowsByCounty.get(row.countyFips) ?? []), row]);
  }

  return new Map(
    [...rowsByCounty.entries()].map(([countyFips, countyRows]) => {
      const totalPopulation = sumDefined(countyRows, (row) => row.totalPopulation);
      const occupiedHousingUnits = sumDefined(countyRows, (row) => row.occupiedHousingUnits);
      const noVehicleHouseholds = sumDefined(countyRows, (row) => row.noVehicleHouseholds);

      return [
        countyFips,
        {
          countyFips,
          countyName: countyRows[0]?.countyName ?? "Unknown County",
          tractCount: countyRows.length,
          totalPopulation,
          occupiedHousingUnits,
          noVehicleHouseholds,
          noVehicleHouseholdShare:
            occupiedHousingUnits === 0 ? null : round(noVehicleHouseholds / occupiedHousingUnits),
          medianHouseholdIncome: weightedMean(countyRows, (row) => row.medianHouseholdIncome),
          povertyRate: weightedMean(countyRows, (row) => row.povertyRate),
          publicTransitCommuterShare: weightedMean(
            countyRows,
            (row) => row.publicTransitCommuterShare,
          ),
          raceEthnicityShare: {
            hispanic: weightedMean(countyRows, (row) => row.raceEthnicityShare.hispanic),
            nonHispanicWhite: weightedMean(
              countyRows,
              (row) => row.raceEthnicityShare.nonHispanicWhite,
            ),
            nonHispanicBlack: weightedMean(
              countyRows,
              (row) => row.raceEthnicityShare.nonHispanicBlack,
            ),
            nonHispanicAsian: weightedMean(
              countyRows,
              (row) => row.raceEthnicityShare.nonHispanicAsian,
            ),
          },
        },
      ];
    }),
  );
}

export async function buildRouteEquityContext(
  args: RouteEquityContextArgs = {},
): Promise<RouteEquityContextResult> {
  const options = createMonthContext(args);
  const acsYear = args.acsYear ?? 2024;
  const [routeCatalog, tractRows] = await withLocalPipelineDb(options.dbPath, (local) =>
    Promise.all([listRouteCatalog(local.db), listCensusTractEquityContext(local.db, acsYear)]),
  );
  const countyAggregates = buildCountyAggregates(tractRows);
  const rows = routeCatalog.map((route) => {
    const assignedCounty = assignCounty(route);
    const aggregate =
      assignedCounty === null ? undefined : countyAggregates.get(assignedCounty.countyFips);

    return {
      routeId: route.routeId,
      isoMonth: options.isoMonth,
      acsYear,
      assignmentGeography: "county_proxy",
      assignedCountyFips: assignedCounty?.countyFips ?? null,
      assignedCountyName: assignedCounty?.countyName ?? null,
      assignmentMethod: assignedCounty?.method ?? "unassigned",
      tractCount: aggregate?.tractCount ?? 0,
      totalPopulation: aggregate?.totalPopulation ?? null,
      occupiedHousingUnits: aggregate?.occupiedHousingUnits ?? null,
      noVehicleHouseholds: aggregate?.noVehicleHouseholds ?? null,
      noVehicleHouseholdShare: aggregate?.noVehicleHouseholdShare ?? null,
      medianHouseholdIncome: aggregate?.medianHouseholdIncome ?? null,
      povertyRate: aggregate?.povertyRate ?? null,
      publicTransitCommuterShare: aggregate?.publicTransitCommuterShare ?? null,
      raceEthnicityShare: aggregate?.raceEthnicityShare ?? {
        hispanic: null,
        nonHispanicWhite: null,
        nonHispanicBlack: null,
        nonHispanicAsian: null,
      },
      sourceStatus: {
        demographics: aggregate === undefined ? "unassigned" : "county_proxy_available",
        lowCarHouseholds: aggregate === undefined ? "unassigned" : "county_proxy_available",
        publicTransitCommuteShare:
          aggregate === undefined ? "unassigned" : "county_proxy_available",
        routeSpatialJoin: "pending_tract_geometry_join",
        jobAccess: "not_ingested_lehd_lodes_or_travel_time_model",
      },
    };
  });
  const assignedRouteCount = rows.filter((row) => row.assignedCountyFips !== null).length;
  await withLocalPipelineDb(options.dbPath, (local) =>
    replaceRouteEquityRows(local.db, options.isoMonth, {
      rows: rows.map((row) => ({
        routeId: row.routeId,
        month: row.isoMonth,
        acsYear: row.acsYear,
        assignmentGeography: row.assignmentGeography,
        assignedCountyFips: row.assignedCountyFips,
        assignedCountyName: row.assignedCountyName,
        assignmentMethod: row.assignmentMethod,
        tractCount: row.tractCount,
        totalPopulation: row.totalPopulation,
        occupiedHousingUnits: row.occupiedHousingUnits,
        noVehicleHouseholds: row.noVehicleHouseholds,
        noVehicleHouseholdShare: row.noVehicleHouseholdShare,
        medianHouseholdIncome: row.medianHouseholdIncome,
        povertyRate: row.povertyRate,
        publicTransitCommuterShare: row.publicTransitCommuterShare,
        hispanicShare: row.raceEthnicityShare.hispanic,
        nonHispanicWhiteShare: row.raceEthnicityShare.nonHispanicWhite,
        nonHispanicBlackShare: row.raceEthnicityShare.nonHispanicBlack,
        nonHispanicAsianShare: row.raceEthnicityShare.nonHispanicAsian,
      })),
      sourceStatuses: rows.flatMap((row) =>
        Object.entries(row.sourceStatus).map(([sourceId, status]) => ({
          routeId: row.routeId,
          month: row.isoMonth,
          sourceScope: "equity_context",
          sourceId,
          status,
          rowCount: null,
          snapshotId: null,
          note: null,
        })),
      ),
    }),
  );

  return {
    analysisPeriod: options.isoMonth,
    acsYear,
    routeCount: rows.length,
    assignedRouteCount,
  };
}

export async function buildRouteEquityContextFromCli(
  args: string[],
): Promise<RouteEquityContextResult> {
  return buildRouteEquityContext(parseCliArgs(args));
}
