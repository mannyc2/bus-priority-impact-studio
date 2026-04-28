import { asc, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeEquityContext } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";
import { groupSourceStatuses, listRouteMonthSourceStatuses } from "./source-statuses.js";

const RouteEquityContextRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    acs_year: z.number().int().min(2000),
    assignment_geography: z.literal("county_proxy"),
    assigned_county_fips: z.string().nullable(),
    assigned_county_name: z.string().nullable(),
    assignment_method: z.enum(["route_id_prefix", "unassigned"]),
    tract_count: z.number().int().nonnegative(),
    total_population: z.number().int().nonnegative().nullable(),
    occupied_housing_units: z.number().int().nonnegative().nullable(),
    no_vehicle_households: z.number().int().nonnegative().nullable(),
    no_vehicle_household_share: z.number().nonnegative().nullable(),
    median_household_income: z.number().nonnegative().nullable(),
    poverty_rate: z.number().nonnegative().nullable(),
    public_transit_commuter_share: z.number().nonnegative().nullable(),
    hispanic_share: z.number().nonnegative().nullable(),
    non_hispanic_white_share: z.number().nonnegative().nullable(),
    non_hispanic_black_share: z.number().nonnegative().nullable(),
    non_hispanic_asian_share: z.number().nonnegative().nullable(),
  })
  .strict();

export type RouteEquityContextRow = z.output<typeof RouteEquityContextRowSchema>;

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

function toRouteEquityContext(
  row: RouteEquityContextRow,
  sourceStatuses: Map<string, Record<string, string>>,
): RouteEquityContext {
  return {
    routeId: row.route_id,
    month: row.month,
    acsYear: row.acs_year,
    assignmentGeography: row.assignment_geography,
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
  const rows = await db
    .select({
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
    })
    .from(routeEquityContext)
    .where(eq(routeEquityContext.month, month))
    .orderBy(desc(routeEquityContext.noVehicleHouseholdShare), asc(routeEquityContext.routeId));

  const parsedRows = rows.map((row) => RouteEquityContextRowSchema.parse(row));
  const sourceStatuses = groupSourceStatuses(
    await listRouteMonthSourceStatuses(db, month, "equity_context"),
  );

  return parsedRows.map((row) => toRouteEquityContext(row, sourceStatuses));
}
