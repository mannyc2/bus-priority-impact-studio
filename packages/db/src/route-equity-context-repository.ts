import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

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
    source_status_json: z.string(),
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
  sourceStatus: unknown;
};

function toRouteEquityContext(row: RouteEquityContextRow): RouteEquityContext {
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
    sourceStatus: parseJsonField(row.source_status_json),
  };
}

export async function listRouteEquityContexts(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteEquityContext[]> {
  const result = await db
    .prepare<RouteEquityContextRow>(
      [
        "SELECT route_id, month, acs_year, assignment_geography, assigned_county_fips,",
        "assigned_county_name, assignment_method, tract_count, total_population,",
        "occupied_housing_units, no_vehicle_households, no_vehicle_household_share,",
        "median_household_income, poverty_rate, public_transit_commuter_share,",
        "hispanic_share, non_hispanic_white_share, non_hispanic_black_share,",
        "non_hispanic_asian_share, source_status_json",
        "FROM route_equity_context",
        "WHERE month = ?",
        "ORDER BY no_vehicle_household_share DESC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteEquityContext(RouteEquityContextRowSchema.parse(row)),
  );
}
