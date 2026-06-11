import { join } from "node:path";

export function routeSpeedAvailabilityArtifactPath(artifactRoot: string): string {
  return join(artifactRoot, "source-availability", "route-speed-availability.json");
}
