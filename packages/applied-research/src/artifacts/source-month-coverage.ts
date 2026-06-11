import { join } from "node:path";

export function sourceMonthCoverageMatrixPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "source-month-coverage",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    "coverage-matrix.json",
  );
}
