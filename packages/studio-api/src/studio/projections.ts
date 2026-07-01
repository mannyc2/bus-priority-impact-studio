import { getStudioRoute } from "@bp/domain/studio/projections";
import {
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
} from "@bp/domain/studio/routes";
import type * as z from "zod";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";

const defaultStudioReleaseArtifactKey = "studio/v1/release.json";
const ARTIFACT_NOT_AVAILABLE_MESSAGE = "Artifact is not available.";
const SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE = "Service dependency is not configured.";

export function studioReleaseKey(env: Pick<StudioApiEnv, "STUDIO_RELEASE_KEY">): string {
  const configuredKey = env.STUDIO_RELEASE_KEY?.trim();
  return configuredKey && configuredKey.length > 0
    ? configuredKey
    : defaultStudioReleaseArtifactKey;
}

export function studioProjectionPrefix(env: Pick<StudioApiEnv, "STUDIO_RELEASE_KEY">): string {
  const parts = studioReleaseKey(env).split("/");
  parts.pop();
  return parts.length === 0 ? "studio/v1" : parts.join("/");
}

export function studioProjectionKey(
  env: Pick<StudioApiEnv, "STUDIO_RELEASE_KEY">,
  path: string,
): string {
  return `${studioProjectionPrefix(env)}/${path}`;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function studioJsonResponse(
  body: unknown,
  env: Pick<StudioApiEnv, "STUDIO_RELEASE_KEY">,
): Response {
  const bodyText = JSON.stringify(body);
  const contentHash = hashString(bodyText);

  return new Response(bodyText, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
      ETag: `"studio-${contentHash}"`,
      "X-Studio-Content-Hash": contentHash,
      "X-Studio-Release": studioProjectionPrefix(env),
    },
  });
}

export async function loadStudioProjection<TSchema extends z.ZodType>(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
  path: string,
  schema: TSchema,
): Promise<Response | z.output<TSchema>> {
  if (env.ARTIFACTS === undefined) {
    console.error("Service dependency is not configured.", {
      context: "Studio API projection load",
      dependency: "ARTIFACTS",
    });
    return errorResponse(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
  }

  const key = studioProjectionKey(env, path);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    console.error("Studio API projection artifact was not found.", { key });
    return errorResponse(503, ARTIFACT_NOT_AVAILABLE_MESSAGE);
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    console.error("Studio API projection artifact is not valid JSON.", { key });
    return errorResponse(502, ARTIFACT_NOT_AVAILABLE_MESSAGE);
  }

  const projection = schema.safeParse(payload);
  if (!projection.success) {
    console.error("Studio API projection artifact failed contract validation.", { key });
    return errorResponse(502, ARTIFACT_NOT_AVAILABLE_MESSAGE);
  }

  return projection.data;
}

export async function loadStudioRouteProjection(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
  routeSlug: string,
): Promise<
  | {
      ok: true;
      route: StudioRoute;
      quality: StudioRoutesResponse["quality"];
      generatedAt: string;
    }
  | { ok: false; response: Response }
> {
  const routes = await loadStudioProjection(env, "routes.json", StudioRoutesResponseSchema);
  if (routes instanceof Response) {
    return { ok: false, response: routes };
  }
  const route = getStudioRoute(routes, routeSlug);
  if (route === undefined) {
    return { ok: false, response: errorResponse(404, "Studio route was not found.") };
  }
  return { ok: true, route, quality: routes.quality, generatedAt: routes.generatedAt };
}

export async function maybeLoadStudioRouteDetailProjection(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
  routeSlug: string,
): Promise<StudioRouteDetailResponse | null> {
  const detail = await loadStudioProjection(
    env,
    `routes/${routeSlug}/index.json`,
    StudioRouteDetailResponseSchema,
  );
  return detail instanceof Response ? null : detail;
}
