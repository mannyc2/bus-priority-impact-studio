import { join } from "node:path";

export function detectorScoreVectorsPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-score-vectors",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "detector-score-vectors.json",
  );
}
