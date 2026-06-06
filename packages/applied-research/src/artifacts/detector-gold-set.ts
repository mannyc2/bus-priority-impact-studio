import { join } from "node:path";

export function detectorGoldSetEvaluationPath(input: {
  artifactRoot: string;
  releaseMonth: string;
}): string {
  return join(input.artifactRoot, "findings", input.releaseMonth, "gold-set-evaluation.json");
}
