import type { Database, SQLQueryBindings } from "bun:sqlite";

type RouteRow = { route_id?: unknown };
type RouteNameRow = { route_id?: unknown; route_short_name?: unknown; route_long_name?: unknown };
type ScheduleStatusRow = { route_id?: unknown; status?: unknown; row_count?: unknown };

export type RouteSourceReconciliationRoute = {
  routeId: string;
  scheduleSource: boolean;
  speedSource: boolean;
  ridershipSource: boolean;
  observedHeadwaySource: boolean;
  observedReliabilityUsable: boolean;
  publicVisible: boolean;
  classification:
    | "source_complete"
    | "schedule_source_absent"
    | "speed_source_absent"
    | "ridership_source_absent"
    | "source_absent_or_current_only";
  eligibleProducts: string[];
};

export type RouteAliasCandidate = {
  rawRouteId: string;
  normalizedRouteId: string | null;
  mappedCatalogRouteId: string | null;
  source: string;
};

export type ScheduleSourceYearRoute = {
  sourceYear: number;
  routeId: string;
  routeName: string | null;
  presentInScheduleRows: boolean;
  ingestStatus: string | null;
  ingestRowCount: number;
  classification:
    | "source_present"
    | "replacement_shuttle_source_absent"
    | "future_or_special_route_source_absent"
    | "current_catalog_route_not_in_source_year"
    | "source_absent_or_lineage_deferred";
  disposition: "eligible" | "explicit_waiver";
  reason: string;
};

export type RouteSourceReconciliationArtifact = {
  artifactKind: "route_source_reconciliation";
  schemaVersion: 1;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  releaseMonth: string;
  runId: string;
  universes: Record<string, { routeCount: number; sampleRoutes: string[] }>;
  routes: RouteSourceReconciliationRoute[];
  aliasCandidates: RouteAliasCandidate[];
  sourceYearRouteReconciliation: {
    sourceYears: number[];
    expectedRouteYearCount: number;
    observedRouteYearCount: number;
    explicitWaiverRouteYearCount: number;
    needsLineageMappingRouteYearCount: number;
    routeYears: ScheduleSourceYearRoute[];
  };
  sourceAbsentRouteIds: string[];
  needsLineageMappingRouteIds: string[];
  nextActions: string[];
};

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

function routeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.toUpperCase() : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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

function routeSet(
  sqlite: Database,
  tableName: string,
  sql: string,
  params: SQLQueryBindings[] = [],
): Set<string> {
  if (!tableExists(sqlite, tableName)) return new Set();
  return new Set(
    (sqlite.query(sql).all(...params) as RouteRow[])
      .map((row) => routeId(row.route_id))
      .filter((id): id is string => id !== null)
      .sort(),
  );
}

function routeNames(sqlite: Database): Map<string, string | null> {
  if (!tableExists(sqlite, "local_route_catalog")) return new Map();
  const hasShortName = columnExists(sqlite, "local_route_catalog", "route_short_name");
  const hasLongName = columnExists(sqlite, "local_route_catalog", "route_long_name");
  const rows = sqlite
    .query(
      `
        SELECT
          route_id,
          ${hasShortName ? "route_short_name" : "NULL"} AS route_short_name,
          ${hasLongName ? "route_long_name" : "NULL"} AS route_long_name
        FROM local_route_catalog
        ORDER BY route_id
      `,
    )
    .all() as RouteNameRow[];
  return new Map(
    rows.flatMap((row) => {
      const id = routeId(row.route_id);
      if (id === null) return [];
      const name = text(row.route_long_name) ?? text(row.route_short_name);
      return [[id, name]];
    }),
  );
}

function canonicalSet(
  rawRoutes: ReadonlySet<string>,
  catalogRoutes: ReadonlySet<string>,
): Set<string> {
  return new Set(
    [...rawRoutes]
      .map((id) => canonicalRouteId(id, catalogRoutes))
      .filter((id): id is string => id !== null && catalogRoutes.has(id))
      .sort(),
  );
}

