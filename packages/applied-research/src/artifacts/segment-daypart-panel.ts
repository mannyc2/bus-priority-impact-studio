import { join } from "node:path";

export function segmentDaypartPanelArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "applied-research",
    `${input.startMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "segment-daypart-panel.json",
  );
}
