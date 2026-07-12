import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { alert, identity, publicComment, savedSearch, studioActorRole } from "../schema.js";

const alertKinds = ["route", "segment", "search"] as const;
export type AlertKind = (typeof alertKinds)[number];

export type AlertRecord = {
  alertId: string;
  identityId: string;
  kind: AlertKind;
  payload: unknown;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

async function selectAlertRows(db: D1ServingDb, identityId: string) {
  return db
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
}

type AlertRow = Awaited<ReturnType<typeof selectAlertRows>>[number];

function rowToAlert(row: AlertRow): AlertRecord {
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }
  return {
    alertId: row.alert_id,
    identityId: row.identity_id,
    kind: row.kind as AlertKind,
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
  const rows = await selectAlertRows(db, identityId);
  return rows.map(rowToAlert);
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

export type SavedSearchRecord = {
  savedSearchId: string;
  identityId: string;
  label: string;
  query: unknown;
  createdAt: string;
  updatedAt: string;
};

async function selectSavedSearchRows(db: D1ServingDb, identityId: string) {
  return db
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
}

type SavedSearchRow = Awaited<ReturnType<typeof selectSavedSearchRows>>[number];

function rowToSavedSearch(row: SavedSearchRow): SavedSearchRecord {
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
  const rows = await selectSavedSearchRows(db, identityId);
  return rows.map(rowToSavedSearch);
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

export type PublicCommentRecord = {
  commentId: string;
  briefId: string;
  identityId: string;
  displayName: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
};

async function selectPublicCommentRows(db: D1ServingDb, briefId: string) {
  return db
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
}

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
  const rows = await selectPublicCommentRows(db, briefId);
  return rows.map((row) => {
    return {
      commentId: row.comment_id,
      briefId: row.brief_id,
      identityId: row.identity_id,
      displayName: row.display_name,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    };
  });
}

export type IdentityWithRoleRecord = {
  identityId: string;
  email: string;
  displayName: string | null;
  operator: { roleId: string; workspaceId: string; scopes: string[] } | null;
};

async function selectIdentityWithRoleRows(
  db: D1ServingDb,
  input: { query?: string | undefined; limit?: number | undefined },
) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const search = input.query?.trim() ?? "";
  const matchPattern = `%${search.toLowerCase()}%`;
  return db
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
}

export async function listIdentitiesWithRoles(
  db: D1ServingDb,
  input: { query?: string | undefined; limit?: number | undefined },
): Promise<IdentityWithRoleRecord[]> {
  const rows = await selectIdentityWithRoleRows(db, input);
  return rows.map((row) => {
    let scopes: string[] = [];
    if (row.scopes_json !== null) {
      try {
        const arr: unknown = JSON.parse(row.scopes_json);
        if (Array.isArray(arr))
          scopes = arr.filter((entry): entry is string => typeof entry === "string");
      } catch {
        scopes = [];
      }
    }
    return {
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
      operator:
        row.role_id === null || row.workspace_id === null
          ? null
          : {
              roleId: row.role_id,
              workspaceId: row.workspace_id,
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
