import { and, asc, desc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeEquityContext } from "../schema.js";
import { groupSourceStatuses, listRouteMonthSourceStatuses } from "./source-statuses.js";

export type RouteEquityContext = {
  routeId: string;
  month: string;
  acsYear: number;
  assignmentGeography: "county_proxy";
  assignedCountyFips: string | null;
  assignedCountyName: string | null;
  assignmentMethod: RouteEquityContextRow["assignment_method"];
  tractCount: number;
  totalPopulation: number | null;
  occupiedHousingUnits: number | null;
  noVehicleHouseholds: number | null;
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
  sourceStatus: Record<string, string>;
};

function key(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

const routeEquityContextColumns = {
  route_id: routeEquityContext.routeId,
  month: routeEquityContext.month,
  acs_year: routeEquityContext.acsYear,
  assignment_geography: routeEquityContext.assignmentGeography,
  assigned_county_fips: routeEquityContext.assignedCountyFips,
  assigned_county_name: routeEquityContext.assignedCountyName,
  assignment_method: routeEquityContext.assignmentMethod,
  tract_count: routeEquityContext.tractCount,
  total_population: routeEquityContext.totalPopulation,
  occupied_housing_units: routeEquityContext.occupiedHousingUnits,
  no_vehicle_households: routeEquityContext.noVehicleHouseholds,
  no_vehicle_household_share: routeEquityContext.noVehicleHouseholdShare,
  median_household_income: routeEquityContext.medianHouseholdIncome,
  poverty_rate: routeEquityContext.povertyRate,
  public_transit_commuter_share: routeEquityContext.publicTransitCommuterShare,
  hispanic_share: routeEquityContext.hispanicShare,
  non_hispanic_white_share: routeEquityContext.nonHispanicWhiteShare,
  non_hispanic_black_share: routeEquityContext.nonHispanicBlackShare,
  non_hispanic_asian_share: routeEquityContext.nonHispanicAsianShare,
};

function toRouteEquityContext(
  row: RouteEquityContextRow,
  sourceStatuses: Map<string, Record<string, string>>,
): RouteEquityContext {
  return {
    routeId: row.route_id,
    month: row.month,
    acsYear: row.acs_year,
    assignmentGeography: row.assignment_geography as RouteEquityContext["assignmentGeography"],
    assignedCountyFips: row.assigned_county_fips,
    assignedCountyName: row.assigned_county_name,
    assignmentMethod: row.assignment_method,
    tractCount: row.tract_count,
    totalPopulation: row.total_population,
    occupiedHousingUnits: row.occupied_housing_units,
    noVehicleHouseholds: row.no_vehicle_households,
    noVehicleHouseholdShare: row.no_vehicle_household_share,
    medianHouseholdIncome: row.median_household_income,
    povertyRate: row.poverty_rate,
    publicTransitCommuterShare: row.public_transit_commuter_share,
    raceEthnicityShare: {
      hispanic: row.hispanic_share,
      nonHispanicWhite: row.non_hispanic_white_share,
      nonHispanicBlack: row.non_hispanic_black_share,
      nonHispanicAsian: row.non_hispanic_asian_share,
    },
    sourceStatus: sourceStatuses.get(key(row.route_id, row.month)) ?? {},
  };
}

export async function listRouteEquityContexts(
  db: D1ServingDb,
  month: string,
): Promise<RouteEquityContext[]> {
  const rows = await selectRouteEquityContextRows(db, month);
  const sourceStatuses = groupSourceStatuses(
    await listRouteMonthSourceStatuses(db, month, "equity_context"),
  );

  return rows.map((row) => toRouteEquityContext(row, sourceStatuses));
}

async function selectRouteEquityContextRows(db: D1ServingDb, month: string) {
  return db
    .select(routeEquityContextColumns)
    .from(routeEquityContext)
    .where(eq(routeEquityContext.month, month))
    .orderBy(desc(routeEquityContext.noVehicleHouseholdShare), asc(routeEquityContext.routeId));
}

async function selectRouteEquityContextRow(db: D1ServingDb, routeId: string, month: string) {
  return db
    .select(routeEquityContextColumns)
    .from(routeEquityContext)
    .where(and(eq(routeEquityContext.routeId, routeId), eq(routeEquityContext.month, month)))
    .limit(1);
}

export type RouteEquityContextRow = Awaited<
  ReturnType<typeof selectRouteEquityContextRows>
>[number];

export async function findRouteEquityContext(
  db: D1ServingDb,
  routeId: string,
  month: string,
): Promise<RouteEquityContext | null> {
  const rows = await selectRouteEquityContextRow(db, routeId, month);
  const row = rows[0];
  if (row === undefined) return null;

  const sourceStatuses = groupSourceStatuses(
    await listRouteMonthSourceStatuses(db, month, "equity_context"),
  );

  return toRouteEquityContext(row, sourceStatuses);
}
