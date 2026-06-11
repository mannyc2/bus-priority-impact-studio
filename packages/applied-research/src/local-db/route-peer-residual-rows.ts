import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  type RoutePeerResidualPanelSpec,
  routePeerResidualPanelSpecV1,
} from "../feature-resolvers/route-peer-residuals";
import type { RouteMetricHistorySourceRow } from "../feature-resolvers/runtime-history";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";

export type RoutePeerResidualPanelLocalDbQuery = {
  readonly sqlite: Database;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly routeId?: string;
};

export type RoutePeerResidualPanelLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: RoutePeerResidualPanelSpec;
  readonly generatedAt?: string | null;
  readonly dbPath?: string;
};

const SqlNumberSchema = z.union([
  z.number(),
  z.bigint().transform(Number),
  z.string().pipe(z.coerce.number()),
]);

const SqlNullableNumberSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  SqlNumberSchema.nullable(),
);

export const RouteMetricHistorySourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  speed_observation_count: SqlNumberSchema,
  average_speed_mph: SqlNullableNumberSchema,
});

export function parseRouteMetricHistorySourceRows(
  rows: readonly unknown[],
): readonly RouteMetricHistorySourceRow[] {
  return z.array(RouteMetricHistorySourceRowSchema).parse(rows) as RouteMetricHistorySourceRow[];
}

export function routePeerResidualPanelSql(
  input: { readonly routeFiltered?: boolean } = {},
): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
      SELECT
        route_id,
        month,
        speed_observation_count,
        average_speed_mph
      FROM local_route_month_trend
      WHERE month >= ?
        AND month <= ?
        ${routeFilter}
      ORDER BY route_id, month
    `;
}

export function loadRoutePeerResidualPanelLocalDbRows(
  input: RoutePeerResidualPanelLocalDbQuery,
): readonly RouteMetricHistorySourceRow[] {
  const query = input.sqlite.query(
    routePeerResidualPanelSql({ routeFiltered: input.routeId !== undefined }),
  );
  return parseRouteMetricHistorySourceRows(
    input.routeId === undefined
      ? query.all(input.startMonth, input.endMonth)
      : query.all(input.startMonth, input.endMonth, input.routeId),
  );
}

export function loadRoutePeerResidualPanelV1Resolution(
  input: RoutePeerResidualPanelLocalDbResolutionQuery,
): LocalDbPanelResolution<RouteMetricHistorySourceRow> {
  const rows = loadRoutePeerResidualPanelLocalDbRows({
    sqlite: input.sqlite,
    startMonth: input.spec.startMonth,
    endMonth: input.spec.endMonth,
    ...(input.spec.routeId === undefined ? {} : { routeId: input.spec.routeId }),
  });
  const panelSpec = routePeerResidualPanelSpecV1(input.spec);
  const routeIds = rows.map((row) => row.route_id as string);
  const months = rows.map((row) => row.month as string);
  return {
    rows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "routePeerResidualPanelSql",
          role: "local_db_route_peer_residual_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_month_trend",
          role: "primary_route_peer_residual_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds,
      entityIds: routeIds,
      months,
    }),
  };
}
