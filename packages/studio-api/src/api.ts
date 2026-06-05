import { handleAuthRoutes } from "./auth-routes.js";
import type { StudioApiEnv } from "./env.js";
import { errorResponse } from "./http/errors.js";
import { allowedApiMethodsForPath, isApiPath, isStudioApiPath } from "./http/routing.js";
import { withServerTiming } from "./http/timing.js";
import { handleObservabilityRoutes } from "./observability.js";
import { handlePublicApiRoutes } from "./public-api.js";
import { handleSchemaRoutes } from "./schema-routes.js";
import type { StudioAuthoringEnv } from "./studio/brief-drafts.js";
import { handleStudioReadRequest } from "./studio/read-handlers.js";

export async function handleStudioApiRequest(
  request: Request,
  env: StudioApiEnv,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!isApiPath(url.pathname)) {
    return null;
  }

  const allowedMethods = allowedApiMethodsForPath(url.pathname);
  if (allowedMethods.length > 0 && !allowedMethods.includes(request.method)) {
    const response = errorResponse(
      405,
      "Method is not allowed for this API route.",
      "METHOD_NOT_ALLOWED",
    );
    response.headers.set("Allow", allowedMethods.join(", "));
    return response;
  }

  const authResponse = await handleAuthRoutes(request, env, url);
  if (authResponse !== null) {
    return authResponse;
  }

  const observabilityResponse = await handleObservabilityRoutes(request, url);
  if (observabilityResponse !== null) {
    return observabilityResponse;
  }

  const schemaResponse = handleSchemaRoutes(url);
  if (schemaResponse !== null) {
    return schemaResponse;
  }

  if (url.pathname.match(/^\/api\/v1\/studio\/briefs\/[^/]+\/draft(?:\/.*)?$/)) {
    const { handleBriefDraftRoutes } = await import("./studio/brief-drafts.js");
    return withServerTiming("studio-draft", () =>
      handleBriefDraftRoutes(request, env as StudioAuthoringEnv, url, ctx),
    );
  }

  if (url.pathname === "/api/v1/studio/briefs" && request.method === "POST") {
    const { handleStudioBriefCreate } = await import("./studio/brief-drafts.js");
    return withServerTiming("studio", () =>
      handleStudioBriefCreate(request, env as StudioAuthoringEnv, url),
    );
  }

  if (isStudioApiPath(url.pathname)) {
    if (url.pathname.match(/^\/api\/v1\/studio\/briefs\/[^/]+$/)) {
      const { maybeLoadDraftOnlyBriefProjection, maybeOverlayStudioBriefDraft } = await import(
        "./studio/brief-drafts.js"
      );
      return withServerTiming("studio", () =>
        handleStudioReadRequest(request, url, env as StudioAuthoringEnv, {
          loadDraftOnlyBriefProjection: maybeLoadDraftOnlyBriefProjection,
          overlayStudioBriefDraft: maybeOverlayStudioBriefDraft,
        }),
      );
    }

    return withServerTiming("studio", () => handleStudioReadRequest(request, url, env));
  }

  const publicApiResponse = await handlePublicApiRoutes(url, env);
  if (publicApiResponse !== null) {
    return publicApiResponse;
  }

  return errorResponse(404, "API route was not found.", "NOT_FOUND");
}
