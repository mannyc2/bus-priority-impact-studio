import { join } from "node:path";

export function causalValidationGatesArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "applied-research",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "causal-validation-gates.json",
  );
}
