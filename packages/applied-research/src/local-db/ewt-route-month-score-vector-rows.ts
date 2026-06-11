import type { Database } from "bun:sqlite";
import {
  type EwtRouteMonthReliabilityRow,
  parseEwtRouteMonthRows,
  type RawEwtRouteMonthReliabilityRow,
  routeMonthKey,
} from "../score-vectors";

type CustomerJourneyAbstRow = {
  route_id: unknown;
  month: unknown;
  mta_abst_minutes: unknown;
};

export type EwtRouteMonthScoreVectorLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hasTable(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { found?: unknown } | null;
  return row !== null;
}

export function loadCustomerJourneyAbstByRouteMonth(
  input: EwtRouteMonthScoreVectorLocalDbQuery,
): Map<string, number> {
  if (!hasTable(input.sqlite, "local_bus_customer_journey_metric")) {
    return new Map();
  }
  const rows = input.sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          SUM(customers * additional_bus_stop_time_minutes) / SUM(customers)
            AS mta_abst_minutes
        FROM local_bus_customer_journey_metric
        WHERE month >= ?
          AND month <= ?
          AND customers > 0
          AND additional_bus_stop_time_minutes IS NOT NULL
        GROUP BY month, route_id
        ORDER BY month, route_id
      `,
    )
    .all(input.startMonth, input.endMonth) as CustomerJourneyAbstRow[];
  const output = new Map<string, number>();
  for (const row of rows) {
    const routeId = textValue(row.route_id);
    const month = textValue(row.month);
    const value = numberValue(row.mta_abst_minutes);
    if (routeId !== null && month !== null && value !== null) {
      output.set(routeMonthKey(routeId, month), value);
    }
  }
  return output;
}

export function loadEwtRouteMonthScoreVectorLocalDbRows(
  input: EwtRouteMonthScoreVectorLocalDbQuery,
): EwtRouteMonthReliabilityRow[] {
  const mtaAbstByRouteMonth = loadCustomerJourneyAbstByRouteMonth(input);
  const rows = input.sqlite
    .query(
      `
        SELECT
          route_id,
          month,
          run_id,
          reliability_status,
          sample_count,
          stop_count,
          direction_count,
          average_observed_headway_minutes,
          expected_wait_minutes,
          scheduled_expected_wait_minutes,
          excess_wait_minutes,
          wait_reliability_ratio
        FROM local_route_observed_reliability_summary
        WHERE month >= ? AND month <= ?
        ORDER BY month, route_id, run_id
      `,
    )
    .all(input.startMonth, input.endMonth) as RawEwtRouteMonthReliabilityRow[];
  return parseEwtRouteMonthRows(rows).map((row) => ({
    ...row,
    mtaAbstMinutes: mtaAbstByRouteMonth.get(routeMonthKey(row.routeId, row.month)) ?? null,
  }));
}
