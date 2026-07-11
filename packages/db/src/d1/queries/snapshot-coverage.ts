import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { routeSpeedHistoryCoverage, sourceMonthCoverage } from "../schema.js";

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

function normalizeSourceCoverageMonth(value: string): string {
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

export type RouteSpeedHistoryCoverage = {
  routeId: string;
  month: string;
  routeSlug: string;
  historyStartMonth: string;
  historyEndMonth: string;
  artifactPath: string;
  artifactStatus: string;
  spineReadiness: "series_ready" | "series_ready_with_gaps" | "needs_pattern_review" | "failed";
  spineReasons: string[];
  matchedCurrentSegmentCount: number | null;
  unmatchedCurrentSegmentCount: number | null;
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
  status: SourceMonthCoverageStatus;
  rowCount: number | null;
  routeCount: number | null;
  note: string | null;
  generatedAt: string;
  artifactPath: string | null;
};

export type SourceMonthCoverageStatus =
  | "available"
  | "partial"
  | "available_not_fetched"
  | "upstream_blocked"
  | "downstream_blocked"
  | "derived_not_built"
  | "source_absent";

function sourceMonthCoverageStatus(value: string): SourceMonthCoverageStatus {
  if (
    value === "available" ||
    value === "partial" ||
    value === "available_not_fetched" ||
    value === "upstream_blocked" ||
    value === "downstream_blocked" ||
    value === "derived_not_built" ||
    value === "source_absent"
  ) {
    return value;
  }
  return "source_absent";
}

export type PublicSnapshotSourceMonthCoverage = {
  rows: SourceMonthCoverage[];
  skippedRowCount: number;
};

function toRouteSpeedHistoryCoverage(row: RouteSpeedHistoryCoverageRow): RouteSpeedHistoryCoverage {
  const spineReadiness = routeSpeedSpineReadiness(row.spine_readiness);
  return {
    routeId: row.route_id,
    month: row.month,
    routeSlug: row.route_slug,
    historyStartMonth: row.history_start_month,
    historyEndMonth: row.history_end_month,
    artifactPath: row.artifact_path,
    artifactStatus: row.artifact_status,
    spineReadiness,
    spineReasons: stringArrayJson(row.spine_reason_json),
    matchedCurrentSegmentCount: row.matched_current_segment_count,
    unmatchedCurrentSegmentCount: row.unmatched_current_segment_count,
    monthCount: row.month_count,
    segmentCount: row.segment_count,
    cellCount: row.cell_count,
    availableCellCount: row.available_cell_count,
    missingCellCount: row.missing_cell_count,
    generatedAt: row.generated_at,
  };
}

function routeSpeedSpineReadiness(value: string): RouteSpeedHistoryCoverage["spineReadiness"] {
  if (
    value === "series_ready" ||
    value === "series_ready_with_gaps" ||
    value === "needs_pattern_review" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error(`Invalid route speed spine readiness: ${value}`);
}

function stringArrayJson(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid route speed spine reasons JSON.");
  }
  return parsed;
}

function toSourceMonthCoverage(row: SourceMonthCoverageRow): SourceMonthCoverage {
  return {
    sourceId: row.source_id,
    month: row.month,
    label: row.label,
    sourceKind: row.source_kind,
    grain: row.grain,
    status: sourceMonthCoverageStatus(row.status),
    rowCount: row.row_count,
    routeCount: row.route_count,
    note: row.note,
    generatedAt: row.generated_at,
    artifactPath: row.artifact_path,
  };
}

function logSkippedSourceMonthCoverageRow(input: {
  row: {
    source_id: string;
    month: string;
  };
  issues: readonly string[];
}): void {
  console.error("Skipping source_month_coverage row for public Studio snapshot.", {
    sourceId: input.row.source_id,
    month: input.row.month,
    issues: input.issues,
  });
}

async function selectSourceMonthCoverageRows(db: D1ServingDb) {
  return db
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
}

async function selectRouteSpeedHistoryCoverageRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeSpeedHistoryCoverage.routeId,
      month: routeSpeedHistoryCoverage.month,
      route_slug: routeSpeedHistoryCoverage.routeSlug,
      history_start_month: routeSpeedHistoryCoverage.historyStartMonth,
      history_end_month: routeSpeedHistoryCoverage.historyEndMonth,
      artifact_path: routeSpeedHistoryCoverage.artifactPath,
      artifact_status: routeSpeedHistoryCoverage.artifactStatus,
      spine_readiness: routeSpeedHistoryCoverage.spineReadiness,
      spine_reason_json: routeSpeedHistoryCoverage.spineReasonJson,
      matched_current_segment_count: routeSpeedHistoryCoverage.matchedCurrentSegmentCount,
      unmatched_current_segment_count: routeSpeedHistoryCoverage.unmatchedCurrentSegmentCount,
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
}

export type RouteSpeedHistoryCoverageRow = Awaited<
  ReturnType<typeof selectRouteSpeedHistoryCoverageRows>
>[number];

type SourceMonthCoverageRawRow = Awaited<ReturnType<typeof selectSourceMonthCoverageRows>>[number];

export type SourceMonthCoverageRow = Omit<SourceMonthCoverageRawRow, "month"> & {
  month: string;
};

function toSourceMonthCoverageRow(row: SourceMonthCoverageRawRow): SourceMonthCoverageRow | null {
  const month = normalizeSourceCoverageMonth(row.month);
  if (/^\d{4}-\d{2}$/.test(month)) {
    return { ...row, month };
  }
  return null;
}

function assertSourceMonthCoverageRow(row: SourceMonthCoverageRawRow): SourceMonthCoverageRow {
  const normalized = toSourceMonthCoverageRow(row);
  if (normalized !== null) return normalized;
  throw new Error("Invalid string");
}

export async function listRouteSpeedHistoryCoverage(
  db: D1ServingDb,
  month: string,
): Promise<RouteSpeedHistoryCoverage[]> {
  const rows = await selectRouteSpeedHistoryCoverageRows(db, month);
  return rows.map(toRouteSpeedHistoryCoverage);
}

export async function listSourceMonthCoverage(db: D1ServingDb): Promise<SourceMonthCoverage[]> {
  const rows = await selectSourceMonthCoverageRows(db);

  return rows.map((row) => toSourceMonthCoverage(assertSourceMonthCoverageRow(row)));
}

export async function listPublicSnapshotSourceMonthCoverage(
  db: D1ServingDb,
): Promise<PublicSnapshotSourceMonthCoverage> {
  const rows = await selectSourceMonthCoverageRows(db);
  const sourceMonthCoverageRows: SourceMonthCoverage[] = [];
  let skippedRowCount = 0;

  for (const row of rows) {
    const parsed = toSourceMonthCoverageRow(row);
    if (parsed === null) {
      skippedRowCount += 1;
      logSkippedSourceMonthCoverageRow({ row, issues: ["Invalid string"] });
      continue;
    }

    sourceMonthCoverageRows.push(toSourceMonthCoverage(parsed));
  }

  return {
    rows: sourceMonthCoverageRows,
    skippedRowCount,
  };
}
