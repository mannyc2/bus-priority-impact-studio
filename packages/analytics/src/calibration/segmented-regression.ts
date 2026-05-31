export type SegmentedRegressionPoint = {
  time: number;
  value: number;
};

export type SegmentedRegressionSummary = {
  intercept: number;
  baselineSlope: number;
  levelChange: number;
  slopeChange: number;
  pointCount: number;
  interventionTime: number;
};

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![pivot]!) > Math.abs(augmented[pivotRow]![pivot]!)) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow]![pivot]!) < 1e-12) return null;
    [augmented[pivot], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[pivot]!];

    const pivotValue = augmented[pivot]![pivot]!;
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot]![column] = augmented[pivot]![column]! / pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]![pivot]!;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column] = augmented[row]![column]! - factor * augmented[pivot]![column]!;
      }
    }
  }

  return augmented.map((row) => row[size]!);
}

export function segmentedRegressionSummary(input: {
  points: readonly SegmentedRegressionPoint[];
  interventionTime: number;
}): SegmentedRegressionSummary | null {
  const points = input.points.filter(
    (point) => Number.isFinite(point.time) && Number.isFinite(point.value),
  );
  if (points.length < 4 || !Number.isFinite(input.interventionTime)) return null;

  const xtx = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
  const xty = Array.from({ length: 4 }, () => 0);
  for (const point of points) {
    const post = point.time >= input.interventionTime ? 1 : 0;
    const timeAfter = post === 1 ? point.time - input.interventionTime : 0;
    const row = [1, point.time, post, timeAfter];
    for (let left = 0; left < row.length; left += 1) {
      xty[left] = xty[left]! + row[left]! * point.value;
      for (let right = 0; right < row.length; right += 1) {
        xtx[left]![right] = xtx[left]![right]! + row[left]! * row[right]!;
      }
    }
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (coefficients === null) return null;
  return {
    intercept: coefficients[0]!,
    baselineSlope: coefficients[1]!,
    levelChange: coefficients[2]!,
    slopeChange: coefficients[3]!,
    pointCount: points.length,
    interventionTime: input.interventionTime,
  };
}
