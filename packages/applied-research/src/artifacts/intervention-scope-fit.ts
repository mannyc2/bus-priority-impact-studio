import { join } from "node:path";

export function interventionScopeFitArtifactPath(input: {
  readonly artifactRoot: string;
  readonly month: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "intervention-scope-fit-v1",
    input.month,
    "intervention-scope-fit.json",
  );
}