function parseIsoMonth(value: string): { year: number; month: number } {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ISO month: ${value}`);
  }
  return { year, month };
}

function sourceYearsForHistoryWindow(startMonth: string, endMonth: string): number[] {
  const start = parseIsoMonth(startMonth);
  const end = parseIsoMonth(endMonth);
  const years = new Set<number>();
  for (let year = start.year, month = start.month; ; ) {
    years.add(year);
    if (year === end.year && month === end.month) break;
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    if (year > end.year || (year === end.year && month > end.month)) break;
  }
  return [...years].sort((left, right) => left - right);
}

function summarize(routes: ReadonlySet<string>): { routeCount: number; sampleRoutes: string[] } {
  const sorted = [...routes].sort();
  return { routeCount: sorted.length, sampleRoutes: sorted.slice(0, 12) };
}

function scheduleStatusByKey(input: {
  sqlite: Database;
  sourceYears: readonly number[];
}): Map<string, { status: string | null; rowCount: number }> {
  if (!tableExists(input.sqlite, "local_route_schedule_ingest_status")) return new Map();
  const output = new Map<string, { status: string | null; rowCount: number }>();
  for (const sourceYear of input.sourceYears) {
    const rows = input.sqlite
      .query(
        `
          SELECT route_id, status, row_count
          FROM local_route_schedule_ingest_status
          WHERE source_year = ?
          ORDER BY route_id
        `,
      )
      .all(sourceYear) as ScheduleStatusRow[];
    for (const row of rows) {
      const id = routeId(row.route_id);
      if (id === null) continue;
      output.set(`${sourceYear}:${id}`, {
        status: text(row.status),
        rowCount: numberValue(row.row_count),
      });
    }
  }
  return output;
}

function scheduleSourceRowsByKey(input: {
  sqlite: Database;
  sourceYears: readonly number[];
  catalogRoutes: ReadonlySet<string>;
}): Set<string> {
  const output = new Set<string>();
  if (tableExists(input.sqlite, "local_route_schedule_stop")) {
    const query = input.sqlite.query(
      `
        SELECT 1 AS present
        FROM local_route_schedule_stop
        WHERE source_year = ? AND route_id = ?
        LIMIT 1
      `,
    );
    for (const sourceYear of input.sourceYears) {
      for (const routeId of input.catalogRoutes) {
        if (query.get(sourceYear, routeId) !== null) output.add(`${sourceYear}:${routeId}`);
      }
    }
    return output;
  }

  if (!tableExists(input.sqlite, "local_route_schedule_ingest_status")) return output;
  for (const sourceYear of input.sourceYears) {
    const rows = input.sqlite
      .query(
        `
          SELECT route_id
          FROM local_route_schedule_ingest_status
          WHERE source_year = ? AND row_count > 0
          ORDER BY route_id
        `,
      )
      .all(sourceYear) as RouteRow[];
    for (const row of rows) {
      const id = routeId(row.route_id);
      if (id !== null) output.add(`${sourceYear}:${id}`);
    }
  }
  return output;
}

function classifyScheduleRouteYear(input: {
  routeId: string;
  routeName: string | null;
  presentInScheduleRows: boolean;
  ingestStatus: string | null;
  ingestRowCount: number;
}): Pick<ScheduleSourceYearRoute, "classification" | "disposition" | "reason"> {
  if (input.presentInScheduleRows) {
    return {
      classification: "source_present",
      disposition: "eligible",
      reason: "source_year_schedule_rows_present",
    };
  }

  const normalizedName = input.routeName?.toLowerCase() ?? "";
  if (normalizedName.includes("shuttle")) {
    return {
      classification: "replacement_shuttle_source_absent",
      disposition: "explicit_waiver",
      reason:
        "current catalog route is a replacement/shuttle route with no rows in the historical schedule source-year file",
    };
  }
  if (input.routeId.startsWith("T")) {
    return {
      classification: "future_or_special_route_source_absent",
      disposition: "explicit_waiver",
      reason:
        "current catalog route is a future/special route family absent from the historical schedule source-year file",
    };
  }
  if (input.ingestStatus !== null && input.ingestRowCount === 0) {
    return {
      classification: "current_catalog_route_not_in_source_year",
      disposition: "explicit_waiver",
      reason:
        "ingest probed the valid source-year file and found zero schedule rows for this current catalog route",
    };
  }
  return {
    classification: "source_absent_or_lineage_deferred",
    disposition: "explicit_waiver",
    reason:
      "no schedule rows were present in the source-year file; historical alias lineage remains deferred rather than treated as a missing import",
  };
}

function classifyRoute(input: {
  scheduleSource: boolean;
  speedSource: boolean;
  ridershipSource: boolean;
}): RouteSourceReconciliationRoute["classification"] {
  if (!input.scheduleSource && !input.speedSource && !input.ridershipSource) {
    return "source_absent_or_current_only";
  }
  if (!input.scheduleSource) return "schedule_source_absent";
  if (!input.speedSource) return "speed_source_absent";
  if (!input.ridershipSource) return "ridership_source_absent";
  return "source_complete";
}

function aliasCandidates(input: {
  source: string;
  rawRoutes: ReadonlySet<string>;
  catalogRoutes: ReadonlySet<string>;
}): RouteAliasCandidate[] {
  return [...input.rawRoutes]
    .flatMap((rawRouteId) => {
      if (input.catalogRoutes.has(rawRouteId)) return [];
      const normalizedRouteId = normalizeRouteIdText(rawRouteId);
      const mappedCatalogRouteId =
        normalizedRouteId !== null && input.catalogRoutes.has(normalizedRouteId)
          ? normalizedRouteId
          : null;
      return [
        {
          rawRouteId,
          normalizedRouteId,
          mappedCatalogRouteId,
          source: input.source,
        },
      ];
    })
    .sort((left, right) => left.rawRouteId.localeCompare(right.rawRouteId));
}

export function buildRouteSourceReconciliation(input: {
  sqlite: Database;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
}): RouteSourceReconciliationArtifact {
  const releaseYear = Number(input.releaseMonth.slice(0, 4));
  const sourceYears = sourceYearsForHistoryWindow(input.historyStartMonth, input.releaseMonth);
  const catalogRoutes = routeSet(
    input.sqlite,
    "local_route_catalog",
    "SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id",
  );
  const rawScheduleRoutes = routeSet(
    input.sqlite,
    "local_route_schedule_stop",
    "SELECT DISTINCT route_id FROM local_route_schedule_stop WHERE source_year = ? ORDER BY route_id",
    [releaseYear],
  );
  const rawSpeedRoutes = routeSet(
    input.sqlite,
    "local_route_segment_speed",
    "SELECT DISTINCT route_id FROM local_route_segment_speed WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
  );
  const rawRidershipRoutes = routeSet(
    input.sqlite,
    "local_route_hourly_ridership",
    "SELECT DISTINCT route_id FROM local_route_hourly_ridership WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
  );
  const rawObservedHeadwayRoutes = routeSet(
    input.sqlite,
    "local_observed_headway_sample",
    "SELECT DISTINCT route_id FROM local_observed_headway_sample WHERE run_id = ? ORDER BY route_id",
    [input.runId],
  );
  const rawObservedReliabilityRoutes = routeSet(
    input.sqlite,
    "local_route_observed_reliability_summary",
    `
      SELECT DISTINCT route_id
      FROM local_route_observed_reliability_summary
      WHERE month = ? AND run_id = ? AND sample_count >= 30
      ORDER BY route_id
    `,
    [input.releaseMonth, input.runId],
  );
  const rawPublicVisibleRoutes = routeSet(
    input.sqlite,
    "local_route_brief_summary",
    `
      SELECT DISTINCT route_id
      FROM local_route_brief_summary
      WHERE month = ? AND public_visible = 1
      ORDER BY route_id
    `,
    [input.releaseMonth],
  );

  const scheduleRoutes = canonicalSet(rawScheduleRoutes, catalogRoutes);
  const speedRoutes = canonicalSet(rawSpeedRoutes, catalogRoutes);
  const ridershipRoutes = canonicalSet(rawRidershipRoutes, catalogRoutes);
  const observedHeadwayRoutes = canonicalSet(rawObservedHeadwayRoutes, catalogRoutes);
  const observedReliabilityRoutes = canonicalSet(rawObservedReliabilityRoutes, catalogRoutes);
  const publicVisibleRoutes = canonicalSet(rawPublicVisibleRoutes, catalogRoutes);
  const catalogRouteNames = routeNames(input.sqlite);
  const scheduleSourceKeys = scheduleSourceRowsByKey({
    sqlite: input.sqlite,
    sourceYears,
    catalogRoutes,
  });
  const scheduleStatus = scheduleStatusByKey({ sqlite: input.sqlite, sourceYears });
  const routes = [...catalogRoutes].sort().map((routeId) => {
    const scheduleSource = scheduleRoutes.has(routeId);
    const speedSource = speedRoutes.has(routeId);
    const ridershipSource = ridershipRoutes.has(routeId);
    const observedHeadwaySource = observedHeadwayRoutes.has(routeId);
    const observedReliabilityUsable = observedReliabilityRoutes.has(routeId);
    const publicVisible = publicVisibleRoutes.has(routeId);
    const eligibleProducts = [
      ...(scheduleSource ? ["local_route_schedule_timepoints_release"] : []),
      ...(scheduleSource || speedSource ? ["local_route_month_coverage_release"] : []),
      ...(ridershipSource ? ["studio_route_peak_windows"] : []),
      ...(speedSource ? ["studio_route_slowest_windows", "studio_route_comparison_ranks"] : []),
      ...(observedReliabilityUsable ? ["ewt_route_month_score_vectors"] : []),
      ...(publicVisible
        ? ["studio_route_artifact_index", "generated_route_briefs", "map_route_segment_geojsons"]
        : []),
    ];
    return {
      routeId,
      scheduleSource,
      speedSource,
      ridershipSource,
      observedHeadwaySource,
      observedReliabilityUsable,
      publicVisible,
      classification: classifyRoute({ scheduleSource, speedSource, ridershipSource }),
      eligibleProducts,
    };
  });
  const sourceYearRouteRows = sourceYears.flatMap((sourceYear) =>
    [...catalogRoutes].sort().map((routeId) => {
      const key = `${sourceYear}:${routeId}`;
      const status = scheduleStatus.get(key);
      const presentInScheduleRows = scheduleSourceKeys.has(key);
      const classification = classifyScheduleRouteYear({
        routeId,
        routeName: catalogRouteNames.get(routeId) ?? null,
        presentInScheduleRows,
        ingestStatus: status?.status ?? null,
        ingestRowCount: status?.rowCount ?? 0,
      });
      return {
        sourceYear,
        routeId,
        routeName: catalogRouteNames.get(routeId) ?? null,
        presentInScheduleRows,
        ingestStatus: status?.status ?? null,
        ingestRowCount: status?.rowCount ?? 0,
        ...classification,
      } satisfies ScheduleSourceYearRoute;
    }),
  );

  const sourceAbsentRouteIds = routes
    .filter((route) => route.classification === "source_absent_or_current_only")
    .map((route) => route.routeId);
  const aliasRows = [
    ...aliasCandidates({
      source: "local_route_schedule_stop",
      rawRoutes: rawScheduleRoutes,
      catalogRoutes,
    }),
    ...aliasCandidates({
      source: "local_observed_headway_sample",
      rawRoutes: rawObservedHeadwayRoutes,
      catalogRoutes,
    }),
  ].sort(
    (left, right) =>
      left.source.localeCompare(right.source) || left.rawRouteId.localeCompare(right.rawRouteId),
  );

  return {
    artifactKind: "route_source_reconciliation",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    universes: {
      route_catalog: summarize(catalogRoutes),
      schedule_source_routes: summarize(scheduleRoutes),
      speed_source_routes: summarize(speedRoutes),
      ridership_source_routes: summarize(ridershipRoutes),
      observed_headway_routes: summarize(observedHeadwayRoutes),
      observed_reliability_routes: summarize(observedReliabilityRoutes),
      public_visible_routes: summarize(publicVisibleRoutes),
    },
    routes,
    aliasCandidates: aliasRows,
    sourceYearRouteReconciliation: {
      sourceYears,
      expectedRouteYearCount: sourceYearRouteRows.length,
      observedRouteYearCount: sourceYearRouteRows.filter((row) => row.presentInScheduleRows).length,
      explicitWaiverRouteYearCount: sourceYearRouteRows.filter(
        (row) => row.disposition === "explicit_waiver",
      ).length,
      needsLineageMappingRouteYearCount: sourceYearRouteRows.filter(
        (row) => row.classification === "source_absent_or_lineage_deferred",
      ).length,
      routeYears: sourceYearRouteRows.filter((row) => row.disposition === "explicit_waiver"),
    },
    sourceAbsentRouteIds,
    needsLineageMappingRouteIds: aliasRows
      .filter((row) => row.mappedCatalogRouteId === null)
      .map((row) => row.rawRouteId),
    nextActions: [
      "Treat source_absent_or_current_only routes as explicit coverage states, not unfinished fetches.",
      "Review alias candidates without mappedCatalogRouteId before promoting historical route lineage.",
      "Rerun data-product completeness after producer outputs are rebuilt against these universes.",
    ],
  };
}
