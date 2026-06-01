import { Database as BunDatabase, type Database, type SQLQueryBindings } from "bun:sqlite";
import { Glob } from "bun";
import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth, monthRange } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import { canonicalRouteId } from "../../lib/route-ids.ts";
import {
  DATA_PRODUCT_MANIFEST,
  type DataProduct,
  type DataProductCheck,
  type DataProductCompletenessStatus,
  type DataProductManifest,
  type DataProductRouteUniverse,
  parseDataProductManifestText,
} from "../../registry/data-products.ts";

type RouteRow = {
  route_id?: unknown;
  run_id?: unknown;
};

type MonthCoverageRow = {
  month?: unknown;
  row_count?: unknown;
  route_count?: unknown;
};

type SourceYearRouteWaiverRow = {
  sourceYear?: unknown;
  routeId?: unknown;
  disposition?: unknown;
  classification?: unknown;
  reason?: unknown;
};

export type DataProductCheckAudit = {
  checkId: string;
  label: string;
  type: DataProductCheck["type"];
  status: DataProductCompletenessStatus;
  tableName: string | null;
  path: string | null;
  expectedCount: number;
  observedCount: number;
  missingCount: number;
  observedShare: number | null;
  sampleObserved: string[];
  sampleMissing: string[];
  samplePartial: string[];
  reasons: string[];
};

export type DataProductCompletenessProductAudit = {
  productId: string;
  label: string;
  kind: DataProduct["kind"];
  owner: string;
  grain: string;
  producerCommand: string;
  expectedUniverse: DataProduct["expectedUniverse"];
  requiredInputs: string[];
  downstreamConsumers: string[];
  freshnessPolicy: DataProduct["freshnessPolicy"];
  lifecycle: DataProduct["lifecycle"];
  status: DataProductCompletenessStatus;
  checks: DataProductCheckAudit[];
  reasons: string[];
};

export type DataProductDownstreamBlocker = {
  productId: string;
  status: DataProductCompletenessStatus;
  downstreamConsumers: string[];
  reasons: string[];
};

export type DataProductCompletenessAudit = {
  artifactKind: "data_product_completeness";
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  manifestVersion: number;
  releaseMonth: string;
  runId: string;
  gtfsRunId: string | null;
  historyWindow: {
    startMonth: string;
    endMonth: string;
    monthCount: number;
  };
  routeUniverses: Record<DataProductRouteUniverse, { routeCount: number; sampleRoutes: string[] }>;
  summary: Record<`${DataProductCompletenessStatus}ProductCount`, number> & {
    productCount: number;
    checkCount: number;
    downstreamBlockedProductCount: number;
  };
  products: DataProductCompletenessProductAudit[];
  downstreamBlockers: DataProductDownstreamBlocker[];
  nextActions: string[];
};

type RouteUniverseSets = Record<DataProductRouteUniverse, Set<string>>;

type BuildDataProductCompletenessAuditInput = {
  sqlite: Database;
  manifest?: DataProductManifest;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId?: string | null;
  artifactRoot: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
};

const STATUS_ORDER: readonly DataProductCompletenessStatus[] = [
  "complete",
  "partial",
  "missing",
  "stale",
  "waived",
  "blocked",
  "fetching",
];

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function routeIdValue(value: unknown): string | null {
  const text = textValue(value);
  return text === null ? null : text.toUpperCase();
}

