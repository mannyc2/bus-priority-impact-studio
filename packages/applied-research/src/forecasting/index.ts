import type { ResearchGrain } from "../core/grain";
import type { HistoryWindow, IsoMonthString } from "../core/windows";

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
