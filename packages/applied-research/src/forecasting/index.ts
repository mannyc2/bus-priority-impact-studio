import type { ResearchGrain } from "../core/grain";
import type { HistoryWindow, IsoMonthString } from "../core/windows";
import type { SegmentDaypartHistoryRow } from "../local-db/segment-daypart-history-rows";

export type ForecastTargetKind =
  | "travel_time_distribution"
  | "headway_distribution"
  | "segment_speed_distribution";

export type ForecastBacktestDefinition = {
  readonly id: string;
  readonly target: ForecastTargetKind;
  readonly grain: ResearchGrain;
  readonly releaseMonth: IsoMonthString;
  readonly historyWindow: HistoryWindow;
  readonly trainMonths: readonly IsoMonthString[];
  readonly validationMonths: readonly IsoMonthString[];
  readonly baselineModels: readonly string[];
  readonly candidateModels: readonly string[];
};

export type ForecastCalibrationScores = {
  readonly pinballLoss: number | null;
  readonly intervalCoverageError: number | null;
  readonly sharpnessPenalty: number | null;
  readonly driftPenalty: number | null;
};

export type ForecastQualityScore = {
  readonly score: number;
  readonly missingMetrics: readonly (keyof ForecastCalibrationScores)[];
};

export type ForecastValidationGateStatus = "pass" | "warn" | "fail";

export type ForecastValidationGate = {
  readonly gateId: "rolling_backtest" | "calibration_curve" | "distribution_shift_monitor";
  readonly status: ForecastValidationGateStatus;
  readonly reasons: readonly string[];
  readonly metrics: Record<string, number | null>;
};

export type ForecastBacktestMonthSummary = {
  readonly month: string;
  readonly forecastCount: number;
  readonly meanAbsoluteErrorMph: number;
  readonly meanAbsolutePercentageError: number;
  readonly withinTenPercentShare: number;
  readonly residualBiasMph: number;
};

export type ForecastValidationGatesArtifact = {
  readonly artifactKind: "forecast_validation_gates";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly historyWindow: {
    readonly startMonth: string;
    readonly endMonth: string;
  };
  readonly artifactPath: string;
  readonly dbPath: string;
  readonly sourcePanelPath: string | null;
  readonly model: {
    readonly modelId: "naive_segment_daypart_trailing_mean_v1";
    readonly target: "average_speed_mph";
    readonly grain: "route_id + direction + segment_id + daypart + month";
    readonly minObservationCount: number;
    readonly minTrainingMonths: number;
    readonly trailingTrainingMonths: number;
  };
  readonly summary: {
    readonly sourceRowCount: number;
    readonly eligibleRowCount: number;
    readonly forecastCount: number;
    readonly validationMonthCount: number;
    readonly routeCount: number;
    readonly segmentCount: number;
    readonly releaseMonthForecastCount: number;
    readonly meanAbsoluteErrorMph: number | null;
    readonly meanAbsolutePercentageError: number | null;
    readonly withinTenPercentShare: number | null;
    readonly residualBiasMph: number | null;
    readonly releaseMonthMeanAbsolutePercentageError: number | null;
    readonly referenceMeanAbsolutePercentageError: number | null;
    readonly releaseMapeDriftRatio: number | null;
  };
  readonly gates: readonly ForecastValidationGate[];
  readonly monthlyBacktest: readonly ForecastBacktestMonthSummary[];
};

type ForecastAccumulator = {
  forecastCount: number;
  absoluteErrorMph: number;
  absolutePercentageError: number;
  withinTenPercentCount: number;
  residualMph: number;
  routeIds: Set<string>;
  segmentIds: Set<string>;
};

type EligibleForecastRow = {
  readonly routeId: string;
  readonly month: string;
  readonly segmentId: string;
  readonly directionId: string;
  readonly daypart: string;
  readonly speedMph: number;
};

const SCORE_WEIGHTS = {
  pinballLoss: 0.4,
  intervalCoverageError: 0.3,
  sharpnessPenalty: 0.15,
  driftPenalty: 0.15,
} as const satisfies Record<keyof ForecastCalibrationScores, number>;

function boundedMetricScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1000, 1000 * (1 - value)));
}

export function scoreForecastCalibration(input: ForecastCalibrationScores): ForecastQualityScore {
  let weighted = 0;
  let weightSum = 0;
  const missingMetrics: (keyof ForecastCalibrationScores)[] = [];

  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof ForecastCalibrationScores)[]) {
    const value = input[key];
    if (value === null) {
      missingMetrics.push(key);
      continue;
    }
    weighted += boundedMetricScore(value) * SCORE_WEIGHTS[key];
    weightSum += SCORE_WEIGHTS[key];
  }

  return {
    score: weightSum === 0 ? 0 : Math.round(weighted / weightSum),
    missingMetrics,
  };
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function newAccumulator(): ForecastAccumulator {
  return {
    forecastCount: 0,
    absoluteErrorMph: 0,
    absolutePercentageError: 0,
    withinTenPercentCount: 0,
    residualMph: 0,
    routeIds: new Set(),
    segmentIds: new Set(),
  };
}

function addForecast(
  accumulator: ForecastAccumulator,
  forecast: {
    readonly routeId: string;
    readonly segmentId: string;
    readonly actualMph: number;
    readonly predictedMph: number;
  },
): void {
  const residualMph = forecast.actualMph - forecast.predictedMph;
  const absoluteErrorMph = Math.abs(residualMph);
  const absolutePercentageError = absoluteErrorMph / Math.max(Math.abs(forecast.actualMph), 1);
  accumulator.forecastCount += 1;
  accumulator.absoluteErrorMph += absoluteErrorMph;
  accumulator.absolutePercentageError += absolutePercentageError;
  accumulator.residualMph += residualMph;
  if (absolutePercentageError <= 0.1) accumulator.withinTenPercentCount += 1;
  accumulator.routeIds.add(forecast.routeId);
  accumulator.segmentIds.add(forecast.segmentId);
}

function summarizeAccumulator(accumulator: ForecastAccumulator): {
  readonly forecastCount: number;
  readonly meanAbsoluteErrorMph: number | null;
  readonly meanAbsolutePercentageError: number | null;
  readonly withinTenPercentShare: number | null;
  readonly residualBiasMph: number | null;
} {
  if (accumulator.forecastCount === 0) {
    return {
      forecastCount: 0,
      meanAbsoluteErrorMph: null,
      meanAbsolutePercentageError: null,
      withinTenPercentShare: null,
      residualBiasMph: null,
    };
  }
  return {
    forecastCount: accumulator.forecastCount,
    meanAbsoluteErrorMph: round(accumulator.absoluteErrorMph / accumulator.forecastCount),
    meanAbsolutePercentageError: round(
      accumulator.absolutePercentageError / accumulator.forecastCount,
    ),
    withinTenPercentShare: round(accumulator.withinTenPercentCount / accumulator.forecastCount),
    residualBiasMph: round(accumulator.residualMph / accumulator.forecastCount),
  };
}

function eligibleRows(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly minObservationCount: number;
}): EligibleForecastRow[] {
  const rows: EligibleForecastRow[] = [];
  for (const row of input.rows) {
    if (row.month < input.startMonth || row.month > input.endMonth) continue;
    if (row.average_speed_mph === null) continue;
    if (row.observation_count < input.minObservationCount || row.traversal_count <= 0) continue;
    rows.push({
      routeId: row.route_id,
      month: row.month,
      segmentId: row.segment_id,
      directionId: row.direction,
      daypart: row.daypart,
      speedMph: row.average_speed_mph,
    });
  }
  return rows;
}

function rowKey(row: EligibleForecastRow): string {
  return [row.routeId, row.directionId, row.segmentId, row.daypart].join("\0");
}

function gate(input: {
  readonly gateId: ForecastValidationGate["gateId"];
  readonly status: ForecastValidationGateStatus;
  readonly reasons: readonly string[];
  readonly metrics: Record<string, number | null>;
}): ForecastValidationGate {
  return input;
}

