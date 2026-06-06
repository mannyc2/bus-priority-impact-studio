import { join } from "node:path";

export function runtimeTrendScoreVectorPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "runtime-trend-score-vectors",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "runtime-trend-score-vectors.json",
  );
}
