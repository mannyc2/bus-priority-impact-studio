import { join } from "node:path";

export function ewtScoreVectorArtifactPath(
  artifactRoot: string,
  startMonth: string,
  endMonth: string,
  releaseMonth: string,
): string {
  return join(
    artifactRoot,
    "analytics-ewt-score-vectors",
    `${startMonth}_to_${endMonth}`,
    releaseMonth,
    "ewt-route-month-score-vectors.json",
  );
}
