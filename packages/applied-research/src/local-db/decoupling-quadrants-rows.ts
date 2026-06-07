import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  type DecouplingQuadrantsSpec,
  decouplingQuadrantsPanelSpecV1,
} from "../feature-resolvers/decoupling-quadrants";
import {
  buildLocalDbPanelResolutionManifest,
  type LocalDbPanelResolution,
} from "./panel-resolution";

export type DecouplingRouteTrendSourceRow = {
  route_id: string;
  month: string;
  speed_observation_count: number;
  average_speed_mph: number | null;
  ridership: number | null;
  has_speed_trend: number | boolean | string;
  has_ridership_trend: number | boolean | string;
};

export type DecouplingReliabilitySourceRow = {
  route_id: string;
  month: string;
  reliability_status: string;
  sample_count: number;
  min_sample_threshold: number;
  observed_long_gap_share: number | null;
  excess_wait_minutes: number | null;
  wait_reliability_ratio: number | null;
};

export type DecouplingQuadrantsLocalDbRows = {
  readonly routeTrendRows: readonly DecouplingRouteTrendSourceRow[];
  readonly reliabilityRows: readonly DecouplingReliabilitySourceRow[];
};

export type DecouplingQuadrantsLocalDbQuery = {
  readonly sqlite: Database;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly observedRunId?: string;
  readonly routeId?: string;
};

export type DecouplingQuadrantsLocalDbResolutionQuery = {
  readonly sqlite: Database;
  readonly spec: DecouplingQuadrantsSpec;
  readonly observedRunId?: string;
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

const SqlBooleanishSchema = z.union([
  z.boolean(),
  z.number(),
  z.bigint().transform(Number),
  z.string(),
]);

export const DecouplingRouteTrendSourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  speed_observation_count: SqlNumberSchema,
  average_speed_mph: SqlNullableNumberSchema,
  ridership: SqlNullableNumberSchema,
  has_speed_trend: SqlBooleanishSchema,
  has_ridership_trend: SqlBooleanishSchema,
});

export const DecouplingReliabilitySourceRowSchema = z.strictObject({
  route_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reliability_status: z.string().min(1),
  sample_count: SqlNumberSchema,
  min_sample_threshold: SqlNumberSchema,
  observed_long_gap_share: SqlNullableNumberSchema,
  excess_wait_minutes: SqlNullableNumberSchema,
  wait_reliability_ratio: SqlNullableNumberSchema,
});

export function parseDecouplingRouteTrendSourceRows(
  rows: readonly unknown[],
): readonly DecouplingRouteTrendSourceRow[] {
  return z
    .array(DecouplingRouteTrendSourceRowSchema)
    .parse(rows) as DecouplingRouteTrendSourceRow[];
}

export function parseDecouplingReliabilitySourceRows(
  rows: readonly unknown[],
): readonly DecouplingReliabilitySourceRow[] {
  return z
    .array(DecouplingReliabilitySourceRowSchema)
    .parse(rows) as DecouplingReliabilitySourceRow[];
}

export function decouplingRouteTrendSql(input: { readonly routeFiltered?: boolean } = {}): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
      SELECT
        route_id,
        month,
        speed_observation_count,
        average_speed_mph,
        ridership,
        has_speed_trend,
        has_ridership_trend
      FROM local_route_month_trend
      WHERE month >= ?
        AND month <= ?
        ${routeFilter}
      ORDER BY route_id, month
    `;
}

export function decouplingReliabilitySql(input: { readonly routeFiltered?: boolean } = {}): string {
  const routeFilter = input.routeFiltered === true ? "AND route_id = ?" : "";
  return `
      SELECT
        route_id,
        month,
        reliability_status,
        sample_count,
        min_sample_threshold,
        observed_long_gap_share,
        excess_wait_minutes,
        wait_reliability_ratio
      FROM local_route_observed_reliability_summary
      WHERE month >= ?
        AND month <= ?
        AND run_id = COALESCE(?, 'bus-observatory-' || month)
        ${routeFilter}
      ORDER BY route_id, month
    `;
}

export function loadDecouplingQuadrantsLocalDbRows(
  input: DecouplingQuadrantsLocalDbQuery,
): DecouplingQuadrantsLocalDbRows {
  const trendQuery = input.sqlite.query(
    decouplingRouteTrendSql({ routeFiltered: input.routeId !== undefined }),
  );
  const reliabilityQuery = input.sqlite.query(
    decouplingReliabilitySql({ routeFiltered: input.routeId !== undefined }),
  );
  const runId = input.observedRunId ?? null;
  return {
    routeTrendRows: parseDecouplingRouteTrendSourceRows(
      input.routeId === undefined
        ? trendQuery.all(input.historyStartMonth, input.releaseMonth)
        : trendQuery.all(input.historyStartMonth, input.releaseMonth, input.routeId),
    ),
    reliabilityRows: parseDecouplingReliabilitySourceRows(
      input.routeId === undefined
        ? reliabilityQuery.all(input.historyStartMonth, input.releaseMonth, runId)
        : reliabilityQuery.all(input.historyStartMonth, input.releaseMonth, runId, input.routeId),
    ),
  };
}

export function loadDecouplingQuadrantsPanelV1Resolution(
  input: DecouplingQuadrantsLocalDbResolutionQuery,
): LocalDbPanelResolution<DecouplingRouteTrendSourceRow | DecouplingReliabilitySourceRow> &
  DecouplingQuadrantsLocalDbRows {
  const rows = loadDecouplingQuadrantsLocalDbRows({
    sqlite: input.sqlite,
    historyStartMonth: input.spec.historyStartMonth,
    releaseMonth: input.spec.releaseMonth,
    ...(input.observedRunId === undefined ? {} : { observedRunId: input.observedRunId }),
    ...(input.spec.routeId === undefined ? {} : { routeId: input.spec.routeId }),
  });
  const combinedRows = [...rows.routeTrendRows, ...rows.reliabilityRows];
  const panelSpec = decouplingQuadrantsPanelSpecV1(input.spec);
  return {
    ...rows,
    rows: combinedRows,
    panelManifest: buildLocalDbPanelResolutionManifest({
      panelSpec,
      generatedAt: input.generatedAt,
      inputRefs: [
        {
          refKind: "query",
          refId: "decouplingRouteTrendSql",
          role: "local_db_decoupling_speed_ridership_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "query",
          refId: "decouplingReliabilitySql",
          role: "local_db_decoupling_reliability_rows",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_month_trend",
          role: "speed_ridership_trend_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
        {
          refKind: "local_table",
          refId: "local_route_observed_reliability_summary",
          role: "observed_reliability_source",
          path: input.dbPath ?? "data/local/pipeline.sqlite",
        },
      ],
      sourceRowCount: combinedRows.length,
      routeIds: combinedRows.map((row) => row.route_id),
      entityIds: combinedRows.map((row) => row.route_id),
      months: combinedRows.map((row) => row.month),
    }),
  };
}
