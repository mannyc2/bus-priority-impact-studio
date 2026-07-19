import { decodeStrict } from "@bp/domain/decode";
import type {
  MapBusLaneFeatureCollection,
  MapContextFeatureCollection,
  MapManifestResponse,
  MapNetworkFeatureCollection as MapNetworkGeometryCollection,
  MapRouteFactsResponse,
  MapRouteSegmentFeatureCollection,
} from "@bp/domain/maps";
import { interventionCorpusKey } from "@bp/domain/studio/intervention-corpus-key";
import { routeStudiesKey, studyIndexKey } from "@bp/domain/studio/study-key";
import {
  createStudioApiClient,
  type PathBuildInput,
  type StudioApiRouteId,
} from "@bp/studio-api/client";
import type {
  RouteStudiesArtifact,
  StudioInterventionCorpus,
  StudioInterventionsEvidenceResponse,
  StudioRouteDetailResponse,
  StudioRouteEvidenceBundle,
  StudioRouteHourlyProfileResponse,
  StudioRouteIndex3Response,
  StudioRouteSpeedHistoryResponse,
  StudioRoutesResponse,
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

export function fetchStudioRoutes(options?: StudioQueryOptions) {
  return loadStudioJson<StudioRoutesResponse>(studioPath("studio.routes"), options);
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

export type NetworkMapFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "MultiLineString";
    coordinates: readonly (readonly (readonly [number, number])[])[];
  };
  properties: {
    routeId: string;
    label: string;
    borough: string | null;
    sbs: boolean | null;
    currentMph: number | null;
    trend6mPct: number | null;
    dailyRiders: number | null;
    riderHoursLost: number | null;
    laneCoverage: number | null;
    ace: boolean | null;
    hourlySpeedMph: Array<number | null>;
    hourlyTraversalCount: number[];
    servedBoroughs: string[];
    factsStatus: "ready" | "unavailable" | "baseline_mismatch";
  };
};

export type NetworkMapFeatureCollection = {
  type: "FeatureCollection";
  features: NetworkMapFeature[];
};

export async function fetchMapManifest(options?: StudioQueryOptions) {
  return loadNullableStudioJson<MapManifestResponse>(studioPath("public.mapManifest"), options);
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
      | "baselineMonth"
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
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features))
    return null;
  const routeIds = new Set<string>();
  for (const feature of value.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties))
      return null;
    const geometry = feature.geometry;
    const properties = feature.properties;
    if (geometry.type !== "MultiLineString" || !Array.isArray(geometry.coordinates)) return null;
    if (
      !geometry.coordinates.every(
        (line) => Array.isArray(line) && line.length >= 2 && line.every(isCoordinate),
      )
    )
      return null;
    const routeId = properties.routeId;
    const speeds = properties.hourlySpeedMph;
    const traversals = properties.hourlyTraversalCount;
    if (
      typeof routeId !== "string" ||
      routeIds.has(routeId) ||
      !Array.isArray(speeds) ||
      speeds.length !== 24 ||
      !Array.isArray(traversals) ||
      traversals.length !== 24
    )
      return null;
    if (
      speeds.some(
        (speed, index) =>
          (speed !== null && typeof speed !== "number") ||
          (speed !== null && !(typeof traversals[index] === "number" && traversals[index] > 0)),
      )
    )
      return null;
    routeIds.add(routeId);
  }
  return value as MapNetworkGeometryCollection;
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
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.baselineMonth !== "string" ||
    !Array.isArray(value.routes)
  )
    return null;
  const routeIds = new Set<string>();
  const valid = value.routes.every((fact) => {
    if (!isRecord(fact) || !isRecord(fact.route)) return false;
    const routeId = fact.route.routeId;
    if (typeof routeId !== "string" || routeIds.has(routeId)) return false;
    routeIds.add(routeId);
    return (
      typeof fact.route.label === "string" &&
      typeof fact.route.speedMph === "number" &&
      typeof fact.route.dailyRiders === "number" &&
      isRecord(fact.delayExposure) &&
      isRecord(fact.provenance) &&
      isRecord(fact.provenance.lane) &&
      isRecord(fact.provenance.ace)
    );
  });
  return valid ? (value as MapRouteFactsResponse) : null;
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
  const layer = manifest.layers.find((candidate) => candidate.layerId === "bus_lanes");
  if (
    layer === undefined ||
    layer.readiness !== "available" ||
    layer.currencyStatus !== "current" ||
    layer.artifactKey === null
  )
    return Promise.resolve({
      status: "unavailable",
      reason: layer?.reason ?? "Bus-lane layer is not declared.",
    });
  return fetchManifestArtifact(manifest, "map_bus_lanes_geojson", parseBusLaneCollection, options);
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

