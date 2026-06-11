import { join } from "node:path";

export function analyticsCorpusProfilePath(input: {
  artifactRoot: string;
  releaseMonth: string;
}): string {
  return join(input.artifactRoot, "analytics-corpus-profile", input.releaseMonth, "profile.json");
}
