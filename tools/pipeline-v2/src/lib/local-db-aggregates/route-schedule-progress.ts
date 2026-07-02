import type { Database } from "bun:sqlite";

type CountRow = {
  count?: unknown;
  rows?: unknown;
  routes?: unknown;
  stops?: unknown;
  timepoint_rows?: unknown;
  run_id?: unknown;
  bundles?: unknown;
  trips?: unknown;
  stop_times?: unknown;
  services?: unknown;
  source_ids?: unknown;
};

export type RouteScheduleProgressResult = {
  routeCatalogCount: number;
  socrataRouteSchedules: Array<{
    sourceYear: number;
    rowCount: number;
    routeCount: number;
    stopCount: number;
    timepointRowCount: number;
    stagedRouteShare: number | null;
    timepointRowShare: number | null;
    likelyTimepointGrain: boolean;
  }>;
  gtfsStaticRuns: Array<{
    runId: string;
    bundleCount: number;
    routeCount: number;
    stopCount: number;
    tripCount: number;
    stopTimeCount: number;
    serviceCount: number;
    sourceIds: string[];
  }>;
};

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function tableCount(sqlite: Database, tableName: string): number {
  if (!tableExists(sqlite, tableName)) return 0;
  const row = sqlite.query(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as CountRow | null;
  return numberValue(row?.count);
}

export function auditRouteScheduleProgress(sqlite: Database): RouteScheduleProgressResult {
  const routeCatalogCount = tableCount(sqlite, "local_route_catalog");
  const socrataRouteSchedules = tableExists(sqlite, "local_route_schedule_stop")
    ? (
        sqlite
          .query(
            `
              SELECT
                source_year,
                COUNT(*) AS rows,
                COUNT(DISTINCT route_id) AS routes,
                COUNT(DISTINCT stop_id) AS stops,
                SUM(CASE WHEN timepoint = 1 THEN 1 ELSE 0 END) AS timepoint_rows
              FROM local_route_schedule_stop
              GROUP BY source_year
              ORDER BY source_year DESC
            `,
          )
          .all() as Array<CountRow & { source_year?: unknown }>
      ).map((row) => {
        const rowCount = numberValue(row.rows);
        const timepointRowCount = numberValue(row.timepoint_rows);
        const timepointRowShare = rowCount === 0 ? null : timepointRowCount / rowCount;
        return {
          sourceYear: numberValue(row.source_year),
          rowCount,
          routeCount: numberValue(row.routes),
          stopCount: numberValue(row.stops),
          timepointRowCount,
          stagedRouteShare:
            routeCatalogCount === 0 ? null : numberValue(row.routes) / routeCatalogCount,
          timepointRowShare,
          likelyTimepointGrain: timepointRowShare !== null && timepointRowShare >= 0.95,
        };
      })
    : [];

  const gtfsStaticRuns = tableExists(sqlite, "local_gtfs_static_bundle")
    ? (
        sqlite
          .query(
            `
              SELECT run_id,
                     COUNT(DISTINCT source_id) AS bundles,
                     SUM(trip_count) AS trips,
                     SUM(stop_time_count) AS stop_times,
                     SUM(calendar_count) AS services,
                     GROUP_CONCAT(DISTINCT source_id) AS source_ids
              FROM local_gtfs_static_bundle
              GROUP BY run_id
              ORDER BY MAX(ingested_at) DESC, run_id DESC
            `,
          )
          .all() as CountRow[]
      ).map((row) => {
        const runId = typeof row.run_id === "string" ? row.run_id : "";
        const countDistinct = (table: string, expression: string) => {
          const countRow = sqlite
            .query(`SELECT COUNT(DISTINCT ${expression}) AS count FROM ${table} WHERE run_id = ?`)
            .get(runId) as CountRow | null;
          return numberValue(countRow?.count);
        };
        return {
          runId,
          bundleCount: numberValue(row.bundles),
          routeCount: countDistinct("local_gtfs_static_route", "route_id"),
          stopCount: countDistinct("local_gtfs_static_stop", "stop_id"),
          tripCount: numberValue(row.trips),
          stopTimeCount: numberValue(row.stop_times),
          serviceCount: numberValue(row.services),
          sourceIds:
            typeof row.source_ids === "string" && row.source_ids.length > 0
              ? row.source_ids.split(",").sort()
              : [],
        };
      })
    : [];

  return { routeCatalogCount, socrataRouteSchedules, gtfsStaticRuns };
}
