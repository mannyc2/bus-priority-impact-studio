import { MapManifestResponseSchema, MapRouteSegmentFeatureCollectionSchema } from "@bp/domain/maps";
import {
  createStudioApiClient,
  type PathBuildInput,
  type StudioApiRouteId,
} from "@bp/studio-api/client";
import * as z from "zod";
import {
  StudioMethodsResponseSchema,
  StudioRouteDetailResponseSchema,
  StudioRouteSpeedHistoryResponseSchema,
  StudioRoutesResponseSchema,
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

export class StudioApiContractError extends Error {
  override readonly name = "StudioApiContractError";
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Studio API response failed contract validation: ${path}`);
    this.path = path;
    this.cause = cause;
  }
}

async function readErrorBody(response: Response): Promise<StudioApiErrorBody | null> {
  try {
    return (await response.json()) as StudioApiErrorBody;
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

async function loadStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: StudioQueryOptions = {},
): Promise<z.output<TSchema>> {
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

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

async function loadNullableStudioJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: StudioQueryOptions = {},
): Promise<z.output<TSchema> | null> {
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

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new StudioApiContractError(path, parsed.error);
  }

  return parsed.data;
}

export function fetchStudioRoutes(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.routes"), StudioRoutesResponseSchema, options);
}

export function fetchStudioRoute(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.route", { params: { routeId } }),
    StudioRouteDetailResponseSchema,
    options,
  );
}

export function fetchStudioRouteSpeedHistory(routeId: string, options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("studio.routeSpeedHistory", { params: { routeId } }),
    StudioRouteSpeedHistoryResponseSchema,
    options,
  );
}

export function fetchStudioMethods(options?: StudioQueryOptions) {
  return loadStudioJson(studioPath("studio.methods"), StudioMethodsResponseSchema, options);
}

const MapContextCollectionSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal("MultiPolygon"),
        coordinates: z.array(z.array(z.array(z.array(z.number()).length(2)))),
      }),
    }),
  ),
});

const MAP_CONTEXT_PATH = "/api/v1/artifacts/map/context/nyc-boroughs.min.geojson";

/** NYC borough shoreline polygons used as the route map's land/water context. */
export function fetchMapContext(options?: StudioQueryOptions) {
  return loadNullableStudioJson(MAP_CONTEXT_PATH, MapContextCollectionSchema, options);
}

const NetworkMapFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      id: z.string(),
      geometry: z.object({
        type: z.literal("MultiLineString"),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
      }),
      properties: z.object({
        routeId: z.string(),
        label: z.string(),
        borough: z.string(),
        sbs: z.boolean(),
        scheduledMph: z.number(),
        currentMph: z.number(),
        trend6mPct: z.number().nullable(),
        dailyRiders: z.number(),
        riderHoursLost: z.number().nullable(),
        laneCoverage: z.number(),
        ace: z.boolean(),
        hotspotCount: z.number(),
        segmentCount: z.number(),
        hours: z.array(z.number()).length(24),
      }),
    }),
  ),
});

export type NetworkMapFeatureCollection = z.output<typeof NetworkMapFeatureCollectionSchema>;
export type NetworkMapFeature = NetworkMapFeatureCollection["features"][number];

async function fetchMapManifest(options?: StudioQueryOptions) {
  return loadNullableStudioJson(
    studioPath("public.mapManifest"),
    MapManifestResponseSchema,
    options,
  );
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
  return loadNullableStudioJson(entry.apiPath, MapRouteSegmentFeatureCollectionSchema, options);
}

/** Fetch the citywide simplified network GeoJSON discovered through the map manifest. */
export async function fetchNetworkMapGeo(options?: StudioQueryOptions) {
  const manifest = await fetchMapManifest(options);
  if (manifest === null) return null;
  const entry = manifest.artifacts.find(
    (artifact) => artifact.artifactKind === "map_network_simplified_geojson",
  );
  if (entry === undefined) return null;
  return loadNullableStudioJson(entry.apiPath, NetworkMapFeatureCollectionSchema, options);
}
