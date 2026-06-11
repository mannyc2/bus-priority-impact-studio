import type { Database } from "bun:sqlite";
import type { BackfillValidationSurfaceId } from "@bp/analytics/calibration";
import type {
  AnalyticsBackfillCoverageAudit,
  SurfaceMonthCoverage,
} from "../evaluation/analytics-backfill-coverage";
import {
  detectorReadinessRegistryProductId,
  type PolicySurfaceCoverageSummary,
} from "../evaluation/analytics-detector-readiness";

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

export type AnalyticsDetectorReadinessDirectSurfaceCoverageQuery = {
  readonly sqlite: Database;
  readonly backfillCoverage: AnalyticsBackfillCoverageAudit;
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

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: unknown } | null;
  return row?.name === tableName;
}

function median(values: readonly number[]): number {
  return values[Math.floor(values.length / 2)] ?? 0;
}

function summarizeCoverage(input: {
  config: DirectSurfaceConfig;
  months: readonly SurfaceMonthCoverage[];
  label?: string;
  tableName?: string;
  registryProductId?: string;
}): PolicySurfaceCoverageSummary {
  const presentRows = input.months.filter((row) => row.rowCount > 0);
  const rowCounts = presentRows.map((row) => row.rowCount).sort((left, right) => left - right);
  const routeCounts = presentRows.map((row) => row.routeCount).sort((left, right) => left - right);
  return {
    surfaceId: input.config.surfaceId,
    registryProductId:
      input.registryProductId ?? detectorReadinessRegistryProductId(input.config.surfaceId),
    label: input.label ?? input.config.label,
    tableName: input.tableName ?? input.config.tableName,
    expectedMonthCount: input.months.length,
    presentMonthCount: input.months.filter((row) => row.status === "present").length,
    thinMonthCount: input.months.filter((row) => row.status === "thin").length,
    missingMonthCount: input.months.filter((row) => row.status === "missing").length,
    medianRowsPerPresentMonth: median(rowCounts),
    medianRoutesPerPresentMonth: median(routeCounts),
    thresholds: {
      minRowCount: input.config.minRowCount,
      minRouteCount: input.config.minRouteCount,
      suspiciousRowDropRatio: 0,
      suspiciousRouteDropRatio: 0,
    },
    missingMonths: input.months.filter((row) => row.status === "missing").map((row) => row.month),
    thinMonths: input.months.filter((row) => row.status === "thin").map((row) => row.month),
    months: [...input.months],
  };
}

function missingTableCoverage(
  config: DirectSurfaceConfig,
  months: readonly string[],
): PolicySurfaceCoverageSummary {
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
  return summarizeCoverage({ config, months: coverageMonths });
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

  return summarizeCoverage({
    config,
    months: coverageMonths,
    label: "Source-year schedule stop rows",
    tableName: "local_route_schedule_stop",
    registryProductId: "local_route_schedule_stop_source_backfill",
  });
}

function directSurfaceCoverage(input: {
  sqlite: Database;
  config: DirectSurfaceConfig;
  months: readonly string[];
}): PolicySurfaceCoverageSummary {
  if (
    input.config.surfaceId === "gtfs_schedule_runtime" &&
    tableExists(input.sqlite, "local_route_schedule_stop")
  ) {
    return scheduleStopSourceYearCoverage(input.sqlite, input.config, input.months);
  }
  if (!tableExists(input.sqlite, input.config.tableName)) {
    return missingTableCoverage(input.config, input.months);
  }

  const rows = input.sqlite.query(input.config.sql).all() as RawSurfaceRow[];
  const observedByMonth = new Map<string, { rowCount: number; routeCount: number }>();
  for (const row of rows) {
    const month = stringValue(row.month);
    if (month === null) continue;
    observedByMonth.set(month, {
      rowCount: numberValue(row.sample_count ?? row.row_count),
      routeCount: numberValue(row.route_count),
    });
  }

  const coverageMonths = input.months.map((month): SurfaceMonthCoverage => {
    const row = observedByMonth.get(month);
    const reasons: string[] = [];
    if (row === undefined || row.rowCount === 0) {
      reasons.push("missing_month");
    } else {
      if (row.rowCount < input.config.minRowCount) reasons.push("below_min_row_count");
      if (row.routeCount < input.config.minRouteCount) reasons.push("below_min_route_count");
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

  return summarizeCoverage({ config: input.config, months: coverageMonths });
}

export function loadAnalyticsDetectorReadinessDirectSurfaceCoverage(
  input: AnalyticsDetectorReadinessDirectSurfaceCoverageQuery,
): PolicySurfaceCoverageSummary[] {
  const months = input.backfillCoverage.surfaces[0]?.months.map((month) => month.month) ?? [];
  return DIRECT_SURFACES.map((config) =>
    directSurfaceCoverage({ sqlite: input.sqlite, config, months }),
  );
}
