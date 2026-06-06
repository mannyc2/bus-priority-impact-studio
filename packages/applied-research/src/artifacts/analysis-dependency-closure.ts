import { join } from "node:path";

export function analysisDependencyClosurePath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-closure",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "detector-closure.json",
  );
}

export function analysisDependencyClosureMarkdownPath(input: {
  artifactRoot: string;
  historyStartMonth: string;
  releaseMonth: string;
}): string {
  return join(
    input.artifactRoot,
    "detector-closure",
    `${input.historyStartMonth}_to_${input.releaseMonth}`,
    input.releaseMonth,
    "detector-closure.md",
  );
}
