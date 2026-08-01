import type {
  PublicInterventionEpisodesArtifact,
  PublicRouteInterventionHistoryArtifact,
} from "@bp/domain/studio/public-intervention-episodes";
import {
  publicInterventionEpisodesKey,
  publicRouteInterventionHistoryKey,
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
    publicArtifactPath(publicInterventionEpisodesKey()),
    options,
  );
}

export async function fetchPublicRouteInterventionHistory(
  routeSlug: string,
  options?: StudioQueryOptions,
): Promise<PublicRouteInterventionHistoryArtifact | null> {
  return loadNullableStudioJson<PublicRouteInterventionHistoryArtifact>(
    publicArtifactPath(publicRouteInterventionHistoryKey(routeSlug)),
    options,
  );
}
