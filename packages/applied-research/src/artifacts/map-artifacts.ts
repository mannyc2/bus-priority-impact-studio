import { join } from "node:path";

export function mapArtifactKey(...parts: string[]): string {
  return join("map", ...parts);
}

export function mapArtifactPath(artifactRoot: string, ...parts: string[]): string {
  return join(artifactRoot, mapArtifactKey(...parts));
}

export function mapArtifactManifestPath(artifactRoot: string, month: string): string {
  return mapArtifactPath(artifactRoot, month, "manifest.json");
}

export function routeSegmentMapArtifactKey(routeId: string, month: string): string {
  return mapArtifactKey("route-segments", routeId.toLowerCase(), month, "all-day.geojson");
}
