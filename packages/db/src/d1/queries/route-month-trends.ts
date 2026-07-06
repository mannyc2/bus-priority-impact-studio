import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeMonthTrend } from "../schema.js";
import { sqliteBool } from "./shared.js";

async function selectRouteMonthTrendRows(db: D1ServingDb, routeId: string) {
  return db
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
}

export type RouteMonthTrendRow = Awaited<ReturnType<typeof selectRouteMonthTrendRows>>[number];

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
    hasSpeedTrend: sqliteBool(row.has_speed_trend),
    hasRidershipTrend: sqliteBool(row.has_ridership_trend),
  };
}

export async function listRouteMonthTrends(
  db: D1ServingDb,
  routeId: string,
): Promise<RouteMonthTrend[]> {
  const rows = await selectRouteMonthTrendRows(db, routeId);
  return rows.map(toRouteMonthTrend);
}
