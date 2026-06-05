import { and, desc, eq, like, or, sql } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { alert, identity, publicComment, savedSearch, studioActorRole } from "../schema.js";

const AlertKindSchema = z.enum(["route", "segment", "search"]);
export type AlertKind = z.output<typeof AlertKindSchema>;

const AlertRowSchema = z
  .object({
    alert_id: z.string(),
    identity_id: z.string(),
    kind: AlertKindSchema,
    payload_json: z.string(),
    active: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export type AlertRecord = {
  alertId: string;
  identityId: string;
  kind: AlertKind;
  payload: unknown;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function rowToAlert(row: z.output<typeof AlertRowSchema>): AlertRecord {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }
  return {
    alertId: row.alert_id,
    identityId: row.identity_id,
    kind: row.kind,
    payload,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertAlert(
  db: D1ServingDb,
  input: {
    alertId: string;
    identityId: string;
    kind: AlertKind;
    payload: unknown;
    now: string;
  },
): Promise<void> {
  await db.insert(alert).values({
    alertId: input.alertId,
    identityId: input.identityId,
    kind: input.kind,
    payloadJson: JSON.stringify(input.payload),
    active: true,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export async function listAlertsForIdentity(
  db: D1ServingDb,
  identityId: string,
): Promise<AlertRecord[]> {
  const rows = await db
    .select({
      alert_id: alert.alertId,
      identity_id: alert.identityId,
      kind: alert.kind,
      payload_json: alert.payloadJson,
      active: sql<number>`${alert.active}`,
      created_at: alert.createdAt,
      updated_at: alert.updatedAt,
    })
    .from(alert)
    .where(and(eq(alert.identityId, identityId), eq(alert.active, true)))
    .orderBy(desc(alert.createdAt));
  return rows.map((row) => rowToAlert(AlertRowSchema.parse(row)));
}

export async function deactivateAlert(
  db: D1ServingDb,
  input: { alertId: string; identityId: string; now: string },
): Promise<boolean> {
  const result = await db
    .update(alert)
    .set({ active: false, updatedAt: input.now })
    .where(
      and(
        eq(alert.alertId, input.alertId),
        eq(alert.identityId, input.identityId),
        eq(alert.active, true),
      ),
    );
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}

const SavedSearchRowSchema = z
  .object({
    saved_search_id: z.string(),
    identity_id: z.string(),
    label: z.string(),
    query_json: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export type SavedSearchRecord = {
  savedSearchId: string;
  identityId: string;
  label: string;
  query: unknown;
  createdAt: string;
  updatedAt: string;
};

function rowToSavedSearch(row: z.output<typeof SavedSearchRowSchema>): SavedSearchRecord {
  let query: unknown = null;
  try {
    query = JSON.parse(row.query_json);
  } catch {
    query = null;
  }
  return {
    savedSearchId: row.saved_search_id,
    identityId: row.identity_id,
    label: row.label,
    query,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertSavedSearch(
  db: D1ServingDb,
  input: {
    savedSearchId: string;
    identityId: string;
    label: string;
    query: unknown;
    now: string;
  },
): Promise<void> {
  await db.insert(savedSearch).values({
    savedSearchId: input.savedSearchId,
    identityId: input.identityId,
    label: input.label,
    queryJson: JSON.stringify(input.query),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export async function listSavedSearchesForIdentity(
  db: D1ServingDb,
  identityId: string,
): Promise<SavedSearchRecord[]> {
  const rows = await db
    .select({
      saved_search_id: savedSearch.savedSearchId,
      identity_id: savedSearch.identityId,
      label: savedSearch.label,
      query_json: savedSearch.queryJson,
      created_at: savedSearch.createdAt,
      updated_at: savedSearch.updatedAt,
    })
    .from(savedSearch)
    .where(eq(savedSearch.identityId, identityId))
    .orderBy(desc(savedSearch.createdAt));
  return rows.map((row) => rowToSavedSearch(SavedSearchRowSchema.parse(row)));
}

export async function deleteSavedSearch(
  db: D1ServingDb,
  input: { savedSearchId: string; identityId: string },
): Promise<boolean> {
  const result = await db
    .delete(savedSearch)
    .where(
      and(
        eq(savedSearch.savedSearchId, input.savedSearchId),
        eq(savedSearch.identityId, input.identityId),
      ),
    );
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}

const PublicCommentRowSchema = z
  .object({
    comment_id: z.string(),
    brief_id: z.string(),
    identity_id: z.string(),
    body: z.string(),
    created_at: z.string(),
    deleted_at: z.string().nullable(),
    display_name: z.string().nullable(),
  })
  .strict();

export type PublicCommentRecord = {
  commentId: string;
  briefId: string;
  identityId: string;
  displayName: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
};

export async function insertPublicComment(
  db: D1ServingDb,
  input: {
    commentId: string;
    briefId: string;
    identityId: string;
    body: string;
    now: string;
  },
): Promise<void> {
  await db.insert(publicComment).values({
    commentId: input.commentId,
    briefId: input.briefId,
    identityId: input.identityId,
    body: input.body,
    createdAt: input.now,
  });
}

export async function listPublicCommentsForBrief(
  db: D1ServingDb,
  briefId: string,
): Promise<PublicCommentRecord[]> {
  const rows = await db
    .select({
      comment_id: publicComment.commentId,
      brief_id: publicComment.briefId,
      identity_id: publicComment.identityId,
      body: publicComment.body,
      created_at: publicComment.createdAt,
      deleted_at: publicComment.deletedAt,
      display_name: identity.displayName,
    })
    .from(publicComment)
    .leftJoin(identity, eq(identity.identityId, publicComment.identityId))
    .where(and(eq(publicComment.briefId, briefId), sql`${publicComment.deletedAt} is null`))
    .orderBy(publicComment.createdAt);
  return rows.map((row) => {
    const parsed = PublicCommentRowSchema.parse(row);
    return {
      commentId: parsed.comment_id,
      briefId: parsed.brief_id,
      identityId: parsed.identity_id,
      displayName: parsed.display_name,
      body: parsed.body,
      createdAt: parsed.created_at,
      deletedAt: parsed.deleted_at,
    };
  });
}

const IdentityWithRoleRowSchema = z
  .object({
    identity_id: z.string(),
    email: z.string(),
    display_name: z.string().nullable(),
    role_id: z.string().nullable(),
    workspace_id: z.string().nullable(),
    scopes_json: z.string().nullable(),
    role_active: z.number().int().nullable(),
  })
  .strict();

export type IdentityWithRoleRecord = {
  identityId: string;
  email: string;
  displayName: string | null;
  operator: { roleId: string; workspaceId: string; scopes: string[] } | null;
};

export async function listIdentitiesWithRoles(
  db: D1ServingDb,
  input: { query?: string | undefined; limit?: number | undefined },
): Promise<IdentityWithRoleRecord[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const search = input.query?.trim() ?? "";
  const matchPattern = `%${search.toLowerCase()}%`;
  const rows = await db
    .select({
      identity_id: identity.identityId,
      email: identity.email,
      display_name: identity.displayName,
      role_id: studioActorRole.roleId,
      workspace_id: studioActorRole.workspaceId,
      scopes_json: studioActorRole.scopesJson,
      role_active: sql<number>`${studioActorRole.active}`,
    })
    .from(identity)
    .leftJoin(
      studioActorRole,
      and(eq(studioActorRole.identityId, identity.identityId), eq(studioActorRole.active, true)),
    )
    .where(
      search.length > 0
        ? and(
            eq(identity.active, true),
            or(
              like(sql`lower(${identity.email})`, matchPattern),
              like(sql`lower(coalesce(${identity.displayName}, ''))`, matchPattern),
            ),
          )
        : eq(identity.active, true),
    )
    .orderBy(desc(identity.createdAt))
    .limit(limit);
  return rows.map((row) => {
    const parsed = IdentityWithRoleRowSchema.parse(row);
    let scopes: string[] = [];
    if (parsed.scopes_json !== null) {
      try {
        const arr: unknown = JSON.parse(parsed.scopes_json);
        if (Array.isArray(arr))
          scopes = arr.filter((entry): entry is string => typeof entry === "string");
      } catch {
        scopes = [];
      }
    }
    return {
      identityId: parsed.identity_id,
      email: parsed.email,
      displayName: parsed.display_name,
      operator:
        parsed.role_id === null || parsed.workspace_id === null
          ? null
          : {
              roleId: parsed.role_id,
              workspaceId: parsed.workspace_id,
              scopes,
            },
    };
  });
}

export async function upsertStudioActorRole(
  db: D1ServingDb,
  input: {
    roleId: string;
    identityId: string;
    workspaceId: string;
    scopes: string[];
    now: string;
  },
): Promise<void> {
  const scopesJson = JSON.stringify(input.scopes);
  await db
    .insert(studioActorRole)
    .values({
      roleId: input.roleId,
      identityId: input.identityId,
      workspaceId: input.workspaceId,
      scopesJson,
      active: true,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [studioActorRole.identityId, studioActorRole.workspaceId],
      set: {
        scopesJson,
        active: true,
        updatedAt: input.now,
      },
    });
}

export async function revokeStudioActorRole(
  db: D1ServingDb,
  input: { identityId: string; workspaceId: string; now: string },
): Promise<boolean> {
  const result = await db
    .update(studioActorRole)
    .set({ active: false, updatedAt: input.now })
    .where(
      and(
        eq(studioActorRole.identityId, input.identityId),
        eq(studioActorRole.workspaceId, input.workspaceId),
        eq(studioActorRole.active, true),
      ),
    );
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}

export async function softDeletePublicComment(
  db: D1ServingDb,
  input: { commentId: string; identityId: string; now: string },
): Promise<boolean> {
  const result = await db
    .update(publicComment)
    .set({ deletedAt: input.now })
    .where(
      and(
        eq(publicComment.commentId, input.commentId),
        eq(publicComment.identityId, input.identityId),
        sql`${publicComment.deletedAt} is null`,
      ),
    );
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}
