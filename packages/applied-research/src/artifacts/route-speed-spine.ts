import { join } from "node:path";

export function routeSpeedSpineArtifactPath(input: {
  artifactRoot: string;
  routeSlug: string;
}): string {
  return join(input.artifactRoot, "studio", "v2", "routes", input.routeSlug, "speed-spine.json");
}

export function routeSpeedSpineManifestPath(input: {
  artifactRoot: string;
  startMonth: string;
  endMonth: string | null;
}): string {
  return join(
    input.artifactRoot,
    "studio",
    "v2",
    "speed-spines",
    `${input.startMonth}_to_${input.endMonth ?? "latest"}`,
    "manifest.json",
  );
}
