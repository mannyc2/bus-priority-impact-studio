import { percentile, percentileRank } from "../concentration.js";
import { HEADWAY_RELIABILITY_EWT_DETECTOR_ID } from "../findings/headway-reliability-ewt.js";

export type EwtRouteMonthReliabilityRow = {
  routeId: string;
  month: string;
  runId: string;
  reliabilityStatus: string;
  sampleCount: number;
  stopCount: number;
  directionCount: number;
  averageObservedHeadwayMinutes: number | null;
  expectedWaitMinutes: number | null;
  scheduledExpectedWaitMinutes: number | null;
  excessWaitMinutes: number | null;
  mtaAbstMinutes: number | null;
  waitReliabilityRatio: number | null;
};

export type EwtScoreBasis =
  | "mta_abst_customer_journey_metric"
  | "observed_regularity_excess_wait"
  | "schedule_excess_wait";

type UsableEwtRouteMonthRow = EwtRouteMonthReliabilityRow & {
  scoreExcessWaitMinutes: number;
  scoreBasis: EwtScoreBasis;
};

export type EwtDistributionSummary = {
  count: number;
  min: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
};

export type EwtScoreVectorEntry = {
  scopeId: string;
  routeId: string;
  month: string;
  runId: string;
  sampleCount: number;
  stopCount: number;
  directionCount: number;
  scoreExcessWaitMinutes: number;
  mtaAbstMinutes: number | null;
  scheduleExcessWaitMinutes: number | null;
  scoreBasis: EwtScoreBasis;
  waitReliabilityRatio: number | null;
  fleetHistoricalPercentile: number | null;
  routeHistoricalPercentile: number | null;
  score: number | null;
  flagged: boolean;
};

export type EwtRouteBaseline = {
  routeId: string;
  baselineMonthCount: number;
  distribution: EwtDistributionSummary;
  releaseMonth: {
    month: string;
    scoreExcessWaitMinutes: number | null;
    mtaAbstMinutes: number | null;
    scheduleExcessWaitMinutes: number | null;
    fleetHistoricalPercentile: number | null;
    routeHistoricalPercentile: number | null;
    flagged: boolean;
  };
};

export type EwtRouteMonthScoreVectorArtifact = {
  artifactKind: "ewt_route_month_score_vectors";
  detectorId: typeof HEADWAY_RELIABILITY_EWT_DETECTOR_ID;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  releaseMonth: string;
  window: {
    startMonth: string;
    endMonth: string;
    monthCount: number;
    minSampleCount: number;
  };
  source: {
    tableName: string;
    grain: "route_month";
    caveat: string;
  };
  thresholds: {
    fleetFlagQuantile: number;
    fleetFlagCutoffScoreExcessWaitMinutes: number | null;
  };
  summary: {
    rawRowCount: number;
    usableRowCount: number;
    baselineUsableRowCount: number;
    excludedRowCount: number;
    routeCount: number;
    usableMonthCount: number;
    baselineMonthCount: number;
    releaseUsableRouteCount: number;
    releaseFlaggedRouteCount: number;
    scoreBasisCounts: Record<EwtScoreBasis, number>;
  };
  baselines: {
    fleetHistoricalWindow: EwtDistributionSummary;
    releaseMonth: EwtDistributionSummary;
    routes: EwtRouteBaseline[];
  };
  scoreVectors: {
    historicalWindow: EwtScoreVectorEntry[];
    releaseMonth: EwtScoreVectorEntry[];
  };
  excludedRowsByReason: Record<string, number>;
};

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseIsoMonth(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) throw new Error(`Invalid ISO month: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid ISO month: ${month}`);
  }
  return { year, month: monthNumber };
}

function compareIsoMonth(left: string, right: string): number {
  return left.localeCompare(right);
}

function isoMonthCount(startMonth: string, endMonth: string): number {
  const start = parseIsoMonth(startMonth);
  const end = parseIsoMonth(endMonth);
  const count = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  if (count <= 0) throw new Error(`Invalid month range ${startMonth}..${endMonth}`);
  return count;
}

export function summarizeEwtDistribution(values: readonly number[]): EwtDistributionSummary {
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
      max: null,
      mean: null,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    count: sorted.length,
    min: round(sorted[0] ?? 0, 4),
    p50: round(percentile(sorted, 0.5), 4),
    p75: round(percentile(sorted, 0.75), 4),
    p90: round(percentile(sorted, 0.9), 4),
    p95: round(percentile(sorted, 0.95), 4),
    max: round(sorted[sorted.length - 1] ?? 0, 4),
    mean: round(mean, 4),
  };
}

