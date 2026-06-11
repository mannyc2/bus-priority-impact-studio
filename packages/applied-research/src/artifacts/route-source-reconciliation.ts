import { join } from "node:path";

export function routeSourceReconciliationPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "route-source-reconciliation",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    "route-source-reconciliation.json",
  );
}
