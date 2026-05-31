import type { Database } from "bun:sqlite";
import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth, monthRange } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

export type BackfillSurfaceId =
  | "route_segment_speed"
  | "route_hourly_ridership"
  | "intervention_comparisons";

type BackfillSurfaceConfig = {
  surfaceId: BackfillSurfaceId;
  label: string;
  tableName: string;
  sql: string;
  minRowCount: number;
  minRouteCount: number;
  suspiciousRowDropRatio: number;
  suspiciousRouteDropRatio: number;
};

type RawSurfaceRow = {
  month: unknown;
  row_count: unknown;
  route_count: unknown;
  evaluated_count?: unknown;
};

export type SurfaceMonthCoverage = {
  month: string;
  status: "missing" | "thin" | "present";
  rowCount: number;
  routeCount: number;
  evaluatedCount: number | null;
  reasons: string[];
};

export type SurfaceCoverageSummary = {
  surfaceId: BackfillSurfaceId;
  label: string;
  tableName: string;
  expectedMonthCount: number;
  presentMonthCount: number;
  thinMonthCount: number;
  missingMonthCount: number;
  medianRowsPerPresentMonth: number;
  medianRoutesPerPresentMonth: number;
  thresholds: {
    minRowCount: number;
    minRouteCount: number;
    suspiciousRowDropRatio: number;
    suspiciousRouteDropRatio: number;
  };
  missingMonths: string[];
  thinMonths: string[];
  months: SurfaceMonthCoverage[];
};

export type AnalyticsBackfillCoverageAudit = {
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  window: {
    startMonth: string;
    endMonth: string;
    monthCount: number;
  };
  summary: {
    surfaceCount: number;
    totalExpectedSurfaceMonths: number;
    presentSurfaceMonths: number;
    thinSurfaceMonths: number;
    missingSurfaceMonths: number;
    readySurfaceCount: number;
    blockedSurfaceCount: number;
  };
  surfaces: SurfaceCoverageSummary[];
  nextActions: string[];
};

const BACKFILL_SURFACES: readonly BackfillSurfaceConfig[] = [
  {
    surfaceId: "route_segment_speed",
    label: "Route segment speeds",
    tableName: "local_route_segment_speed",
    sql: `
      SELECT month, COUNT(*) AS row_count, COUNT(DISTINCT route_id) AS route_count, NULL AS evaluated_count
      FROM local_route_segment_speed
      GROUP BY month
    `,
    minRowCount: 100_000,
    minRouteCount: 250,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.75,
  },
  {
    surfaceId: "route_hourly_ridership",
    label: "Route hourly ridership",
    tableName: "local_route_hourly_ridership",
    sql: `
      SELECT month, COUNT(*) AS row_count, COUNT(DISTINCT route_id) AS route_count, NULL AS evaluated_count
      FROM local_route_hourly_ridership
      GROUP BY month
    `,
    minRowCount: 30_000,
    minRouteCount: 250,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.75,
  },
  {
    surfaceId: "intervention_comparisons",
    label: "Intervention comparisons",
    tableName: "local_route_intervention_comparison",
    sql: `
      SELECT
        month,
        COUNT(*) AS row_count,
        COUNT(DISTINCT route_id) AS route_count,
        SUM(CASE WHEN comparison_status = 'evaluated' THEN 1 ELSE 0 END) AS evaluated_count
      FROM local_route_intervention_comparison
      GROUP BY month
    `,
    minRowCount: 50,
    minRouteCount: 25,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.5,
  },
];

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
  return monthRange(start.year, start.month, end.year, end.month).map((m) => m.isoMonth);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const high = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return high;
  return ((sorted[mid - 1] ?? high) + high) / 2;
}

function surfaceRowsByMonth(
  sqlite: Database,
  config: BackfillSurfaceConfig,
): Map<string, Omit<SurfaceMonthCoverage, "status" | "reasons">> {
  const rows = sqlite.query(config.sql).all() as RawSurfaceRow[];
  const output = new Map<string, Omit<SurfaceMonthCoverage, "status" | "reasons">>();
  for (const row of rows) {
    const month = textValue(row.month);
    if (month === null) continue;
    output.set(month, {
      month,
      rowCount: numberValue(row.row_count),
      routeCount: numberValue(row.route_count),
      evaluatedCount:
        row.evaluated_count === undefined || row.evaluated_count === null
          ? null
          : numberValue(row.evaluated_count),
    });
  }
  return output;
}

function monthReasons(input: {
  row: Omit<SurfaceMonthCoverage, "status" | "reasons"> | undefined;
  config: BackfillSurfaceConfig;
  medianRows: number;
  medianRoutes: number;
}): string[] {
  if (input.row === undefined || input.row.rowCount === 0) return ["missing_month"];
  const reasons: string[] = [];
  if (input.row.rowCount < input.config.minRowCount) reasons.push("below_min_row_count");
  if (input.row.routeCount < input.config.minRouteCount) reasons.push("below_min_route_count");
  if (
    input.medianRows > 0 &&
    input.row.rowCount < input.medianRows * input.config.suspiciousRowDropRatio
  ) {
    reasons.push("suspicious_row_count_drop");
  }
  if (
    input.medianRoutes > 0 &&
    input.row.routeCount < input.medianRoutes * input.config.suspiciousRouteDropRatio
  ) {
    reasons.push("suspicious_route_count_drop");
  }
  return reasons;
}

