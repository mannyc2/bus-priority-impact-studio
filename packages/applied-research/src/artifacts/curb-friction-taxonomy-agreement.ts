import { join } from "node:path";

export function curbFrictionTaxonomyAgreementAuditPath(artifactRoot: string): string {
  return join(artifactRoot, "context-events", "311-curb-friction-taxonomy-agreement.json");
}
