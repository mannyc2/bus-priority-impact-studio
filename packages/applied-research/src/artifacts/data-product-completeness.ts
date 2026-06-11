import { join } from "node:path";

export function dataProductCompletenessPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
  runId: string;
}): string {
  return join(
    input.artifactRoot,
    "data-product-completeness",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.runId,
    "completeness.json",
  );
}
