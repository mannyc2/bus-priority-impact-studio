import { join } from "node:path";

export function sourceGapModelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly month: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "source-gap-model-v1",
    input.month,
    "source-gap-model.json",
  );
}
