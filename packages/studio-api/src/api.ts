import type { RouteSpec } from "./contracts/index.js";
import type { StudioApiEnv } from "./env.js";
import { errorResponse } from "./http/errors.js";
import {
  allowedApiMethodsForPath,
  findRouteSpec,
  isApiPath,
  isStudioApiPath,
} from "./http/routing.js";
import { withServerTiming } from "./http/timing.js";
import { handleObservabilityRoutes } from "./observability.js";
import { handlePublicApiRoutes } from "./public-api.js";
import { handleSchemaRoutes } from "./schema-routes.js";
import { handleStudioReadRequest } from "./studio/read-handlers.js";

function cacheControlForRoute(route: RouteSpec): string {
  const policy = route.cache;
  if (policy.kind === "private-no-store") return "private, no-store";
  if (policy.kind === "no-store") return "no-store";

  const segments = [`public, max-age=${policy.maxAgeSeconds}`];
  if (policy.staleWhileRevalidateSeconds !== undefined) {
    segments.push(`stale-while-revalidate=${policy.staleWhileRevalidateSeconds}`);
  }
  return segments.join(", ");
}

function preflightRouteRequest(request: Request, route: RouteSpec | null): Response | null {
  if (route === null) return null;

  if (route.auth.kind === "session") {
    return errorResponse(401, "Authentication is required.", "UNAUTHENTICATED");
  }

  if (route.idempotency.kind === "required") {
    const value = request.headers.get(route.idempotency.header)?.trim() ?? "";
    if (value.length === 0) {
      return errorResponse(400, "Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
    }
  }

  return null;
}

function applyRouteCachePolicy(route: RouteSpec | null, response: Response): Response {
  if (route === null || response.status >= 500 || response.headers.has("Cache-Control")) {
    return response;
  }

  const next = new Response(response.body, response);
  next.headers.set("Cache-Control", cacheControlForRoute(route));
  return next;
}

export async function handleStudioApiRequest(
  request: Request,
  env: StudioApiEnv,
  _ctx?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isApiPath(url.pathname)) {
    return null;
  }

  const allowedMethods = allowedApiMethodsForPath(url.pathname);
  if (isStudioApiPath(url.pathname) && allowedMethods.length === 0) {
    return errorResponse(404, "API route was not found.", "NOT_FOUND");
  }

  if (allowedMethods.length > 0 && !allowedMethods.includes(request.method)) {
    const response = errorResponse(
      405,
      "Method is not allowed for this API route.",
      "METHOD_NOT_ALLOWED",
    );
    response.headers.set("Allow", allowedMethods.join(", "));
    return response;
  }

  const routeSpec = findRouteSpec(request.method, url.pathname);
  const preflightResponse = preflightRouteRequest(request, routeSpec);
  if (preflightResponse !== null) {
    return preflightResponse;
  }

  const observabilityResponse = await handleObservabilityRoutes(request, url);
  if (observabilityResponse !== null) {
    return applyRouteCachePolicy(routeSpec, observabilityResponse);
  }

  const schemaResponse = handleSchemaRoutes(url);
  if (schemaResponse !== null) {
    return applyRouteCachePolicy(routeSpec, schemaResponse);
  }

  if (isStudioApiPath(url.pathname)) {
    const response = await withServerTiming("studio", () =>
      handleStudioReadRequest(request, url, env),
    );
    return applyRouteCachePolicy(routeSpec, response);
  }

  const publicApiResponse = await handlePublicApiRoutes(url, env);
  if (publicApiResponse !== null) {
    return applyRouteCachePolicy(routeSpec, publicApiResponse);
  }

  return errorResponse(404, "API route was not found.", "NOT_FOUND");
}
