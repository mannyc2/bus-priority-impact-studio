import { join } from "node:path";

export function analyticsBackfillCoveragePath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-backfill-coverage",
    `${input.startMonth}_to_${input.endMonth}`,
    "coverage.json",
  );
}
