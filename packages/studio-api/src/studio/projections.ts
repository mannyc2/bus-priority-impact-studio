import { getStudioRoute } from "@bp/domain/studio/projections";
import {
  type StudioRoute,
  type StudioRouteDetailResponse,
  StudioRouteDetailResponseSchema,
  StudioRouteSchema,
  type StudioRoutesResponse,
  StudioRoutesResponseSchema,
} from "@bp/domain/studio/routes";
import { Result, Schema } from "effect";
import { loadReleaseArtifact } from "../artifact-resolver.js";
import type { StudioApiEnv } from "../env.js";
import { errorResponse } from "../http/errors.js";
import {
  ARTIFACT_NOT_AVAILABLE_MESSAGE,
  SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE,
} from "../http/messages.js";
import { decodeSchemaEitherStrip, schemaErrorIssues } from "../schema-decode.js";

type SchemaOutput<TSchema extends Schema.Constraint> = TSchema["Type"];

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

export async function loadStudioProjection<TSchema extends Schema.Constraint>(
  env: Pick<
    StudioApiEnv,
    | "ARTIFACTS"
    | "DB"
    | "PLAN097_PREVIOUS_RELEASE_ID"
    | "PLAN097_RECOVERY_ENABLED"
    | "STUDIO_RELEASE_KEY"
  >,
  path: string,
  schema: TSchema,
): Promise<Response | SchemaOutput<TSchema>> {
  if (env.ARTIFACTS === undefined) {
    console.error("Service dependency is not configured.", {
      context: "Studio API projection load",
      dependency: "ARTIFACTS",
    });
    return errorResponse(503, SERVICE_DEPENDENCY_NOT_CONFIGURED_MESSAGE);
  }

  const key = studioProjectionKey(env, path);
  const object = await loadReleaseArtifact(env, key);
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

  const projection = decodeSchemaEitherStrip(schema, payload);
  if (Result.isFailure(projection)) {
    console.error("Studio API projection artifact failed contract validation.", {
      key,
      issues: schemaErrorIssues(projection.failure),
    });
    return errorResponse(502, ARTIFACT_NOT_AVAILABLE_MESSAGE);
  }

  return projection.success;
}

const PublishedRouteInterventionsProjectionSchema = Schema.Struct({
  routes: Schema.Array(StudioRouteSchema),
});

/**
 * Reads intervention annotations from the already-public route projection while D1 remains the
 * authority for current route identity and operating data. The join is deliberately exact and
 * case-sensitive: legacy slugs and route families must never move evidence between routes.
 *
 * A missing or contract-invalid compatibility projection contributes no annotations. It cannot
 * replace D1 route cards or make the route listing unavailable.
 */
export async function maybeLoadPublishedRouteInterventions(
  env: Pick<StudioApiEnv, "ARTIFACTS" | "STUDIO_RELEASE_KEY">,
): Promise<ReadonlyMap<string, StudioRoute["interventions"]>> {
  const projection = await loadStudioProjection(
    env,
    "routes.json",
    PublishedRouteInterventionsProjectionSchema,
  );
  if (projection instanceof Response) return new Map();

  const interventionsByRouteId = new Map<string, StudioRoute["interventions"]>();
  for (const route of projection.routes) {
    if (interventionsByRouteId.has(route.routeId)) {
      console.error("Published route projection contains a duplicate exact route identity.", {
        routeId: route.routeId,
      });
      return new Map();
    }
    interventionsByRouteId.set(route.routeId, route.interventions);
  }
  return interventionsByRouteId;
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
