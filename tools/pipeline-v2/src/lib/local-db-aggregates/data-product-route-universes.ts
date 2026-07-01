import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { DataProductRouteUniverse } from "@bp/analytics/data-products";

type RouteRow = {
  route_id?: unknown;
  run_id?: unknown;
};

export type DataProductRouteUniverseSets = Record<DataProductRouteUniverse, Set<string>>;

export type BuildDataProductRouteUniversesInput = {
  sqlite: Database;
  releaseMonth: string;
  runId: string;
  gtfsRunId: string | null;
};

export type DataProductRouteUniverseSummary = Record<
  DataProductRouteUniverse,
  { routeCount: number; sampleRoutes: string[] }
>;

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeRouteIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, "$1$2");
}

function canonicalRouteId(value: unknown, routeUniverse: ReadonlySet<string>): string | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : null;
  if (raw === null || raw.length === 0) return null;
  if (routeUniverse.has(raw)) return raw;

  const normalized = normalizeRouteIdText(raw);
  if (normalized === null) return null;
  return routeUniverse.has(normalized) ? normalized : normalized;
}

function routeIdValue(value: unknown): string | null {
  const text = textValue(value);
  return text === null ? null : text.toUpperCase();
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function columnExists(sqlite: Database, tableName: string, columnName: string): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const rows = sqlite.query(`PRAGMA table_info(${tableName})`).all() as { name?: unknown }[];
  return rows.some((row) => row.name === columnName);
}

function routeSetFromRows(
  rows: readonly RouteRow[],
  routeUniverse: ReadonlySet<string> | null = null,
): Set<string> {
  return new Set(
    rows
      .map((row) =>
        routeUniverse === null
          ? routeIdValue(row.route_id)
          : canonicalRouteId(row.route_id, routeUniverse),
      )
      .filter(
        (routeId): routeId is string =>
          routeId !== null && (routeUniverse === null || routeUniverse.has(routeId)),
      )
      .sort(),
  );
}

function routeSetFromQuery(
  sqlite: Database,
  tableName: string,
  sql: string,
  params: SQLQueryBindings[] = [],
  routeUniverse: ReadonlySet<string> | null = null,
): Set<string> {
  if (!tableExists(sqlite, tableName)) return new Set();
  return routeSetFromRows(sqlite.query(sql).all(...params) as RouteRow[], routeUniverse);
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left].filter((routeId) => right.has(routeId)).sort());
}

function union(...sets: readonly ReadonlySet<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]).sort());
}

function sortedRoutes(routes: ReadonlySet<string>): string[] {
  return [...routes].sort();
}

export function latestDataProductGtfsRunId(sqlite: Database): string | null {
  if (!tableExists(sqlite, "local_gtfs_static_bundle")) return null;
  const row = sqlite
    .query(
      `
        SELECT run_id
        FROM local_gtfs_static_bundle
        GROUP BY run_id
        ORDER BY MAX(ingested_at) DESC, run_id DESC
        LIMIT 1
      `,
    )
    .get() as RouteRow | null;
  return textValue(row?.run_id);
}

export function buildDataProductRouteUniverses(
  input: BuildDataProductRouteUniversesInput,
): DataProductRouteUniverseSets {
  const routeCatalog = routeSetFromQuery(
    input.sqlite,
    "local_route_catalog",
    "SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id",
  );
  const releaseYear = Number(input.releaseMonth.slice(0, 4));
  const scheduleSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_schedule_stop",
    "SELECT DISTINCT route_id FROM local_route_schedule_stop WHERE source_year = ? ORDER BY route_id",
    [releaseYear],
    routeCatalog,
  );
  const speedSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_segment_speed",
    "SELECT DISTINCT route_id FROM local_route_segment_speed WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
    routeCatalog,
  );
  const historicalSpeedSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_segment_speed",
    "SELECT DISTINCT route_id FROM local_route_segment_speed ORDER BY route_id",
  );
  const ridershipSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_hourly_ridership",
    "SELECT DISTINCT route_id FROM local_route_hourly_ridership WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
    routeCatalog,
  );
  const observedHeadwayRoutes = routeSetFromQuery(
    input.sqlite,
    "local_observed_headway_sample",
    "SELECT DISTINCT route_id FROM local_observed_headway_sample WHERE run_id = ? ORDER BY route_id",
    [input.runId],
    routeCatalog,
  );
  const observedReliabilityRouteSql = columnExists(
    input.sqlite,
    "local_route_observed_reliability_summary",
    "sample_count",
  )
    ? `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ? AND sample_count >= 30
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ?
        ORDER BY route_id
      `;
  const observedReliabilityRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_observed_reliability_summary",
    observedReliabilityRouteSql,
    [input.releaseMonth, input.runId],
    routeCatalog,
  );
  const publicVisibleRouteSql = columnExists(
    input.sqlite,
    "local_route_brief_summary",
    "public_visible",
  )
    ? `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ? AND public_visible = 1
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ?
        ORDER BY route_id
      `;
  const publicVisibleRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_brief_summary",
    publicVisibleRouteSql,
    [input.releaseMonth],
    routeCatalog,
  );
  const gtfsRoutes =
    input.gtfsRunId === null
      ? new Set<string>()
      : routeSetFromQuery(
          input.sqlite,
          "local_gtfs_static_route",
          "SELECT DISTINCT route_id FROM local_gtfs_static_route WHERE run_id = ? ORDER BY route_id",
          [input.gtfsRunId],
          routeCatalog,
        );

  return {
    route_catalog: routeCatalog,
    coverage_source_routes: union(scheduleSourceRoutes, speedSourceRoutes),
    schedule_source_routes: scheduleSourceRoutes,
    speed_source_routes: speedSourceRoutes,
    historical_speed_source_routes: historicalSpeedSourceRoutes,
    ridership_source_routes: ridershipSourceRoutes,
    speed_ridership_source_routes: intersection(speedSourceRoutes, ridershipSourceRoutes),
    observed_headway_routes: observedHeadwayRoutes,
    observed_reliability_routes: observedReliabilityRoutes,
    ewt_eligible_routes: intersection(
      intersection(routeCatalog, observedHeadwayRoutes),
      gtfsRoutes,
    ),
    public_visible_routes:
      publicVisibleRoutes.size > 0
        ? publicVisibleRoutes
        : intersection(speedSourceRoutes, ridershipSourceRoutes),
  };
}

export function dataProductRouteUniverseSummary(
  routeUniverses: DataProductRouteUniverseSets,
): DataProductRouteUniverseSummary {
  return Object.fromEntries(
    Object.entries(routeUniverses).map(([key, routes]) => [
      key,
      {
        routeCount: routes.size,
        sampleRoutes: sortedRoutes(routes).slice(0, 12),
      },
    ]),
  ) as DataProductRouteUniverseSummary;
}
