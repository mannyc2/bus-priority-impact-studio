import { join } from "node:path";

export function contextEventRouteTouchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "route-touch-audit.json");
}
