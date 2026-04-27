import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
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
  db: D1DatabaseLike,
  routeId: string,
): Promise<RouteMonthTrend[]> {
  const result = await db
    .prepare<RouteMonthTrendRow>(
      [
        "SELECT route_id, month, speed_observation_count, speed_bus_trip_count,",
        "average_speed_mph, ridership, transfers, has_speed_trend, has_ridership_trend",
        "FROM route_month_trend",
        "WHERE route_id = ?",
        "ORDER BY month ASC",
      ].join(" "),
    )
    .bind(routeId)
    .all();

  return (result.results ?? []).map((row) =>
    toRouteMonthTrend(RouteMonthTrendRowSchema.parse(row)),
  );
}
