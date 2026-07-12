import { and, asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeMonthSourceStatus } from "../schema.js";

export type RouteMonthSourceStatusScope = "reliability" | "equity_context";

async function selectRouteMonthSourceStatusRows(
  db: D1ServingDb,
  month: string,
  sourceScope: RouteMonthSourceStatusScope,
) {
  return db
    .select({
      route_id: routeMonthSourceStatus.routeId,
      month: routeMonthSourceStatus.month,
      source_scope: routeMonthSourceStatus.sourceScope,
      source_id: routeMonthSourceStatus.sourceId,
      status: routeMonthSourceStatus.status,
      row_count: routeMonthSourceStatus.rowCount,
      snapshot_id: routeMonthSourceStatus.snapshotId,
      note: routeMonthSourceStatus.note,
    })
    .from(routeMonthSourceStatus)
    .where(
      and(
        eq(routeMonthSourceStatus.month, month),
        eq(routeMonthSourceStatus.sourceScope, sourceScope),
      ),
    )
    .orderBy(asc(routeMonthSourceStatus.routeId), asc(routeMonthSourceStatus.sourceId));
}

export type RouteMonthSourceStatusRow = Awaited<
  ReturnType<typeof selectRouteMonthSourceStatusRows>
>[number];

export async function listRouteMonthSourceStatuses(
  db: D1ServingDb,
  month: string,
  sourceScope: RouteMonthSourceStatusScope,
): Promise<RouteMonthSourceStatusRow[]> {
  return selectRouteMonthSourceStatusRows(db, month, sourceScope);
}

export function groupSourceStatuses(
  rows: readonly RouteMonthSourceStatusRow[],
): Map<string, Record<string, string>> {
  const output = new Map<string, Record<string, string>>();

  for (const row of rows) {
    const key = `${row.route_id}::${row.month}`;
    const group = output.get(key) ?? {};
    group[row.source_id] = row.status;
    output.set(key, group);
  }

  return output;
}
