import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  type BackfillValidationSurfaceId,
  type DetectorCalibrationPolicy,
  type DetectorPostBackfillValidationExpectation,
  getCalibrationWindowConfig,
  listDetectorCalibrationPolicies,
} from "@bp/analytics/calibration";
import { listAnalyticsDetectors } from "@bp/analytics/registry";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";
import {
  type AnalyticsBackfillCoverageAudit,
  analyticsBackfillCoveragePath,
  buildAnalyticsBackfillCoverageAudit,
  type SurfaceCoverageSummary,
  type SurfaceMonthCoverage,
} from "./analytics-backfill-coverage.ts";

type DetectorReadinessStatus = "ready" | "partial" | "blocked" | "policy_pending";

type DirectSurfaceConfig = {
  surfaceId: BackfillValidationSurfaceId;
  label: string;
  tableName: string;
  sql: string;
  minRowCount: number;
  minRouteCount: number;
};

type RawSurfaceRow = {
  month: unknown;
  row_count: unknown;
  route_count: unknown;
  sample_count?: unknown;
};

type SourceYearSurfaceRow = {
  source_year: unknown;
  row_count: unknown;
  route_count: unknown;
};

type PolicySurfaceCoverageSummary = Omit<SurfaceCoverageSummary, "surfaceId"> & {
  surfaceId: BackfillValidationSurfaceId;
};

export type DetectorSurfaceReadiness = {
  surfaceId: BackfillValidationSurfaceId;
  label: string;
  tableName: string;
  required: boolean;
  status: DetectorReadinessStatus;
  presentMonthCount: number;
  usableMonthCount: number;
  thinMonthCount: number;
  missingMonthCount: number;
  minimumCompleteMonths: number;
  missingMonths: string[];
  thinMonths: string[];
  failureState: string;
  expectation: string;
  reasons: string[];
};

export type DetectorReadinessSummary = {
  detectorId: string;
  detectorName: string;
  status: DetectorReadinessStatus;
  releaseOutputWindow: string;
  baselineWindowIds: string[];
  minimumCompleteMonths: number;
  requiredSurfaceIds: BackfillValidationSurfaceId[];
  optionalSurfaceIds: BackfillValidationSurfaceId[];
  requirements: DetectorSurfaceReadiness[];
  blockingReasons: string[];
  nextActions: string[];
};

export type AnalyticsDetectorReadinessAudit = {
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  coverageArtifactPath: string;
  window: AnalyticsBackfillCoverageAudit["window"];
  summary: {
    detectorCount: number;
    readyDetectorCount: number;
    partialDetectorCount: number;
    blockedDetectorCount: number;
    policyPendingDetectorCount: number;
    requiredSurfaceCount: number;
    readyRequiredSurfaceCount: number;
    partialRequiredSurfaceCount: number;
    blockedRequiredSurfaceCount: number;
  };
  detectors: DetectorReadinessSummary[];
  surfaceCoverage: PolicySurfaceCoverageSummary[];
};

