export function interventionObservationBundleKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/intervention-observations.json`;
}

export function interventionObservationIndexKey(): string {
  return "studio/v2/interventions/observation-index.json";
}
