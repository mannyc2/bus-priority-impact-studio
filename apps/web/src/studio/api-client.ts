import { decodeStrict } from "@bp/domain/decode";
import {
  type MapBusLaneFeatureCollection,
  type MapContextFeatureCollection,
  type MapManifestResponse,
  MapManifestResponseSchema,
  MapNetworkFeatureCollectionSchema,
  type MapNetworkFeatureCollection as MapNetworkGeometryCollection,
  type MapRouteFactsResponse,
  MapRouteFactsResponseSchema,
  type MapRouteSegmentFeatureCollection,
  MapRouteSegmentFeatureCollectionSchema,
} from "@bp/domain/maps";
import { interventionCorpusKey } from "@bp/domain/studio/intervention-corpus-key";
import {
  interventionFacetIndexKey,
  routeInterventionInventoryBundleKey,
} from "@bp/domain/studio/route-intervention-inventory-key";
import {
  StudioRouteDetailResponseSchema,
  StudioRoutesResponseSchema,
} from "@bp/domain/studio/routes";
import { routeStudiesKey, studyIndexKey } from "@bp/domain/studio/study-key";
import {
  createStudioApiClient,
  type PathBuildInput,
  type StudioApiRouteId,
} from "@bp/studio-api/client";
import type {
  RouteStudiesArtifact,
  StudioInterventionCorpus,
  StudioInterventionFacetIndex,
  StudioInterventionsEvidenceResponse,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteHourlyProfileResponse,
  StudioRouteIndex3Response,
  StudioRouteInterventionInventoryBundle,
  StudioRouteSpeedHistoryResponse,
  StudyIndexArtifact,
} from "./api-contract.js";
import { StudioRouteIndex3ResponseSchema } from "./api-contract.js";

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

export async function fetchStudioRoutes(options?: StudioQueryOptions) {
  return decodeStrict(StudioRoutesResponseSchema)(
    await loadStudioJson<unknown>(studioPath("studio.routes"), options),
  );
}

export async function fetchStudioRouteIndex(options?: StudioQueryOptions) {
  return decodeStrict(StudioRouteIndex3ResponseSchema)(
    await loadStudioJson<unknown>(`${studioPath("studio.routes")}?schema=3`, options),
  );
}

export function fetchStudioInterventionsEvidence(options?: StudioQueryOptions) {
  return loadStudioJson<StudioInterventionsEvidenceResponse>(
    studioPath("studio.interventionsEvidence"),
    options,
  );
}