export function buildForecastValidationGatesArtifact(input: {
  readonly rows: readonly SegmentDaypartHistoryRow[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
  readonly generatedAt: string;
  readonly dbPath: string;
  readonly artifactPath: string;
  readonly sourcePanelPath?: string | null;
  readonly minObservationCount?: number;
  readonly minTrainingMonths?: number;
  readonly trailingTrainingMonths?: number;
  readonly minimumBacktestForecastCount?: number;
  readonly minimumValidationMonthCount?: number;
  readonly maximumMeanAbsolutePercentageError?: number;
  readonly maximumAbsoluteBiasMph?: number;
  readonly maximumReleaseMapeDriftRatio?: number;
}): ForecastValidationGatesArtifact {
  const minObservationCount = input.minObservationCount ?? 10;
  const minTrainingMonths = input.minTrainingMonths ?? 12;
  const trailingTrainingMonths = input.trailingTrainingMonths ?? 12;
  const minimumBacktestForecastCount = input.minimumBacktestForecastCount ?? 1000;
  const minimumValidationMonthCount = input.minimumValidationMonthCount ?? 6;
  const maximumMeanAbsolutePercentageError = input.maximumMeanAbsolutePercentageError ?? 0.35;
  const maximumAbsoluteBiasMph = input.maximumAbsoluteBiasMph ?? 2;
  const maximumReleaseMapeDriftRatio = input.maximumReleaseMapeDriftRatio ?? 1.5;

  const eligible = eligibleRows({
    rows: input.rows,
    startMonth: input.startMonth,
    endMonth: input.endMonth,
    minObservationCount,
  });
  const byKey = new Map<string, EligibleForecastRow[]>();
  for (const row of eligible) {
    const key = rowKey(row);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const overall = newAccumulator();
  const byMonth = new Map<string, ForecastAccumulator>();
  for (const rows of byKey.values()) {
    const sorted = [...rows].sort((left, right) => left.month.localeCompare(right.month));
    const history: number[] = [];
    for (const row of sorted) {
      if (history.length >= minTrainingMonths) {
        const trainingWindow = history.slice(-trailingTrainingMonths);
        const predictedMph = mean(trainingWindow);
        if (predictedMph !== null) {
          const forecast = {
            routeId: row.routeId,
            segmentId: row.segmentId,
            actualMph: row.speedMph,
            predictedMph,
          };
          addForecast(overall, forecast);
          const monthAccumulator = byMonth.get(row.month) ?? newAccumulator();
          addForecast(monthAccumulator, forecast);
          byMonth.set(row.month, monthAccumulator);
        }
      }
      history.push(row.speedMph);
    }
  }

  const overallSummary = summarizeAccumulator(overall);
  const monthlyBacktest = [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, accumulator]) => {
      const summary = summarizeAccumulator(accumulator);
      return {
        month,
        forecastCount: summary.forecastCount,
        meanAbsoluteErrorMph: summary.meanAbsoluteErrorMph ?? 0,
        meanAbsolutePercentageError: summary.meanAbsolutePercentageError ?? 0,
        withinTenPercentShare: summary.withinTenPercentShare ?? 0,
        residualBiasMph: summary.residualBiasMph ?? 0,
      };
    });
  const releaseMonthSummary = monthlyBacktest.find((row) => row.month === input.releaseMonth);
  const referenceMapeValues = monthlyBacktest
    .filter((row) => row.month < input.releaseMonth)
    .slice(-6)
    .map((row) => row.meanAbsolutePercentageError);
  const referenceMeanAbsolutePercentageError = mean(referenceMapeValues);
  const releaseMonthMeanAbsolutePercentageError =
    releaseMonthSummary?.meanAbsolutePercentageError ?? null;
  const releaseMapeDriftRatio =
    releaseMonthMeanAbsolutePercentageError === null ||
    referenceMeanAbsolutePercentageError === null ||
    referenceMeanAbsolutePercentageError === 0
      ? null
      : round(releaseMonthMeanAbsolutePercentageError / referenceMeanAbsolutePercentageError);

  const rollingBacktestStatus =
    overall.forecastCount === 0
      ? "fail"
      : overall.forecastCount < minimumBacktestForecastCount ||
          monthlyBacktest.length < minimumValidationMonthCount
        ? "warn"
        : "pass";
  const calibrationStatus =
    overallSummary.meanAbsolutePercentageError === null
      ? "fail"
      : overallSummary.meanAbsolutePercentageError > maximumMeanAbsolutePercentageError ||
          Math.abs(overallSummary.residualBiasMph ?? 0) > maximumAbsoluteBiasMph
        ? "warn"
        : "pass";
  const driftStatus =
    releaseMonthSummary === undefined
      ? "fail"
      : releaseMapeDriftRatio !== null && releaseMapeDriftRatio > maximumReleaseMapeDriftRatio
        ? "warn"
        : "pass";

  return {
    artifactKind: "forecast_validation_gates",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    historyWindow: {
      startMonth: input.startMonth,
      endMonth: input.endMonth,
    },
    artifactPath: input.artifactPath,
    dbPath: input.dbPath,
    sourcePanelPath: input.sourcePanelPath ?? null,
    model: {
      modelId: "naive_segment_daypart_trailing_mean_v1",
      target: "average_speed_mph",
      grain: "route_id + direction + segment_id + daypart + month",
      minObservationCount,
      minTrainingMonths,
      trailingTrainingMonths,
    },
    summary: {
      sourceRowCount: input.rows.length,
      eligibleRowCount: eligible.length,
      forecastCount: overallSummary.forecastCount,
      validationMonthCount: monthlyBacktest.length,
      routeCount: overall.routeIds.size,
      segmentCount: overall.segmentIds.size,
      releaseMonthForecastCount: releaseMonthSummary?.forecastCount ?? 0,
      meanAbsoluteErrorMph: overallSummary.meanAbsoluteErrorMph,
      meanAbsolutePercentageError: overallSummary.meanAbsolutePercentageError,
      withinTenPercentShare: overallSummary.withinTenPercentShare,
      residualBiasMph: overallSummary.residualBiasMph,
      releaseMonthMeanAbsolutePercentageError,
      referenceMeanAbsolutePercentageError:
        referenceMeanAbsolutePercentageError === null
          ? null
          : round(referenceMeanAbsolutePercentageError),
      releaseMapeDriftRatio,
    },
    gates: [
      gate({
        gateId: "rolling_backtest",
        status: rollingBacktestStatus,
        reasons:
          rollingBacktestStatus === "pass"
            ? []
            : overall.forecastCount === 0
              ? ["no_backtest_forecasts"]
              : ["backtest_support_below_preferred_threshold"],
        metrics: {
          forecastCount: overall.forecastCount,
          validationMonthCount: monthlyBacktest.length,
          minimumBacktestForecastCount,
          minimumValidationMonthCount,
        },
      }),
      gate({
        gateId: "calibration_curve",
        status: calibrationStatus,
        reasons:
          calibrationStatus === "pass"
            ? []
            : overallSummary.meanAbsolutePercentageError === null
              ? ["calibration_metrics_missing"]
              : ["calibration_metrics_warn"],
        metrics: {
          meanAbsolutePercentageError: overallSummary.meanAbsolutePercentageError,
          residualBiasMph: overallSummary.residualBiasMph,
          withinTenPercentShare: overallSummary.withinTenPercentShare,
          maximumMeanAbsolutePercentageError,
          maximumAbsoluteBiasMph,
        },
      }),
      gate({
        gateId: "distribution_shift_monitor",
        status: driftStatus,
        reasons:
          driftStatus === "pass"
            ? []
            : releaseMonthSummary === undefined
              ? ["release_month_backtest_missing"]
              : ["release_month_error_drift_warn"],
        metrics: {
          releaseMonthForecastCount: releaseMonthSummary?.forecastCount ?? 0,
          releaseMonthMeanAbsolutePercentageError,
          referenceMeanAbsolutePercentageError:
            referenceMeanAbsolutePercentageError === null
              ? null
              : round(referenceMeanAbsolutePercentageError),
          releaseMapeDriftRatio,
          maximumReleaseMapeDriftRatio,
        },
      }),
    ],
    monthlyBacktest,
  };
}
