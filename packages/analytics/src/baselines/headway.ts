export type HeadwayLos = "A" | "B" | "C" | "D" | "E" | "F";

export type ExcessWaitTimeResult = {
  averageWaitTimeMinutes: number | null;
  scheduledWaitTimeMinutes: number | null;
  excessWaitTimeMinutes: number | null;
};

export type HeadwayIrregularityRates = {
  pairCount: number;
  bunchingPairCount: number;
  gapPairCount: number;
  bunchingShare: number | null;
  gapShare: number | null;
  ratios: number[];
};

export type HeadwayIrregularityOptions = {
  bunchingRatio: number;
  gapRatio: number;
};

export const DEFAULT_HEADWAY_IRREGULARITY_OPTIONS: HeadwayIrregularityOptions = {
  bunchingRatio: 0.25,
  gapRatio: 2,
};

function finiteNonnegativeValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStandardDeviation(values: readonly number[]): number | null {
  const valueMean = mean(values);
  if (valueMean === null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function scheduledWaitTimeMinutes(scheduledBusesPerHour: number | null): number | null {
  if (scheduledBusesPerHour === null) return null;
  if (!Number.isFinite(scheduledBusesPerHour) || scheduledBusesPerHour <= 0) return null;
  return 30 / scheduledBusesPerHour;
}

export function averageWaitTimeMinutes(headwaysMinutes: readonly number[]): number | null {
  const headways = finiteNonnegativeValues(headwaysMinutes);
  if (headways.length === 0) return null;

  const headwayTotal = headways.reduce((sum, headway) => sum + headway, 0);
  if (headwayTotal <= 0) return null;

  const squaredHeadwayTotal = headways.reduce((sum, headway) => sum + headway ** 2, 0);
  return squaredHeadwayTotal / (2 * headwayTotal);
}

export function excessWaitTimeMinutes(
  headwaysMinutes: readonly number[],
  scheduledBusesPerHour: number | null,
): ExcessWaitTimeResult {
  const averageWait = averageWaitTimeMinutes(headwaysMinutes);
  const scheduledWait = scheduledWaitTimeMinutes(scheduledBusesPerHour);
  const excessWait =
    averageWait === null || scheduledWait === null ? null : Math.max(0, averageWait - scheduledWait);

  return {
    averageWaitTimeMinutes: averageWait,
    scheduledWaitTimeMinutes: scheduledWait,
    excessWaitTimeMinutes: excessWait,
  };
}

export function headwayCoefficientOfVariation(
  headwaysMinutes: readonly number[],
  expectedMeanHeadwayMinutes?: number | null,
): number | null {
  const headways = finiteNonnegativeValues(headwaysMinutes);
  if (headways.length < 2) return null;

  const denominator =
    expectedMeanHeadwayMinutes === undefined || expectedMeanHeadwayMinutes === null
      ? mean(headways)
      : expectedMeanHeadwayMinutes;
  if (denominator === null || !Number.isFinite(denominator) || denominator <= 0) return null;

  const standardDeviation = populationStandardDeviation(headways);
  if (standardDeviation === null) return null;
  return standardDeviation / denominator;
}

export function headwayLosFromCoefficient(coefficientOfVariation: number | null): HeadwayLos | null {
  if (coefficientOfVariation === null) return null;
  if (!Number.isFinite(coefficientOfVariation) || coefficientOfVariation < 0) return null;
  if (coefficientOfVariation <= 0.21) return "A";
  if (coefficientOfVariation <= 0.3) return "B";
  if (coefficientOfVariation <= 0.39) return "C";
  if (coefficientOfVariation <= 0.52) return "D";
  if (coefficientOfVariation <= 0.74) return "E";
  return "F";
}

export function headwayIrregularityRates(
  headwaysMinutes: readonly number[],
  scheduledHeadwayMinutes: number | null,
  options: Partial<HeadwayIrregularityOptions> = {},
): HeadwayIrregularityRates {
  const thresholds = { ...DEFAULT_HEADWAY_IRREGULARITY_OPTIONS, ...options };
  if (
    scheduledHeadwayMinutes === null ||
    !Number.isFinite(scheduledHeadwayMinutes) ||
    scheduledHeadwayMinutes <= 0
  ) {
    return {
      pairCount: 0,
      bunchingPairCount: 0,
      gapPairCount: 0,
      bunchingShare: null,
      gapShare: null,
      ratios: [],
    };
  }

  const ratios = finiteNonnegativeValues(headwaysMinutes).map(
    (headway) => headway / scheduledHeadwayMinutes,
  );
  const pairCount = ratios.length;
  if (pairCount === 0) {
    return {
      pairCount,
      bunchingPairCount: 0,
      gapPairCount: 0,
      bunchingShare: null,
      gapShare: null,
      ratios,
    };
  }

  const bunchingPairCount = ratios.filter((ratio) => ratio < thresholds.bunchingRatio).length;
  const gapPairCount = ratios.filter((ratio) => ratio > thresholds.gapRatio).length;

  return {
    pairCount,
    bunchingPairCount,
    gapPairCount,
    bunchingShare: bunchingPairCount / pairCount,
    gapShare: gapPairCount / pairCount,
    ratios,
  };
}
