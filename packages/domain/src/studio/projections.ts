import {
  type StudioBrief,
  type StudioBriefCard,
  type StudioBriefEvidenceResponse,
  StudioBriefEvidenceResponseSchema,
  type StudioBriefHistoryResponse,
  StudioBriefHistoryResponseSchema,
  type StudioBriefResponse,
  StudioBriefResponseSchema,
  type StudioBriefsResponse,
  StudioBriefsResponseSchema,
} from "./briefs/read-model.js";
import {
  type StudioDocsResponse,
  StudioDocsResponseSchema,
  type StudioMethodsResponse,
  StudioMethodsResponseSchema,
} from "./docs/index.js";
import {
  type StudioFinding,
  type StudioFindingCard,
  type StudioFindingResponse,
  StudioFindingResponseSchema,
  type StudioFindingsResponse,
  StudioFindingsResponseSchema,
} from "./findings/index.js";
import {
  type StudioCompareResponse,
  StudioCompareResponseSchema,
  type StudioReleasePayload,
} from "./release.js";
import {
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRouteLadderResponse,
  StudioRouteLadderResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
} from "./routes/index.js";

export function getStudioRoute(
  release: Pick<StudioReleasePayload, "routes">,
  slug: string | undefined,
): StudioRoute | undefined {
  return release.routes.find((route) => route.slug === (slug ?? ""));
}

export function getStudioFinding(
  release: Pick<StudioReleasePayload, "findings">,
  id: string | undefined,
): StudioFinding | undefined {
  return release.findings.find((finding) => finding.id === (id ?? ""));
}

export function getStudioBrief(
  release: Pick<StudioReleasePayload, "briefs">,
  id: string | undefined,
): StudioBrief | undefined {
  return release.briefs.find((brief) => brief.id === (id ?? ""));
}

export function buildStudioFindingCards(
  release: StudioReleasePayload,
  findings: readonly StudioFinding[] = release.findings,
): StudioFindingCard[] {
  return findings.flatMap((finding) => {
    const route = getStudioRoute(release, finding.routeSlug);
    return route === undefined ? [] : [{ finding, route }];
  });
}

export function buildStudioBriefCards(
  release: StudioReleasePayload,
  briefs: readonly StudioBrief[] = release.briefs,
): StudioBriefCard[] {
  return briefs.flatMap((brief) => {
    const route = getStudioRoute(release, brief.routeSlug);
    return route === undefined ? [] : [{ brief, route }];
  });
}

function routeSegments(release: StudioReleasePayload, slug: string) {
  return release.segments.filter((segment) => segment.routeSlug === slug);
}

function routeArtifactRefs(release: StudioReleasePayload, routeId: string) {
  return release.routeArtifacts.filter((artifact) => artifact.routeId === routeId);
}

function briefVersions(release: StudioReleasePayload, briefId: string) {
  return release.versions.filter((version) => version.briefId === briefId);
}

function briefComments(release: StudioReleasePayload, briefId: string) {
  return release.comments.filter((comment) => comment.briefId === briefId);
}

function briefHeading(brief: StudioBrief, route: StudioRoute) {
  return {
    id: brief.id,
    title: brief.title,
    version: brief.version,
    routeSlug: brief.routeSlug,
    routeLabel: route.label,
    routeSbs: route.sbs,
  };
}

export function buildStudioRoutesProjection(release: StudioReleasePayload): StudioRoutesResponse {
  return StudioRoutesResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    routes: release.routes,
    quality: release.quality,
  });
}

export function buildStudioRouteProjection(
  release: StudioReleasePayload,
  route: StudioRoute,
): StudioRouteDetailResponse {
  return StudioRouteDetailResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    route,
    ...(route.peerSlug ? { peerRoute: getStudioRoute(release, route.peerSlug) } : {}),
    segments: routeSegments(release, route.slug),
    artifactRefs: routeArtifactRefs(release, route.routeId),
    quality: release.quality,
  });
}

export function buildStudioRouteLadderProjection(
  release: StudioReleasePayload,
  route: StudioRoute,
): StudioRouteLadderResponse {
  return StudioRouteLadderResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    route,
    segments: routeSegments(release, route.slug),
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
      riderHoursLost: routeA.riderHoursLost - routeB.riderHoursLost,
      laneCoverage: routeB.laneCoverage - routeA.laneCoverage,
    },
    quality: release.quality,
  });
}

export function buildStudioFindingsProjection(
  release: StudioReleasePayload,
): StudioFindingsResponse {
  return StudioFindingsResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    findings: buildStudioFindingCards(release),
    quality: release.quality,
  });
}

export function buildStudioFindingProjection(
  release: StudioReleasePayload,
  finding: StudioFinding,
): StudioFindingResponse | undefined {
  const route = getStudioRoute(release, finding.routeSlug);
  if (route === undefined) {
    return undefined;
  }

  return StudioFindingResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    finding,
    route,
    quality: release.quality,
  });
}

export function buildStudioBriefsProjection(release: StudioReleasePayload): StudioBriefsResponse {
  return StudioBriefsResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    briefs: buildStudioBriefCards(release),
    quality: release.quality,
  });
}

export function buildStudioBriefProjection(
  release: StudioReleasePayload,
  brief: StudioBrief,
): StudioBriefResponse | undefined {
  const route = getStudioRoute(release, brief.routeSlug);
  if (route === undefined) {
    return undefined;
  }

  return StudioBriefResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    brief,
    route,
    versions: briefVersions(release, brief.id),
    comments: briefComments(release, brief.id),
    quality: release.quality,
  });
}

export function buildStudioBriefEvidenceProjection(
  release: StudioReleasePayload,
  brief: StudioBrief,
): StudioBriefEvidenceResponse | undefined {
  const route = getStudioRoute(release, brief.routeSlug);
  if (route === undefined) {
    return undefined;
  }

  return StudioBriefEvidenceResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    heading: briefHeading(brief, route),
    claims: brief.claims,
    evidence: brief.evidence,
    caveats: brief.caveats,
    quality: release.quality,
  });
}

export function buildStudioBriefHistoryProjection(
  release: StudioReleasePayload,
  brief: StudioBrief,
): StudioBriefHistoryResponse | undefined {
  const route = getStudioRoute(release, brief.routeSlug);
  if (route === undefined) {
    return undefined;
  }

  return StudioBriefHistoryResponseSchema.parse({
    schemaVersion: 1,
    generatedAt: release.generatedAt,
    heading: briefHeading(brief, route),
    versions: briefVersions(release, brief.id),
    comments: briefComments(release, brief.id),
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
