import { join } from "node:path";

export function detectorEvaluationLabelsPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-evaluation",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "detector-evaluation-labels.json",
  );
}
