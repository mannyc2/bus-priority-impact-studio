import { join } from "node:path";

export function featureGrainMaterializationCoveragePath(input: {
  readonly artifactRoot: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "materialization-coverage",
    `feature-grain-materialization-coverage-${input.releaseMonth}.json`,
  );
}
