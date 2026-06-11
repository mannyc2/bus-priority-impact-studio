import { join } from "node:path";

export function reliabilityExposurePanelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly releaseMonth: string;
  readonly runId: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "reliability-exposure-panel-v1",
    input.releaseMonth,
    input.runId,
    "reliability-exposure-panel.json",
  );
}
