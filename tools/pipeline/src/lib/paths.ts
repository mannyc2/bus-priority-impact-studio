import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRootPath = fileURLToPath(new URL("../../../../", import.meta.url));

export function fromRepoRoot(path: string): string {
  return join(repoRootPath, path);
}

export function defaultArtifactRootPath(): string {
  return fromRepoRoot("data/artifacts");
}

export function defaultExportRootPath(): string {
  return fromRepoRoot("data/exports");
}

export function fromCliPath(value: string): string {
  return isAbsolute(value) ? value : fromRepoRoot(value);
}
