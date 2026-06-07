import { join } from "node:path";

export function routePeerResidualsArtifactPath(input: {
  readonly artifactRoot: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "route-peer-residuals-v1",
    `${input.startMonth}_to_${input.endMonth}`,
    input.releaseMonth,
    "route-peer-residuals.json",
  );
}
