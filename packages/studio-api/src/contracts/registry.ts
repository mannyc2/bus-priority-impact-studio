import { privateNoStore, publicStudioCache } from "./cache-policy.js";
import { noIdempotency } from "./idempotency.js";
import type { RouteAuth, RouteSpec } from "./route-spec.js";

const publicAuth = { kind: "public" } as const satisfies RouteAuth;

function route<const TSpec extends RouteSpec>(spec: TSpec): TSpec {
  return spec;
}

export const studioApiRoutes = [
  route({
    id: "system.health",
    operationId: "getHealth",
    method: "GET",
    path: "/api/health",
    tags: ["System"],
    summary: "Return API health status.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "system.openapi",
    operationId: "getOpenApi",
    method: "GET",
    path: "/api/openapi.json",
    tags: ["System"],
    summary: "Return the Studio OpenAPI document.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "observability.rum",
    operationId: "postRum",
    method: "POST",
    path: "/api/v1/rum",
    tags: ["Observability"],
    summary: "Record browser route performance telemetry.",
    auth: publicAuth,
    cache: privateNoStore,
    idempotency: noIdempotency,
  }),
  route({
    id: "public.status",
    operationId: "getReleaseStatus",
    method: "GET",
    path: "/api/v1/status",
    tags: ["Public"],
    summary: "Return current public serving release status.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "public.mapManifest",
    operationId: "getMapManifest",
    method: "GET",
    path: "/api/v1/map/manifest",
    tags: ["Public"],
    summary: "Return map artifact metadata.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "public.artifact",
    operationId: "getArtifact",
    method: "GET",
    path: "/api/v1/artifacts/:artifactKey*",
    tags: ["Public"],
    summary: "Fetch a public artifact by key.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routes",
    operationId: "getStudioRoutes",
    method: "GET",
    path: "/api/v1/studio/routes",
    tags: ["Studio"],
    summary: "List Studio route projections.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.snapshot",
    operationId: "getStudioSnapshot",
    method: "GET",
    path: "/api/v1/studio/snapshot",
    tags: ["Studio"],
    summary: "Return a compact Studio release snapshot.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routeSections",
    operationId: "listStudioRouteSections",
    method: "GET",
    path: "/api/v1/studio/routes/sections",
    tags: ["Studio"],
    summary: "Return route discovery sections.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.route",
    operationId: "getStudioRoute",
    method: "GET",
    path: "/api/v1/studio/routes/:routeId",
    tags: ["Studio"],
    summary: "Return a Studio route detail projection.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routeHistory",
    operationId: "getStudioRouteHistory",
    method: "GET",
    path: "/api/v1/studio/routes/:routeId/history",
    tags: ["Studio"],
    summary: "Return route-month speed and ridership history.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routeHourlyProfile",
    operationId: "getStudioRouteHourlyProfile",
    method: "GET",
    path: "/api/v1/studio/routes/:routeId/hourly-profile",
    tags: ["Studio"],
    summary: "Return route hourly ridership, speed, and reliability samples.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routeSpeedHistory",
    operationId: "getStudioRouteSpeedHistory",
    method: "GET",
    path: "/api/v1/studio/routes/:routeId/speed-history",
    tags: ["Studio"],
    summary: "Return route-segment speed history by month and daypart.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
  route({
    id: "studio.routeTimeline",
    operationId: "getStudioRouteTimeline",
    method: "GET",
    path: "/api/v1/studio/routes/:routeId/timeline",
    tags: ["Studio"],
    summary: "Return source-backed MTA-wiki route evidence for a route.",
    auth: publicAuth,
    cache: publicStudioCache,
    idempotency: noIdempotency,
  }),
] as const;

export type StudioApiRoute = (typeof studioApiRoutes)[number];
export type StudioApiRouteId = StudioApiRoute["id"];

export function getStudioApiRoute(routeId: StudioApiRouteId): StudioApiRoute {
  const route = studioApiRoutes.find((candidate) => candidate.id === routeId);
  if (route === undefined) {
    throw new Error(`Unknown Studio API route id: ${routeId}`);
  }
  return route;
}
