import type { Database } from "bun:sqlite";
import { performance } from "node:perf_hooks";
import { decouplingReliabilitySql, decouplingRouteTrendSql } from "./decoupling-quadrants-rows";
import { INTERVENTION_PANEL_SQL } from "./intervention-panel-rows";
import { pulseFingerprintSql } from "./pulse-fingerprint-rows";
import { reliabilityExposurePanelRidershipSql } from "./reliability-exposure-panel-rows";
import { routePeerResidualPanelSql } from "./route-peer-residual-rows";
import { SEGMENT_DAYPART_HISTORY_SQL } from "./segment-daypart-history-rows";
import { segmentMonthPanelV1Sql } from "./segment-month-panel-rows";

export type LocalDbHotQueryId =
  | "route_month_history"
  | "segment_month_panel"
  | "segment_daypart_panel"
  | "route_peer_residual_panel"
  | "treatment_event_panel"
  | "reliability_exposure"
  | "pulse_fingerprint"
  | "decoupling_route_trend"
  | "decoupling_reliability"
  | "source_gap_model";

export type LocalDbHotQueryBaselineStatus =
  | "measured"
  | "missing_table"
  | "artifact_backed"
  | "error";

export type LocalDbHotQueryBaselineRow = {
  readonly queryId: LocalDbHotQueryId;
  readonly panelId: string;
  readonly status: LocalDbHotQueryBaselineStatus;
  readonly sourceTables: readonly string[];
  readonly params: readonly (string | number | null)[];
  readonly rowCount: number | null;
  readonly elapsedMs: number | null;
  readonly queryPlan: readonly string[];
  readonly usesIndex: boolean | null;
  readonly fullScanTables: readonly string[];
  readonly warnings: readonly string[];
  readonly error: string | null;
};

export type LocalDbHotQueryBaselinesArtifact = {
  readonly artifactKind: "local_db_hot_query_baselines";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dbPath: string | null;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly summary: {
    readonly queryCount: number;
    readonly measuredQueryCount: number;
    readonly missingTableQueryCount: number;
    readonly artifactBackedQueryCount: number;
    readonly errorQueryCount: number;
    readonly fullScanWarningCount: number;
  };
  readonly queries: readonly LocalDbHotQueryBaselineRow[];
};

type QueryPlanRow = {
  detail?: unknown;
};

type HotQueryDefinition = {
  readonly queryId: LocalDbHotQueryId;
  readonly panelId: string;
  readonly sourceTables: readonly string[];
  readonly sql: string | null;
  readonly params: readonly (string | number | null)[];
  readonly warnings?: readonly string[];
};

