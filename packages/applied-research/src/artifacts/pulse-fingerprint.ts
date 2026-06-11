import { join } from "node:path";

export function pulseFingerprintArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "analytics-models",
    "pulse-fingerprint-v1",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "pulse-fingerprint.json",
  );
}
