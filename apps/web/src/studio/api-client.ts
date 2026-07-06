import type { MapManifestResponse, MapRouteSegmentFeatureCollection } from "@bp/domain/maps";
import {
  createStudioApiClient,
  type PathBuildInput,
  type StudioApiRouteId,
} from "@bp/studio-api/client";
import type {
  StudioInterventionsEvidenceResponse,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteHourlyProfileResponse,
  StudioRouteIndex2Response,
  StudioRouteSpeedHistoryResponse,
  StudioRoutesResponse,
} from "./api-contract.js";

type StudioApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type StudioQueryOptions = {
  signal?: AbortSignal;
};

export const staticStudioLoaderStaleTimeMs = 5 * 60 * 1000;

const studioApiClient = createStudioApiClient();

function studioPath(routeId: StudioApiRouteId, input: PathBuildInput = {}): string {
  return studioApiClient.path(routeId, input);
}

export class StudioApiError extends Error {
  override readonly name = "StudioApiError";
  readonly status: number;
  readonly path: string;
  readonly code: string;

  constructor({
    status,
    path,
    code,
    message,
  }: {
    status: number;
    path: string;
    code?: string;
    message?: string;
  }) {
    super(message ?? `Studio API request failed: ${status} ${path}`);
    this.status = status;
    this.path = path;
    this.code = code ?? `HTTP_${status}`;
  }
}

async function readErrorBody(response: Response): Promise<StudioApiErrorBody | null> {
  try {
    const body: StudioApiErrorBody = await response.json();
    return body;
  } catch {
    return null;
  }
}

async function apiError(response: Response, path: string): Promise<StudioApiError> {
  const body = await readErrorBody(response);
  return new StudioApiError({
    status: response.status,
    path,
    ...(body?.error?.code ? { code: body.error.code } : {}),
    ...(body?.error?.message ? { message: body.error.message } : {}),
  });
}

async function loadStudioJson<T>(path: string, options: StudioQueryOptions = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const body: T = await response.json();
  return body;
}

async function loadNullableStudioJson<T>(
  path: string,
  options: StudioQueryOptions = {},
): Promise<T | null> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await apiError(response, path);
  }

  const body: T = await response.json();
  return body;
}

export function fetchStudioRoutes(options?: StudioQueryOptions) {
  return loadStudioJson<StudioRoutesResponse>(studioPath("studio.routes"), options);
}

export function fetchStudioRouteIndex(options?: StudioQueryOptions) {
  return loadStudioJson<StudioRouteIndex2Response>(
    `${studioPath("studio.routes")}?schema=2`,
    options,
  );
}

export function fetchStudioInterventionsEvidence(options?: StudioQueryOptions) {
  return loadStudioJson<StudioInterventionsEvidenceResponse>(
    studioPath("studio.interventionsEvidence"),
    options,
  );
}

export function timelineEvidenceRouteSlugs(routeIndex: StudioRouteIndex2Response): string[] {
  return routeIndex.routes.flatMap((route) =>
    route.projectionRefs.some(
      (ref) => ref.id === "route_timeline" && ref.status === "available" && ref.path !== null,
    )
      ? [route.slug]
      : [],
  );
}

export function fetchStudioRoute(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioRouteDetailResponse>(
    studioPath("studio.route", { params: { routeId } }),
    options,
  );
}

export function fetchStudioRouteSpeedHistory(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioRouteSpeedHistoryResponse>(
    studioPath("studio.routeSpeedHistory", { params: { routeId } }),
    options,
  );
}

export function fetchStudioRouteHourlyProfile(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioRouteHourlyProfileResponse>(
    studioPath("studio.routeHourlyProfile", { params: { routeId } }),
    options,
  );
}

export function fetchStudioRouteEvidence(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioRouteEvidenceBundle>(
    studioPath("studio.routeTimeline", { params: { routeId } }),
    options,
  );
}

export type MapContextCollection = {
  features: Array<{
    geometry: {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };
  }>;
};

const MAP_CONTEXT_PATH = "/api/v1/artifacts/map/context/nyc-boroughs.min.geojson";

/** NYC borough shoreline polygons used as the route map's land/water context. */
export function fetchMapContext(options?: StudioQueryOptions) {
  return loadNullableStudioJson<MapContextCollection>(MAP_CONTEXT_PATH, options);
}

export type NetworkMapFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "MultiLineString";
    coordinates: Array<Array<[number, number]>>;
  };
  properties: {
    routeId: string;
    label: string;
    borough: string;
    sbs: boolean;
    scheduledMph: number;
    currentMph: number;
    trend6mPct: number | null;
    dailyRiders: number;
    riderHoursLost: number | null;
    laneCoverage: number;
    ace: boolean;
    hotspotCount: number;
    segmentCount: number;
    hours: number[];
  };
};

export type NetworkMapFeatureCollection = {
  type: "FeatureCollection";
  features: NetworkMapFeature[];
};

async function fetchMapManifest(options?: StudioQueryOptions) {
  return loadNullableStudioJson<MapManifestResponse>(studioPath("public.mapManifest"), options);
}

/** Fetch the precomputed route-segment GeoJSON for one route, via the map manifest. */
export async function fetchRouteSegmentsGeo(routeId: string, options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const entry = manifest.artifacts.find(
    (artifact) =>
      artifact.artifactKind === "map_route_segments_geojson" && artifact.routeId === routeId,
  );
  if (entry === undefined) return null;
  return loadNullableStudioJson<MapRouteSegmentFeatureCollection>(entry.apiPath, options);
}

/** Fetch the citywide simplified network GeoJSON discovered through the map manifest. */
export async function fetchNetworkMapGeo(options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const entry = manifest.artifacts.find(
    (artifact) => artifact.artifactKind === "map_network_simplified_geojson",
  );
  if (entry === undefined) return null;
  return loadNullableStudioJson<NetworkMapFeatureCollection>(entry.apiPath, options);
}
