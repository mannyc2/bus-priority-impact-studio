import type { Database, SQLQueryBindings } from "bun:sqlite";
import { type IsoMonthString, monthRange } from "../core";
import type {
  AnalyticsBackfillObservedMonthRow,
  AnalyticsBackfillSurfaceRows,
  BackfillSurfaceId,
} from "../evaluation";

type BackfillSurfaceQueryConfig = {
  surfaceId: BackfillSurfaceId;
  tableName: string;
  evaluatedCountExpression: string;
};

type BackfillSurfaceQuery = {
  sql: string;
  params: readonly SQLQueryBindings[];
};

type RawSurfaceRow = {
  month: unknown;
  row_count: unknown;
  route_count: unknown;
  evaluated_count?: unknown;
};

export type AnalyticsBackfillCoverageLocalDbQuery = {
  readonly sqlite: Database;
  readonly months?: readonly string[];
  readonly startMonth?: string;
  readonly endMonth?: string;
};

const BACKFILL_SURFACE_QUERIES: readonly BackfillSurfaceQueryConfig[] = [
  {
    surfaceId: "route_segment_speed",
    tableName: "local_route_segment_speed",
    evaluatedCountExpression: "NULL",
  },
  {
    surfaceId: "route_hourly_ridership",
    tableName: "local_route_hourly_ridership",
    evaluatedCountExpression: "NULL",
  },
  {
    surfaceId: "intervention_comparisons",
    tableName: "local_route_intervention_comparison",
    evaluatedCountExpression: "SUM(CASE WHEN comparison_status = 'evaluated' THEN 1 ELSE 0 END)",
  },
];

function surfaceQuery(
  config: BackfillSurfaceQueryConfig,
  months: readonly string[] | undefined,
): BackfillSurfaceQuery {
  const whereClause =
    months === undefined
      ? ""
      : months.length === 0
        ? "WHERE 1 = 0"
        : `WHERE month IN (${months.map(() => "?").join(", ")})`;
  return {
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count,
        ${config.evaluatedCountExpression} AS evaluated_count
      FROM ${config.tableName}
      ${whereClause}
      GROUP BY month
    `,
    params: months === undefined ? [] : [...months],
  };
}

function isoMonthValue(value: string): IsoMonthString {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO month: ${value}`);
  }
  return value as IsoMonthString;
}

function queryMonths(input: AnalyticsBackfillCoverageLocalDbQuery): readonly string[] | undefined {
  if (input.months !== undefined) return input.months;
  if (input.startMonth === undefined && input.endMonth === undefined) return undefined;
  if (input.startMonth === undefined || input.endMonth === undefined) {
    throw new Error("Both startMonth and endMonth are required when bounding backfill coverage");
  }
  return monthRange(isoMonthValue(input.startMonth), isoMonthValue(input.endMonth));
}

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
  months: readonly string[] | undefined,
): AnalyticsBackfillObservedMonthRow[] {
  const query = surfaceQuery(config, months);
  const rows = sqlite.query<RawSurfaceRow, SQLQueryBindings[]>(query.sql).all(...query.params);
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
  const months = queryMonths(input);
  return BACKFILL_SURFACE_QUERIES.map((config) => ({
    surfaceId: config.surfaceId,
    rows: loadSurfaceRows(input.sqlite, config, months),
  }));
}
