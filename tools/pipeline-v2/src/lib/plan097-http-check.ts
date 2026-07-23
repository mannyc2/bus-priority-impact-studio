import { createHash } from "node:crypto";
import type { Plan097HttpBaseline } from "@bp/db/recovery/plan097";
import { MapManifestResponseSchema, MapRouteSegmentFeatureCollectionSchema } from "@bp/domain/maps";
import { ReleaseStatusResponseSchema } from "@bp/domain/routes";
import { StudioRouteEvidenceBundleSchema } from "@bp/domain/studio";
import {
  StudioRouteDetailResponseSchema,
  StudioRouteHistoryResponseSchema,
  StudioRouteHourlyProfileResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
} from "@bp/domain/studio/routes";
import { StudioRouteIndex3ResponseSchema } from "@bp/domain/studio/snapshots";
import type { Schema } from "effect";
import { decodeSchemaStrict } from "./schema-decode.ts";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const legacyEmptyStatePatterns = [
  /route dossier is still building/iu,
  /no published serving data is available/iu,
] as const;

export function assertNoPlan097LegacyEmptyState(body: string, path: string): void {
  if (legacyEmptyStatePatterns.some((pattern) => pattern.test(body))) {
    throw new Error(`Plan 097 legacy empty-state language survived at ${path}`);
  }
}

export function assertPlan097RecoveryCacheSafety(
  endpoints: readonly Plan097HttpBaseline["endpoints"][number][],
): void {
  for (const endpoint of endpoints) {
    if (endpoint.status < 500 && endpoint.cacheControl !== "no-store") {
      throw new Error(`Plan 097 cache bypass is missing for ${endpoint.path}`);
    }
  }
}

export async function fetchPlan097HttpEvidence<A>(input: {
  fetch: Fetch;
  baseUrl: string;
  path: string;
  schemaId: string;
  schema: Schema.Schema<A>;
}): Promise<{
  value: A;
  rawBody: string;
  evidence: Plan097HttpBaseline["endpoints"][number];
}> {
  const response = await input.fetch(new URL(input.path, input.baseUrl), {
    headers: {
      accept: "application/json",
      "user-agent": "bp-plan097-release-check/1",
    },
  });
  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`${input.path} returned HTTP ${response.status}`);
  }
  assertNoPlan097LegacyEmptyState(rawBody, input.path);
  const value = decodeSchemaStrict(input.schema, JSON.parse(rawBody) as unknown);
  return {
    value,
    rawBody,
    evidence: {
      path: input.path,
      status: response.status,
      schemaId: input.schemaId,
      safeBodySha256: createHash("sha256").update(rawBody).digest("hex"),
      requestId: response.headers.get("x-request-id"),
      cfRay: response.headers.get("cf-ray"),
      cacheControl: response.headers.get("cache-control"),
      etag: response.headers.get("etag"),
    },
  };
}

export async function fetchPlan097HttpBaselineEvidence<A>(input: {
  fetch: Fetch;
  baseUrl: string;
  path: string;
  schemaId: string;
  schema: Schema.Schema<A>;
}): Promise<{
  value: A | null;
  evidence: Plan097HttpBaseline["endpoints"][number];
}> {
  const response = await input.fetch(new URL(input.path, input.baseUrl), {
    headers: {
      accept: "application/json",
      "user-agent": "bp-plan097-release-check/1",
    },
  });
  const rawBody = await response.text();
  assertNoPlan097LegacyEmptyState(rawBody, input.path);
  return {
    value: response.ok ? decodeSchemaStrict(input.schema, JSON.parse(rawBody) as unknown) : null,
    evidence: {
      path: input.path,
      status: response.status,
      schemaId: input.schemaId,
      safeBodySha256: createHash("sha256").update(rawBody).digest("hex"),
      requestId: response.headers.get("x-request-id"),
      cfRay: response.headers.get("cf-ray"),
      cacheControl: response.headers.get("cache-control"),
      etag: response.headers.get("etag"),
    },
  };
}

function releaseAwarePath(path: string, nonce: string): string {
  const url = new URL(path, "https://plan097.invalid");
  url.searchParams.set("plan097", nonce);
  return `${url.pathname}${url.search}`;
}

function comparisonPath(path: string): string {
  const url = new URL(path, "https://plan097.invalid");
  url.searchParams.delete("plan097");
  return `${url.pathname}${url.search}`;
}

