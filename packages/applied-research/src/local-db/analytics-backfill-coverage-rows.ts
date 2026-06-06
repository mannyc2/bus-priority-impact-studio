import type { Database } from "bun:sqlite";
import type {
  AnalyticsBackfillObservedMonthRow,
  AnalyticsBackfillSurfaceRows,
  BackfillSurfaceId,
} from "../evaluation";

type BackfillSurfaceQueryConfig = {
  surfaceId: BackfillSurfaceId;
  sql: string;
};

type RawSurfaceRow = {
  month: unknown;
  row_count: unknown;
  route_count: unknown;
  evaluated_count?: unknown;
};

export type AnalyticsBackfillCoverageLocalDbQuery = {
  readonly sqlite: Database;
};

const BACKFILL_SURFACE_QUERIES: readonly BackfillSurfaceQueryConfig[] = [
  {
    surfaceId: "route_segment_speed",
    sql: `
      SELECT month, COUNT(*) AS row_count, COUNT(DISTINCT route_id) AS route_count, NULL AS evaluated_count
      FROM local_route_segment_speed
      GROUP BY month
    `,
  },
  {
    surfaceId: "route_hourly_ridership",
    sql: `
      SELECT month, COUNT(*) AS row_count, COUNT(DISTINCT route_id) AS route_count, NULL AS evaluated_count
      FROM local_route_hourly_ridership
      GROUP BY month
    `,
  },
  {
    surfaceId: "intervention_comparisons",
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count,
        SUM(CASE WHEN comparison_status = 'evaluated' THEN 1 ELSE 0 END) AS evaluated_count
      FROM local_route_intervention_comparison
      GROUP BY month
    `,
  },
];

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

function loadSurfaceRows(
  sqlite: Database,
  config: BackfillSurfaceQueryConfig,
): AnalyticsBackfillObservedMonthRow[] {
  const rows = sqlite.query(config.sql).all() as RawSurfaceRow[];
  const output: AnalyticsBackfillObservedMonthRow[] = [];
  for (const row of rows) {
    const month = textValue(row.month);
    if (month === null) continue;
    output.push({
      month,
      rowCount: numberValue(row.row_count),
      routeCount: numberValue(row.route_count),
      evaluatedCount:
        row.evaluated_count === undefined || row.evaluated_count === null
          ? null
          : numberValue(row.evaluated_count),
    });
  }
  return output;
}

export function loadAnalyticsBackfillCoverageLocalDbRows(
  input: AnalyticsBackfillCoverageLocalDbQuery,
): AnalyticsBackfillSurfaceRows[] {
  return BACKFILL_SURFACE_QUERIES.map((config) => ({
    surfaceId: config.surfaceId,
    rows: loadSurfaceRows(input.sqlite, config),
  }));
}
