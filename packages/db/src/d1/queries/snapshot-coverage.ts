import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeSpeedHistoryCoverage, sourceMonthCoverage } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteSpeedHistoryCoverageRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_slug: z.string().min(1),
    history_start_month: IsoMonthSchema,
    history_end_month: IsoMonthSchema,
    artifact_path: z.string().min(1),
    artifact_status: z.string().min(1),
    month_count: z.number().int().nonnegative(),
    segment_count: z.number().int().nonnegative(),
    cell_count: z.number().int().nonnegative(),
    available_cell_count: z.number().int().nonnegative(),
    missing_cell_count: z.number().int().nonnegative(),
    generated_at: z.string().min(1),
  })
  .strict();

const DISPLAY_MONTHS = new Map([
  ["january", "01"],
  ["february", "02"],
  ["march", "03"],
  ["april", "04"],
  ["may", "05"],
  ["june", "06"],
  ["july", "07"],
  ["august", "08"],
  ["september", "09"],
  ["october", "10"],
  ["november", "11"],
  ["december", "12"],
]);

function normalizeSourceCoverageMonth(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const displayMonthMatch =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i.exec(
      trimmed,
    );
  if (displayMonthMatch === null) return value;
  const monthName = displayMonthMatch[1];
  const year = displayMonthMatch[2];
  if (monthName === undefined || year === undefined) return value;
  const month = DISPLAY_MONTHS.get(monthName.toLowerCase());
  return month === undefined ? value : `${year}-${month}`;
}

const SourceCoverageMonthSchema = z.preprocess(normalizeSourceCoverageMonth, IsoMonthSchema);

const SourceMonthCoverageRowSchema = z
  .object({
    source_id: z.string().min(1),
    month: SourceCoverageMonthSchema,
    label: z.string().min(1),
    source_kind: z.string().min(1),
    grain: z.string().min(1),
    status: z.string().min(1),
    row_count: z.number().int().nonnegative().nullable(),
    route_count: z.number().int().nonnegative().nullable(),
    note: z.string().nullable(),
    generated_at: z.string().min(1),
    artifact_path: z.string().nullable(),
  })
  .strict();

export type RouteSpeedHistoryCoverageRow = z.output<typeof RouteSpeedHistoryCoverageRowSchema>;
export type SourceMonthCoverageRow = z.output<typeof SourceMonthCoverageRowSchema>;

export type RouteSpeedHistoryCoverage = {
  routeId: string;
  month: string;
  routeSlug: string;
  historyStartMonth: string;
  historyEndMonth: string;
  artifactPath: string;
  artifactStatus: string;
  monthCount: number;
  segmentCount: number;
  cellCount: number;
  availableCellCount: number;
  missingCellCount: number;
  generatedAt: string;
};

export type SourceMonthCoverage = {
  sourceId: string;
  month: string;
  label: string;
  sourceKind: string;
  grain: string;
  status: string;
  rowCount: number | null;
  routeCount: number | null;
  note: string | null;
  generatedAt: string;
  artifactPath: string | null;
};

function toRouteSpeedHistoryCoverage(row: RouteSpeedHistoryCoverageRow): RouteSpeedHistoryCoverage {
  return {
    routeId: row.route_id,
    month: row.month,
    routeSlug: row.route_slug,
    historyStartMonth: row.history_start_month,
    historyEndMonth: row.history_end_month,
    artifactPath: row.artifact_path,
    artifactStatus: row.artifact_status,
    monthCount: row.month_count,
    segmentCount: row.segment_count,
    cellCount: row.cell_count,
    availableCellCount: row.available_cell_count,
    missingCellCount: row.missing_cell_count,
    generatedAt: row.generated_at,
  };
}

function toSourceMonthCoverage(row: SourceMonthCoverageRow): SourceMonthCoverage {
  return {
    sourceId: row.source_id,
    month: row.month,
    label: row.label,
    sourceKind: row.source_kind,
    grain: row.grain,
    status: row.status,
    rowCount: row.row_count,
    routeCount: row.route_count,
    note: row.note,
    generatedAt: row.generated_at,
    artifactPath: row.artifact_path,
  };
}

export async function listRouteSpeedHistoryCoverage(
  db: D1ServingDb,
  month: string,
): Promise<RouteSpeedHistoryCoverage[]> {
  const rows = await db
    .select({
      route_id: routeSpeedHistoryCoverage.routeId,
      month: routeSpeedHistoryCoverage.month,
      route_slug: routeSpeedHistoryCoverage.routeSlug,
      history_start_month: routeSpeedHistoryCoverage.historyStartMonth,
      history_end_month: routeSpeedHistoryCoverage.historyEndMonth,
      artifact_path: routeSpeedHistoryCoverage.artifactPath,
      artifact_status: routeSpeedHistoryCoverage.artifactStatus,
      month_count: routeSpeedHistoryCoverage.monthCount,
      segment_count: routeSpeedHistoryCoverage.segmentCount,
      cell_count: routeSpeedHistoryCoverage.cellCount,
      available_cell_count: routeSpeedHistoryCoverage.availableCellCount,
      missing_cell_count: routeSpeedHistoryCoverage.missingCellCount,
      generated_at: routeSpeedHistoryCoverage.generatedAt,
    })
    .from(routeSpeedHistoryCoverage)
    .where(eq(routeSpeedHistoryCoverage.month, month))
    .orderBy(asc(routeSpeedHistoryCoverage.routeId));

  return rows.map((row) =>
    toRouteSpeedHistoryCoverage(RouteSpeedHistoryCoverageRowSchema.parse(row)),
  );
}

export async function listSourceMonthCoverage(db: D1ServingDb): Promise<SourceMonthCoverage[]> {
  const rows = await db
    .select({
      source_id: sourceMonthCoverage.sourceId,
      month: sourceMonthCoverage.month,
      label: sourceMonthCoverage.label,
      source_kind: sourceMonthCoverage.sourceKind,
      grain: sourceMonthCoverage.grain,
      status: sourceMonthCoverage.status,
      row_count: sourceMonthCoverage.rowCount,
      route_count: sourceMonthCoverage.routeCount,
      note: sourceMonthCoverage.note,
      generated_at: sourceMonthCoverage.generatedAt,
      artifact_path: sourceMonthCoverage.artifactPath,
    })
    .from(sourceMonthCoverage)
    .orderBy(asc(sourceMonthCoverage.sourceId), asc(sourceMonthCoverage.month));

  return rows.map((row) => toSourceMonthCoverage(SourceMonthCoverageRowSchema.parse(row)));
}
