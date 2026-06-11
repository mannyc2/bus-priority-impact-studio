import { join } from "node:path";

export function routeSpeedHistoryArtifactPath(input: {
  artifactRoot: string;
  routeSlug: string;
}): string {
  return join(input.artifactRoot, "studio", "v2", "routes", input.routeSlug, "speed-history.json");
}

export function routeSpeedHistoryManifestPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string | null;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "speed-histories",
    `${input.startMonth}_to_${input.endMonth ?? "latest"}`,
    "manifest.json",
  );
}
