import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema } from "./serving-shared.js";

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
  db: D1DatabaseLike,
  month: string,
  sourceScope: RouteMonthSourceStatusScope,
): Promise<RouteMonthSourceStatusRow[]> {
  const result = await db
    .prepare<RouteMonthSourceStatusRow>(
      [
        "SELECT route_id, month, source_scope, source_id, status, row_count, snapshot_id, note",
        "FROM route_month_source_status",
        "WHERE month = ? AND source_scope = ?",
        "ORDER BY route_id ASC, source_id ASC",
      ].join(" "),
    )
    .bind(month, sourceScope)
    .all();

  return (result.results ?? []).map((row) => RouteMonthSourceStatusRowSchema.parse(row));
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
