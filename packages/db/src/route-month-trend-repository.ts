import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "./d1/client.js";
import { routeMonthTrend } from "./d1/schema.js";
import { IsoMonthSchema } from "./serving-shared.js";

const RouteMonthTrendRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    speed_observation_count: z.number().int().nonnegative(),
    speed_bus_trip_count: z.number().int().nonnegative(),
    average_speed_mph: z.number().nonnegative().nullable(),
    ridership: z.number().nonnegative().nullable(),
    transfers: z.number().nonnegative().nullable(),
    has_speed_trend: z.union([z.literal(0), z.literal(1), z.boolean()]),
    has_ridership_trend: z.union([z.literal(0), z.literal(1), z.boolean()]),
  })
  .strict();

export type RouteMonthTrendRow = z.output<typeof RouteMonthTrendRowSchema>;

export type RouteMonthTrend = {
  routeId: string;
  month: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  ridership: number | null;
  transfers: number | null;
  hasSpeedTrend: boolean;
  hasRidershipTrend: boolean;
};

function toRouteMonthTrend(row: RouteMonthTrendRow): RouteMonthTrend {
  return {
    routeId: row.route_id,
    month: row.month,
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    ridership: row.ridership,
    transfers: row.transfers,
    hasSpeedTrend: row.has_speed_trend === true || row.has_speed_trend === 1,
    hasRidershipTrend: row.has_ridership_trend === true || row.has_ridership_trend === 1,
  };
}

export async function listRouteMonthTrends(
  db: D1ServingDb,
  routeId: string,
): Promise<RouteMonthTrend[]> {
  const rows = await db
    .select({
      route_id: routeMonthTrend.routeId,
      month: routeMonthTrend.month,
      speed_observation_count: routeMonthTrend.speedObservationCount,
      speed_bus_trip_count: routeMonthTrend.speedBusTripCount,
      average_speed_mph: routeMonthTrend.averageSpeedMph,
      ridership: routeMonthTrend.ridership,
      transfers: routeMonthTrend.transfers,
      has_speed_trend: routeMonthTrend.hasSpeedTrend,
      has_ridership_trend: routeMonthTrend.hasRidershipTrend,
    })
    .from(routeMonthTrend)
    .where(eq(routeMonthTrend.routeId, routeId))
    .orderBy(asc(routeMonthTrend.month));

  return rows.map((row) => toRouteMonthTrend(RouteMonthTrendRowSchema.parse(row)));
}
