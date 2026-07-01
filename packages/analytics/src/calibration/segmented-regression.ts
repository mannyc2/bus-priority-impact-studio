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
  const augmented = matrix.map((row, index) => [...row, requiredNumber(vector, index)]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(requiredNumber(requiredRow(augmented, row), pivot)) >
        Math.abs(requiredNumber(requiredRow(augmented, pivotRow), pivot))
      ) {
        pivotRow = row;
      }
    }
    if (Math.abs(requiredNumber(requiredRow(augmented, pivotRow), pivot)) < 1e-12) return null;
    [augmented[pivot], augmented[pivotRow]] = [
      requiredRow(augmented, pivotRow),
      requiredRow(augmented, pivot),
    ];

    const pivotRowValues = requiredRow(augmented, pivot);
    const pivotValue = requiredNumber(pivotRowValues, pivot);
    for (let column = pivot; column <= size; column += 1) {
      pivotRowValues[column] = requiredNumber(pivotRowValues, column) / pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const rowValues = requiredRow(augmented, row);
      const factor = requiredNumber(rowValues, pivot);
      for (let column = pivot; column <= size; column += 1) {
        rowValues[column] =
          requiredNumber(rowValues, column) - factor * requiredNumber(pivotRowValues, column);
      }
    }
  }

  return augmented.map((row) => requiredNumber(row, size));
}

function requiredRow(rows: readonly number[][], index: number): number[] {
  const row = rows[index];
  if (row === undefined) throw new Error(`Missing matrix row at index ${index}.`);
  return row;
}

function requiredNumber(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing matrix value at index ${index}.`);
  return value;
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
      xty[left] = requiredNumber(xty, left) + requiredNumber(row, left) * point.value;
      for (let right = 0; right < row.length; right += 1) {
        const xtxRow = requiredRow(xtx, left);
        xtxRow[right] =
          requiredNumber(xtxRow, right) + requiredNumber(row, left) * requiredNumber(row, right);
      }
    }
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (coefficients === null) return null;
  return {
    intercept: requiredNumber(coefficients, 0),
    baselineSlope: requiredNumber(coefficients, 1),
    levelChange: requiredNumber(coefficients, 2),
    slopeChange: requiredNumber(coefficients, 3),
    pointCount: points.length,
    interventionTime: input.interventionTime,
  };
}