function exclusionReason(row: EwtRouteMonthReliabilityRow, minSampleCount: number): string | null {
  if (row.reliabilityStatus !== "observed") return "not_observed";
  if (row.sampleCount < minSampleCount) return "insufficient_samples";
  if (scoreValue(row) === null) {
    return "missing_score_wait_metric";
  }
  return null;
}

function scoreValue(
  row: EwtRouteMonthReliabilityRow,
): { value: number; basis: EwtScoreBasis } | null {
  if (row.mtaAbstMinutes !== null && Number.isFinite(row.mtaAbstMinutes)) {
    return {
      value: row.mtaAbstMinutes,
      basis: "mta_abst_customer_journey_metric",
    };
  }
  if (
    row.expectedWaitMinutes !== null &&
    row.averageObservedHeadwayMinutes !== null &&
    row.averageObservedHeadwayMinutes > 0
  ) {
    return {
      value: row.expectedWaitMinutes - row.averageObservedHeadwayMinutes / 2,
      basis: "observed_regularity_excess_wait",
    };
  }
  if (row.excessWaitMinutes !== null && Number.isFinite(row.excessWaitMinutes)) {
    return { value: row.excessWaitMinutes, basis: "schedule_excess_wait" };
  }
  return null;
}

function groupByRoute(
  rows: readonly UsableEwtRouteMonthRow[],
): Map<string, UsableEwtRouteMonthRow[]> {
  const output = new Map<string, UsableEwtRouteMonthRow[]>();
  for (const row of rows) {
    const routeRows = output.get(row.routeId) ?? [];
    routeRows.push(row);
    output.set(row.routeId, routeRows);
  }
  return output;
}

function buildEntry(input: {
  row: UsableEwtRouteMonthRow;
  fleetHistoricalValues: readonly number[];
  routeHistoricalValues: readonly number[];
  flagCutoff: number | null;
}): EwtScoreVectorEntry {
  const fleetHistoricalPercentile =
    input.fleetHistoricalValues.length === 0
      ? null
      : percentileRank(input.row.scoreExcessWaitMinutes, input.fleetHistoricalValues);
  const routeHistoricalPercentile =
    input.routeHistoricalValues.length === 0
      ? null
      : percentileRank(input.row.scoreExcessWaitMinutes, input.routeHistoricalValues);
  return {
    scopeId: `${input.row.routeId}:${input.row.month}`,
    routeId: input.row.routeId,
    month: input.row.month,
    runId: input.row.runId,
    sampleCount: input.row.sampleCount,
    stopCount: input.row.stopCount,
    directionCount: input.row.directionCount,
    scoreExcessWaitMinutes: round(input.row.scoreExcessWaitMinutes, 4),
    mtaAbstMinutes: input.row.mtaAbstMinutes === null ? null : round(input.row.mtaAbstMinutes, 4),
    scheduleExcessWaitMinutes:
      input.row.excessWaitMinutes === null ? null : round(input.row.excessWaitMinutes, 4),
    scoreBasis: input.row.scoreBasis,
    waitReliabilityRatio:
      input.row.waitReliabilityRatio === null ? null : round(input.row.waitReliabilityRatio, 4),
    fleetHistoricalPercentile:
      fleetHistoricalPercentile === null ? null : round(fleetHistoricalPercentile, 4),
    routeHistoricalPercentile:
      routeHistoricalPercentile === null ? null : round(routeHistoricalPercentile, 4),
    score: fleetHistoricalPercentile === null ? null : round(fleetHistoricalPercentile * 100, 2),
    flagged: input.flagCutoff !== null && input.row.scoreExcessWaitMinutes >= input.flagCutoff,
  };
}

