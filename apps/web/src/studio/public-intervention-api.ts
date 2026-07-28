import type {
  PublicInterventionEpisodesArtifact,
  PublicRouteInterventionHistoryArtifact,
} from "@bp/domain/studio/public-intervention-episodes";
import {
  loadNullableStudioJson,
  publicArtifactPath,
  type StudioQueryOptions,
} from "./api-client.js";

export async function fetchPublicInterventionEpisodes(
  options?: StudioQueryOptions,
): Promise<PublicInterventionEpisodesArtifact | null> {
  return loadNullableStudioJson<PublicInterventionEpisodesArtifact>(
    publicArtifactPath("studio/v2/interventions/public-episodes.json"),
    options,
  );
}

export async function fetchPublicRouteInterventionHistory(
  routeSlug: string,
  options?: StudioQueryOptions,
): Promise<PublicRouteInterventionHistoryArtifact | null> {
  return loadNullableStudioJson<PublicRouteInterventionHistoryArtifact>(
    publicArtifactPath(`studio/v2/routes/${routeSlug}/intervention-history.json`),
    options,
  );
}
