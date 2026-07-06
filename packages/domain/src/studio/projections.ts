import {
  type StudioDocsResponse,
  StudioDocsResponseSchema,
  type StudioMethodsResponse,
  StudioMethodsResponseSchema,
} from "./docs/index.js";
import {
  type StudioCompareResponse,
  StudioCompareResponseSchema,
  type StudioReleasePayload,
} from "./release.js";
import {
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
  type StudioSegmentsResponse,
  StudioSegmentsResponseSchema,
} from "./routes/index.js";

export function getStudioRoute(
  release: Pick<StudioReleasePayload, "routes">,
  slug: string | undefined,
): StudioRoute | undefined {
  return release.routes.find((route) => route.slug === (slug ?? ""));
}

function routeSegments(release: StudioReleasePayload, slug: string) {
  return release.segments.filter((segment) => segment.routeSlug === slug);
}

function routeArtifactRefs(release: StudioReleasePayload, routeId: string) {
  return release.routeArtifacts.filter((artifact) => artifact.routeId === routeId);
}

export function buildStudioRoutesProjection(release: StudioReleasePayload): StudioRoutesResponse {
  return StudioRoutesResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    routes: release.routes,
    quality: release.quality,
  });
}

export function buildStudioSegmentsProjection(
  release: StudioReleasePayload,
): StudioSegmentsResponse {
  return StudioSegmentsResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    segments: release.segments,
    quality: release.quality,
  });
}

export function buildStudioRouteProjection(
  release: StudioReleasePayload,
  route: StudioRoute,
): StudioRouteDetailResponse {
  // capability + dossier default to null here; the Worker joins the pipeline-built
  // capability row and dossier summary at read time (hard-cutover C2).
  return StudioRouteDetailResponseSchema.parse({
    schemaVersion: 2,
    generatedAt: release.generatedAt,
    route,
    ...(route.peerSlug ? { peerRoute: getStudioRoute(release, route.peerSlug) } : {}),
    segments: routeSegments(release, route.slug),
    artifactRefs: routeArtifactRefs(release, route.routeId),
    quality: release.quality,
  });
}

export function buildStudioCompareProjection(
  release: StudioReleasePayload,
  routeA: StudioRoute,
  routeB: StudioRoute,
): StudioCompareResponse {
  return StudioCompareResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    routes: [routeA, routeB],
    deltas: {
      speedMph: routeB.speedMph - routeA.speedMph,
      riderHoursLost:
        routeA.riderHoursLost === null || routeB.riderHoursLost === null
          ? null
          : routeA.riderHoursLost - routeB.riderHoursLost,
      laneCoverage: routeB.laneCoverage - routeA.laneCoverage,
    },
    quality: release.quality,
  });
}

export function buildStudioMethodsProjection(release: StudioReleasePayload): StudioMethodsResponse {
  return StudioMethodsResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    datasets: release.methods,
    quality: release.quality,
  });
}

export function buildStudioDocsProjection(release: StudioReleasePayload): StudioDocsResponse {
  return StudioDocsResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    sections: release.docsSections,
    endpoints: release.docsEndpoints,
    quality: release.quality,
  });
}
