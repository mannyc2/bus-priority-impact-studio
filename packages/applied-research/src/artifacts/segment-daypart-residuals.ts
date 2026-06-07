import { join } from "node:path";

export function segmentDaypartResidualsArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "segment-daypart-residuals-v1",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "segment-daypart-residuals.json",
  );
}
