import { join } from "node:path";

export function evaluationArtifactKey(month: string, fileName: string): string {
  return join("evaluations", month, fileName);
}

export function evaluationArtifactPath(
  artifactRoot: string,
  month: string,
  fileName: string,
): string {
  return join(artifactRoot, evaluationArtifactKey(month, fileName));
}

export function evaluationArtifactManifestPath(artifactRoot: string, month: string): string {
  return evaluationArtifactPath(artifactRoot, month, "manifest.json");
}