export function comparePlan097HttpBaselines(input: {
  expected: Plan097HttpBaseline;
  actual: Plan097HttpBaseline;
}): { matchedEndpointCount: number } {
  if (input.expected.activeReleaseId !== input.actual.activeReleaseId) {
    throw new Error("Plan 097 rollback did not restore the baseline release");
  }
  const expectedByPath = new Map(
    input.expected.endpoints.map((endpoint) => [comparisonPath(endpoint.path), endpoint]),
  );
  if (expectedByPath.size !== input.actual.endpoints.length) {
    throw new Error("Plan 097 rollback endpoint inventory differs from the baseline");
  }
  for (const endpoint of input.actual.endpoints) {
    const expected = expectedByPath.get(comparisonPath(endpoint.path));
    if (expected === undefined) {
      throw new Error(`Plan 097 rollback added an unexpected endpoint ${endpoint.path}`);
    }
    if (
      endpoint.status !== expected.status ||
      endpoint.schemaId !== expected.schemaId ||
      endpoint.cacheControl !== expected.cacheControl ||
      endpoint.etag !== expected.etag
    ) {
      throw new Error(`Plan 097 rollback contract metadata drifted for ${endpoint.path}`);
    }
    if (endpoint.safeBodySha256 !== expected.safeBodySha256) {
      throw new Error(`Plan 097 rollback safe body hash drifted for ${endpoint.path}`);
    }
  }
  return { matchedEndpointCount: input.actual.endpoints.length };
}

export type Plan097HttpCheckResult = {
  baseline: Plan097HttpBaseline;
  exactRouteCount: number;
  representativeGeometry: {
    path: string;
    sha256: string;
    featureCount: number;
  } | null;
};

export type Plan097HttpCheckMode = "baseline" | "candidate";

export function assertPlan097RouteDetail(input: {
  mode: Plan097HttpCheckMode;
  expectedReleaseId: string;
  expectedRouteId: string;
  expectedSlug: string;
  requireCandidateDossier: boolean;
  actualReleaseId: string;
  actualRouteId: string;
  actualSlug: string;
  dossierPresent: boolean;
}): void {
  if (
    input.actualReleaseId !== input.expectedReleaseId ||
    input.actualRouteId !== input.expectedRouteId ||
    input.actualSlug !== input.expectedSlug ||
    (input.mode === "candidate" && input.requireCandidateDossier && !input.dossierPresent)
  ) {
    throw new Error(`Plan 097 route detail is incomplete for ${input.expectedRouteId}`);
  }
}

