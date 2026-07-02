import type { Database, SQLQueryBindings } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import type {
  DataProduct,
  DataProductCheck,
  DataProductCheckAudit,
  DataProductCompletenessStatus,
} from "@bp/analytics/data-products";
import { dataProductJsonSemanticReasons } from "@bp/analytics/data-products";
import { Glob } from "bun";
import type { DataProductRouteUniverseSets } from "./data-product-route-universes";

type RouteRow = {
  route_id?: unknown;
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

export type DataProductCheckTemplateValues = {
  readonly repoRoot: string;
  readonly artifactRoot: string;
  readonly releaseMonth: string;
  readonly historyStartMonth: string;
  readonly runId: string;
  readonly gtfsRunId: string | null;
  readonly routeId?: string;
};

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

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { present?: unknown } | null;
  return row !== null;
}

function routeSetFromRows(rows: readonly RouteRow[]): Set<string> {
  return new Set(
    rows
      .map((row) => routeIdValue(row.route_id))
      .filter((routeId): routeId is string => routeId !== null)
      .sort(),
  );
}

function routeSetFromQuery(
  sqlite: Database,
  tableName: string,
  sql: string,
  params: SQLQueryBindings[] = [],
): Set<string> {
  if (!tableExists(sqlite, tableName)) return new Set();
  return routeSetFromRows(sqlite.query(sql).all(...params) as RouteRow[]);
}

function sortedRoutes(routes: ReadonlySet<string>): string[] {
  return [...routes].sort();
}

