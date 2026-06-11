import type { Database } from "bun:sqlite";

export type RouteSpeedHistoryCoverageIndexLocalDb = {
  readonly sqlite: Database;
};

export type RouteSpeedHistoryCoverageIndexRoute = {
  routeId: string;
  routeSlug: string;
  artifactPath: string;
  artifactStatus: string;
  monthCount: number | null;
  segmentCount: number | null;
  cellCount: number | null;
  availableCellCount: number | null;
  missingCellCount: number | null;
};

export type RouteSpeedHistoryCoverageIndexResult = {
  releaseMonth: string;
  expectedRouteCount: number;
  availableRouteCount: number;
  missingRouteCount: number;
  tableRowCount: number;
};

export function normalizeRouteSpeedHistoryRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

export function ensureRouteSpeedHistoryCoverageTable(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_route_speed_history_coverage (
      route_id TEXT NOT NULL,
      month TEXT NOT NULL,
      route_slug TEXT NOT NULL,
      history_start_month TEXT NOT NULL,
      history_end_month TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      artifact_status TEXT NOT NULL,
      month_count INTEGER NOT NULL,
      segment_count INTEGER NOT NULL,
      cell_count INTEGER NOT NULL,
      available_cell_count INTEGER NOT NULL,
      missing_cell_count INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      PRIMARY KEY (route_id, month)
    )
  `);
}

export function materializeRouteSpeedHistoryCoverageIndex(input: {
  local: RouteSpeedHistoryCoverageIndexLocalDb;
  releaseMonth: string;
  historyStartMonth: string;
  historyEndMonth: string;
  expectedRouteCount: number;
  routes: readonly RouteSpeedHistoryCoverageIndexRoute[];
  generatedAt?: string | undefined;
}): RouteSpeedHistoryCoverageIndexResult {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  ensureRouteSpeedHistoryCoverageTable(input.local.sqlite);
  input.local.sqlite.transaction(() => {
    input.local.sqlite
      .query("DELETE FROM local_route_speed_history_coverage WHERE month = ?")
      .run(input.releaseMonth);
    const insert = input.local.sqlite.query(`
      INSERT INTO local_route_speed_history_coverage (
        route_id,
        month,
        route_slug,
        history_start_month,
        history_end_month,
        artifact_path,
        artifact_status,
        month_count,
        segment_count,
        cell_count,
        available_cell_count,
        missing_cell_count,
        generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const route of input.routes) {
      insert.run(
        normalizeRouteSpeedHistoryRouteId(route.routeId),
        input.releaseMonth,
        route.routeSlug,
        input.historyStartMonth,
        input.historyEndMonth,
        route.artifactPath,
        route.artifactStatus,
        route.monthCount ?? 0,
        route.segmentCount ?? 0,
        route.cellCount ?? 0,
        route.availableCellCount ?? 0,
        route.missingCellCount ?? 0,
        generatedAt,
      );
    }
  })();

  const tableRow = input.local.sqlite
    .query("SELECT COUNT(*) AS row_count FROM local_route_speed_history_coverage WHERE month = ?")
    .get(input.releaseMonth) as { row_count?: unknown } | null;
  const tableRowCount =
    typeof tableRow?.row_count === "number" ? tableRow.row_count : Number(tableRow?.row_count ?? 0);

  return {
    releaseMonth: input.releaseMonth,
    expectedRouteCount: input.expectedRouteCount,
    availableRouteCount: tableRowCount,
    missingRouteCount: input.expectedRouteCount - tableRowCount,
    tableRowCount,
  };
}