export async function runPlan097HttpCheck(input: {
  baseUrl: string;
  mode?: Plan097HttpCheckMode | undefined;
  fetch?: Fetch | undefined;
  expectedReleaseId?: string | undefined;
  expectedExactRouteCount?: number | undefined;
  nonce?: string | undefined;
  checkedAt?: string | undefined;
}): Promise<Plan097HttpCheckResult> {
  if (new URL(input.baseUrl).protocol !== "https:") {
    throw new Error("Plan 097 production HTTP checker requires HTTPS");
  }
  const fetchDependency = input.fetch ?? fetch;
  const mode = input.mode ?? "candidate";
  const nonce = input.nonce ?? crypto.randomUUID();
  const endpoints: Plan097HttpBaseline["endpoints"][number][] = [];
  const request = async <A>(
    path: string,
    schemaId: string,
    schema: Schema.Schema<A>,
  ): Promise<A> => {
    const result = await fetchPlan097HttpEvidence({
      fetch: fetchDependency,
      baseUrl: input.baseUrl,
      path: releaseAwarePath(path, nonce),
      schemaId,
      schema,
    });
    endpoints.push(result.evidence);
    return result.value;
  };

  const status = await request(
    "/api/v1/status",
    "bp.release_status_response.v1",
    ReleaseStatusResponseSchema,
  );
  if (input.expectedReleaseId !== undefined && status.releaseId !== input.expectedReleaseId) {
    throw new Error("Plan 097 production status elected an unexpected release");
  }
  const routeIndex = await request(
    "/api/v1/studio/routes?schema=3",
    "bp.studio.route_index_response.v3",
    StudioRouteIndex3ResponseSchema,
  );
  if (routeIndex.releaseId !== status.releaseId || routeIndex.routes.length === 0) {
    throw new Error("Plan 097 schema-v3 route index does not match the active release");
  }
  if (
    input.expectedExactRouteCount !== undefined &&
    routeIndex.routes.length !== input.expectedExactRouteCount
  ) {
    throw new Error("Plan 097 schema-v3 route count differs from the signed candidate");
  }

  const routeCases = [
    { routeId: "BX38", slug: "bx38", requireDossier: true },
    { routeId: "B1", slug: "b1", requireDossier: false },
    { routeId: "B44", slug: "b44", requireDossier: false },
    { routeId: "B44+", slug: "b44-sbs", requireDossier: false },
  ] as const;
  for (const route of routeCases) {
    const indexed = routeIndex.routes.find((candidate) => candidate.routeId === route.routeId);
    if (indexed === undefined || indexed.slug !== route.slug) {
      throw new Error(`Plan 097 exact route identity mismatch for ${route.routeId}`);
    }
    const detail = await request(
      `/api/v1/studio/routes/${route.slug}`,
      "bp.studio.route_detail_response.v3",
      StudioRouteDetailResponseSchema,
    );
    assertPlan097RouteDetail({
      mode,
      expectedReleaseId: status.releaseId,
      expectedRouteId: route.routeId,
      expectedSlug: route.slug,
      requireCandidateDossier: route.requireDossier,
      actualReleaseId: detail.releaseId,
      actualRouteId: detail.route.routeId,
      actualSlug: detail.route.slug,
      dossierPresent: detail.dossier !== null,
    });
  }

  for (const slug of ["bx38", "b1"] as const) {
    const history = await request(
      `/api/v1/studio/routes/${slug}/history`,
      "bp.studio.route_history_response.v1",
      StudioRouteHistoryResponseSchema,
    );
    if (history.points.length === 0) {
      throw new Error(`Plan 097 route history is empty for ${slug}`);
    }
    await request(
      `/api/v1/studio/routes/${slug}/hourly-profile`,
      "bp.studio.route_hourly_profile_response.v1",
      StudioRouteHourlyProfileResponseSchema,
    );
    await request(
      `/api/v1/studio/routes/${slug}/speed-history`,
      "bp.studio.route_speed_history_response.v1",
      StudioRouteSpeedHistoryResponseSchema,
    );
    await request(
      `/api/v1/studio/routes/${slug}/timeline`,
      "bp.studio.route_evidence_bundle.v1",
      StudioRouteEvidenceBundleSchema,
    );
  }

  const mapManifestPath = releaseAwarePath("/api/v1/map/manifest", nonce);
  const mapManifest =
    mode === "candidate"
      ? await request(
          "/api/v1/map/manifest",
          "bp.map_manifest_response.v2",
          MapManifestResponseSchema,
        )
      : await fetchPlan097HttpBaselineEvidence({
          fetch: fetchDependency,
          baseUrl: input.baseUrl,
          path: mapManifestPath,
          schemaId: "bp.map_manifest_response.v2",
          schema: MapManifestResponseSchema,
        }).then((result) => {
          endpoints.push(result.evidence);
          return result.value;
        });
  if (mapManifest === null) {
    assertPlan097RecoveryCacheSafety(endpoints);
    return {
      baseline: {
        checkedAt: input.checkedAt ?? new Date().toISOString(),
        activeReleaseId: status.releaseId,
        endpoints,
      },
      exactRouteCount: routeIndex.routes.length,
      representativeGeometry: null,
    };
  }
  if (
    mapManifest.releaseId !== status.releaseId ||
    mapManifest.releaseProfile !== "full" ||
    mapManifest.status !== "pass" ||
    mapManifest.verificationStatus !== "pass"
  ) {
    throw new Error("Plan 097 map manifest does not match the active Studio release");
  }
  const geometry = mapManifest.artifacts.find(
    (artifact) =>
      artifact.artifactKind === "map_route_segments_geojson" && artifact.featureCount > 0,
  );
  if (geometry === undefined) {
    throw new Error("Plan 097 map manifest has no representative route geometry");
  }
  const geometryResult = await fetchPlan097HttpEvidence({
    fetch: fetchDependency,
    baseUrl: input.baseUrl,
    path: releaseAwarePath(geometry.apiPath, nonce),
    schemaId: "bp.map_route_segment_feature_collection.v2",
    schema: MapRouteSegmentFeatureCollectionSchema,
  });
  endpoints.push(geometryResult.evidence);
  if (
    geometryResult.evidence.safeBodySha256 !== geometry.sha256 ||
    geometryResult.value.features.length !== geometry.featureCount
  ) {
    throw new Error("Plan 097 representative map geometry differs from its manifest");
  }
  assertPlan097RecoveryCacheSafety(endpoints);

  return {
    baseline: {
      checkedAt: input.checkedAt ?? new Date().toISOString(),
      activeReleaseId: status.releaseId,
      endpoints,
    },
    exactRouteCount: routeIndex.routes.length,
    representativeGeometry: {
      path: geometryResult.evidence.path,
      sha256: geometry.sha256,
      featureCount: geometry.featureCount,
    },
  };
}
