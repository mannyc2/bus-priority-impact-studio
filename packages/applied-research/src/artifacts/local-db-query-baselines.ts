import { join } from "node:path";

export function localDbQueryBaselinesArtifactPath(input: {
  readonly artifactRoot: string;
  readonly historyStartMonth: string;
  readonly releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "local-db-query-baselines",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    "query-baselines.json",
  );
}