export function buildAnalyticsBackfillCoverageAudit(input: {
  sqlite: Database;
  startMonth: string;
  endMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
}): AnalyticsBackfillCoverageAudit {
  const months = requestedMonths(input.startMonth, input.endMonth);
  const surfaces = BACKFILL_SURFACES.map((config): SurfaceCoverageSummary => {
    const observedByMonth = surfaceRowsByMonth(input.sqlite, config);
    const presentRows = [...observedByMonth.values()].filter((row) =>
      months.includes(row.month),
    );
    const medianRows = median(presentRows.map((row) => row.rowCount).filter((count) => count > 0));
    const medianRoutes = median(
      presentRows.map((row) => row.routeCount).filter((count) => count > 0),
    );
    const coverageMonths = months.map((month): SurfaceMonthCoverage => {
      const row = observedByMonth.get(month);
      const reasons = monthReasons({ row, config, medianRows, medianRoutes });
      return {
        month,
        status: reasons.length === 0 ? "present" : reasons.includes("missing_month") ? "missing" : "thin",
        rowCount: row?.rowCount ?? 0,
        routeCount: row?.routeCount ?? 0,
        evaluatedCount: row?.evaluatedCount ?? null,
        reasons,
      };
    });

    return {
      surfaceId: config.surfaceId,
      label: config.label,
      tableName: config.tableName,
      expectedMonthCount: months.length,
      presentMonthCount: coverageMonths.filter((row) => row.status === "present").length,
      thinMonthCount: coverageMonths.filter((row) => row.status === "thin").length,
      missingMonthCount: coverageMonths.filter((row) => row.status === "missing").length,
      medianRowsPerPresentMonth: medianRows,
      medianRoutesPerPresentMonth: medianRoutes,
      thresholds: {
        minRowCount: config.minRowCount,
        minRouteCount: config.minRouteCount,
        suspiciousRowDropRatio: config.suspiciousRowDropRatio,
        suspiciousRouteDropRatio: config.suspiciousRouteDropRatio,
      },
      missingMonths: coverageMonths.filter((row) => row.status === "missing").map((row) => row.month),
      thinMonths: coverageMonths.filter((row) => row.status === "thin").map((row) => row.month),
      months: coverageMonths,
    };
  });

  const totalExpectedSurfaceMonths = surfaces.reduce(
    (sum, surface) => sum + surface.expectedMonthCount,
    0,
  );
  const presentSurfaceMonths = surfaces.reduce(
    (sum, surface) => sum + surface.presentMonthCount,
    0,
  );
  const thinSurfaceMonths = surfaces.reduce((sum, surface) => sum + surface.thinMonthCount, 0);
  const missingSurfaceMonths = surfaces.reduce(
    (sum, surface) => sum + surface.missingMonthCount,
    0,
  );
  const blockedSurfaces = surfaces.filter(
    (surface) => surface.thinMonthCount > 0 || surface.missingMonthCount > 0,
  );

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    window: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      monthCount: months.length,
    },
    summary: {
      surfaceCount: surfaces.length,
      totalExpectedSurfaceMonths,
      presentSurfaceMonths,
      thinSurfaceMonths,
      missingSurfaceMonths,
      readySurfaceCount: surfaces.length - blockedSurfaces.length,
      blockedSurfaceCount: blockedSurfaces.length,
    },
    surfaces,
    nextActions:
      blockedSurfaces.length === 0
        ? [
            "Regenerate audit analytics-corpus-profile.",
            "Promote fine-grain route segment speed and hourly ridership to historical baseline inputs.",
            "Materialize detector score vectors over the completed window.",
          ]
        : blockedSurfaces.map(
            (surface) =>
              `Backfill or explain ${surface.surfaceId}: ${surface.missingMonthCount} missing month(s), ${surface.thinMonthCount} thin month(s).`,
          ),
  };
}

export function analyticsBackfillCoveragePath(
  artifactRoot: string,
  startMonth: string,
  endMonth: string,
): string {
  return join(artifactRoot, "analytics-backfill-coverage", `${startMonth}_to_${endMonth}`, "coverage.json");
}

export default defineCommand({
  path: ["audit", "analytics-backfill-coverage"],
  summary: "Audit historical coverage for release-only analytics backfill surfaces.",
  input: {
    options: dbOptions.extend({
      startYear: arg.positiveInt().default(2023).describe("Start year"),
      startMonth: arg.positiveInt().default(4).describe("Start month, 1-12"),
      endYear: arg.positiveInt().default(2026).describe("End year"),
      endMonth: arg.positiveInt().default(3).describe("End month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for coverage JSON"),
    }),
  },
  output: z.object({
    startMonth: z.string(),
    endMonth: z.string(),
    outputPath: z.string(),
    surfaceCount: z.number().int().nonnegative(),
    totalExpectedSurfaceMonths: z.number().int().nonnegative(),
    presentSurfaceMonths: z.number().int().nonnegative(),
    thinSurfaceMonths: z.number().int().nonnegative(),
    missingSurfaceMonths: z.number().int().nonnegative(),
    readySurfaceCount: z.number().int().nonnegative(),
    blockedSurfaceCount: z.number().int().nonnegative(),
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
        ? analyticsBackfillCoveragePath(artifactRoot, startMonth, endMonth)
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new BunDatabase(dbPath, { readonly: true });

    let audit: AnalyticsBackfillCoverageAudit;
    try {
      audit = buildAnalyticsBackfillCoverageAudit({
        sqlite,
        startMonth,
        endMonth,
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
      startMonth,
      endMonth,
      outputPath,
      surfaceCount: audit.summary.surfaceCount,
      totalExpectedSurfaceMonths: audit.summary.totalExpectedSurfaceMonths,
      presentSurfaceMonths: audit.summary.presentSurfaceMonths,
      thinSurfaceMonths: audit.summary.thinSurfaceMonths,
      missingSurfaceMonths: audit.summary.missingSurfaceMonths,
      readySurfaceCount: audit.summary.readySurfaceCount,
      blockedSurfaceCount: audit.summary.blockedSurfaceCount,
    };
  },
});
