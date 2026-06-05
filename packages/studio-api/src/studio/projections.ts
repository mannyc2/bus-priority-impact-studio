import {
  getStudioRoute,
  type StudioBriefResponse,
  StudioBriefResponseSchema,
  StudioBriefsResponseSchema,
  type StudioFindingResponse,
  StudioFindingResponseSchema,
  StudioFindingsResponseSchema,
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
} from "@bp/domain";
import type * as z from "zod";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";

const defaultStudioReleaseArtifactKey = "studio/v1/release.json";

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
    return errorResponse(503, "ARTIFACTS R2 binding is required for the Studio API.");
  }

  const key = studioProjectionKey(env, path);
  const object = await env.ARTIFACTS.get(key);
  if (object === null) {
    return errorResponse(503, `Studio API projection artifact was not found at ${key}.`);
  }

  let payload: unknown;
  try {
    payload = await object.json();
  } catch {
    return errorResponse(502, `Studio API projection artifact is not valid JSON: ${key}.`);
  }

  const projection = schema.safeParse(payload);
  if (!projection.success) {
    return errorResponse(502, `Studio API projection artifact failed contract validation: ${key}.`);
  }

  return projection.data;
}

export async function loadStudioBriefProjection(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
  briefId: string,
): Promise<{ ok: true; data: StudioBriefResponse } | { ok: false; response: Response }> {
  const briefs = await loadStudioProjection(env, "briefs.json", StudioBriefsResponseSchema);
  if (briefs instanceof Response) {
    return { ok: false, response: briefs };
  }
  if (!briefs.briefs.some(({ brief }) => brief.id === briefId)) {
    return { ok: false, response: errorResponse(404, "Studio brief was not found.") };
  }

  const brief = await loadStudioProjection(
    env,
    `briefs/${briefId}/index.json`,
    StudioBriefResponseSchema,
  );
  return brief instanceof Response ? { ok: false, response: brief } : { ok: true, data: brief };
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

export async function loadStudioFindingProjection(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
  findingId: string,
): Promise<{ ok: true; data: StudioFindingResponse } | { ok: false; response: Response }> {
  const findings = await loadStudioProjection(env, "findings.json", StudioFindingsResponseSchema);
  if (findings instanceof Response) {
    return { ok: false, response: findings };
  }
  if (!findings.findings.some(({ finding }) => finding.id === findingId)) {
    return { ok: false, response: errorResponse(404, "Studio finding was not found.") };
  }

  const finding = await loadStudioProjection(
    env,
    `findings/${findingId}/index.json`,
    StudioFindingResponseSchema,
  );
  return finding instanceof Response
    ? { ok: false, response: finding }
    : { ok: true, data: finding };
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
