import {
  type AlertRecord,
  createD1ServingDb,
  deactivateAlert,
  deleteSavedSearch,
  insertAlert,
  insertPublicComment,
  insertSavedSearch,
  listAlertsForIdentity,
  listPublicCommentsForBrief,
  listSavedSearchesForIdentity,
  type PublicCommentRecord,
  type SavedSearchRecord,
  softDeletePublicComment,
} from "@bp/db/d1";
import {
  AlertCreateRequestSchema,
  AlertResponseSchema,
  AlertsListResponseSchema,
  PublicCommentCreateRequestSchema,
  PublicCommentResponseSchema,
  PublicCommentsListResponseSchema,
  SavedSearchCreateRequestSchema,
  SavedSearchesListResponseSchema,
  SavedSearchResponseSchema,
} from "@bp/domain/studio/identity";
import type * as z from "zod";
import type { StudioApiEnv } from "./env.js";
import { errorResponse as errorJson } from "./http/errors.js";
import { jsonResponse as json, noContentResponse as noContent } from "./http/json.js";
import { authError, randomToken, resolveIdentity } from "./studio/auth.js";

type IdentityContext = {
  database: ReturnType<typeof createD1ServingDb>;
  identity: { identityId: string; email: string; displayName: string | null };
};

async function parseJsonRequest<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<{ ok: true; data: z.output<TSchema> } | { ok: false; response: Response }> {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, response: errorJson(400, "Request body failed contract validation.") };
  }
  return { ok: true, data: parsed.data };
}

async function requireIdentity(
  request: Request,
  env: StudioApiEnv,
): Promise<IdentityContext | Response> {
  if (env.DB === undefined) {
    return errorJson(503, "D1 binding is not configured.");
  }
  const resolved = await resolveIdentity(request, env);
  if (resolved.identity === null) {
    return authError(401, "UNAUTHORIZED", "Sign in is required for this action.");
  }
  return { database: createD1ServingDb(env.DB), identity: resolved.identity };
}

function alertResponse(record: AlertRecord) {
  return AlertResponseSchema.parse({
    alertId: record.alertId,
    kind: record.kind,
    payload: record.payload,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function savedSearchResponse(record: SavedSearchRecord) {
  return SavedSearchResponseSchema.parse({
    savedSearchId: record.savedSearchId,
    label: record.label,
    query: record.query,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function publicCommentResponse(record: PublicCommentRecord) {
  return PublicCommentResponseSchema.parse({
    commentId: record.commentId,
    briefId: record.briefId,
    displayName: record.displayName,
    body: record.body,
    createdAt: record.createdAt,
  });
}

export async function handleIdentitySurfaceRoutes(
  request: Request,
  env: StudioApiEnv,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/api/v1/alerts") {
    const context = await requireIdentity(request, env);
    if (context instanceof Response) return context;

    if (request.method === "GET") {
      const alerts = await listAlertsForIdentity(context.database, context.identity.identityId);
      return json(AlertsListResponseSchema.parse({ alerts: alerts.map(alertResponse) }));
    }

    if (request.method === "POST") {
      const body = await parseJsonRequest(request, AlertCreateRequestSchema);
      if (!body.ok) return body.response;
      const now = new Date().toISOString();
      const alertId = randomToken(16);
      await insertAlert(context.database, {
        alertId,
        identityId: context.identity.identityId,
        kind: body.data.kind,
        payload: body.data.payload,
        now,
      });
      return json(
        AlertResponseSchema.parse({
          alertId,
          kind: body.data.kind,
          payload: body.data.payload,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }

  const alertMatch = url.pathname.match(/^\/api\/v1\/alerts\/([^/]+)$/);
  if (alertMatch !== null && request.method === "DELETE") {
    const context = await requireIdentity(request, env);
    if (context instanceof Response) return context;
    const now = new Date().toISOString();
    const deleted = await deactivateAlert(context.database, {
      alertId: decodeURIComponent(alertMatch[1] ?? ""),
      identityId: context.identity.identityId,
      now,
    });
    return deleted ? noContent() : errorJson(404, "Alert was not found.");
  }

  if (url.pathname === "/api/v1/saved-searches") {
    const context = await requireIdentity(request, env);
    if (context instanceof Response) return context;

    if (request.method === "GET") {
      const savedSearches = await listSavedSearchesForIdentity(
        context.database,
        context.identity.identityId,
      );
      return json(
        SavedSearchesListResponseSchema.parse({
          savedSearches: savedSearches.map(savedSearchResponse),
        }),
      );
    }

    if (request.method === "POST") {
      const body = await parseJsonRequest(request, SavedSearchCreateRequestSchema);
      if (!body.ok) return body.response;
      const now = new Date().toISOString();
      const savedSearchId = randomToken(16);
      await insertSavedSearch(context.database, {
        savedSearchId,
        identityId: context.identity.identityId,
        label: body.data.label,
        query: body.data.query,
        now,
      });
      return json(
        SavedSearchResponseSchema.parse({
          savedSearchId,
          label: body.data.label,
          query: body.data.query,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
  }

  const savedSearchMatch = url.pathname.match(/^\/api\/v1\/saved-searches\/([^/]+)$/);
  if (savedSearchMatch !== null && request.method === "DELETE") {
    const context = await requireIdentity(request, env);
    if (context instanceof Response) return context;
    const deleted = await deleteSavedSearch(context.database, {
      savedSearchId: decodeURIComponent(savedSearchMatch[1] ?? ""),
      identityId: context.identity.identityId,
    });
    return deleted ? noContent() : errorJson(404, "Saved search was not found.");
  }

  const commentsMatch = url.pathname.match(/^\/api\/v1\/briefs\/([^/]+)\/public-comments$/);
  if (commentsMatch !== null) {
    if (env.DB === undefined) {
      return errorJson(503, "D1 binding is not configured.");
    }
    const briefId = decodeURIComponent(commentsMatch[1] ?? "");
    const database = createD1ServingDb(env.DB);

    if (request.method === "GET") {
      const comments = await listPublicCommentsForBrief(database, briefId);
      return json(
        PublicCommentsListResponseSchema.parse({
          comments: comments.map(publicCommentResponse),
        }),
      );
    }

    if (request.method === "POST") {
      const context = await requireIdentity(request, env);
      if (context instanceof Response) return context;
      const body = await parseJsonRequest(request, PublicCommentCreateRequestSchema);
      if (!body.ok) return body.response;
      const now = new Date().toISOString();
      const commentId = randomToken(16);
      await insertPublicComment(context.database, {
        commentId,
        briefId,
        identityId: context.identity.identityId,
        body: body.data.body,
        now,
      });
      return json(
        PublicCommentResponseSchema.parse({
          commentId,
          briefId,
          displayName: context.identity.displayName,
          body: body.data.body,
          createdAt: now,
        }),
      );
    }
  }

  const commentMatch = url.pathname.match(/^\/api\/v1\/briefs\/([^/]+)\/public-comments\/([^/]+)$/);
  if (commentMatch !== null && request.method === "DELETE") {
    const context = await requireIdentity(request, env);
    if (context instanceof Response) return context;
    const deleted = await softDeletePublicComment(context.database, {
      commentId: decodeURIComponent(commentMatch[2] ?? ""),
      identityId: context.identity.identityId,
      now: new Date().toISOString(),
    });
    return deleted ? noContent() : errorJson(404, "Public comment was not found.");
  }

  return null;
}
