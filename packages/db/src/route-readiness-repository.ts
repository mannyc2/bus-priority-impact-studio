import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

const RouteReadinessRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_short_name: z.string().min(1),
    route_long_name: z.string().nullable(),
    readiness_status: z.enum([
      "ready",
      "partial",
      "missing_geometry",
      "missing_schedule",
      "missing_speed",
    ]),
    build_eligible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    readiness_score: z.number().int().min(0).max(100),
    missing_inputs_json: z.string(),
    speed_observation_count: z.number().int().nonnegative(),
    speed_bus_trip_count: z.number().int().nonnegative(),
    average_speed_mph: z.number().nonnegative().nullable(),
    schedule_timepoint_count: z.number().int().nonnegative(),
    shape_count: z.number().int().nonnegative(),
    stop_count: z.number().int().nonnegative(),
    timepoint_stop_count: z.number().int().nonnegative(),
  })
  .strict();

export type RouteReadinessRow = z.output<typeof RouteReadinessRowSchema>;

export type RouteReadiness = {
  routeId: string;
  month: string;
  routeShortName: string;
  routeLongName: string | null;
  readinessStatus: RouteReadinessRow["readiness_status"];
  buildEligible: boolean;
  readinessScore: number;
  missingInputs: unknown;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
};

function toRouteReadiness(row: RouteReadinessRow): RouteReadiness {
  return {
    routeId: row.route_id,
    month: row.month,
    routeShortName: row.route_short_name,
    routeLongName: row.route_long_name,
    readinessStatus: row.readiness_status,
    buildEligible: row.build_eligible === true || row.build_eligible === 1,
    readinessScore: row.readiness_score,
    missingInputs: parseJsonField(row.missing_inputs_json),
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
    shapeCount: row.shape_count,
    stopCount: row.stop_count,
    timepointStopCount: row.timepoint_stop_count,
  };
}

export async function listRouteReadiness(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReadiness[]> {
  const result = await db
    .prepare<RouteReadinessRow>(
      [
        "SELECT route_id, month, route_short_name, route_long_name, readiness_status,",
        "build_eligible, readiness_score, missing_inputs_json, speed_observation_count,",
        "speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, shape_count,",
        "stop_count, timepoint_stop_count",
        "FROM route_readiness",
        "WHERE month = ?",
        "ORDER BY build_eligible DESC, readiness_score DESC, average_speed_mph ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) => toRouteReadiness(RouteReadinessRowSchema.parse(row)));
}

export async function listBuildEligibleRoutes(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteReadiness[]> {
  const result = await db
    .prepare<RouteReadinessRow>(
      [
        "SELECT route_id, month, route_short_name, route_long_name, readiness_status,",
        "build_eligible, readiness_score, missing_inputs_json, speed_observation_count,",
        "speed_bus_trip_count, average_speed_mph, schedule_timepoint_count, shape_count,",
        "stop_count, timepoint_stop_count",
        "FROM route_readiness",
        "WHERE month = ? AND build_eligible = 1",
        "ORDER BY average_speed_mph ASC, route_id ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) => toRouteReadiness(RouteReadinessRowSchema.parse(row)));
}
