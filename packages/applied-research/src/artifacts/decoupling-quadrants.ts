import { join } from "node:path";

export function decouplingQuadrantsArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "decoupling-quadrants-v1",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "decoupling-quadrants.json",
  );
}
