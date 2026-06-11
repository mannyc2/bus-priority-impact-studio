export type BackfillSurfaceId =
  | "route_segment_speed"
  | "route_hourly_ridership"
  | "intervention_comparisons";

type BackfillSurfacePolicy = {
  surfaceId: BackfillSurfaceId;
  label: string;
  tableName: string;
  minRowCount: number;
  minRouteCount: number;
  suspiciousRowDropRatio: number;
  suspiciousRouteDropRatio: number;
};

export type AnalyticsBackfillObservedMonthRow = {
  month: string;
  rowCount: number;
  routeCount: number;
  evaluatedCount: number | null;
};

export type AnalyticsBackfillSurfaceRows = {
  surfaceId: BackfillSurfaceId;
  rows: readonly AnalyticsBackfillObservedMonthRow[];
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

export type BuildAnalyticsBackfillCoverageAuditInput = {
  surfaceRows: readonly AnalyticsBackfillSurfaceRows[];
  startMonth: string;
  endMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
};

const BACKFILL_SURFACE_POLICIES: readonly BackfillSurfacePolicy[] = [
  {
    surfaceId: "route_segment_speed",
    label: "Route segment speeds",
    tableName: "local_route_segment_speed",
    minRowCount: 100_000,
    minRouteCount: 250,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.75,
  },
  {
    surfaceId: "route_hourly_ridership",
    label: "Route hourly ridership",
    tableName: "local_route_hourly_ridership",
    minRowCount: 30_000,
    minRouteCount: 250,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.75,
  },
  {
    surfaceId: "intervention_comparisons",
    label: "Intervention comparisons",
    tableName: "local_route_intervention_comparison",
    minRowCount: 50,
    minRouteCount: 25,
    suspiciousRowDropRatio: 0.5,
    suspiciousRouteDropRatio: 0.5,
  },
];

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
  const months: string[] = [];
  for (let year = start.year, month = start.month; ; ) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year === end.year && month === end.month) return months;
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    if (year > end.year || (year === end.year && month > end.month)) return months;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const high = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return high;
  return ((sorted[mid - 1] ?? high) + high) / 2;
}

function monthReasons(input: {
  row: AnalyticsBackfillObservedMonthRow | undefined;
  policy: BackfillSurfacePolicy;
  medianRows: number;
  medianRoutes: number;
}): string[] {
  if (input.row === undefined || input.row.rowCount === 0) return ["missing_month"];
  const reasons: string[] = [];
  if (input.row.rowCount < input.policy.minRowCount) reasons.push("below_min_row_count");
  if (input.row.routeCount < input.policy.minRouteCount) reasons.push("below_min_route_count");
  if (
    input.medianRows > 0 &&
    input.row.rowCount < input.medianRows * input.policy.suspiciousRowDropRatio
  ) {
    reasons.push("suspicious_row_count_drop");
  }
  if (
    input.medianRoutes > 0 &&
    input.row.routeCount < input.medianRoutes * input.policy.suspiciousRouteDropRatio
  ) {
    reasons.push("suspicious_route_count_drop");
  }
  return reasons;
}

export function buildAnalyticsBackfillCoverageAudit(
  input: BuildAnalyticsBackfillCoverageAuditInput,
): AnalyticsBackfillCoverageAudit {
  const months = requestedMonths(input.startMonth, input.endMonth);
  const rowsBySurface = new Map(
    input.surfaceRows.map((surface) => [surface.surfaceId, surface.rows]),
  );
  const surfaces = BACKFILL_SURFACE_POLICIES.map((policy): SurfaceCoverageSummary => {
    const observedByMonth = new Map(
      (rowsBySurface.get(policy.surfaceId) ?? []).map((row) => [row.month, row]),
    );
    const presentRows = [...observedByMonth.values()].filter((row) => months.includes(row.month));
    const medianRows = median(presentRows.map((row) => row.rowCount).filter((count) => count > 0));
    const medianRoutes = median(
      presentRows.map((row) => row.routeCount).filter((count) => count > 0),
    );
    const coverageMonths = months.map((month): SurfaceMonthCoverage => {
      const row = observedByMonth.get(month);
      const reasons = monthReasons({ row, policy, medianRows, medianRoutes });
      return {
        month,
        status:
          reasons.length === 0 ? "present" : reasons.includes("missing_month") ? "missing" : "thin",
        rowCount: row?.rowCount ?? 0,
        routeCount: row?.routeCount ?? 0,
        evaluatedCount: row?.evaluatedCount ?? null,
        reasons,
      };
    });

    return {
      surfaceId: policy.surfaceId,
      label: policy.label,
      tableName: policy.tableName,
      expectedMonthCount: months.length,
      presentMonthCount: coverageMonths.filter((row) => row.status === "present").length,
      thinMonthCount: coverageMonths.filter((row) => row.status === "thin").length,
      missingMonthCount: coverageMonths.filter((row) => row.status === "missing").length,
      medianRowsPerPresentMonth: medianRows,
      medianRoutesPerPresentMonth: medianRoutes,
      thresholds: {
        minRowCount: policy.minRowCount,
        minRouteCount: policy.minRouteCount,
        suspiciousRowDropRatio: policy.suspiciousRowDropRatio,
        suspiciousRouteDropRatio: policy.suspiciousRouteDropRatio,
      },
      missingMonths: coverageMonths
        .filter((row) => row.status === "missing")
        .map((row) => row.month),
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