function publicArtifactPath(key: string): string {
  return `/api/v1/artifacts/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

export function fetchStudioInterventionCorpus(options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioInterventionCorpus>(
    publicArtifactPath(interventionCorpusKey()),
    options,
  );
}

export function fetchStudioRouteInterventionInventory(
  routeSlug: string,
  options?: StudioQueryOptions,
) {
  return loadNullableStudioJson<StudioRouteInterventionInventoryBundle>(
    publicArtifactPath(routeInterventionInventoryBundleKey(routeSlug)),
    options,
  );
}

export function fetchStudioInterventionFacetIndex(options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudioInterventionFacetIndex>(
    publicArtifactPath(interventionFacetIndexKey()),
    options,
  );
}

export function fetchStudioRouteStudies(routeSlug: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson<RouteStudiesArtifact>(
    publicArtifactPath(routeStudiesKey(routeSlug)),
    options,
  );
}

export function fetchStudioStudiesIndex(options?: StudioQueryOptions) {
  return loadNullableStudioJson<StudyIndexArtifact>(publicArtifactPath(studyIndexKey()), options);
}

export function timelineEvidenceRouteSlugs(routeIndex: StudioRouteIndex3Response): string[] {
  return routeIndex.routes.flatMap((route) =>
    route.projectionRefs.some(
      (ref) => ref.id === "route_timeline" && ref.status === "available" && ref.path !== null,
    )
      ? [route.slug]
      : [],
  );
}

export async function fetchStudioRoute(routeId: string, options?: StudioQueryOptions) {
  const value = await loadNullableStudioJson<unknown>(
    studioPath("studio.route", { params: { routeId } }),
    options,
  );
  return value === null ? null : decodeStrict(StudioRouteDetailResponseSchema)(value);
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

export type NetworkMapFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "MultiLineString";
    coordinates: readonly (readonly (readonly [number, number])[])[];
  };
  properties: {
    routeId: string;
    month: string;
    label: string;
    borough: string | null;
    sbs: boolean | null;
    currentMph: number | null;
    trend6mPct: number | null;
    dailyRiders: number | null;
    riderHoursLost: number | null;
    delayCoverage: { start: string | null; end: string } | null;
    laneCoverage: number | null;
    ace: boolean | null;
    hourlySpeedMph: Array<number | null>;
    hourlyTraversalCount: number[];
    servedBoroughs: string[];
    factsStatus: "ready" | "unavailable" | "coverage_mismatch";
  };
};

export type NetworkMapFeatureCollection = {
  type: "FeatureCollection";
  features: NetworkMapFeature[];
};

export async function fetchMapManifest(options?: StudioQueryOptions) {
  const manifest = await loadNullableStudioJson<unknown>(studioPath("public.mapManifest"), options);
  return manifest === null ? null : decodeStrict(MapManifestResponseSchema)(manifest);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ArtifactLoad<T> =
  | {
      status: "ready";
      data: T;
      path: string;
      expectedSha256: string;
      actualSha256: string;
    }
  | { status: "missing"; path: string }
  | { status: "unavailable"; reason: string }
  | {
      status: "integrity_mismatch";
      path: string;
      expectedSha256: string;
      actualSha256: string;
    }
  | { status: "invalid_contract"; path: string; reason: string }
  | { status: "request_failed"; path: string; httpStatus: number; reason: string };

type JsonRecord = Record<string, unknown> &
  Partial<
    Record<
      | "ace"
      | "boroName"
      | "borough"
      | "coordinates"
      | "dailyRiders"
      | "delayExposure"
      | "facility"
      | "features"
      | "geometry"
      | "hourlySpeedMph"
      | "hourlyTraversalCount"
      | "label"
      | "labelPoint"
      | "lane"
      | "properties"
      | "provenance"
      | "route"
      | "routeId"
      | "routes"
      | "schemaVersion"
      | "segmentId"
      | "sourceRevision"
      | "speedMph"
      | "street"
      | "type",
      unknown
    >
  >;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function parseNetworkCollection(value: unknown): MapNetworkGeometryCollection | null {
  try {
    return decodeStrict(MapNetworkFeatureCollectionSchema)(value);
  } catch {
    return null;
  }
}

function parseContextCollection(value: unknown): MapContextFeatureCollection | null {
  if (
    !isRecord(value) ||
    value.type !== "FeatureCollection" ||
    !isRecord(value.sourceRevision) ||
    !Array.isArray(value.features) ||
    value.features.length === 0
  )
    return null;
  const valid = value.features.every(
    (feature) =>
      isRecord(feature) &&
      isRecord(feature.properties) &&
      typeof feature.properties.boroName === "string" &&
      isCoordinate(feature.properties.labelPoint) &&
      isRecord(feature.geometry) &&
      feature.geometry.type === "MultiPolygon" &&
      Array.isArray(feature.geometry.coordinates),
  );
  return valid ? (value as MapContextFeatureCollection) : null;
}

function parseBusLaneCollection(value: unknown): MapBusLaneFeatureCollection | null {
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features))
    return null;
  const valid = value.features.every((feature) => {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties))
      return false;
    const coordinates = feature.geometry.coordinates;
    const properties = feature.properties;
    return (
      feature.geometry.type === "LineString" &&
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      coordinates.every(isCoordinate) &&
      typeof properties.segmentId === "string" &&
      typeof properties.street === "string" &&
      typeof properties.borough === "string" &&
      typeof properties.facility === "string"
    );
  });
  return valid ? (value as MapBusLaneFeatureCollection) : null;
}

function parseRouteFacts(value: unknown): MapRouteFactsResponse | null {
  try {
    return decodeStrict(MapRouteFactsResponseSchema)(value);
  } catch {
    return null;
  }
}

function parseRouteSegmentCollection(
  value: unknown,
  sourceRouteId: string,
): MapRouteSegmentFeatureCollection | null {
  try {
    const collection = decodeStrict(MapRouteSegmentFeatureCollectionSchema)(value);
    return collection.features.every((feature) => feature.properties.routeId === sourceRouteId)
      ? collection
      : null;
  } catch {
    return null;
  }
}

export async function fetchVerifiedMapArtifact<T>(
  path: string,
  expectedSha256: string,
  parse: (value: unknown) => T | null,
  options: StudioQueryOptions = {},
): Promise<ArtifactLoad<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return {
      status: "request_failed",
      path,
      httpStatus: 0,
      reason: error instanceof Error ? error.message : "Artifact request failed.",
    };
  }
  if (response.status === 404) return { status: "missing", path };
  if (!response.ok)
    return {
      status: "request_failed",
      path,
      httpStatus: response.status,
      reason: `Artifact request failed with HTTP ${response.status}.`,
    };
  const bytes = await response.arrayBuffer();
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== expectedSha256)
    return { status: "integrity_mismatch", path, expectedSha256, actualSha256 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { status: "invalid_contract", path, reason: "Artifact body is not valid JSON." };
  }
  const data = parse(parsed);
  return data === null
    ? { status: "invalid_contract", path, reason: "Artifact failed its map data contract." }
    : { status: "ready", data, path, expectedSha256, actualSha256 };
}

export async function fetchMapRouteFacts(
  manifest: MapManifestResponse,
  options?: StudioQueryOptions,
): Promise<ArtifactLoad<MapRouteFactsResponse>> {
  if (manifest.routeFacts.status === "unavailable")
    return { status: "unavailable", reason: manifest.routeFacts.reason };
  return fetchVerifiedMapArtifact(
    publicArtifactPath(manifest.routeFacts.artifactKey),
    manifest.routeFacts.sha256,
    parseRouteFacts,
    options,
  );
}

async function fetchManifestArtifact<T>(
  manifest: MapManifestResponse,
  artifactKind: string,
  parse: (value: unknown) => T | null,
  options?: StudioQueryOptions,
): Promise<ArtifactLoad<T>> {
  const entry = manifest.artifacts.find((artifact) => artifact.artifactKind === artifactKind);
  return entry === undefined
    ? { status: "unavailable", reason: `Manifest does not declare ${artifactKind}.` }
    : fetchVerifiedMapArtifact(entry.apiPath, entry.sha256, parse, options);
}

export function fetchMapBusLanes(
  manifest: MapManifestResponse,
  options?: StudioQueryOptions,
): Promise<ArtifactLoad<MapBusLaneFeatureCollection>> {
  const entry = currentMapBusLaneArtifact(manifest);
  if (entry === null) {
    const layer = manifest.layers.find((candidate) => candidate.layerId === "bus_lanes");
    return Promise.resolve({
      status: "unavailable",
      reason:
        layer === undefined
          ? "Bus-lane layer is not declared."
          : "Manifest does not declare exactly one current bus-lane artifact.",
    });
  }
  return fetchVerifiedMapArtifact(entry.apiPath, entry.sha256, parseBusLaneCollection, options);
}

/** Exact current bus-lane object declared by both the layer and artifact tables. */
export function currentMapBusLaneArtifact(manifest: MapManifestResponse) {
  const layer = manifest.layers.find((candidate) => candidate.layerId === "bus_lanes");
  if (
    layer === undefined ||
    layer.readiness !== "available" ||
    layer.currencyStatus !== "current" ||
    layer.artifactKey === null
  )
    return null;
  const candidates = manifest.artifacts.filter(
    (artifact) =>
      artifact.artifactKind === "map_bus_lanes_geojson" &&
      artifact.artifactKey === layer.artifactKey,
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

async function fetchMapContextLoad(
  manifest: MapManifestResponse,
  options?: StudioQueryOptions,
): Promise<ArtifactLoad<MapContextFeatureCollection>> {
  return fetchManifestArtifact(
    manifest,
    "map_borough_context_geojson",
    parseContextCollection,
    options,
  );
}

function fetchRouteSegmentsLoad(
  manifest: MapManifestResponse,
  sourceRouteId: string,
  options?: StudioQueryOptions,
): Promise<ArtifactLoad<MapRouteSegmentFeatureCollection>> {
  const candidates = manifest.artifacts.filter(
    (artifact) =>
      artifact.artifactKind === "map_route_segments_geojson" && artifact.routeId === sourceRouteId,
  );
  if (candidates.length !== 1)
    return Promise.resolve({
      status: "unavailable",
      reason:
        candidates.length === 0
          ? `Manifest does not declare route segments for ${sourceRouteId}.`
          : `Manifest declares multiple route-segment artifacts for ${sourceRouteId}.`,
    });
  const entry = candidates[0];
  if (entry === undefined)
    return Promise.resolve({
      status: "unavailable",
      reason: `Manifest does not declare route segments for ${sourceRouteId}.`,
    });
  return fetchVerifiedMapArtifact(
    entry.apiPath,
    entry.sha256,
    (value) => parseRouteSegmentCollection(value, sourceRouteId),
    options,
  );
}

export type SelectedRouteDetailLoad =
  | { status: "ready"; data: StudioRouteDetailResponse; path: string }
  | { status: "unavailable"; reason: string; path: string }
  | { status: "invalid_contract"; reason: string; path: string }
  | { status: "request_failed"; reason: string; path: string; httpStatus: number };

export type SelectedRouteMapEvidence = {
  routeId: string;
  routeDetail: SelectedRouteDetailLoad;
  segments: ArtifactLoad<MapRouteSegmentFeatureCollection>;
};

async function fetchSelectedRouteDetail(
  sourceRouteId: string,
  options: StudioQueryOptions,
): Promise<SelectedRouteDetailLoad> {
  const path = studioPath("studio.route", { params: { routeId: sourceRouteId } });
  let value: unknown | null;
  try {
    value = await loadNullableStudioJson<unknown>(path, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return {
      status: "request_failed",
      path,
      httpStatus: error instanceof StudioApiError ? error.status : 0,
      reason: error instanceof Error ? error.message : "Route-detail request failed.",
    };
  }
  if (value === null)
    return {
      status: "unavailable",
      path,
      reason: `Route detail is unavailable for ${sourceRouteId}.`,
    };

  let data: StudioRouteDetailResponse;
  try {
    data = decodeStrict(StudioRouteDetailResponseSchema)(value);
  } catch {
    return { status: "invalid_contract", path, reason: "Route detail failed its data contract." };
  }
  return data.route.routeId === sourceRouteId
    ? { status: "ready", data, path }
    : {
        status: "invalid_contract",
        path,
        reason: `Route detail resolved ${data.route.routeId}, not ${sourceRouteId}.`,
      };
}

/**
 * Lazy evidence for one pinned source route. The caller supplies the already-loaded
 * citywide manifest so selecting a route never refetches or changes release identity.
 */
export async function fetchSelectedRouteMapEvidence(
  manifest: MapManifestResponse,
  sourceRouteId: string,
  options: StudioQueryOptions = {},
): Promise<SelectedRouteMapEvidence> {
  const [routeDetail, segments] = await Promise.all([
    fetchSelectedRouteDetail(sourceRouteId, options),
    fetchRouteSegmentsLoad(manifest, sourceRouteId, options),
  ]);
  return { routeId: sourceRouteId, routeDetail, segments };
}

/** NYC borough shoreline polygons used as progressive map context. */
export async function fetchMapContext(options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const load = await fetchMapContextLoad(manifest, options);
  return load.status === "ready" ? load.data : null;
}

/** Fetch the precomputed route-segment GeoJSON through the manifest/hash
 * boundary while preserving integrity and contract failure states. */
export async function fetchRouteSegmentsGeoLoad(routeId: string, options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null)
    return { status: "unavailable", reason: "Map manifest is unavailable." } as const;
  return fetchRouteSegmentsLoad(manifest, routeId, options);
}

/** Compatibility helper for locator surfaces that need only ready geometry. */
export async function fetchRouteSegmentsGeo(routeId: string, options?: StudioQueryOptions) {
  const segments = await fetchRouteSegmentsGeoLoad(routeId, options);
  return segments.status === "ready" ? segments.data : null;
}

export type NetworkMapBundle = {
  manifest: MapManifestResponse;
  network: ArtifactLoad<MapNetworkGeometryCollection>;
  context: ArtifactLoad<MapContextFeatureCollection>;
  routeFacts: ArtifactLoad<MapRouteFactsResponse>;
};

/** Fetch independently verified citywide map artifacts declared by one manifest. */
export async function fetchNetworkMapGeo(
  options?: StudioQueryOptions,
): Promise<NetworkMapBundle | null> {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const [network, context, routeFacts] = await Promise.all([
    fetchManifestArtifact(
      manifest,
      "map_network_simplified_geojson",
      parseNetworkCollection,
      options,
    ),
    fetchMapContextLoad(manifest, options),
    fetchMapRouteFacts(manifest, options),
  ]);
  return { manifest, network, context, routeFacts };
}

export type NetworkMapJoinResult = {
  collection: NetworkMapFeatureCollection | null;
  factsStatus: "ready" | "unavailable" | "coverage_mismatch";
  completeFactCount: number;
  routeCount: number;
  /**
   * End of the unanimous delay-exposure coverage window across every mapped
   * route, or null when any route lacks an available delay fact or the full
   * windows disagree. This is evidence grain, never release identity.
   */
  delayCoverageEnd: string | null;
  message: string | null;
};

type CoverageLike = { readonly start: string | null; readonly end: string };
type ReleaseIdentityLike = {
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly coverage: CoverageLike;
};

function coverageMatches(left: CoverageLike, right: CoverageLike): boolean {
  return left.start === right.start && left.end === right.end;
}

function releaseIdentityMatches(left: ReleaseIdentityLike, right: ReleaseIdentityLike): boolean {
  return (
    left.releaseId === right.releaseId &&
    left.publishedAt === right.publishedAt &&
    coverageMatches(left.coverage, right.coverage)
  );
}

function coverageLabel(coverage: CoverageLike): string {
  return coverage.start === null || coverage.start === coverage.end
    ? coverage.end
    : `${coverage.start} through ${coverage.end}`;
}

function releaseIdentityLabel(identity: ReleaseIdentityLike): string {
  return `${identity.releaseId} published ${identity.publishedAt}, covering ${coverageLabel(identity.coverage)}`;
}

export function joinNetworkMapBundle(bundle: NetworkMapBundle | null): NetworkMapJoinResult {
  if (bundle === null)
    return {
      collection: null,
      factsStatus: "unavailable",
      completeFactCount: 0,
      routeCount: 0,
      delayCoverageEnd: null,
      message: "The map manifest is unavailable.",
    };
  if (bundle.network.status !== "ready")
    return {
      collection: null,
      factsStatus: "unavailable",
      completeFactCount: 0,
      routeCount: 0,
      delayCoverageEnd: null,
      message:
        bundle.network.status === "integrity_mismatch"
          ? `Network geometry failed integrity verification (expected ${bundle.network.expectedSha256}, received ${bundle.network.actualSha256}).`
          : `Citywide network geometry is unavailable (${bundle.network.status}).`,
    };
  const networkIdentityMismatch = !releaseIdentityMatches(bundle.network.data, bundle.manifest);
  const routeFactsIdentityMismatch =
    bundle.routeFacts.status === "ready" &&
    (bundle.manifest.routeFacts.status !== "available" ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.manifest) ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.network.data) ||
      !releaseIdentityMatches(bundle.routeFacts.data, bundle.manifest.routeFacts));
  const coverageMismatch = networkIdentityMismatch || routeFactsIdentityMismatch;
  const facts =
    bundle.routeFacts.status === "ready" && !coverageMismatch ? bundle.routeFacts.data : null;
  const factsByRoute = new Map(
    facts?.routes.map((fact) => [fact.route.routeId, fact] as const) ?? [],
  );
  let completeFactCount = 0;
  let delayFactCount = 0;
  let unanimousDelayCoverage: { start: string | null; end: string } | null = null;
  let delayCoverageMismatch = false;
  const features = bundle.network.data.features.map((feature) => {
    const fact = factsByRoute.get(feature.properties.routeId);
    if (fact !== undefined) completeFactCount += 1;
    const exposure = fact?.delayExposure;
    if (
      exposure !== undefined &&
      exposure.status === "available" &&
      exposure.valueRiderHours !== null &&
      exposure.coverage !== null
    ) {
      delayFactCount += 1;
      if (unanimousDelayCoverage === null) {
        unanimousDelayCoverage = exposure.coverage;
      } else if (!coverageMatches(unanimousDelayCoverage, exposure.coverage)) {
        delayCoverageMismatch = true;
      }
    }
    return {
      type: "Feature" as const,
      id: `network-route:${feature.properties.routeId}`,
      geometry: feature.geometry,
      properties: {
        routeId: feature.properties.routeId,
        month: feature.properties.month,
        label: fact?.route.label ?? feature.properties.routeId,
        borough: fact?.route.borough ?? null,
        sbs: fact?.route.sbs ?? null,
        currentMph: fact?.route.speedMph ?? null,
        trend6mPct: fact?.route.movement6mPct ?? null,
        dailyRiders: fact?.route.dailyRiders ?? null,
        riderHoursLost: fact?.delayExposure.valueRiderHours ?? null,
        delayCoverage: fact?.delayExposure.coverage ?? null,
        laneCoverage: fact?.provenance.lane.valuePct ?? null,
        ace:
          fact === undefined || fact.provenance.ace.status === "unknown"
            ? null
            : fact.provenance.ace.status === "active",
        hourlySpeedMph: [...feature.properties.hourlySpeedMph],
        hourlyTraversalCount: [...feature.properties.hourlyTraversalCount],
        servedBoroughs: [...feature.properties.servedBoroughs],
        factsStatus: coverageMismatch
          ? ("coverage_mismatch" as const)
          : fact === undefined
            ? ("unavailable" as const)
            : ("ready" as const),
      },
    };
  });
  const routeCount = features.length;
  // The delay lens needs 100% of mapped routes on one shared evidence window;
  // anything less serves no coverage label and the lens stays hidden.
  const resolvedDelayCoverage = unanimousDelayCoverage as CoverageLike | null;
  const delayCoverageEnd =
    routeCount > 0 &&
    delayFactCount === routeCount &&
    !delayCoverageMismatch &&
    resolvedDelayCoverage !== null
      ? resolvedDelayCoverage.end
      : null;
  const factsStatus = coverageMismatch
    ? "coverage_mismatch"
    : completeFactCount === routeCount && bundle.routeFacts.status === "ready"
      ? "ready"
      : "unavailable";
  const factFailureMessage =
    bundle.routeFacts.status === "integrity_mismatch"
      ? `Route facts failed integrity verification (expected ${bundle.routeFacts.expectedSha256}, received ${bundle.routeFacts.actualSha256}).`
      : null;
  const coverageMismatchMessage = networkIdentityMismatch
    ? `Manifest covers ${coverageLabel(bundle.manifest.coverage)}, but map geometry covers ${coverageLabel(bundle.network.data.coverage)}. Release identity mismatch: expected ${releaseIdentityLabel(bundle.manifest)}; received ${releaseIdentityLabel(bundle.network.data)}.`
    : routeFactsIdentityMismatch && bundle.routeFacts.status === "ready"
      ? `Map geometry covers ${coverageLabel(bundle.network.data.coverage)}, but route facts cover ${coverageLabel(bundle.routeFacts.data.coverage)}. Release identity mismatch: manifest ${releaseIdentityLabel(bundle.manifest)}; network ${releaseIdentityLabel(bundle.network.data)}; route facts ${releaseIdentityLabel(bundle.routeFacts.data)}; manifest reference ${bundle.manifest.routeFacts.status === "available" ? releaseIdentityLabel(bundle.manifest.routeFacts) : "unavailable"}.`
      : null;
  return {
    collection: { type: "FeatureCollection", features },
    factsStatus,
    completeFactCount,
    routeCount,
    delayCoverageEnd,
    message: coverageMismatchMessage
      ? coverageMismatchMessage
      : factFailureMessage !== null
        ? `${factFailureMessage} ${completeFactCount} of ${routeCount} routes have complete metric facts.`
        : completeFactCount === routeCount
          ? null
          : `${completeFactCount} of ${routeCount} routes have complete metric facts.`,
  };
}
