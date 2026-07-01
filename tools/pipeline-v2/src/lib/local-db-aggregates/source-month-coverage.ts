import type { Database } from "bun:sqlite";

type SourceMonthCoverageStatus =
  | "available"
  | "partial"
  | "available_not_fetched"
  | "upstream_blocked"
  | "derived_not_built"
  | "source_absent";

export type SourceMonthCoverageCell = {
  month: string;
  status: SourceMonthCoverageStatus;
  rowCount: number;
  routeCount: number | null;
  note: string | null;
};

export type SourceMonthCoverageSource = {
  sourceId: string;
  label: string;
  kind: "source_table" | "source_year_table" | "derived_table" | "upstream_blocked_source";
  grain: string;
  months: SourceMonthCoverageCell[];
  summary: {
    availableMonthCount: number;
    partialMonthCount: number;
    availableNotFetchedMonthCount: number;
    upstreamBlockedMonthCount: number;
    derivedNotBuiltMonthCount: number;
    sourceAbsentMonthCount: number;
  };
};

export type SourceMonthCoverageMatrix = {
  artifactKind: "source_month_coverage_matrix";
  schemaVersion: 1;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  historyWindow: {
    startMonth: string;
    endMonth: string;
    monthCount: number;
  };
  summary: {
    sourceCount: number;
    cellCount: number;
    statusCounts: Record<SourceMonthCoverageStatus, number>;
  };
  sources: SourceMonthCoverageSource[];
};

type MonthStats = {
  rowCount: number;
  routeCount: number | null;
  expectedRouteCount?: number | null;
  zeroRowRouteCount?: number | undefined;
  sourceAbsentRouteCount?: number | undefined;
};

