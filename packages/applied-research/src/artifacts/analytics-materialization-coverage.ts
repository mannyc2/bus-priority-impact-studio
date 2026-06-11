import { join } from "node:path";

export function analyticsMaterializationCoveragePath(input: {
  artifactRoot: string;
  month: string;
  runId: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-materialization-coverage",
    input.month,
    input.runId,
    "coverage.json",
  );
}
