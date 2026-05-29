import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export function fromRepoRoot(...segments: string[]): string {
  return join(repoRoot, ...segments);
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

export function findingsArtifactDir(month: string): string {
  return fromRepoRoot("data", "artifacts", "findings", month);
}

export function agentProposalsDir(month: string, runId: string): string {
  return join(findingsArtifactDir(month), "agent-proposals", runId);
}