export function buildEwtRouteMonthScoreVectorArtifact(input: {
  rows: readonly EwtRouteMonthReliabilityRow[];
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
  generatedAt: string;
  dbPath: string | null;
  artifactPath: string;
  minSampleCount: number;
  fleetFlagQuantile: number;
}): EwtRouteMonthScoreVectorArtifact {
  const monthCount = isoMonthCount(input.startMonth, input.endMonth);
  if (
    compareIsoMonth(input.releaseMonth, input.startMonth) < 0 ||
    compareIsoMonth(input.releaseMonth, input.endMonth) > 0
  ) {
    throw new Error(
      `Release month ${input.releaseMonth} must be inside ${input.startMonth}..${input.endMonth}`,
    );
  }

  const excludedRowsByReason: Record<string, number> = {};
  const usableRows = input.rows.flatMap((row): UsableEwtRouteMonthRow[] => {
    const reason = exclusionReason(row, input.minSampleCount);
    if (reason !== null) {
      excludedRowsByReason[reason] = (excludedRowsByReason[reason] ?? 0) + 1;
      return [];
    }
    const score = scoreValue(row);
    if (score === null) return [];
    return [{ ...row, scoreExcessWaitMinutes: score.value, scoreBasis: score.basis }];
  });
  const baselineRows = usableRows.filter(
    (row) => compareIsoMonth(row.month, input.releaseMonth) < 0,
  );
  const releaseRows = usableRows.filter((row) => row.month === input.releaseMonth);
  const fleetHistoricalValues = baselineRows.map((row) => row.scoreExcessWaitMinutes);
  const flagCutoff =
    fleetHistoricalValues.length === 0
      ? null
      : percentile(fleetHistoricalValues, input.fleetFlagQuantile);
  const baselineRowsByRoute = groupByRoute(baselineRows);

  const historicalWindow = usableRows
    .map((row) =>
      buildEntry({
        row,
        fleetHistoricalValues,
        routeHistoricalValues:
          baselineRowsByRoute
            .get(row.routeId)
            ?.map((routeRow) => routeRow.scoreExcessWaitMinutes) ?? [],
        flagCutoff,
      }),
    )
    .sort(
      (left, right) =>
        left.month.localeCompare(right.month) || left.routeId.localeCompare(right.routeId),
    );
  const releaseMonth = historicalWindow.filter((entry) => entry.month === input.releaseMonth);

  const routeIds = [...new Set(usableRows.map((row) => row.routeId))].sort((left, right) =>
    left.localeCompare(right),
  );
  const routeBaselines = routeIds.map((routeId) => {
    const routeBaselineRows = baselineRowsByRoute.get(routeId) ?? [];
    const routeValues = routeBaselineRows.map((row) => row.scoreExcessWaitMinutes);
    const release = releaseMonth.find((entry) => entry.routeId === routeId);
    return {
      routeId,
      baselineMonthCount: routeBaselineRows.length,
      distribution: summarizeEwtDistribution(routeValues),
      releaseMonth: {
        month: input.releaseMonth,
        scoreExcessWaitMinutes: release?.scoreExcessWaitMinutes ?? null,
        mtaAbstMinutes: release?.mtaAbstMinutes ?? null,
        scheduleExcessWaitMinutes: release?.scheduleExcessWaitMinutes ?? null,
        fleetHistoricalPercentile: release?.fleetHistoricalPercentile ?? null,
        routeHistoricalPercentile: release?.routeHistoricalPercentile ?? null,
        flagged: release?.flagged ?? false,
      },
    };
  });

  return {
    artifactKind: "ewt_route_month_score_vectors",
    detectorId: HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    artifactPath: input.artifactPath,
    releaseMonth: input.releaseMonth,
    window: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      monthCount,
      minSampleCount: input.minSampleCount,
    },
    source: {
      tableName: "local_route_observed_reliability_summary+local_bus_customer_journey_metric",
      grain: "route_month",
      caveat:
        "Calibration artifact over route-month observed reliability summaries joined to MTA Customer Journey-Focused Metrics when available. The preferred score basis is MTA Additional Bus Stop Time (ABST), an official route-month-period aggregate sometimes described as Excess Wait Time and customer-weighted here across periods. ABST is schedule-relative but is not a substitute for raw stop-direction-hour schedule-derived EWT; observed-regularity excess wait remains a fallback for route-months without ABST.",
    },
    thresholds: {
      fleetFlagQuantile: input.fleetFlagQuantile,
      fleetFlagCutoffScoreExcessWaitMinutes: flagCutoff === null ? null : round(flagCutoff, 4),
    },
    summary: {
      rawRowCount: input.rows.length,
      usableRowCount: usableRows.length,
      baselineUsableRowCount: baselineRows.length,
      excludedRowCount: input.rows.length - usableRows.length,
      routeCount: routeIds.length,
      usableMonthCount: new Set(usableRows.map((row) => row.month)).size,
      baselineMonthCount: new Set(baselineRows.map((row) => row.month)).size,
      releaseUsableRouteCount: releaseMonth.length,
      releaseFlaggedRouteCount: releaseMonth.filter((entry) => entry.flagged).length,
      scoreBasisCounts: {
        mta_abst_customer_journey_metric: usableRows.filter(
          (row) => row.scoreBasis === "mta_abst_customer_journey_metric",
        ).length,
        observed_regularity_excess_wait: usableRows.filter(
          (row) => row.scoreBasis === "observed_regularity_excess_wait",
        ).length,
        schedule_excess_wait: usableRows.filter((row) => row.scoreBasis === "schedule_excess_wait")
          .length,
      },
    },
    baselines: {
      fleetHistoricalWindow: summarizeEwtDistribution(fleetHistoricalValues),
      releaseMonth: summarizeEwtDistribution(releaseRows.map((row) => row.scoreExcessWaitMinutes)),
      routes: routeBaselines,
    },
    scoreVectors: {
      historicalWindow,
      releaseMonth,
    },
    excludedRowsByReason,
  };
}
