import { and, asc, desc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeReadiness, routeReadinessMissingInput } from "../schema.js";
import { sqliteBool } from "./shared.js";

export type RouteReadiness = {
  routeId: string;
  month: string;
  routeShortName: string;
  routeLongName: string | null;
  readinessStatus: RouteReadinessRow["readiness_status"];
  buildEligible: boolean;
  readinessScore: number;
  missingInputs: string[];
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
};

export function routeMonthKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

export async function listReadinessMissingInputRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeReadinessMissingInput.routeId,
      month: routeReadinessMissingInput.month,
      input_rank: routeReadinessMissingInput.inputRank,
      input_name: routeReadinessMissingInput.inputName,
      severity: routeReadinessMissingInput.severity,
      note: routeReadinessMissingInput.note,
    })
    .from(routeReadinessMissingInput)
    .where(eq(routeReadinessMissingInput.month, month))
    .orderBy(asc(routeReadinessMissingInput.routeId), asc(routeReadinessMissingInput.inputRank));
}

export type RouteReadinessMissingInputRow = Awaited<
  ReturnType<typeof listReadinessMissingInputRows>
>[number];

export function groupMissingInputs(
  rows: readonly RouteReadinessMissingInputRow[],
): Map<string, string[]> {
  const output = new Map<string, string[]>();

  for (const row of rows) {
    const key = routeMonthKey(row.route_id, row.month);
    const group = output.get(key) ?? [];
    group.push(row.input_name);
    output.set(key, group);
  }

  return output;
}

function toRouteReadiness(
  row: RouteReadinessRow,
  missingInputs: Map<string, string[]>,
): RouteReadiness {
  return {
    routeId: row.route_id,
    month: row.month,
    routeShortName: row.route_short_name,
    routeLongName: row.route_long_name,
    readinessStatus: row.readiness_status,
    buildEligible: sqliteBool(row.build_eligible),
    readinessScore: row.readiness_score,
    missingInputs: missingInputs.get(routeMonthKey(row.route_id, row.month)) ?? [],
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
    shapeCount: row.shape_count,
    stopCount: row.stop_count,
    timepointStopCount: row.timepoint_stop_count,
  };
}

async function selectReadinessRows(db: D1ServingDb, month: string, buildEligibleOnly: boolean) {
  return db
    .select({
      route_id: routeReadiness.routeId,
      month: routeReadiness.month,
      route_short_name: routeReadiness.routeShortName,
      route_long_name: routeReadiness.routeLongName,
      readiness_status: routeReadiness.readinessStatus,
      build_eligible: routeReadiness.buildEligible,
      readiness_score: routeReadiness.readinessScore,
      speed_observation_count: routeReadiness.speedObservationCount,
      speed_bus_trip_count: routeReadiness.speedBusTripCount,
      average_speed_mph: routeReadiness.averageSpeedMph,
      schedule_timepoint_count: routeReadiness.scheduleTimepointCount,
      shape_count: routeReadiness.shapeCount,
      stop_count: routeReadiness.stopCount,
      timepoint_stop_count: routeReadiness.timepointStopCount,
    })
    .from(routeReadiness)
    .where(
      buildEligibleOnly
        ? and(eq(routeReadiness.month, month), eq(routeReadiness.buildEligible, true))
        : eq(routeReadiness.month, month),
    )
    .orderBy(
      ...(buildEligibleOnly
        ? [asc(routeReadiness.averageSpeedMph), asc(routeReadiness.routeId)]
        : [
            desc(routeReadiness.buildEligible),
            desc(routeReadiness.readinessScore),
            asc(routeReadiness.averageSpeedMph),
            asc(routeReadiness.routeId),
          ]),
    );
}

export type RouteReadinessRow = Awaited<ReturnType<typeof selectReadinessRows>>[number];

async function listReadinessRows(
  db: D1ServingDb,
  month: string,
  buildEligibleOnly: boolean,
): Promise<RouteReadiness[]> {
  const rows = await selectReadinessRows(db, month, buildEligibleOnly);
  const missingInputs = groupMissingInputs(await listReadinessMissingInputRows(db, month));

  return rows.map((row) => toRouteReadiness(row, missingInputs));
}

export async function listRouteReadiness(
  db: D1ServingDb,
  month: string,
): Promise<RouteReadiness[]> {
  return listReadinessRows(db, month, false);
}

export async function listBuildEligibleRoutes(
  db: D1ServingDb,
  month: string,
): Promise<RouteReadiness[]> {
  return listReadinessRows(db, month, true);
}