const DIRECT_SURFACES: readonly DirectSurfaceConfig[] = [
  {
    surfaceId: "observed_headways",
    label: "Observed reliability/headway summaries",
    tableName: "local_route_observed_reliability_summary",
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count,
        SUM(sample_count) AS sample_count
      FROM local_route_observed_reliability_summary
      GROUP BY month
    `,
    minRowCount: 250,
    minRouteCount: 250,
  },
  {
    surfaceId: "bus_wait_assessment",
    label: "Bus Wait Assessment route-period rows",
    tableName: "local_bus_wait_assessment",
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count
      FROM local_bus_wait_assessment
      GROUP BY month
    `,
    minRowCount: 250,
    minRouteCount: 250,
  },
  {
    surfaceId: "gtfs_schedule_runtime",
    label: "GTFS schedule timepoints",
    tableName: "local_route_schedule_timepoint",
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count,
        COUNT(*) AS sample_count
      FROM local_route_schedule_timepoint
      GROUP BY month
    `,
    minRowCount: 10_000,
    minRouteCount: 250,
  },
  {
    surfaceId: "dot_permit_route_touches",
    label: "DOT permit route-touch bridge rows",
    tableName: "local_context_event_route_touch",
    sql: `
      SELECT
        substr(occurred_at, 1, 7) AS month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count
      FROM local_context_event_route_touch
      WHERE event_kind = 'permit'
      GROUP BY substr(occurred_at, 1, 7)
    `,
    minRowCount: 25,
    minRouteCount: 1,
  },
  {
    surfaceId: "service_request_route_touches",
    label: "311 service-request route-touch bridge rows",
    tableName: "local_context_event_route_touch",
    sql: `
      SELECT
        substr(occurred_at, 1, 7) AS month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count
      FROM local_context_event_route_touch
      WHERE event_kind = '311_complaint'
      GROUP BY substr(occurred_at, 1, 7)
    `,
    minRowCount: 25,
    minRouteCount: 1,
  },
];

const BACKFILL_SURFACE_TO_POLICY_SURFACE: ReadonlyMap<string, BackfillValidationSurfaceId> =
  new Map([
    ["route_segment_speed", "route_segment_speeds"],
    ["route_hourly_ridership", "route_hourly_ridership"],
    ["intervention_comparisons", "intervention_comparisons"],
  ]);

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: unknown } | null;
  return row?.name === tableName;
}

function directSurfaceCoverage(
  sqlite: Database,
  config: DirectSurfaceConfig,
  backfillCoverage: AnalyticsBackfillCoverageAudit,
): PolicySurfaceCoverageSummary {
  const months = backfillCoverage.surfaces[0]?.months.map((month) => month.month) ?? [];
  if (
    config.surfaceId === "gtfs_schedule_runtime" &&
    tableExists(sqlite, "local_route_schedule_stop")
  ) {
    return scheduleStopSourceYearCoverage(sqlite, config, months);
  }
  if (!tableExists(sqlite, config.tableName)) {
    const coverageMonths = months.map(
      (month): SurfaceMonthCoverage => ({
        month,
        status: "missing",
        rowCount: 0,
        routeCount: 0,
        evaluatedCount: null,
        reasons: ["surface_table_missing"],
      }),
    );
    return {
      surfaceId: config.surfaceId,
      label: config.label,
      tableName: config.tableName,
      expectedMonthCount: months.length,
      presentMonthCount: 0,
      thinMonthCount: 0,
      missingMonthCount: coverageMonths.length,
      medianRowsPerPresentMonth: 0,
      medianRoutesPerPresentMonth: 0,
      thresholds: {
        minRowCount: config.minRowCount,
        minRouteCount: config.minRouteCount,
        suspiciousRowDropRatio: 0,
        suspiciousRouteDropRatio: 0,
      },
      missingMonths: coverageMonths.map((row) => row.month),
      thinMonths: [],
      months: coverageMonths,
    };
  }

  const rows = sqlite.query(config.sql).all() as RawSurfaceRow[];
  const observedByMonth = new Map<string, { rowCount: number; routeCount: number }>();
  for (const row of rows) {
    const month = stringValue(row.month);
    if (month === null) continue;
    observedByMonth.set(month, {
      rowCount: numberValue(row.sample_count ?? row.row_count),
      routeCount: numberValue(row.route_count),
    });
  }

  const coverageMonths = months.map((month): SurfaceMonthCoverage => {
    const row = observedByMonth.get(month);
    const reasons: string[] = [];
    if (row === undefined || row.rowCount === 0) {
      reasons.push("missing_month");
    } else {
      if (row.rowCount < config.minRowCount) reasons.push("below_min_row_count");
      if (row.routeCount < config.minRouteCount) reasons.push("below_min_route_count");
    }
    return {
      month,
      status:
        reasons.length === 0 ? "present" : reasons.includes("missing_month") ? "missing" : "thin",
      rowCount: row?.rowCount ?? 0,
      routeCount: row?.routeCount ?? 0,
      evaluatedCount: null,
      reasons,
    };
  });

  const presentRows = coverageMonths.filter((row) => row.rowCount > 0);
  const rowCounts = presentRows.map((row) => row.rowCount).sort((left, right) => left - right);
  const routeCounts = presentRows.map((row) => row.routeCount).sort((left, right) => left - right);
  const median = (values: readonly number[]) => values[Math.floor(values.length / 2)] ?? 0;

  return {
    surfaceId: config.surfaceId,
    label: config.label,
    tableName: config.tableName,
    expectedMonthCount: months.length,
    presentMonthCount: coverageMonths.filter((row) => row.status === "present").length,
    thinMonthCount: coverageMonths.filter((row) => row.status === "thin").length,
    missingMonthCount: coverageMonths.filter((row) => row.status === "missing").length,
    medianRowsPerPresentMonth: median(rowCounts),
    medianRoutesPerPresentMonth: median(routeCounts),
    thresholds: {
      minRowCount: config.minRowCount,
      minRouteCount: config.minRouteCount,
      suspiciousRowDropRatio: 0,
      suspiciousRouteDropRatio: 0,
    },
    missingMonths: coverageMonths.filter((row) => row.status === "missing").map((row) => row.month),
    thinMonths: coverageMonths.filter((row) => row.status === "thin").map((row) => row.month),
    months: coverageMonths,
  };
}

function sourceYearForMonth(month: string): number | null {
  const sourceYear = Number(month.slice(0, 4));
  return Number.isInteger(sourceYear) ? sourceYear : null;
}

function scheduleStopSourceYearCoverage(
  sqlite: Database,
  config: DirectSurfaceConfig,
  months: readonly string[],
): PolicySurfaceCoverageSummary {
  const sourceYears = Array.from(
    new Set(months.map(sourceYearForMonth).filter((year): year is number => year !== null)),
  );
  const whereClause =
    sourceYears.length === 0
      ? ""
      : `WHERE source_year IN (${sourceYears.map(() => "?").join(", ")})`;
  const rows = sqlite
    .query(
      `
        SELECT
          source_year,
          COUNT(*) AS row_count,
          COUNT(DISTINCT route_id) AS route_count
        FROM local_route_schedule_stop
        ${whereClause}
        GROUP BY source_year
      `,
    )
    .all(...sourceYears) as SourceYearSurfaceRow[];
  const observedBySourceYear = new Map<number, { rowCount: number; routeCount: number }>();
  for (const row of rows) {
    const sourceYear = numberValue(row.source_year);
    if (!Number.isInteger(sourceYear) || sourceYear <= 0) continue;
    observedBySourceYear.set(sourceYear, {
      rowCount: numberValue(row.row_count),
      routeCount: numberValue(row.route_count),
    });
  }

  const coverageMonths = months.map((month): SurfaceMonthCoverage => {
    const sourceYear = sourceYearForMonth(month);
    const row = sourceYear === null ? undefined : observedBySourceYear.get(sourceYear);
    const reasons: string[] = [];
    if (sourceYear === null || row === undefined || row.rowCount === 0) {
      reasons.push("missing_source_year");
    } else {
      if (row.rowCount < config.minRowCount) reasons.push("below_min_row_count");
      if (row.routeCount < config.minRouteCount) reasons.push("below_min_route_count");
    }
    return {
      month,
      status:
        reasons.length === 0
          ? "present"
          : reasons.includes("missing_source_year")
            ? "missing"
            : "thin",
      rowCount: row?.rowCount ?? 0,
      routeCount: row?.routeCount ?? 0,
      evaluatedCount: null,
      reasons,
    };
  });

  const presentRows = coverageMonths.filter((row) => row.rowCount > 0);
  const rowCounts = presentRows.map((row) => row.rowCount).sort((left, right) => left - right);
  const routeCounts = presentRows.map((row) => row.routeCount).sort((left, right) => left - right);
  const median = (values: readonly number[]) => values[Math.floor(values.length / 2)] ?? 0;

  return {
    surfaceId: config.surfaceId,
    label: "Source-year schedule stop rows",
    tableName: "local_route_schedule_stop",
    expectedMonthCount: months.length,
    presentMonthCount: coverageMonths.filter((row) => row.status === "present").length,
    thinMonthCount: coverageMonths.filter((row) => row.status === "thin").length,
    missingMonthCount: coverageMonths.filter((row) => row.status === "missing").length,
    medianRowsPerPresentMonth: median(rowCounts),
    medianRoutesPerPresentMonth: median(routeCounts),
    thresholds: {
      minRowCount: config.minRowCount,
      minRouteCount: config.minRouteCount,
      suspiciousRowDropRatio: 0,
      suspiciousRouteDropRatio: 0,
    },
    missingMonths: coverageMonths.filter((row) => row.status === "missing").map((row) => row.month),
    thinMonths: coverageMonths.filter((row) => row.status === "thin").map((row) => row.month),
    months: coverageMonths,
  };
}

function policySurfaceCoverage(
  backfillCoverage: AnalyticsBackfillCoverageAudit,
  directCoverage: readonly PolicySurfaceCoverageSummary[],
): PolicySurfaceCoverageSummary[] {
  const backfillSurfaces = backfillCoverage.surfaces.map((surface) => {
    const policySurfaceId = BACKFILL_SURFACE_TO_POLICY_SURFACE.get(surface.surfaceId);
    return {
      ...surface,
      surfaceId: policySurfaceId ?? (surface.surfaceId as BackfillValidationSurfaceId),
    };
  });
  return [...backfillSurfaces, ...directCoverage];
}

function maximumMinimumCompleteMonths(policy: DetectorCalibrationPolicy): number {
  const gateMinimum = Math.max(
    0,
    ...policy.minimumHistoryGates.map((gate) => gate.minimumCompleteMonths),
  );
  const windowMinimum = Math.max(
    0,
    ...policy.baselineWindowIds.map(
      (windowId) => getCalibrationWindowConfig(windowId)?.minimumCompleteMonths ?? 0,
    ),
  );
  return Math.max(gateMinimum, windowMinimum, 1);
}

function surfaceReadiness(input: {
  expectation: DetectorPostBackfillValidationExpectation;
  surface: PolicySurfaceCoverageSummary | undefined;
  minimumCompleteMonths: number;
}): DetectorSurfaceReadiness {
  if (input.surface === undefined) {
    return {
      surfaceId: input.expectation.surfaceId,
      label: input.expectation.surfaceId,
      tableName: "",
      required: input.expectation.required,
      status: input.expectation.required ? "blocked" : "partial",
      presentMonthCount: 0,
      usableMonthCount: 0,
      thinMonthCount: 0,
      missingMonthCount: 0,
      minimumCompleteMonths: input.minimumCompleteMonths,
      missingMonths: [],
      thinMonths: [],
      failureState: input.expectation.failureState,
      expectation: input.expectation.expectation,
      reasons: ["surface_not_audited"],
    };
  }

  const usableMonthCount = input.surface.presentMonthCount;
  const hasFullWindow = input.surface.missingMonthCount === 0 && input.surface.thinMonthCount === 0;
  const passesMinimum = usableMonthCount >= input.minimumCompleteMonths;
  const status: DetectorReadinessStatus = !passesMinimum
    ? "blocked"
    : hasFullWindow
      ? "ready"
      : "partial";

  const reasons: string[] = [];
  if (!passesMinimum) reasons.push("below_minimum_complete_months");
  if (input.surface.missingMonthCount > 0) reasons.push("missing_months");
  if (input.surface.thinMonthCount > 0) reasons.push("thin_months");

  return {
    surfaceId: input.expectation.surfaceId,
    label: input.surface.label,
    tableName: input.surface.tableName,
    required: input.expectation.required,
    status,
    presentMonthCount: input.surface.presentMonthCount,
    usableMonthCount,
    thinMonthCount: input.surface.thinMonthCount,
    missingMonthCount: input.surface.missingMonthCount,
    minimumCompleteMonths: input.minimumCompleteMonths,
    missingMonths: input.surface.missingMonths,
    thinMonths: input.surface.thinMonths,
    failureState: input.expectation.failureState,
    expectation: input.expectation.expectation,
    reasons,
  };
}

function detectorStatus(
  requirements: readonly DetectorSurfaceReadiness[],
): DetectorReadinessStatus {
  const required = requirements.filter((requirement) => requirement.required);
  if (required.some((requirement) => requirement.status === "blocked")) return "blocked";
  if (required.some((requirement) => requirement.status === "partial")) return "partial";
  return "ready";
}

function nextActionsFor(detector: DetectorReadinessSummary): string[] {
  if (detector.status === "policy_pending") {
    return [
      "Add an explicit detector calibration policy or record why historical calibration is not required.",
    ];
  }
  if (detector.status === "ready") {
    return [
      "Materialize baseline snapshots for the declared windows.",
      "Generate historical score vectors and threshold sensitivity summaries.",
    ];
  }
  return detector.requirements
    .filter((requirement) => requirement.required && requirement.status !== "ready")
    .map(
      (requirement) =>
        `${requirement.surfaceId}: ${requirement.failureState} (${requirement.usableMonthCount}/${requirement.minimumCompleteMonths} minimum usable months; ${requirement.missingMonthCount} missing, ${requirement.thinMonthCount} thin).`,
    );
}

function pendingPolicyDetectorSummary(input: {
  detectorId: string;
  detectorName: string;
}): DetectorReadinessSummary {
  const detector: DetectorReadinessSummary = {
    detectorId: input.detectorId,
    detectorName: input.detectorName,
    status: "policy_pending",
    releaseOutputWindow: "policy_pending",
    baselineWindowIds: [],
    minimumCompleteMonths: 0,
    requiredSurfaceIds: [],
    optionalSurfaceIds: [],
    requirements: [],
    blockingReasons: ["calibration_policy_pending"],
    nextActions: [],
  };
  return {
    ...detector,
    nextActions: nextActionsFor(detector),
  };
}

function detectorReadinessFromPolicy(input: {
  policy: DetectorCalibrationPolicy;
  surfaceById: ReadonlyMap<string, PolicySurfaceCoverageSummary>;
}): DetectorReadinessSummary {
  const minimumCompleteMonths = maximumMinimumCompleteMonths(input.policy);
  const requirements = input.policy.postBackfillValidation.map((expectation) =>
    surfaceReadiness({
      expectation,
      surface: input.surfaceById.get(expectation.surfaceId),
      minimumCompleteMonths,
    }),
  );
  const status = detectorStatus(requirements);
  const blockingReasons = requirements
    .filter((requirement) => requirement.required && requirement.status === "blocked")
    .flatMap((requirement) =>
      requirement.reasons.map((reason) => `${requirement.surfaceId}:${reason}`),
    );
  const detector: DetectorReadinessSummary = {
    detectorId: input.policy.detectorId,
    detectorName: input.policy.detectorName,
    status,
    releaseOutputWindow: input.policy.releaseOutputWindow,
    baselineWindowIds: [...input.policy.baselineWindowIds],
    minimumCompleteMonths,
    requiredSurfaceIds: input.policy.postBackfillValidation
      .filter((expectation) => expectation.required)
      .map((expectation) => expectation.surfaceId),
    optionalSurfaceIds: input.policy.postBackfillValidation
      .filter((expectation) => !expectation.required)
      .map((expectation) => expectation.surfaceId),
    requirements,
    blockingReasons,
    nextActions: [],
  };
  return {
    ...detector,
    nextActions: nextActionsFor(detector),
  };
}

export function buildAnalyticsDetectorReadinessAudit(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  coverageArtifactPath: string;
}): AnalyticsDetectorReadinessAudit {
  const backfillCoverage = buildAnalyticsBackfillCoverageAudit({
    sqlite: input.sqlite,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.coverageArtifactPath,
  });
  const directCoverage = DIRECT_SURFACES.map((config) =>
    directSurfaceCoverage(input.sqlite, config, backfillCoverage),
  );
  const surfaces = policySurfaceCoverage(backfillCoverage, directCoverage);
  const surfaceById = new Map<string, PolicySurfaceCoverageSummary>(
    surfaces.map((surface) => [surface.surfaceId, surface]),
  );

  const policyByDetectorId = new Map(
    listDetectorCalibrationPolicies().map((policy) => [policy.detectorId, policy]),
  );
  const detectors = listAnalyticsDetectors().map((detector): DetectorReadinessSummary => {
    const policy = policyByDetectorId.get(detector.detectorId);
    if (policy === undefined) {
      return pendingPolicyDetectorSummary({
        detectorId: detector.detectorId,
        detectorName: detector.spec.name,
      });
    }
    return detectorReadinessFromPolicy({ policy, surfaceById });
  });

  const requiredRequirements = detectors.flatMap((detector) =>
    detector.requirements.filter((requirement) => requirement.required),
  );

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    coverageArtifactPath: input.coverageArtifactPath,
    window: backfillCoverage.window,
    summary: {
      detectorCount: detectors.length,
      readyDetectorCount: detectors.filter((detector) => detector.status === "ready").length,
      partialDetectorCount: detectors.filter((detector) => detector.status === "partial").length,
      blockedDetectorCount: detectors.filter((detector) => detector.status === "blocked").length,
      policyPendingDetectorCount: detectors.filter(
        (detector) => detector.status === "policy_pending",
      ).length,
      requiredSurfaceCount: requiredRequirements.length,
      readyRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "ready",
      ).length,
      partialRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "partial",
      ).length,
      blockedRequiredSurfaceCount: requiredRequirements.filter(
        (requirement) => requirement.status === "blocked",
      ).length,
    },
    detectors,
    surfaceCoverage: surfaces,
  };
}

export function analyticsDetectorReadinessPath(
  artifactRoot: string,
  startMonth: string,
  endMonth: string,
): string {
  return join(
    artifactRoot,
    "analytics-detector-readiness",
    `${startMonth}_to_${endMonth}`,
    "readiness.json",
  );
}

export default defineCommand({
  path: ["audit", "analytics-detector-readiness"],
  summary: "Join analytics backfill coverage to detector calibration policies.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for readiness JSON"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    readyDetectorCount: z.number().int().nonnegative(),
    partialDetectorCount: z.number().int().nonnegative(),
    blockedDetectorCount: z.number().int().nonnegative(),
    policyPendingDetectorCount: z.number().int().nonnegative(),
    readyRequiredSurfaceCount: z.number().int().nonnegative(),
    partialRequiredSurfaceCount: z.number().int().nonnegative(),
    blockedRequiredSurfaceCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const startMonth = isoMonth(input.options.startYear, input.options.startMonth);
    const endMonth = isoMonth(input.options.endYear, input.options.endMonth);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? analyticsDetectorReadinessPath(artifactRoot, startMonth, endMonth)
        : fromCliPath(input.options.output);
    const coverageArtifactPath = analyticsBackfillCoveragePath(artifactRoot, startMonth, endMonth);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    sqlite.exec("PRAGMA busy_timeout = 5000");

    let audit: AnalyticsDetectorReadinessAudit;
    try {
      audit = buildAnalyticsDetectorReadinessAudit({
        sqlite,
        startMonth,
        endMonth,
        generatedAt: new Date().toISOString(),
        dbPath: repoDisplayPath(dbPath),
        artifactPath: repoDisplayPath(outputPath),
        coverageArtifactPath: repoDisplayPath(coverageArtifactPath),
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, audit);

    return {
      startMonth,
      endMonth,
      outputPath: repoDisplayPath(outputPath),
      detectorCount: audit.summary.detectorCount,
      readyDetectorCount: audit.summary.readyDetectorCount,
      partialDetectorCount: audit.summary.partialDetectorCount,
      blockedDetectorCount: audit.summary.blockedDetectorCount,
      policyPendingDetectorCount: audit.summary.policyPendingDetectorCount,
      readyRequiredSurfaceCount: audit.summary.readyRequiredSurfaceCount,
      partialRequiredSurfaceCount: audit.summary.partialRequiredSurfaceCount,
      blockedRequiredSurfaceCount: audit.summary.blockedRequiredSurfaceCount,
    };
  },
});
