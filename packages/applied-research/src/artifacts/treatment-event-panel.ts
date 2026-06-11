import { join } from "node:path";

export function treatmentEventPanelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "treatment-event-panel-v1",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "treatment-event-panel.json",
  );
}

export function treatmentEventCandidateCausalReviewPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "treatment-event-panel-v1",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "candidate-causal-review.json",
  );
}
