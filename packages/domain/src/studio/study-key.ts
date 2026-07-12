// Artifact keys only — safe to import from the web client without pulling
// the study schemas (and effect) into the bundle, matching intervention-corpus-key.
export function studyArtifactKey(eventKey: string): string {
  return `studio/v2/studies/${eventKey}.json`;
}

export function studyIndexKey(): string {
  return "studio/v2/studies/index.json";
}

export function routeStudiesKey(routeSlug: string): string {
  return `studio/v2/routes/${routeSlug}/studies.json`;
}
