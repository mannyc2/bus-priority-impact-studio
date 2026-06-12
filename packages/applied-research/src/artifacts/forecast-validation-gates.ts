import { join } from "node:path";

export function forecastValidationGatesArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "applied-research",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "forecast-validation-gates.json",
  );
}
