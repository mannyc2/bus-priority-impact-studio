import type { Database } from "bun:sqlite";
import type { RouteSpeedSpineSourceRow } from "@bp/analytics/feature-history";

export type RouteSpeedSpineCandidate = {
  routeId: string;
  sourceRowCount: number;
  monthCount: number;
  startMonth: string;
  endMonth: string;
};

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

export function loadRouteSpeedSpineLocalDbRows(input: {
  sqlite: Database;
  routeId: string;
  startMonth: string;
  endMonth: string | null;
}): RouteSpeedSpineSourceRow[] {
  const clauses = ["route_id = ?", "month >= ?"];
  const params: Array<string | number> = [input.routeId, input.startMonth];
  if (input.endMonth !== null) {
    clauses.push("month <= ?");
    params.push(input.endMonth);
  }
  return input.sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          direction,
          stop_order,
          timepoint_stop_id,
          timepoint_stop_name,
          timepoint_stop_latitude,
          timepoint_stop_longitude,
          next_timepoint_stop_id,
          next_timepoint_stop_name,
          next_timepoint_stop_latitude,
          next_timepoint_stop_longitude,
          COUNT(*) AS source_row_count,
          SUM(bus_trip_count) AS bus_trip_count,
          SUM(average_road_speed_mph * bus_trip_count)
            / NULLIF(SUM(CASE WHEN average_road_speed_mph IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_road_speed_mph,
          SUM(average_travel_time_minutes * bus_trip_count)
            / NULLIF(SUM(CASE WHEN average_travel_time_minutes IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_travel_time_minutes,
          SUM(road_distance_miles * bus_trip_count)
            / NULLIF(SUM(CASE WHEN road_distance_miles IS NULL THEN 0 ELSE bus_trip_count END), 0)
            AS average_road_distance_miles
        FROM local_route_segment_speed
        WHERE ${clauses.join(" AND ")}
        GROUP BY
          route_id,
          month,
          direction,
          stop_order,
          timepoint_stop_id,
          timepoint_stop_name,
          timepoint_stop_latitude,
          timepoint_stop_longitude,
          next_timepoint_stop_id,
          next_timepoint_stop_name,
          next_timepoint_stop_latitude,
          next_timepoint_stop_longitude
        ORDER BY month, direction, stop_order, timepoint_stop_id, next_timepoint_stop_id
      `,
    )
    .all(...params) as RouteSpeedSpineSourceRow[];
}

export function loadRouteSpeedSpineCandidateLocalDbRows(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string | null;
  routeIds: readonly string[];
}): RouteSpeedSpineCandidate[] {
  const clauses = ["month >= ?"];
  const params: Array<string | number> = [input.startMonth];
  if (input.endMonth !== null) {
    clauses.push("month <= ?");
    params.push(input.endMonth);
  }
  if (input.routeIds.length > 0) {
    clauses.push(`route_id IN (${input.routeIds.map(() => "?").join(", ")})`);
    params.push(...input.routeIds);
  }
  const rows = input.sqlite
    .query(
      `
        SELECT
          route_id,
          COUNT(*) AS source_row_count,
          COUNT(DISTINCT month) AS month_count,
          MIN(month) AS start_month,
          MAX(month) AS end_month
        FROM local_route_segment_speed
        WHERE ${clauses.join(" AND ")}
        GROUP BY route_id
        ORDER BY route_id
      `,
    )
    .all(...params) as Array<{
    route_id: string;
    source_row_count: number;
    month_count: number;
    start_month: string;
    end_month: string;
  }>;
  return rows.map((row) => ({
    routeId: row.route_id,
    sourceRowCount: row.source_row_count,
    monthCount: row.month_count,
    startMonth: row.start_month,
    endMonth: row.end_month,
  }));
}

export function loadCurrentRouteSpeedSpineCatalogRouteIds(sqlite: Database): Set<string> {
  const row = sqlite
    .query("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get("local_route_catalog") as { ok?: number } | null;
  if (row?.ok !== 1) return new Set();
  const rows = sqlite
    .query("SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id")
    .all() as Array<{ route_id: string }>;
  return new Set(rows.map((catalogRow) => normalizeRouteId(catalogRow.route_id)));
}
