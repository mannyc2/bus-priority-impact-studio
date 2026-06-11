import { join } from "node:path";

export function analyticsDetectorReadinessPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-detector-readiness",
    `${input.startMonth}_to_${input.endMonth}`,
    "readiness.json",
  );
}