function parseIsoMonthParts(value: string): { year: number; month: number } {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ISO month: ${value}`);
  }
  return { year, month };
}

function requestedMonths(startMonth: string, endMonth: string): string[] {
  const start = parseIsoMonthParts(startMonth);
  const end = parseIsoMonthParts(endMonth);
  return monthRange(start.year, start.month, end.year, end.month).map((month) => month.isoMonth);
}

function sourceYearsForMonths(months: readonly string[]): number[] {
  return [...new Set(months.map((month) => parseIsoMonthParts(month).year))].sort(
    (left, right) => left - right,
  );
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function columnExists(sqlite: Database, tableName: string, columnName: string): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const rows = sqlite.query(`PRAGMA table_info(${tableName})`).all() as { name?: unknown }[];
  return rows.some((row) => row.name === columnName);
}

function routeSetFromRows(
  rows: readonly RouteRow[],
  routeUniverse: ReadonlySet<string> | null = null,
): Set<string> {
  return new Set(
    rows
      .map((row) =>
        routeUniverse === null
          ? routeIdValue(row.route_id)
          : canonicalRouteId(row.route_id, routeUniverse),
      )
      .filter(
        (routeId): routeId is string =>
          routeId !== null && (routeUniverse === null || routeUniverse.has(routeId)),
      )
      .sort(),
  );
}

function routeSetFromQuery(
  sqlite: Database,
  tableName: string,
  sql: string,
  params: SQLQueryBindings[] = [],
  routeUniverse: ReadonlySet<string> | null = null,
): Set<string> {
  if (!tableExists(sqlite, tableName)) return new Set();
  return routeSetFromRows(sqlite.query(sql).all(...params) as RouteRow[], routeUniverse);
}

function latestGtfsRunId(sqlite: Database): string | null {
  if (!tableExists(sqlite, "local_gtfs_static_bundle")) return null;
  const row = sqlite
    .query(
      `
        SELECT run_id
        FROM local_gtfs_static_bundle
        GROUP BY run_id
        ORDER BY MAX(ingested_at) DESC, run_id DESC
        LIMIT 1
      `,
    )
    .get() as RouteRow | null;
  return textValue(row?.run_id);
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left].filter((routeId) => right.has(routeId)).sort());
}

function union(...sets: readonly ReadonlySet<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]).sort());
}

function sortedRoutes(routes: ReadonlySet<string>): string[] {
  return [...routes].sort();
}

function buildRouteUniverses(input: {
  sqlite: Database;
  releaseMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): RouteUniverseSets {
  const routeCatalog = routeSetFromQuery(
    input.sqlite,
    "local_route_catalog",
    "SELECT DISTINCT route_id FROM local_route_catalog ORDER BY route_id",
  );
  const releaseYear = Number(input.releaseMonth.slice(0, 4));
  const scheduleSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_schedule_stop",
    "SELECT DISTINCT route_id FROM local_route_schedule_stop WHERE source_year = ? ORDER BY route_id",
    [releaseYear],
    routeCatalog,
  );
  const speedSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_segment_speed",
    "SELECT DISTINCT route_id FROM local_route_segment_speed WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
    routeCatalog,
  );
  const ridershipSourceRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_hourly_ridership",
    "SELECT DISTINCT route_id FROM local_route_hourly_ridership WHERE month = ? ORDER BY route_id",
    [input.releaseMonth],
    routeCatalog,
  );
  const observedHeadwayRoutes = routeSetFromQuery(
    input.sqlite,
    "local_observed_headway_sample",
    "SELECT DISTINCT route_id FROM local_observed_headway_sample WHERE run_id = ? ORDER BY route_id",
    [input.runId],
    routeCatalog,
  );
  const observedReliabilityRouteSql = columnExists(
    input.sqlite,
    "local_route_observed_reliability_summary",
    "sample_count",
  )
    ? `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ? AND sample_count >= 30
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_observed_reliability_summary
        WHERE month = ? AND run_id = ?
        ORDER BY route_id
      `;
  const observedReliabilityRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_observed_reliability_summary",
    observedReliabilityRouteSql,
    [input.releaseMonth, input.runId],
    routeCatalog,
  );
  const publicVisibleRouteSql = columnExists(
    input.sqlite,
    "local_route_brief_summary",
    "public_visible",
  )
    ? `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ? AND public_visible = 1
        ORDER BY route_id
      `
    : `
        SELECT DISTINCT route_id
        FROM local_route_brief_summary
        WHERE month = ?
        ORDER BY route_id
      `;
  const publicVisibleRoutes = routeSetFromQuery(
    input.sqlite,
    "local_route_brief_summary",
    publicVisibleRouteSql,
    [input.releaseMonth],
    routeCatalog,
  );
  const gtfsRoutes =
    input.gtfsRunId === null
      ? new Set<string>()
      : routeSetFromQuery(
          input.sqlite,
          "local_gtfs_static_route",
          "SELECT DISTINCT route_id FROM local_gtfs_static_route WHERE run_id = ? ORDER BY route_id",
          [input.gtfsRunId],
          routeCatalog,
        );

  return {
    route_catalog: routeCatalog,
    coverage_source_routes: union(scheduleSourceRoutes, speedSourceRoutes),
    schedule_source_routes: scheduleSourceRoutes,
    speed_source_routes: speedSourceRoutes,
    ridership_source_routes: ridershipSourceRoutes,
    speed_ridership_source_routes: intersection(speedSourceRoutes, ridershipSourceRoutes),
    observed_headway_routes: observedHeadwayRoutes,
    observed_reliability_routes: observedReliabilityRoutes,
    ewt_eligible_routes: intersection(
      intersection(routeCatalog, observedHeadwayRoutes),
      gtfsRoutes,
    ),
    public_visible_routes:
      publicVisibleRoutes.size > 0
        ? publicVisibleRoutes
        : intersection(speedSourceRoutes, ridershipSourceRoutes),
  };
}

function routeUniverseSummary(
  routeUniverses: RouteUniverseSets,
): DataProductCompletenessAudit["routeUniverses"] {
  return Object.fromEntries(
    Object.entries(routeUniverses).map(([key, routes]) => [
      key,
      {
        routeCount: routes.size,
        sampleRoutes: sortedRoutes(routes).slice(0, 12),
      },
    ]),
  ) as DataProductCompletenessAudit["routeUniverses"];
}

function resolveTemplate(
  template: string,
  input: {
    artifactRoot: string;
    releaseMonth: string;
    historyStartMonth: string;
    runId: string;
    gtfsRunId: string | null;
    routeId?: string;
  },
): string {
  return template
    .replaceAll("{repoRoot}", repoRoot)
    .replaceAll("{artifactRoot}", input.artifactRoot)
    .replaceAll("{releaseMonth}", input.releaseMonth)
    .replaceAll("{historyStartMonth}", input.historyStartMonth)
    .replaceAll("{runId}", input.runId)
    .replaceAll("{gtfsRunId}", input.gtfsRunId ?? "")
    .replaceAll("{routeId}", input.routeId ?? "");
}

function statusFromCoverage(input: {
  expectedCount: number;
  observedCount: number;
  missingCount: number;
}): DataProductCompletenessStatus {
  if (input.expectedCount === 0) return "blocked";
  if (input.missingCount === 0) return "complete";
  if (input.observedCount === 0) return "missing";
  return "partial";
}

function routeCoverageCheck(input: {
  check: Extract<
    DataProductCheck,
    { type: "table_route_coverage" | "route_artifact_coverage" | "score_vector_routes" }
  >;
  expectedRoutes: ReadonlySet<string>;
  observedRoutes: ReadonlySet<string>;
  tableName?: string | null;
  path?: string | null;
}): DataProductCheckAudit {
  const expectedRoutes = sortedRoutes(input.expectedRoutes);
  const observedExpectedRoutes = expectedRoutes.filter((routeId) =>
    input.observedRoutes.has(routeId),
  );
  const missingRoutes = expectedRoutes.filter((routeId) => !input.observedRoutes.has(routeId));
  const expectedCount = expectedRoutes.length;
  const observedCount = observedExpectedRoutes.length;
  const missingCount = missingRoutes.length;
  const status = statusFromCoverage({ expectedCount, observedCount, missingCount });
  const reasons =
    status === "complete"
      ? []
      : expectedCount === 0
        ? ["empty_expected_route_universe"]
        : [`missing_routes:${missingCount}`];

  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: input.tableName ?? null,
    path: input.path === undefined || input.path === null ? null : repoDisplayPath(input.path),
    expectedCount,
    observedCount,
    missingCount,
    observedShare: expectedCount === 0 ? null : observedCount / expectedCount,
    sampleObserved: observedExpectedRoutes.slice(0, 12),
    sampleMissing: missingRoutes.slice(0, 12),
    samplePartial: [],
    reasons,
  };
}

function monthTableCoverageCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "month_table_coverage" }>;
  months: readonly string[];
}): DataProductCheckAudit {
  if (!tableExists(input.sqlite, input.check.tableName)) {
    return {
      checkId: input.check.id,
      label: input.check.label,
      type: input.check.type,
      status: "missing",
      tableName: input.check.tableName,
      path: null,
      expectedCount: input.months.length,
      observedCount: 0,
      missingCount: input.months.length,
      observedShare: input.months.length === 0 ? null : 0,
      sampleObserved: [],
      sampleMissing: input.months.slice(0, 12),
      samplePartial: [],
      reasons: ["table_missing"],
    };
  }

  const routeCountExpression =
    input.check.routeColumn === undefined
      ? "0 AS route_count"
      : `COUNT(DISTINCT ${input.check.routeColumn}) AS route_count`;
  const rows = input.sqlite
    .query(
      `
        SELECT
          ${input.check.monthColumn} AS month,
          COUNT(*) AS row_count,
          ${routeCountExpression}
        FROM ${input.check.tableName}
        GROUP BY ${input.check.monthColumn}
      `,
    )
    .all() as MonthCoverageRow[];
  const observedByMonth = new Map<string, { rowCount: number; routeCount: number }>();
  for (const row of rows) {
    const month = textValue(row.month);
    if (month === null) continue;
    observedByMonth.set(month, {
      rowCount: numberValue(row.row_count),
      routeCount: numberValue(row.route_count),
    });
  }

  const missingMonths: string[] = [];
  const presentMonths: string[] = [];
  const partialMonths: string[] = [];
  for (const month of input.months) {
    const row = observedByMonth.get(month);
    if (row === undefined || row.rowCount === 0) {
      missingMonths.push(month);
      continue;
    }
    presentMonths.push(month);
    const reasons: string[] = [];
    if (row.rowCount < input.check.minRowsPerMonth) reasons.push("below_min_row_count");
    if (row.routeCount < input.check.minRoutesPerMonth) reasons.push("below_min_route_count");
    if (reasons.length > 0) partialMonths.push(`${month}:${reasons.join("+")}`);
  }

  const expectedCount = input.months.length;
  const observedCount = presentMonths.length;
  const missingCount = missingMonths.length;
  const status: DataProductCompletenessStatus =
    missingCount === expectedCount
      ? "missing"
      : missingCount > 0 || partialMonths.length > 0
        ? "partial"
        : "complete";
  const reasons = [
    ...(missingCount > 0 ? [`missing_months:${missingCount}`] : []),
    ...(partialMonths.length > 0 ? [`thin_months:${partialMonths.length}`] : []),
  ];

  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: input.check.tableName,
    path: null,
    expectedCount,
    observedCount,
    missingCount,
    observedShare: expectedCount === 0 ? null : observedCount / expectedCount,
    sampleObserved: presentMonths.slice(0, 12),
    sampleMissing: missingMonths.slice(0, 12),
    samplePartial: partialMonths.slice(0, 12),
    reasons,
  };
}

function tableRouteCoverageCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "table_route_coverage" }>;
  routeUniverses: RouteUniverseSets;
  releaseMonth: string;
  runId: string;
}): DataProductCheckAudit {
  const runFilter = input.check.runColumn === undefined ? "" : `AND ${input.check.runColumn} = ?`;
  const params =
    input.check.runColumn === undefined ? [input.releaseMonth] : [input.releaseMonth, input.runId];
  const observedRoutes = routeSetFromQuery(
    input.sqlite,
    input.check.tableName,
    `
      SELECT DISTINCT ${input.check.routeColumn} AS route_id
      FROM ${input.check.tableName}
      WHERE ${input.check.monthColumn} = ?
      ${runFilter}
      ORDER BY ${input.check.routeColumn}
    `,
    params,
  );
  return routeCoverageCheck({
    check: input.check,
    expectedRoutes: input.routeUniverses[input.check.expectedRoutes],
    observedRoutes,
    tableName: input.check.tableName,
  });
}

function tableRowCountCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "table_row_count" }>;
}): DataProductCheckAudit {
  if (!tableExists(input.sqlite, input.check.tableName)) {
    return {
      checkId: input.check.id,
      label: input.check.label,
      type: input.check.type,
      status: "missing",
      tableName: input.check.tableName,
      path: null,
      expectedCount: input.check.minRows,
      observedCount: 0,
      missingCount: input.check.minRows,
      observedShare: input.check.minRows === 0 ? 1 : 0,
      sampleObserved: [],
      sampleMissing: [input.check.tableName],
      samplePartial: [],
      reasons: ["table_missing"],
    };
  }

  const rows =
    input.check.minRows === 0
      ? []
      : input.sqlite
          .query(`SELECT 1 AS present FROM ${input.check.tableName} LIMIT ?`)
          .all(input.check.minRows);
  const rowCount = rows.length;
  const status: DataProductCompletenessStatus =
    rowCount === 0 && input.check.minRows > 0
      ? "missing"
      : rowCount < input.check.minRows
        ? "partial"
        : "complete";
  const missingCount = Math.max(input.check.minRows - rowCount, 0);
  const reasons =
    status === "complete"
      ? []
      : rowCount === 0
        ? ["table_empty"]
        : [`below_min_rows:${rowCount}/${input.check.minRows}`];

  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: input.check.tableName,
    path: null,
    expectedCount: input.check.minRows,
    observedCount: rowCount,
    missingCount,
    observedShare: input.check.minRows === 0 ? 1 : Math.min(rowCount / input.check.minRows, 1),
    sampleObserved: rowCount > 0 ? [`rows_at_least:${rowCount}`] : [],
    sampleMissing: status === "missing" ? [`min_rows:${input.check.minRows}`] : [],
    samplePartial: status === "partial" ? [`rows:${rowCount}`] : [],
    reasons,
  };
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sourceYearWaiverRows(value: unknown): SourceYearRouteWaiverRow[] {
  const root = asJsonObject(value);
  const sourceYearRouteReconciliation = asJsonObject(root["sourceYearRouteReconciliation"]);
  const candidates =
    sourceYearRouteReconciliation["routeYears"] !== undefined
      ? sourceYearRouteReconciliation["routeYears"]
      : root["routeYears"];
  return asJsonArray(candidates).map((row) => asJsonObject(row) as SourceYearRouteWaiverRow);
}

function isSourceYearRouteWaiverDisposition(value: unknown): boolean {
  return (
    value === "source_absent" ||
    value === "not_historical_schedule_eligible" ||
    value === "explicit_waiver"
  );
}

async function sourceYearRouteWaiverKeys(input: {
  pathTemplate: string | undefined;
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): Promise<{ path: string | null; keys: Set<string>; sample: string[] }> {
  if (input.pathTemplate === undefined) return { path: null, keys: new Set(), sample: [] };
  const path = resolveTemplate(input.pathTemplate, input);
  if (!existsSync(path)) return { path, keys: new Set(), sample: [] };
  const artifact = await Bun.file(path).json();
  const rows = sourceYearWaiverRows(artifact);
  const keys = new Set<string>();
  const sample: string[] = [];
  for (const row of rows) {
    if (!isSourceYearRouteWaiverDisposition(row.disposition)) continue;
    const sourceYear = numberValue(row.sourceYear);
    const routeId = routeIdValue(row.routeId);
    if (!Number.isInteger(sourceYear) || routeId === null) continue;
    const key = `${sourceYear}:${routeId}`;
    keys.add(key);
    if (sample.length < 12) {
      const classification = textValue(row.classification) ?? textValue(row.reason);
      sample.push(classification === null ? key : `${key}:${classification}`);
    }
  }
  return { path, keys, sample };
}

async function sourceYearRouteCoverageCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "source_year_route_coverage" }>;
  routeUniverses: RouteUniverseSets;
  months: readonly string[];
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): Promise<DataProductCheckAudit> {
  const expectedRoutes = sortedRoutes(input.routeUniverses[input.check.expectedRoutes]);
  const sourceYears = sourceYearsForMonths(input.months);
  const expectedKeys = sourceYears.flatMap((sourceYear) =>
    expectedRoutes.map((routeId) => `${sourceYear}:${routeId}`),
  );
  const waivers = await sourceYearRouteWaiverKeys({
    pathTemplate: input.check.waiverArtifactPathTemplate,
    artifactRoot: input.artifactRoot,
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    runId: input.runId,
    gtfsRunId: input.gtfsRunId,
  });
  if (!tableExists(input.sqlite, input.check.tableName)) {
    return {
      checkId: input.check.id,
      label: input.check.label,
      type: input.check.type,
      status: "missing",
      tableName: input.check.tableName,
      path: waivers.path === null ? null : repoDisplayPath(waivers.path),
      expectedCount: expectedKeys.length,
      observedCount: 0,
      missingCount: expectedKeys.length,
      observedShare: expectedKeys.length === 0 ? 1 : 0,
      sampleObserved: [],
      sampleMissing: expectedKeys.slice(0, 12),
      samplePartial: [],
      reasons: ["table_missing"],
    };
  }

  const statusTable =
    input.check.statusTableName !== undefined && tableExists(input.sqlite, input.check.statusTableName)
      ? input.check.statusTableName
      : null;
  const statusByKey = new Map<string, { status: string | null; rowCount: number }>();
  if (statusTable !== null) {
    const statusSourceYearColumn = input.check.statusSourceYearColumn ?? input.check.sourceYearColumn;
    const statusRouteColumn = input.check.statusRouteColumn ?? input.check.routeColumn;
    const statusColumn = input.check.statusColumn ?? "status";
    const statusRowCountColumn = input.check.statusRowCountColumn ?? "row_count";
    for (const sourceYear of sourceYears) {
      const rows = input.sqlite
        .query(
          `
            SELECT ${statusRouteColumn} AS route_id, ${statusColumn} AS status, ${statusRowCountColumn} AS row_count
            FROM ${statusTable}
            WHERE ${statusSourceYearColumn} = ?
          `,
        )
        .all(sourceYear) as { route_id?: unknown; status?: unknown; row_count?: unknown }[];
      for (const row of rows) {
        const routeId = routeIdValue(row.route_id);
        if (routeId === null) continue;
        statusByKey.set(`${sourceYear}:${routeId}`, {
          status: textValue(row.status),
          rowCount: numberValue(row.row_count),
        });
      }
    }
  }

  const observed: string[] = [];
  const missing: string[] = [];
  const waivedMissing: string[] = [];
  const statusOnly: string[] = [];
  const zeroRowComplete: string[] = [];
  for (const sourceYear of sourceYears) {
    for (const routeId of expectedRoutes) {
      const key = `${sourceYear}:${routeId}`;
      const row = input.sqlite
        .query(
          `
            SELECT 1 AS present
            FROM ${input.check.tableName}
            WHERE ${input.check.sourceYearColumn} = ? AND ${input.check.routeColumn} = ?
            LIMIT 1
          `,
        )
        .get(sourceYear, routeId);
      if (row !== null) {
        observed.push(key);
        continue;
      }
      const status = statusByKey.get(key);
      if (status?.status === "complete" && status.rowCount === 0) zeroRowComplete.push(key);
      if (status !== undefined && status.status !== null) statusOnly.push(`${key}:${status.status}`);
      if (waivers.keys.has(key)) {
        waivedMissing.push(key);
        continue;
      }
      missing.push(key);
    }
  }

  const expectedCount = expectedKeys.length;
  const observedCount = observed.length + waivedMissing.length;
  const missingCount = missing.length;
  const status = statusFromCoverage({ expectedCount, observedCount, missingCount });
  const reasons =
    status === "complete"
      ? []
      : [
          `missing_route_years:${missingCount}`,
          ...(waivedMissing.length > 0 ? [`waived_route_years:${waivedMissing.length}`] : []),
          ...(statusOnly.length > 0 ? [`status_without_rows:${statusOnly.length}`] : []),
          ...(zeroRowComplete.length > 0
            ? [`complete_status_zero_rows:${zeroRowComplete.length}`]
            : []),
        ];

  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: input.check.tableName,
    path: waivers.path === null ? null : repoDisplayPath(waivers.path),
    expectedCount,
    observedCount,
    missingCount,
    observedShare: expectedCount === 0 ? null : observedCount / expectedCount,
    sampleObserved: observed.slice(0, 12),
    sampleMissing: missing.slice(0, 12),
    samplePartial: [...waivers.sample, ...statusOnly].slice(0, 12),
    reasons,
  };
}

async function routeArtifactCoverageCheck(input: {
  check: Extract<DataProductCheck, { type: "route_artifact_coverage" }>;
  routeUniverses: RouteUniverseSets;
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): Promise<DataProductCheckAudit> {
  const expectedRoutes = input.routeUniverses[input.check.expectedRoutes];
  const observedRoutes = new Set<string>();
  for (const routeId of expectedRoutes) {
    const routeIdCandidates = [routeId, routeId.toLowerCase()];
    if (
      routeIdCandidates.some((candidate) =>
        existsSync(
          resolveTemplate(input.check.pathTemplate, {
            artifactRoot: input.artifactRoot,
            releaseMonth: input.releaseMonth,
            historyStartMonth: input.historyStartMonth,
            runId: input.runId,
            gtfsRunId: input.gtfsRunId,
            routeId: candidate,
          }),
        ),
      )
    ) {
      observedRoutes.add(routeId);
    }
  }
  return routeCoverageCheck({
    check: input.check,
    expectedRoutes,
    observedRoutes,
    path: resolveTemplate(input.check.pathTemplate, {
      artifactRoot: input.artifactRoot,
      releaseMonth: input.releaseMonth,
      historyStartMonth: input.historyStartMonth,
      runId: input.runId,
      gtfsRunId: input.gtfsRunId,
      routeId: "{routeId}",
    }),
  });
}

function routeIdsFromScoreVectorArtifact(
  value: unknown,
  input: { releaseMonth: string; runId: string },
): {
  routes: Set<string>;
  duplicateRoutes: string[];
  wrongMonthRoutes: string[];
  wrongRunRoutes: string[];
} {
  if (typeof value !== "object" || value === null) {
    return {
      routes: new Set(),
      duplicateRoutes: [],
      wrongMonthRoutes: [],
      wrongRunRoutes: [],
    };
  }
  const artifact = value as {
    releaseMonth?: unknown;
    scoreVectors?: { releaseMonth?: unknown };
    baselines?: { routes?: unknown };
  };
  const releaseRows = Array.isArray(artifact.scoreVectors?.releaseMonth)
    ? artifact.scoreVectors.releaseMonth
    : [];
  const baselineRows = Array.isArray(artifact.baselines?.routes) ? artifact.baselines.routes : [];
  const rows = releaseRows.length > 0 ? releaseRows : baselineRows;
  const routes = new Set<string>();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const wrongMonthRoutes = new Set<string>();
  const wrongRunRoutes = new Set<string>();
  if (textValue(artifact.releaseMonth) !== null && artifact.releaseMonth !== input.releaseMonth) {
    wrongMonthRoutes.add(`artifact:${textValue(artifact.releaseMonth)}`);
  }
  for (const row of rows) {
    if (typeof row !== "object" || row === null || !("routeId" in row)) continue;
    const routeId = routeIdValue((row as { routeId?: unknown }).routeId);
    if (routeId === null) continue;
    if (seen.has(routeId)) duplicates.add(routeId);
    seen.add(routeId);
    routes.add(routeId);
    const month = textValue((row as { month?: unknown }).month);
    if (month !== null && month !== input.releaseMonth) wrongMonthRoutes.add(`${routeId}:${month}`);
    const runId = textValue((row as { runId?: unknown }).runId);
    if (runId !== null && runId !== input.runId) wrongRunRoutes.add(`${routeId}:${runId}`);
  }
  return {
    routes,
    duplicateRoutes: sortedRoutes(duplicates),
    wrongMonthRoutes: [...wrongMonthRoutes].sort(),
    wrongRunRoutes: [...wrongRunRoutes].sort(),
  };
}

async function scoreVectorRoutesCheck(input: {
  check: Extract<DataProductCheck, { type: "score_vector_routes" }>;
  routeUniverses: RouteUniverseSets;
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): Promise<DataProductCheckAudit> {
  const artifactPath = resolveTemplate(input.check.pathTemplate, {
    artifactRoot: input.artifactRoot,
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    runId: input.runId,
    gtfsRunId: input.gtfsRunId,
  });
  const parsed = existsSync(artifactPath)
    ? routeIdsFromScoreVectorArtifact(await Bun.file(artifactPath).json(), {
        releaseMonth: input.releaseMonth,
        runId: input.runId,
      })
    : {
        routes: new Set<string>(),
        duplicateRoutes: [],
        wrongMonthRoutes: [],
        wrongRunRoutes: [],
      };
  const base = routeCoverageCheck({
    check: input.check,
    expectedRoutes: input.routeUniverses[input.check.expectedRoutes],
    observedRoutes: parsed.routes,
    path: artifactPath,
  });
  const semanticReasons = [
    ...(parsed.duplicateRoutes.length > 0
      ? [`duplicate_score_vector_routes:${parsed.duplicateRoutes.length}`]
      : []),
    ...(parsed.wrongMonthRoutes.length > 0
      ? [`wrong_release_month_rows:${parsed.wrongMonthRoutes.length}`]
      : []),
    ...(parsed.wrongRunRoutes.length > 0 ? [`wrong_run_id_rows:${parsed.wrongRunRoutes.length}`] : []),
  ];
  if (semanticReasons.length === 0) return base;
  return {
    ...base,
    status: base.status === "missing" ? "missing" : "partial",
    samplePartial: [
      ...base.samplePartial,
      ...parsed.duplicateRoutes.slice(0, 6).map((routeId) => `duplicate:${routeId}`),
      ...parsed.wrongMonthRoutes.slice(0, 6).map((routeId) => `wrong_month:${routeId}`),
      ...parsed.wrongRunRoutes.slice(0, 6).map((routeId) => `wrong_run:${routeId}`),
    ].slice(0, 12),
    reasons: [...base.reasons, ...semanticReasons],
  };
}

function isStaleArtifact(
  path: string,
  generatedAt: string,
  staleAfterDays: number | undefined,
): boolean {
  if (staleAfterDays === undefined) return false;
  const referenceMs = Date.parse(generatedAt);
  if (!Number.isFinite(referenceMs)) return false;
  const staleBeforeMs = referenceMs - staleAfterDays * 24 * 60 * 60 * 1000;
  return statSync(path).mtimeMs < staleBeforeMs;
}

function valueAtJsonPath(value: unknown, path: string): unknown {
  const segments = path.replace(/^\$?\./, "").split(".").filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function jsonSemanticReasons(input: {
  value: unknown;
  check: Extract<DataProductCheck, { type: "json_artifact" }>;
  releaseMonth: string;
  runId: string;
}): string[] {
  const reasons: string[] = [];
  if (input.check.validateReleaseMonth === true) {
    const month =
      textValue(valueAtJsonPath(input.value, "releaseMonth")) ??
      textValue(valueAtJsonPath(input.value, "month")) ??
      textValue(valueAtJsonPath(input.value, "requestedMonth"));
    if (month !== input.releaseMonth) reasons.push(`release_month_mismatch:${month ?? "missing"}`);
  }
  if (input.check.validateRunId === true) {
    const runId = textValue(valueAtJsonPath(input.value, "runId"));
    if (runId !== input.runId) reasons.push(`run_id_mismatch:${runId ?? "missing"}`);
  }
  for (const required of input.check.requiredJsonValues ?? []) {
    const actual = valueAtJsonPath(input.value, required.path);
    if (actual !== required.equals) {
      reasons.push(`json_value_mismatch:${required.path}`);
    }
  }
  if (input.check.semantic === "tier2_publishable_ready") {
    const publishableTotal = numberValue(valueAtJsonPath(input.value, "summary.publishableTotal"));
    const recordsWithoutReview = valueAtJsonPath(input.value, "summary.recordsWithoutReview");
    const dispositionConflicts = valueAtJsonPath(
      input.value,
      "summary.dispositionVsRecordKindConflicts",
    );
    if (publishableTotal <= 0) reasons.push("tier2_publishable_total_zero");
    if (Array.isArray(recordsWithoutReview) && recordsWithoutReview.length > 0) {
      reasons.push(`tier2_records_without_review:${recordsWithoutReview.length}`);
    }
    if (Array.isArray(dispositionConflicts) && dispositionConflicts.length > 0) {
      reasons.push(`tier2_disposition_conflicts:${dispositionConflicts.length}`);
    }
  }
  if (input.check.semantic === "detector_gold_set_quality") {
    const trueNegative = numberValue(valueAtJsonPath(input.value, "summary.trueNegative"));
    const falsePositive = numberValue(valueAtJsonPath(input.value, "summary.falsePositive"));
    const falseNegative = numberValue(valueAtJsonPath(input.value, "summary.falseNegative"));
    const falseNegativeDiscoveryScopeCount =
      numberValue(valueAtJsonPath(input.value, "summary.falseNegativeDiscoveryScopeCount")) ||
      (Array.isArray(valueAtJsonPath(input.value, "falseNegativeDiscoveryScopes"))
        ? (valueAtJsonPath(input.value, "falseNegativeDiscoveryScopes") as unknown[]).length
        : 0);
    const expectations = valueAtJsonPath(input.value, "expectations");
    const negativeExpectationCount = Array.isArray(expectations)
      ? expectations.filter(
          (expectation) =>
            typeof expectation === "object" &&
            expectation !== null &&
            (expectation as { shouldFlag?: unknown }).shouldFlag === false,
        ).length
      : 0;
    if (negativeExpectationCount === 0 || trueNegative + falsePositive === 0) {
      reasons.push("detector_gold_set_has_no_negative_labels");
    }
    if (falseNegative === 0 && falseNegativeDiscoveryScopeCount === 0) {
      reasons.push("detector_gold_set_has_no_false_negative_pool");
    }
  }
  return reasons;
}

async function jsonArtifactCheck(input: {
  product: DataProduct;
  check: Extract<DataProductCheck, { type: "json_artifact" | "file_artifact" }>;
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
  generatedAt: string;
}): Promise<DataProductCheckAudit> {
  const artifactPath = resolveTemplate(input.check.pathTemplate, {
    artifactRoot: input.artifactRoot,
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    runId: input.runId,
    gtfsRunId: input.gtfsRunId,
  });
  const exists = existsSync(artifactPath);
  const stale =
    exists &&
    isStaleArtifact(artifactPath, input.generatedAt, input.product.freshnessPolicy.staleAfterDays);
  let semanticReasons: string[] = [];
  if (exists && !stale && input.check.type === "json_artifact") {
    try {
      semanticReasons = jsonSemanticReasons({
        value: await Bun.file(artifactPath).json(),
        check: input.check,
        releaseMonth: input.releaseMonth,
        runId: input.runId,
      });
    } catch {
      semanticReasons = ["artifact_json_invalid"];
    }
  }
  const status: DataProductCompletenessStatus = !exists
    ? "missing"
    : stale
      ? "stale"
      : semanticReasons.length > 0
        ? "partial"
        : "complete";
  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: null,
    path: repoDisplayPath(artifactPath),
    expectedCount: 1,
    observedCount: exists ? 1 : 0,
    missingCount: exists ? 0 : 1,
    observedShare: exists ? 1 : 0,
    sampleObserved: exists ? [repoDisplayPath(artifactPath)] : [],
    sampleMissing: exists ? [] : [repoDisplayPath(artifactPath)],
    samplePartial: semanticReasons.slice(0, 12),
    reasons: !exists ? ["artifact_missing"] : stale ? ["artifact_stale"] : semanticReasons,
  };
}

async function artifactGlobCheck(input: {
  check: Extract<DataProductCheck, { type: "artifact_glob" }>;
  artifactRoot: string;
  releaseMonth: string;
  historyStartMonth: string;
  runId: string;
  gtfsRunId: string | null;
}): Promise<DataProductCheckAudit> {
  const rootPath = resolveTemplate(input.check.rootTemplate, {
    artifactRoot: input.artifactRoot,
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    runId: input.runId,
    gtfsRunId: input.gtfsRunId,
  });
  const pattern = resolveTemplate(input.check.pattern, {
    artifactRoot: input.artifactRoot,
    releaseMonth: input.releaseMonth,
    historyStartMonth: input.historyStartMonth,
    runId: input.runId,
    gtfsRunId: input.gtfsRunId,
  });
  const observedPaths: string[] = [];
  if (existsSync(rootPath)) {
    const glob = new Glob(pattern);
    for await (const path of glob.scan({ cwd: rootPath, onlyFiles: true, dot: false })) {
      observedPaths.push(path);
      if (observedPaths.length >= input.check.minFiles) break;
    }
  }
  observedPaths.sort();
  const observedCount = observedPaths.length;
  const expectedCount = input.check.minFiles;
  const missingCount = Math.max(expectedCount - observedCount, 0);
  const status: DataProductCompletenessStatus =
    observedCount === 0 && expectedCount > 0
      ? "missing"
      : observedCount < expectedCount
        ? "partial"
        : "complete";
  const rootDisplayPath = repoDisplayPath(rootPath);

  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: null,
    path: `${rootDisplayPath}/${pattern}`,
    expectedCount,
    observedCount,
    missingCount,
    observedShare: expectedCount === 0 ? 1 : Math.min(observedCount / expectedCount, 1),
    sampleObserved: observedPaths.slice(0, 12).map((path) => `${rootDisplayPath}/${path}`),
    sampleMissing: status === "complete" ? [] : [`${rootDisplayPath}/${pattern}`],
    samplePartial: status === "partial" ? [`files:${observedCount}`] : [],
    reasons:
      status === "complete"
        ? []
        : !existsSync(rootPath)
          ? ["artifact_root_missing"]
          : [`below_min_files:${observedCount}/${expectedCount}`],
  };
}

async function evaluateCheck(input: {
  product: DataProduct;
  check: DataProductCheck;
  sqlite: Database;
  routeUniverses: RouteUniverseSets;
  months: readonly string[];
  releaseMonth: string;
  historyStartMonth: string;
  artifactRoot: string;
  runId: string;
  gtfsRunId: string | null;
  generatedAt: string;
}): Promise<DataProductCheckAudit> {
  switch (input.check.type) {
    case "month_table_coverage":
      return monthTableCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        months: input.months,
      });
    case "table_route_coverage":
      return tableRouteCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        routeUniverses: input.routeUniverses,
        releaseMonth: input.releaseMonth,
        runId: input.runId,
      });
    case "table_row_count":
      return tableRowCountCheck({
        sqlite: input.sqlite,
        check: input.check,
      });
    case "source_year_route_coverage":
      return sourceYearRouteCoverageCheck({
        sqlite: input.sqlite,
        check: input.check,
        routeUniverses: input.routeUniverses,
        months: input.months,
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        historyStartMonth: input.historyStartMonth,
        runId: input.runId,
        gtfsRunId: input.gtfsRunId,
      });
    case "route_artifact_coverage":
      return routeArtifactCoverageCheck({
        check: input.check,
        routeUniverses: input.routeUniverses,
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        historyStartMonth: input.historyStartMonth,
        runId: input.runId,
        gtfsRunId: input.gtfsRunId,
      });
    case "score_vector_routes":
      return scoreVectorRoutesCheck({
        check: input.check,
        routeUniverses: input.routeUniverses,
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        historyStartMonth: input.historyStartMonth,
        runId: input.runId,
        gtfsRunId: input.gtfsRunId,
      });
    case "json_artifact":
    case "file_artifact":
      return jsonArtifactCheck({
        product: input.product,
        check: input.check,
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        historyStartMonth: input.historyStartMonth,
        runId: input.runId,
        gtfsRunId: input.gtfsRunId,
        generatedAt: input.generatedAt,
      });
    case "artifact_glob":
      return artifactGlobCheck({
        check: input.check,
        artifactRoot: input.artifactRoot,
        releaseMonth: input.releaseMonth,
        historyStartMonth: input.historyStartMonth,
        runId: input.runId,
        gtfsRunId: input.gtfsRunId,
      });
  }
}

function productStatus(
  product: DataProduct,
  checks: readonly DataProductCheckAudit[],
): DataProductCompletenessStatus {
  if (product.lifecycle.status !== "expected") return product.lifecycle.status;
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.every((check) => check.status === "missing")) return "missing";
  if (checks.some((check) => check.status === "missing" || check.status === "partial")) {
    return "partial";
  }
  if (checks.some((check) => check.status === "stale")) return "stale";
  return "complete";
}

function productReasons(product: DataProduct, checks: readonly DataProductCheckAudit[]): string[] {
  if (product.lifecycle.status !== "expected") {
    return product.lifecycle.reason === undefined
      ? [`lifecycle_${product.lifecycle.status}`]
      : [`lifecycle_${product.lifecycle.status}:${product.lifecycle.reason}`];
  }
  return checks.flatMap((check) => check.reasons.map((reason) => `${check.checkId}:${reason}`));
}

function statusCounts(products: readonly DataProductCompletenessProductAudit[]) {
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [`${status}ProductCount`, 0]),
  ) as Record<`${DataProductCompletenessStatus}ProductCount`, number>;
  for (const product of products) {
    counts[`${product.status}ProductCount`] += 1;
  }
  return counts;
}

export async function buildDataProductCompletenessAudit(
  input: BuildDataProductCompletenessAuditInput,
): Promise<DataProductCompletenessAudit> {
  const manifest = input.manifest ?? DATA_PRODUCT_MANIFEST;
  const gtfsRunId = input.gtfsRunId ?? latestGtfsRunId(input.sqlite);
  const months = requestedMonths(input.historyStartMonth, input.releaseMonth);
  const routeUniverses = buildRouteUniverses({
    sqlite: input.sqlite,
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    gtfsRunId,
  });

  const products: DataProductCompletenessProductAudit[] = [];
  for (const product of manifest.products) {
    const checks = await Promise.all(
      product.checks.map((check) =>
        evaluateCheck({
          product,
          check,
          sqlite: input.sqlite,
          routeUniverses,
          months,
          releaseMonth: input.releaseMonth,
          historyStartMonth: input.historyStartMonth,
          artifactRoot: input.artifactRoot,
          runId: input.runId,
          gtfsRunId,
          generatedAt: input.generatedAt,
        }),
      ),
    );
    const status = productStatus(product, checks);
    products.push({
      productId: product.id,
      label: product.label,
      kind: product.kind,
      owner: product.owner,
      grain: product.grain,
      producerCommand: product.producerCommand,
      expectedUniverse: product.expectedUniverse,
      requiredInputs: product.requiredInputs,
      downstreamConsumers: product.downstreamConsumers,
      freshnessPolicy: product.freshnessPolicy,
      lifecycle: product.lifecycle,
      status,
      checks,
      reasons: productReasons(product, checks),
    });
  }

  const downstreamBlockers = products
    .filter((product) => product.status !== "complete" && product.status !== "waived")
    .map((product) => ({
      productId: product.productId,
      status: product.status,
      downstreamConsumers: product.downstreamConsumers,
      reasons: product.reasons,
    }));

  return {
    artifactKind: "data_product_completeness",
    generatedAt: input.generatedAt,
    dbPath: input.dbPath === null ? null : repoDisplayPath(input.dbPath),
    artifactPath: repoDisplayPath(input.artifactPath),
    manifestVersion: manifest.version,
    releaseMonth: input.releaseMonth,
    runId: input.runId,
    gtfsRunId,
    historyWindow: {
      startMonth: input.historyStartMonth,
      endMonth: input.releaseMonth,
      monthCount: months.length,
    },
    routeUniverses: routeUniverseSummary(routeUniverses),
    summary: {
      productCount: products.length,
      checkCount: products.reduce((sum, product) => sum + product.checks.length, 0),
      ...statusCounts(products),
      downstreamBlockedProductCount: downstreamBlockers.length,
    },
    products,
    downstreamBlockers,
    nextActions:
      downstreamBlockers.length === 0
        ? ["No derived data-product completeness blockers found for the audited scope."]
        : downstreamBlockers.map(
            (blocker) =>
              `Resolve or explicitly waive ${blocker.productId} (${blocker.status}) before relying on ${blocker.downstreamConsumers.join(", ")}.`,
          ),
  };
}

export function dataProductCompletenessPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
  runId: string;
}): string {
  return join(
    input.artifactRoot,
    "data-product-completeness",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.runId,
    "completeness.json",
  );
}

const productSummarySchema = z.object({
  productId: z.string(),
  label: z.string(),
  kind: z.string(),
  status: z.enum(["complete", "partial", "missing", "stale", "waived", "blocked", "fetching"]),
  downstreamConsumers: z.array(z.string()),
  reasons: z.array(z.string()),
});

export default defineCommand({
  path: ["audit", "data-product-completeness"],
  summary: "Audit derived data-product completeness from the pipeline-v2 registry.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026).describe("Release calendar year"),
      month: arg.positiveInt().default(3).describe("Release calendar month, 1-12"),
      historyStartMonth: z
        .string()
        .default("2023-04")
        .describe("Start month for historical data-product coverage"),
      runId: z.string().optional().describe("Observed GTFS-RT/import run id"),
      gtfsRunId: z.string().optional().describe("GTFS static staging run id"),
      manifest: z.string().optional().describe("Optional JSON/YAML data-product manifest path"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for completeness JSON"),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    historyStartMonth: z.string(),
    runId: z.string(),
    gtfsRunId: z.string().nullable(),
    outputPath: z.string(),
    productCount: z.number().int().nonnegative(),
    completeProductCount: z.number().int().nonnegative(),
    partialProductCount: z.number().int().nonnegative(),
    missingProductCount: z.number().int().nonnegative(),
    staleProductCount: z.number().int().nonnegative(),
    waivedProductCount: z.number().int().nonnegative(),
    blockedProductCount: z.number().int().nonnegative(),
    fetchingProductCount: z.number().int().nonnegative(),
    downstreamBlockedProductCount: z.number().int().nonnegative(),
    products: z.array(productSummarySchema),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const historyStartMonth = input.options.historyStartMonth;
    const runId = input.options.runId ?? `bus-observatory-${releaseMonth}`;
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? dataProductCompletenessPath({
            artifactRoot,
            historyStartMonth,
            releaseMonth,
            runId,
          })
        : fromCliPath(input.options.output);
    const manifest =
      input.options.manifest === undefined
        ? DATA_PRODUCT_MANIFEST
        : parseDataProductManifestText(await Bun.file(fromCliPath(input.options.manifest)).text());
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: DataProductCompletenessAudit;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      audit = await buildDataProductCompletenessAudit({
        sqlite,
        manifest,
        releaseMonth,
        historyStartMonth,
        runId,
        gtfsRunId: input.options.gtfsRunId ?? null,
        artifactRoot,
        generatedAt: new Date().toISOString(),
        dbPath,
        artifactPath: outputPath,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      releaseMonth,
      historyStartMonth,
      runId,
      gtfsRunId: audit.gtfsRunId,
      outputPath: repoDisplayPath(outputPath),
      productCount: audit.summary.productCount,
      completeProductCount: audit.summary.completeProductCount,
      partialProductCount: audit.summary.partialProductCount,
      missingProductCount: audit.summary.missingProductCount,
      staleProductCount: audit.summary.staleProductCount,
      waivedProductCount: audit.summary.waivedProductCount,
      blockedProductCount: audit.summary.blockedProductCount,
      fetchingProductCount: audit.summary.fetchingProductCount,
      downstreamBlockedProductCount: audit.summary.downstreamBlockedProductCount,
      products: audit.products.map((product) => ({
        productId: product.productId,
        label: product.label,
        kind: product.kind,
        status: product.status,
        downstreamConsumers: product.downstreamConsumers,
        reasons: product.reasons,
      })),
    };
  },
});
