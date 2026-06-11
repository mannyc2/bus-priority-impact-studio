import { join } from "node:path";

export function parkingViolationMatchAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "parking-violation-match-audit.json");
}