function textValue(value: unknown): string | null {
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

function parseIsoMonthParts(value: string): { year: number; month: number } {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ISO month: ${value}`);
  }
  return { year, month };
}

function requestedMonths(startMonth: string, endMonth: string): string[] {
  const start = parseIsoMonthParts(startMonth);
  const end = parseIsoMonthParts(endMonth);
  const months: string[] = [];
  for (let year = start.year, month = start.month; ; ) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year === end.year && month === end.month) return months;
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    if (year > end.year || (year === end.year && month > end.month)) return months;
  }
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function monthStatsFromTable(input: {
  sqlite: Database;
  tableName: string;
  monthColumn: string;
  routeColumn?: string | undefined;
}): Map<string, MonthStats> {
  if (!tableExists(input.sqlite, input.tableName)) return new Map();
  const routeExpr =
    input.routeColumn === undefined
      ? "NULL AS route_count"
      : `COUNT(DISTINCT ${input.routeColumn}) AS route_count`;
  const rows = input.sqlite
    .query(
      `
        SELECT substr(${input.monthColumn}, 1, 7) AS month,
          COUNT(*) AS row_count,
          ${routeExpr}
        FROM ${input.tableName}
        GROUP BY substr(${input.monthColumn}, 1, 7)
        ORDER BY substr(${input.monthColumn}, 1, 7)
      `,
    )
    .all() as Array<{ month?: unknown; row_count?: unknown; route_count?: unknown }>;
  return new Map(
    rows.flatMap((row) => {
      const month = textValue(row.month);
      if (month === null) return [];
      return [
        [
          month,
          {
            rowCount: numberValue(row.row_count),
            routeCount: row.route_count === null ? null : numberValue(row.route_count),
          },
        ] as const,
      ];
    }),
  );
}

function sourceYearStatsFromScheduleIngestStatus(sqlite: Database): Map<number, MonthStats> {
  if (!tableExists(sqlite, "local_route_schedule_ingest_status")) return new Map();
  const rows = sqlite
    .query(
      `
        SELECT source_year,
          SUM(CASE WHEN status = 'complete' THEN row_count ELSE 0 END) AS row_count,
          COUNT(DISTINCT CASE WHEN status = 'complete' AND row_count > 0 THEN route_id END) AS route_count,
          COUNT(DISTINCT route_id) AS expected_route_count,
          SUM(CASE WHEN row_count = 0 THEN 1 ELSE 0 END) AS zero_row_route_count,
          SUM(CASE WHEN status = 'source_absent' THEN 1 ELSE 0 END) AS source_absent_route_count
        FROM local_route_schedule_ingest_status
        GROUP BY source_year
        ORDER BY source_year
      `,
    )
    .all() as Array<{ source_year?: unknown; row_count?: unknown; route_count?: unknown }>;
  return new Map(
    rows.flatMap((row) => {
      const year = numberValue(row.source_year);
      if (!Number.isInteger(year) || year <= 0) return [];
      return [
        [
          year,
          {
            rowCount: numberValue(row.row_count),
            routeCount: numberValue(row.route_count),
            expectedRouteCount: numberValue(
              (row as { expected_route_count?: unknown }).expected_route_count,
            ),
            zeroRowRouteCount: numberValue(
              (row as { zero_row_route_count?: unknown }).zero_row_route_count,
            ),
            sourceAbsentRouteCount: numberValue(
              (row as { source_absent_route_count?: unknown }).source_absent_route_count,
            ),
          },
        ] as const,
      ];
    }),
  );
}

function sourceMonthSummary(
  months: readonly SourceMonthCoverageCell[],
): SourceMonthCoverageSource["summary"] {
  return {
    availableMonthCount: months.filter((month) => month.status === "available").length,
    partialMonthCount: months.filter((month) => month.status === "partial").length,
    availableNotFetchedMonthCount: months.filter(
      (month) => month.status === "available_not_fetched",
    ).length,
    upstreamBlockedMonthCount: months.filter((month) => month.status === "upstream_blocked").length,
    derivedNotBuiltMonthCount: months.filter((month) => month.status === "derived_not_built")
      .length,
    sourceAbsentMonthCount: months.filter((month) => month.status === "source_absent").length,
  };
}

function sourceFromMonthStats(input: {
  sourceId: string;
  label: string;
  kind: SourceMonthCoverageSource["kind"];
  grain: string;
  months: readonly string[];
  stats: ReadonlyMap<string, MonthStats>;
  missingStatus: SourceMonthCoverageStatus;
  missingNote: string;
}): SourceMonthCoverageSource {
  const cells = input.months.map((month): SourceMonthCoverageCell => {
    const stats = input.stats.get(month);
    if (stats !== undefined && stats.rowCount > 0) {
      return {
        month,
        status: "available",
        rowCount: stats.rowCount,
        routeCount: stats.routeCount,
        note: null,
      };
    }
    return {
      month,
      status: input.missingStatus,
      rowCount: 0,
      routeCount: null,
      note: input.missingNote,
    };
  });
  return {
    sourceId: input.sourceId,
    label: input.label,
    kind: input.kind,
    grain: input.grain,
    months: cells,
    summary: sourceMonthSummary(cells),
  };
}

function scheduleSourceYearSource(input: {
  months: readonly string[];
  stats: ReadonlyMap<number, MonthStats>;
  tablePresent: boolean;
}): SourceMonthCoverageSource {
  const cells = input.months.map((month): SourceMonthCoverageCell => {
    const year = Number(month.slice(0, 4));
    const stats = input.stats.get(year);
    if (stats !== undefined && stats.rowCount > 0) {
      const expectedRouteCount = stats.expectedRouteCount ?? stats.routeCount;
      const partial =
        expectedRouteCount !== null &&
        stats.routeCount !== null &&
        stats.routeCount < expectedRouteCount;
      return {
        month,
        status: partial ? "partial" : "available",
        rowCount: stats.rowCount,
        routeCount: stats.routeCount,
        note: partial
          ? `Source-year schedule stop rows for ${stats.routeCount ?? 0}/${expectedRouteCount ?? 0} status routes in ${year}; zero-row routes: ${stats.zeroRowRouteCount ?? 0}; source-absent routes: ${stats.sourceAbsentRouteCount ?? 0}; not month-specific historical GTFS static.`
          : `Source-year schedule stop rows for ${year}; not month-specific historical GTFS static.`,
      };
    }
    return {
      month,
      status: input.tablePresent ? "available_not_fetched" : "source_absent",
      rowCount: 0,
      routeCount: null,
      note: input.tablePresent
        ? `No schedule stop rows fetched for source year ${year}.`
        : "local_route_schedule_stop table is absent.",
    };
  });
  return {
    sourceId: "local_route_schedule_stop_source_year",
    label: "Route schedule stop source-year support",
    kind: "source_year_table",
    grain: "source year x route x schedule stop",
    months: cells,
    summary: sourceMonthSummary(cells),
  };
}

function historicalGtfsBlockedSource(months: readonly string[]): SourceMonthCoverageSource {
  const cells = months.map(
    (month): SourceMonthCoverageCell => ({
      month,
      status: "upstream_blocked",
      rowCount: 0,
      routeCount: null,
      note: "No audited month-by-month historical GTFS static bundle source has been fetched or proven.",
    }),
  );
  return {
    sourceId: "historical_gtfs_static_bundle_snapshots",
    label: "Historical GTFS static bundle snapshots",
    kind: "upstream_blocked_source",
    grain: "GTFS static bundle x historical service month",
    months: cells,
    summary: sourceMonthSummary(cells),
  };
}

export function buildSourceMonthCoverageMatrix(input: {
  sqlite: Database;
  historyStartMonth: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
}): SourceMonthCoverageMatrix {
  const months = requestedMonths(input.historyStartMonth, input.releaseMonth);
  const sources: SourceMonthCoverageSource[] = [
    sourceFromMonthStats({
      sourceId: "local_route_segment_speed",
      label: "Route segment speed rows",
      kind: "source_table",
      grain: "route x month x segment/hour speed observation",
      months,
      stats: monthStatsFromTable({
        sqlite: input.sqlite,
        tableName: "local_route_segment_speed",
        monthColumn: "month",
        routeColumn: "route_id",
      }),
      missingStatus: tableExists(input.sqlite, "local_route_segment_speed")
        ? "available_not_fetched"
        : "source_absent",
      missingNote: "No local route segment speed rows for this month.",
    }),
    sourceFromMonthStats({
      sourceId: "local_route_hourly_ridership",
      label: "Route hourly ridership rows",
      kind: "source_table",
      grain: "route x month x day/hour ridership",
      months,
      stats: monthStatsFromTable({
        sqlite: input.sqlite,
        tableName: "local_route_hourly_ridership",
        monthColumn: "month",
        routeColumn: "route_id",
      }),
      missingStatus: tableExists(input.sqlite, "local_route_hourly_ridership")
        ? "available_not_fetched"
        : "source_absent",
      missingNote: "No local route hourly ridership rows for this month.",
    }),
    scheduleSourceYearSource({
      months,
      stats: sourceYearStatsFromScheduleIngestStatus(input.sqlite),
      tablePresent: tableExists(input.sqlite, "local_route_schedule_ingest_status"),
    }),
    sourceFromMonthStats({
      sourceId: "local_route_month_trend",
      label: "Route monthly trend rows",
      kind: "derived_table",
      grain: "route x month speed/ridership trend",
      months,
      stats: monthStatsFromTable({
        sqlite: input.sqlite,
        tableName: "local_route_month_trend",
        monthColumn: "month",
        routeColumn: "route_id",
      }),
      missingStatus: tableExists(input.sqlite, "local_route_month_trend")
        ? "derived_not_built"
        : "source_absent",
      missingNote: "Route monthly trend rows are not built for this month.",
    }),
    sourceFromMonthStats({
      sourceId: "local_route_month_source_status",
      label: "Route-month source status rows",
      kind: "derived_table",
      grain: "route x month x source status",
      months,
      stats: monthStatsFromTable({
        sqlite: input.sqlite,
        tableName: "local_route_month_source_status",
        monthColumn: "month",
        routeColumn: "route_id",
      }),
      missingStatus: tableExists(input.sqlite, "local_route_month_source_status")
        ? "derived_not_built"
        : "source_absent",
      missingNote: "Route-month source status rows are not built for this month.",
    }),
    historicalGtfsBlockedSource(months),
  ];

  const statusCounts = {
    available: 0,
    partial: 0,
    available_not_fetched: 0,
    upstream_blocked: 0,
    derived_not_built: 0,
    source_absent: 0,
  } satisfies Record<SourceMonthCoverageStatus, number>;
  for (const cell of sources.flatMap((source) => source.months)) {
    statusCounts[cell.status] += 1;
  }

  return {
    artifactKind: "source_month_coverage_matrix",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
      monthCount: months.length,
    },
    summary: {
      sourceCount: sources.length,
      cellCount: sources.reduce((sum, source) => sum + source.months.length, 0),
      statusCounts,
    },
    sources,
  };
}
