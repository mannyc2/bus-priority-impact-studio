import { and, asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeMonthSourceStatus, routeMonthSourceStatusCurrentSignal } from "../schema.js";

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

/** Current-signal status rows are deliberately outside candidate namespaces. */
export async function listCurrentRouteMonthSourceStatuses(
  db: D1ServingDb,
  month: string,
  sourceScope: RouteMonthSourceStatusScope,
): Promise<RouteMonthSourceStatusRow[]> {
  return db
    .select({
      route_id: routeMonthSourceStatusCurrentSignal.routeId,
      month: routeMonthSourceStatusCurrentSignal.month,
      source_scope: routeMonthSourceStatusCurrentSignal.sourceScope,
      source_id: routeMonthSourceStatusCurrentSignal.sourceId,
      status: routeMonthSourceStatusCurrentSignal.status,
      row_count: routeMonthSourceStatusCurrentSignal.rowCount,
      snapshot_id: routeMonthSourceStatusCurrentSignal.snapshotId,
      note: routeMonthSourceStatusCurrentSignal.note,
    })
    .from(routeMonthSourceStatusCurrentSignal)
    .where(
      and(
        eq(routeMonthSourceStatusCurrentSignal.month, month),
        eq(routeMonthSourceStatusCurrentSignal.sourceScope, sourceScope),
      ),
    )
    .orderBy(
      asc(routeMonthSourceStatusCurrentSignal.routeId),
      asc(routeMonthSourceStatusCurrentSignal.sourceId),
    );
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