function uniqueValues<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function routeArtifactRouteIdCandidates(routeId: string): string[] {
  const lowerRouteId = routeId.toLowerCase();
  const routeSlug = lowerRouteId
    .replace(/\+/gu, "-sbs")
    .replace(/[^a-z0-9-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return uniqueValues([routeId, lowerRouteId, routeSlug]);
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

function sourceYearsForMonths(months: readonly string[]): number[] {
  return [...new Set(months.map((month) => parseIsoMonthParts(month).year))].sort(
    (left, right) => left - right,
  );
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
  check: Extract<DataProductCheck, { type: "table_route_coverage" | "route_artifact_coverage" }>;
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
    path: input.path ?? null,
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

export function resolveDataProductCheckTemplate(
  template: string,
  input: DataProductCheckTemplateValues,
): string {
  return template
    .replaceAll("{repoRoot}", input.repoRoot)
    .replaceAll("{artifactRoot}", input.artifactRoot)
    .replaceAll("{releaseMonth}", input.releaseMonth)
    .replaceAll("{historyStartMonth}", input.historyStartMonth)
    .replaceAll("{runId}", input.runId)
    .replaceAll("{gtfsRunId}", input.gtfsRunId ?? "")
    .replaceAll("{routeId}", input.routeId ?? "");
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
  // biome-ignore lint/complexity/useLiteralKeys: index-signature access is required here.
  const sourceYearRouteReconciliation = asJsonObject(root["sourceYearRouteReconciliation"]);
  // biome-ignore lint/complexity/useLiteralKeys: index-signature access is required here.
  const nestedRouteYears = sourceYearRouteReconciliation["routeYears"];
  // biome-ignore lint/complexity/useLiteralKeys: index-signature access is required here.
  const rootRouteYears = root["routeYears"];
  const candidates = nestedRouteYears !== undefined ? nestedRouteYears : rootRouteYears;
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
  templateValues: DataProductCheckTemplateValues;
  displayPath: (path: string) => string;
}): Promise<{ path: string | null; keys: Set<string>; sample: string[] }> {
  if (input.pathTemplate === undefined) return { path: null, keys: new Set(), sample: [] };
  const path = resolveDataProductCheckTemplate(input.pathTemplate, input.templateValues);
  if (!existsSync(path)) return { path: input.displayPath(path), keys: new Set(), sample: [] };
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
  return { path: input.displayPath(path), keys, sample };
}

export function evaluateDataProductMonthTableCoverageCheck(input: {
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

export function evaluateDataProductTableRouteCoverageCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "table_route_coverage" }>;
  routeUniverses: DataProductRouteUniverseSets;
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

export async function evaluateDataProductSourceYearRouteCoverageCheck(input: {
  sqlite: Database;
  check: Extract<DataProductCheck, { type: "source_year_route_coverage" }>;
  routeUniverses: DataProductRouteUniverseSets;
  months: readonly string[];
  templateValues: DataProductCheckTemplateValues;
  displayPath?: (path: string) => string;
}): Promise<DataProductCheckAudit> {
  const displayPath = input.displayPath ?? ((path: string) => path);
  const expectedRoutes = sortedRoutes(input.routeUniverses[input.check.expectedRoutes]);
  const sourceYears = sourceYearsForMonths(input.months);
  const expectedKeys = sourceYears.flatMap((sourceYear) =>
    expectedRoutes.map((routeId) => `${sourceYear}:${routeId}`),
  );
  const waivers = await sourceYearRouteWaiverKeys({
    pathTemplate: input.check.waiverArtifactPathTemplate,
    templateValues: input.templateValues,
    displayPath,
  });
  if (!tableExists(input.sqlite, input.check.tableName)) {
    return {
      checkId: input.check.id,
      label: input.check.label,
      type: input.check.type,
      status: "missing",
      tableName: input.check.tableName,
      path: waivers.path,
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
    input.check.statusTableName !== undefined &&
    tableExists(input.sqlite, input.check.statusTableName)
      ? input.check.statusTableName
      : null;
  const statusByKey = new Map<string, { status: string | null; rowCount: number }>();
  if (statusTable !== null) {
    const statusSourceYearColumn =
      input.check.statusSourceYearColumn ?? input.check.sourceYearColumn;
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
      if (status !== undefined && status.status !== null)
        statusOnly.push(`${key}:${status.status}`);
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
    path: waivers.path,
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

export async function evaluateDataProductRouteArtifactCoverageCheck(input: {
  check: Extract<DataProductCheck, { type: "route_artifact_coverage" }>;
  routeUniverses: DataProductRouteUniverseSets;
  templateValues: DataProductCheckTemplateValues;
  displayPath?: (path: string) => string;
}): Promise<DataProductCheckAudit> {
  const displayPath = input.displayPath ?? ((path: string) => path);
  const expectedRoutes = input.routeUniverses[input.check.expectedRoutes];
  const observedRoutes = new Set<string>();
  for (const routeId of expectedRoutes) {
    const routeIdCandidates = routeArtifactRouteIdCandidates(routeId);
    if (
      routeIdCandidates.some((candidate) =>
        existsSync(
          resolveDataProductCheckTemplate(input.check.pathTemplate, {
            ...input.templateValues,
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
    path: displayPath(
      resolveDataProductCheckTemplate(input.check.pathTemplate, {
        ...input.templateValues,
        routeId: "{routeId}",
      }),
    ),
  });
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

export async function evaluateDataProductJsonOrFileArtifactCheck(input: {
  product: DataProduct;
  check: Extract<DataProductCheck, { type: "json_artifact" | "file_artifact" }>;
  templateValues: DataProductCheckTemplateValues;
  generatedAt: string;
  displayPath?: (path: string) => string;
}): Promise<DataProductCheckAudit> {
  const displayPath = input.displayPath ?? ((path: string) => path);
  const artifactPath = resolveDataProductCheckTemplate(
    input.check.pathTemplate,
    input.templateValues,
  );
  const exists = existsSync(artifactPath);
  const stale =
    exists &&
    isStaleArtifact(artifactPath, input.generatedAt, input.product.freshnessPolicy.staleAfterDays);
  let semanticReasons: string[] = [];
  if (exists && !stale && input.check.type === "json_artifact") {
    try {
      semanticReasons = dataProductJsonSemanticReasons({
        value: await Bun.file(artifactPath).json(),
        check: input.check,
        releaseMonth: input.templateValues.releaseMonth,
        runId: input.templateValues.runId,
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
  const displayArtifactPath = displayPath(artifactPath);
  return {
    checkId: input.check.id,
    label: input.check.label,
    type: input.check.type,
    status,
    tableName: null,
    path: displayArtifactPath,
    expectedCount: 1,
    observedCount: exists ? 1 : 0,
    missingCount: exists ? 0 : 1,
    observedShare: exists ? 1 : 0,
    sampleObserved: exists ? [displayArtifactPath] : [],
    sampleMissing: exists ? [] : [displayArtifactPath],
    samplePartial: semanticReasons.slice(0, 12),
    reasons: !exists ? ["artifact_missing"] : stale ? ["artifact_stale"] : semanticReasons,
  };
}

export async function evaluateDataProductArtifactGlobCheck(input: {
  check: Extract<DataProductCheck, { type: "artifact_glob" }>;
  templateValues: DataProductCheckTemplateValues;
  displayPath?: (path: string) => string;
}): Promise<DataProductCheckAudit> {
  const displayPath = input.displayPath ?? ((path: string) => path);
  const rootPath = resolveDataProductCheckTemplate(input.check.rootTemplate, input.templateValues);
  const pattern = resolveDataProductCheckTemplate(input.check.pattern, input.templateValues);
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
  const rootDisplayPath = displayPath(rootPath);

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

export function evaluateDataProductTableRowCountCheck(input: {
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
