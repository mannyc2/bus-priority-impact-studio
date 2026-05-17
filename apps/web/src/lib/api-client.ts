import {
  type HotspotListResponse,
  HotspotListResponseSchema,
  type MapManifestResponse,
  MapManifestResponseSchema,
  type RouteCard,
  type RouteCompareResponse,
  RouteCompareResponseSchema,
  type RouteListResponse,
  RouteListResponseSchema,
  type RouteProfileResponse,
  RouteProfileResponseSchema,
} from "@bp/domain";

export const BASELINE_MONTH = "2026-03";

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${path}`);
  }
  return response.json();
}

export async function fetchRouteList(limit = 50): Promise<RouteListResponse> {
  const payload = await fetchJson(`/api/v1/routes?${query({ month: BASELINE_MONTH, limit })}`);
  return RouteListResponseSchema.parse(payload);
}

export async function fetchHotspots(limit = 50): Promise<HotspotListResponse> {
  const payload = await fetchJson(`/api/v1/hotspots?${query({ month: BASELINE_MONTH, limit })}`);
  return HotspotListResponseSchema.parse(payload);
}

export async function fetchRouteProfile(routeId: string): Promise<RouteProfileResponse> {
  const payload = await fetchJson(
    `/api/v1/routes/${encodeURIComponent(routeId)}/profile?${query({ month: BASELINE_MONTH })}`,
  );
  return RouteProfileResponseSchema.parse(payload);
}

export async function fetchRouteCompare(a: string, b: string): Promise<RouteCompareResponse> {
  const payload = await fetchJson(`/api/v1/compare?${query({ month: BASELINE_MONTH, a, b })}`);
  return RouteCompareResponseSchema.parse(payload);
}

export async function fetchMapManifest(): Promise<MapManifestResponse> {
  const payload = await fetchJson(`/api/v1/map/manifest?${query({ month: BASELINE_MONTH })}`);
  return MapManifestResponseSchema.parse(payload);
}

export async function fetchMapRouteShapes(): Promise<unknown | null> {
  const manifest = await fetchMapManifest();
  const routeShapes = manifest.artifacts.find(
    (artifact) => artifact.artifactKind === "map_route_shapes_geojson",
  );
  if (routeShapes === undefined) {
    return null;
  }

  return fetchJson(routeShapes.apiPath);
}

export function gradeFromScore(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function routeDisplayName(routeId: string): string {
  return routeId.replaceAll("+", " SBS").replaceAll("-", " ");
}

export function bunchingPercent(card: Pick<RouteCard, "observedBunchingShare">): number {
  return Math.round((card.observedBunchingShare ?? 0) * 100);
}
