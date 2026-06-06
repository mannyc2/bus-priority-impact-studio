import { join } from "node:path";

export function segmentDaypartHistoryArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-feature-history",
    `${input.startMonth}_to_${input.endMonth}`,
    "segment-daypart-history.json",
  );
}
