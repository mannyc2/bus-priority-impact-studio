import { join } from "node:path";

function appliedResearchPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
  readonly filename: string;
}): string {
  return join(
    input.artifactRoot,
    "applied-research",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    input.filename,
  );
}

export function pulseCandidateSetArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "pulse-candidate-set.json" });
}

export function pulseEventOverlapArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "pulse-event-overlap.json" });
}

export function eventEffectContrastArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "event-effect-contrast.json" });
}

export function mechanismCorroborationArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "mechanism-corroboration.json" });
}

export function eventFamilyEffectPanelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "event-family-effect-panel.json" });
}

export function eventFamilyResponseDriftStudyArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return appliedResearchPath({ ...input, filename: "event-family-response-drift-study.json" });
}
