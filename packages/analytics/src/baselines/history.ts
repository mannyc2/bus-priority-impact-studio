export type HistoricalDelta = {
  current: number;
  baseline: number;
  delta: number;
  percentDelta: number | null;
};

export type RobustZScore = {
  value: number;
  median: number;
  mad: number;
  scaledMad: number;
  z: number | null;
};

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function median(values: readonly number[]): number | null {
  const finite = finiteValues(values).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const midpoint = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return finite[midpoint]!;
  return (finite[midpoint - 1]! + finite[midpoint]!) / 2;
}

export function historicalDelta(current: number, baseline: number): HistoricalDelta {
  return {
    current,
    baseline,
    delta: current - baseline,
    percentDelta: baseline === 0 ? null : (current - baseline) / baseline,
  };
}

export function medianAbsoluteDeviation(values: readonly number[]): number | null {
  const valueMedian = median(values);
  if (valueMedian === null) return null;
  return median(finiteValues(values).map((value) => Math.abs(value - valueMedian)));
}

export function robustZScore(value: number, baselineValues: readonly number[]): RobustZScore {
  const valueMedian = median(baselineValues);
  const mad = medianAbsoluteDeviation(baselineValues);
  if (valueMedian === null || mad === null) {
    return { value, median: 0, mad: 0, scaledMad: 0, z: null };
  }

  const scaledMad = 1.4826 * mad;
  return {
    value,
    median: valueMedian,
    mad,
    scaledMad,
    z: scaledMad === 0 ? null : (value - valueMedian) / scaledMad,
  };
}

export function theilSenSlope(values: readonly number[]): number | null {
  const finite = finiteValues(values);
  if (finite.length < 2) return null;

  const slopes: number[] = [];
  for (let left = 0; left < finite.length - 1; left += 1) {
    for (let right = left + 1; right < finite.length; right += 1) {
      slopes.push((finite[right]! - finite[left]!) / (right - left));
    }
  }

  return median(slopes);
}
