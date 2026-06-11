import { join } from "node:path";

export function speedPaceScoreVectorPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "speed-pace-score-vectors",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "speed-pace-score-vectors.json",
  );
}
