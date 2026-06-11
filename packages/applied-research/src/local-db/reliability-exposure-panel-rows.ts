import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { RouteHourlyRidershipSourceRow } from "../feature-resolvers";
import {
  type ReliabilityExposurePanelSpec,
  reliabilityExposurePanelSpecV1,
} from "../feature-resolvers/reliability-exposure-panel";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";

export type ReliabilityExposurePanelLocalDbQuery = {
  readonly sqlite: Database;
  readonly month: string;
  readonly routeId?: string;
};

export type ReliabilityExposureRidershipLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: ReliabilityExposurePanelSpec;
  readonly generatedAt?: string | null;
  readonly dbPath?: string;
};

const SqlNumberSchema = z.union([
  z.number(),
  z.bigint().transform(Number),
  z.string().pipe(z.coerce.number()),
]);

export const RouteHourlyRidershipSourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  day_of_week: z.string().min(1),
  hour_of_day: SqlNumberSchema,
  ridership: SqlNumberSchema,
});

export function parseRouteHourlyRidershipSourceRows(
  rows: readonly unknown[],
): readonly RouteHourlyRidershipSourceRow[] {
  return z
    .array(RouteHourlyRidershipSourceRowSchema)
    .parse(rows) as RouteHourlyRidershipSourceRow[];
}

export function reliabilityExposurePanelRidershipSql(
  input: { readonly routeFiltered?: boolean } = {},
): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
      SELECT
        route_id,
        month,
        day_of_week,
        hour_of_day,
        AVG(ridership) AS ridership
      FROM local_route_hourly_ridership
      WHERE month = ?
        ${routeFilter}
      GROUP BY route_id, month, day_of_week, hour_of_day
      ORDER BY route_id, day_of_week, hour_of_day
    `;
}

export function loadReliabilityExposurePanelRidershipRows(
  input: ReliabilityExposurePanelLocalDbQuery,
): readonly RouteHourlyRidershipSourceRow[] {
  const query = input.sqlite.query(
    reliabilityExposurePanelRidershipSql({ routeFiltered: input.routeId !== undefined }),
  );
  return parseRouteHourlyRidershipSourceRows(
    input.routeId === undefined ? query.all(input.month) : query.all(input.month, input.routeId),
  );
}

export function loadReliabilityExposureRidershipPanelV1Resolution(
  input: ReliabilityExposureRidershipLocalDbResolutionQuery,
): LocalDbPanelResolution<RouteHourlyRidershipSourceRow> {
  const rows = loadReliabilityExposurePanelRidershipRows({
    sqlite: input.sqlite,
    month: input.spec.releaseMonth,
    ...(input.spec.routeId === undefined ? {} : { routeId: input.spec.routeId }),
  });
  const panelSpec = reliabilityExposurePanelSpecV1(input.spec);
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
          refId: "reliabilityExposurePanelRidershipSql",
          role: "local_db_reliability_exposure_ridership_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_hourly_ridership",
          role: "rider_exposure_proxy_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: rows.length,
      routeIds,
      entityIds: rows.map((row) =>
        [row.route_id as string, row.day_of_week as string, String(row.hour_of_day)].join(":"),
      ),
      months,
      limitations: [
        "This local-db resolver covers the ridership side of reliability exposure; stop-direction-hour EWT rows come from artifacts.",
      ],
    }),
  };
}
