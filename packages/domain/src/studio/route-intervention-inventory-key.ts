// Artifact keys only — safe to import from the web client without pulling
// the inventory schemas (and effect) into the browser bundle.
export function routeInterventionInventoryBundleKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/intervention-inventory.json`;
}

export function routeInterventionInventoryIndexKey(): string {
  return "studio/v2/interventions/route-inventory-index.json";
}

export function interventionFacetIndexKey(): string {
  return "studio/v2/interventions/facet-index.json";
}

export function routeInterventionInventoryReconciliationKey(): string {
  return "studio/v2/interventions/route-inventory-reconciliation.json";
}