/** NYC borough shoreline polygons used as progressive map context. */
export async function fetchMapContext(options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const load = await fetchMapContextLoad(manifest, options);
  return load.status === "ready" ? load.data : null;
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
  factsStatus: "ready" | "unavailable" | "baseline_mismatch";
  completeFactCount: number;
  routeCount: number;
  message: string | null;
};

export function joinNetworkMapBundle(bundle: NetworkMapBundle | null): NetworkMapJoinResult {
  if (bundle === null)
    return {
      collection: null,
      factsStatus: "unavailable",
      completeFactCount: 0,
      routeCount: 0,
      message: "The map manifest is unavailable.",
    };
  if (bundle.network.status !== "ready")
    return {
      collection: null,
      factsStatus: "unavailable",
      completeFactCount: 0,
      routeCount: 0,
      message:
        bundle.network.status === "integrity_mismatch"
          ? `Network geometry failed integrity verification (expected ${bundle.network.expectedSha256}, received ${bundle.network.actualSha256}).`
          : `Citywide network geometry is unavailable (${bundle.network.status}).`,
    };
  const baselineMismatch =
    bundle.routeFacts.status === "ready" &&
    bundle.routeFacts.data.baselineMonth !== bundle.manifest.baselineMonth;
  const facts =
    bundle.routeFacts.status === "ready" && !baselineMismatch ? bundle.routeFacts.data : null;
  const factsByRoute = new Map(
    facts?.routes.map((fact) => [fact.route.routeId, fact] as const) ?? [],
  );
  let completeFactCount = 0;
  const features = bundle.network.data.features.map((feature) => {
    const fact = factsByRoute.get(feature.properties.routeId);
    if (fact !== undefined) completeFactCount += 1;
    return {
      type: "Feature" as const,
      id: `network-route:${feature.properties.routeId}`,
      geometry: feature.geometry,
      properties: {
        routeId: feature.properties.routeId,
        label: fact?.route.label ?? feature.properties.routeId,
        borough: fact?.route.borough ?? null,
        sbs: fact?.route.sbs ?? null,
        currentMph: fact?.route.speedMph ?? null,
        trend6mPct: fact?.route.movement6mPct ?? null,
        dailyRiders: fact?.route.dailyRiders ?? null,
        riderHoursLost: fact?.delayExposure.valueRiderHours ?? null,
        laneCoverage: fact?.provenance.lane.valuePct ?? null,
        ace:
          fact === undefined || fact.provenance.ace.status === "unknown"
            ? null
            : fact.provenance.ace.status === "active",
        hourlySpeedMph: [...feature.properties.hourlySpeedMph],
        hourlyTraversalCount: [...feature.properties.hourlyTraversalCount],
        servedBoroughs: [...feature.properties.servedBoroughs],
        factsStatus: baselineMismatch
          ? ("baseline_mismatch" as const)
          : fact === undefined
            ? ("unavailable" as const)
            : ("ready" as const),
      },
    };
  });
  const routeCount = features.length;
  const factsStatus = baselineMismatch
    ? "baseline_mismatch"
    : completeFactCount === routeCount && bundle.routeFacts.status === "ready"
      ? "ready"
      : "unavailable";
  const factFailureMessage =
    bundle.routeFacts.status === "integrity_mismatch"
      ? `Route facts failed integrity verification (expected ${bundle.routeFacts.expectedSha256}, received ${bundle.routeFacts.actualSha256}).`
      : null;
  return {
    collection: { type: "FeatureCollection", features },
    factsStatus,
    completeFactCount,
    routeCount,
    message: baselineMismatch
      ? `Map geometry is for ${bundle.manifest.baselineMonth}, but route facts are for ${bundle.routeFacts.status === "ready" ? bundle.routeFacts.data.baselineMonth : "an unavailable month"}.`
      : factFailureMessage !== null
        ? `${factFailureMessage} ${completeFactCount} of ${routeCount} routes have complete metric facts.`
        : completeFactCount === routeCount
          ? null
          : `${completeFactCount} of ${routeCount} routes have complete metric facts.`,
  };
}
