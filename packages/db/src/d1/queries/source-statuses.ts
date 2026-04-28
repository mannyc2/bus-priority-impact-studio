import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeMonthSourceStatus } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteMonthSourceStatusRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    source_scope: z.enum(["reliability", "equity_context"]),
    source_id: z.string().min(1),
    status: z.string().min(1),
    row_count: z.number().int().nonnegative().nullable(),
    snapshot_id: z.string().nullable(),
    note: z.string().nullable(),
  })
  .strict();

export type RouteMonthSourceStatusScope = z.output<
  typeof RouteMonthSourceStatusRowSchema
>["source_scope"];

export type RouteMonthSourceStatusRow = z.output<typeof RouteMonthSourceStatusRowSchema>;

export async function listRouteMonthSourceStatuses(
  db: D1ServingDb,
  month: string,
  sourceScope: RouteMonthSourceStatusScope,
): Promise<RouteMonthSourceStatusRow[]> {
  const rows = await db
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

  return rows.map((row) => RouteMonthSourceStatusRowSchema.parse(row));
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