function routeMonthHistorySql(): string {
  return `
      SELECT
        route_id,
        month,
        speed_observation_count,
        speed_bus_trip_count,
        average_speed_mph,
        ridership,
        transfers,
        has_speed_trend,
        has_ridership_trend
      FROM local_route_month_trend
      WHERE month >= ?
        AND month <= ?
      ORDER BY route_id, month
    `;
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
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

function queryPlan(sqlite: Database, sql: string, params: readonly (string | number | null)[]) {
  return (sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as QueryPlanRow[])
    .map((row) => (typeof row.detail === "string" ? row.detail : ""))
    .filter((detail) => detail.length > 0);
}

function rowCountFor(sqlite: Database, sql: string, params: readonly (string | number | null)[]) {
  const row = sqlite
    .query(`SELECT COUNT(*) AS row_count FROM (${sql}) AS hot_query_baseline`)
    .get(...params) as { row_count?: unknown } | null;
  return numberValue(row?.row_count);
}

function planUsesIndex(plan: readonly string[]): boolean {
  return plan.some((detail) =>
    /\bUSING (?:COVERING )?(?:INDEX|AUTOMATIC INDEX|PRIMARY KEY|INTEGER PRIMARY KEY)\b/i.test(
      detail,
    ),
  );
}

function fullScanTablesFor(plan: readonly string[], sourceTables: readonly string[]): string[] {
  return sourceTables.filter((table) =>
    plan.some(
      (detail) =>
        new RegExp(`\\bSCAN ${table}\\b`, "i").test(detail) &&
        !/\bUSING (?:COVERING )?(?:INDEX|AUTOMATIC INDEX|PRIMARY KEY|INTEGER PRIMARY KEY)\b/i.test(
          detail,
        ),
    ),
  );
}

function hotQueryDefinitions(input: {
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly observedRunId: string | null;
}): HotQueryDefinition[] {
  const windowParams = [input.historyStartMonth, input.releaseMonth] as const;
  return [
    {
      queryId: "route_month_history",
      panelId: "route_month_history_v1",
      sourceTables: ["local_route_month_trend"],
      sql: routeMonthHistorySql(),
      params: windowParams,
    },
    {
      queryId: "segment_month_panel",
      panelId: "segment_month_panel_v1",
      sourceTables: ["local_route_segment_speed"],
      sql: segmentMonthPanelV1Sql(),
      params: windowParams,
    },
    {
      queryId: "segment_daypart_panel",
      panelId: "segment_daypart_history_v1",
      sourceTables: ["local_route_segment_speed"],
      sql: SEGMENT_DAYPART_HISTORY_SQL,
      params: windowParams,
    },
    {
      queryId: "route_peer_residual_panel",
      panelId: "route_peer_residual_panel_v1",
      sourceTables: ["local_route_month_trend"],
      sql: routePeerResidualPanelSql(),
      params: windowParams,
    },
    {
      queryId: "treatment_event_panel",
      panelId: "treatment_event_panel_v1",
      sourceTables: ["local_route_intervention_comparison"],
      sql: INTERVENTION_PANEL_SQL,
      params: windowParams,
    },
    {
      queryId: "reliability_exposure",
      panelId: "reliability_exposure_panel_v1",
      sourceTables: ["local_route_hourly_ridership"],
      sql: reliabilityExposurePanelRidershipSql(),
      params: [input.releaseMonth],
    },
    {
      queryId: "pulse_fingerprint",
      panelId: "route_hour_of_week_pulse_panel_v1",
      sourceTables: ["local_route_segment_speed"],
      sql: pulseFingerprintSql(),
      params: windowParams,
    },
    {
      queryId: "decoupling_route_trend",
      panelId: "decoupling_route_trend_panel_v1",
      sourceTables: ["local_route_month_trend"],
      sql: decouplingRouteTrendSql(),
      params: windowParams,
    },
    {
      queryId: "decoupling_reliability",
      panelId: "decoupling_reliability_panel_v1",
      sourceTables: ["local_route_observed_reliability_summary"],
      sql: decouplingReliabilitySql(),
      params: [input.historyStartMonth, input.releaseMonth, input.observedRunId],
    },
    {
      queryId: "source_gap_model",
      panelId: "source_gap_panel_v1",
      sourceTables: [],
      sql: null,
      params: [input.releaseMonth],
      warnings: [
        "Source-gap model rows are artifact-backed by route-treatment-summary, so there is no direct SQLite query plan for this panel.",
      ],
    },
  ];
}

function measureHotQuery(
  sqlite: Database,
  definition: HotQueryDefinition,
): LocalDbHotQueryBaselineRow {
  if (definition.sql === null) {
    return {
      queryId: definition.queryId,
      panelId: definition.panelId,
      status: "artifact_backed",
      sourceTables: definition.sourceTables,
      params: definition.params,
      rowCount: null,
      elapsedMs: null,
      queryPlan: [],
      usesIndex: null,
      fullScanTables: [],
      warnings: definition.warnings ?? [],
      error: null,
    };
  }

  const missingTables = definition.sourceTables.filter((table) => !tableExists(sqlite, table));
  if (missingTables.length > 0) {
    return {
      queryId: definition.queryId,
      panelId: definition.panelId,
      status: "missing_table",
      sourceTables: definition.sourceTables,
      params: definition.params,
      rowCount: null,
      elapsedMs: null,
      queryPlan: [],
      usesIndex: null,
      fullScanTables: [],
      warnings: [`Missing local table(s): ${missingTables.join(", ")}.`],
      error: null,
    };
  }

  try {
    const plan = queryPlan(sqlite, definition.sql, definition.params);
    const startedAt = performance.now();
    const rowCount = rowCountFor(sqlite, definition.sql, definition.params);
    const elapsedMs = performance.now() - startedAt;
    const fullScanTables = fullScanTablesFor(plan, definition.sourceTables);
    const usesIndex = planUsesIndex(plan);
    return {
      queryId: definition.queryId,
      panelId: definition.panelId,
      status: "measured",
      sourceTables: definition.sourceTables,
      params: definition.params,
      rowCount,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      queryPlan: plan,
      usesIndex,
      fullScanTables,
      warnings: [
        ...(definition.warnings ?? []),
        ...(usesIndex ? [] : ["Query plan does not report index usage."]),
        ...(fullScanTables.length === 0
          ? []
          : [`Query plan reports full table scan(s): ${fullScanTables.join(", ")}.`]),
      ],
      error: null,
    };
  } catch (err) {
    return {
      queryId: definition.queryId,
      panelId: definition.panelId,
      status: "error",
      sourceTables: definition.sourceTables,
      params: definition.params,
      rowCount: null,
      elapsedMs: null,
      queryPlan: [],
      usesIndex: null,
      fullScanTables: [],
      warnings: definition.warnings ?? [],
      error: (err as Error).message,
    };
  }
}

export function buildLocalDbHotQueryBaselines(input: {
  readonly sqlite: Database;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly observedRunId?: string | null;
  readonly generatedAt?: string | null;
  readonly dbPath?: string | null;
}): LocalDbHotQueryBaselinesArtifact {
  const queries = hotQueryDefinitions({
    historyStartMonth: input.historyStartMonth,
    releaseMonth: input.releaseMonth,
    observedRunId: input.observedRunId ?? null,
  }).map((definition) => measureHotQuery(input.sqlite, definition));

  return {
    artifactKind: "local_db_hot_query_baselines",
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: input.dbPath ?? null,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
    },
    summary: {
      queryCount: queries.length,
      measuredQueryCount: queries.filter((query) => query.status === "measured").length,
      missingTableQueryCount: queries.filter((query) => query.status === "missing_table").length,
      artifactBackedQueryCount: queries.filter((query) => query.status === "artifact_backed")
        .length,
      errorQueryCount: queries.filter((query) => query.status === "error").length,
      fullScanWarningCount: queries.filter((query) => query.fullScanTables.length > 0).length,
    },
    queries,
  };
}
