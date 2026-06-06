import { join } from "node:path";

export function routeTreatmentSummaryArtifactPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.json",
  );
}

export function routeTreatmentSummaryMarkdownPath(input: {
  artifactRoot: string;
  month: string;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "route-treatment-summary",
    input.month,
    "route-treatment-summary.md",
  );
}
