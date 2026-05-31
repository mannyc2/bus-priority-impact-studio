import type { D1Database } from "@cloudflare/workers-types";
import * as z from "zod";

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
  database: D1Database,
  input: {
    alertId: string;
    identityId: string;
    kind: AlertKind;
    payload: unknown;
    now: string;
  },
): Promise<void> {
  await database
    .prepare(
      `insert into alert (alert_id, identity_id, kind, payload_json, active, created_at, updated_at)
                  values (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      input.alertId,
      input.identityId,
      input.kind,
      JSON.stringify(input.payload),
      input.now,
      input.now,
    )
    .run();
}

export async function listAlertsForIdentity(
  database: D1Database,
  identityId: string,
): Promise<AlertRecord[]> {
  const result = await database
    .prepare(
      `select alert_id, identity_id, kind, payload_json, active, created_at, updated_at
         from alert
        where identity_id = ? and active = 1
        order by created_at desc`,
    )
    .bind(identityId)
    .all();
  const rows = (result.results ?? []) as unknown[];
  return rows.map((row) => rowToAlert(AlertRowSchema.parse(row)));
}

export async function deactivateAlert(
  database: D1Database,
  input: { alertId: string; identityId: string; now: string },
): Promise<boolean> {
  const result = await database
    .prepare(
      `update alert set active = 0, updated_at = ?
        where alert_id = ? and identity_id = ? and active = 1`,
    )
    .bind(input.now, input.alertId, input.identityId)
    .run();
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
  database: D1Database,
  input: {
    savedSearchId: string;
    identityId: string;
    label: string;
    query: unknown;
    now: string;
  },
): Promise<void> {
  await database
    .prepare(
      `insert into saved_search (saved_search_id, identity_id, label, query_json, created_at, updated_at)
                         values (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.savedSearchId,
      input.identityId,
      input.label,
      JSON.stringify(input.query),
      input.now,
      input.now,
    )
    .run();
}

export async function listSavedSearchesForIdentity(
  database: D1Database,
  identityId: string,
): Promise<SavedSearchRecord[]> {
  const result = await database
    .prepare(
      `select saved_search_id, identity_id, label, query_json, created_at, updated_at
         from saved_search
        where identity_id = ?
        order by created_at desc`,
    )
    .bind(identityId)
    .all();
  const rows = (result.results ?? []) as unknown[];
  return rows.map((row) => rowToSavedSearch(SavedSearchRowSchema.parse(row)));
}

export async function deleteSavedSearch(
  database: D1Database,
  input: { savedSearchId: string; identityId: string },
): Promise<boolean> {
  const result = await database
    .prepare("delete from saved_search where saved_search_id = ? and identity_id = ?")
    .bind(input.savedSearchId, input.identityId)
    .run();
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
  database: D1Database,
  input: {
    commentId: string;
    briefId: string;
    identityId: string;
    body: string;
    now: string;
  },
): Promise<void> {
  await database
    .prepare(
      `insert into public_comment (comment_id, brief_id, identity_id, body, created_at)
                          values (?, ?, ?, ?, ?)`,
    )
    .bind(input.commentId, input.briefId, input.identityId, input.body, input.now)
    .run();
}

export async function listPublicCommentsForBrief(
  database: D1Database,
  briefId: string,
): Promise<PublicCommentRecord[]> {
  const result = await database
    .prepare(
      `select c.comment_id, c.brief_id, c.identity_id, c.body,
              c.created_at, c.deleted_at, i.display_name
         from public_comment c
         left join identity i on i.identity_id = c.identity_id
        where c.brief_id = ? and c.deleted_at is null
        order by c.created_at asc`,
    )
    .bind(briefId)
    .all();
  const rows = (result.results ?? []) as unknown[];
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
  database: D1Database,
  input: { query?: string | undefined; limit?: number | undefined },
): Promise<IdentityWithRoleRecord[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const search = input.query?.trim() ?? "";
  const matchPattern = `%${search.toLowerCase()}%`;
  const statement =
    search.length > 0
      ? database
          .prepare(
            `select i.identity_id, i.email, i.display_name,
                    r.role_id, r.workspace_id, r.scopes_json,
                    r.active as role_active
               from identity i
               left join studio_actor_role r on r.identity_id = i.identity_id and r.active = 1
              where i.active = 1
                and (lower(i.email) like ? or lower(coalesce(i.display_name, '')) like ?)
              order by i.created_at desc
              limit ?`,
          )
          .bind(matchPattern, matchPattern, limit)
      : database
          .prepare(
            `select i.identity_id, i.email, i.display_name,
                    r.role_id, r.workspace_id, r.scopes_json,
                    r.active as role_active
               from identity i
               left join studio_actor_role r on r.identity_id = i.identity_id and r.active = 1
              where i.active = 1
              order by i.created_at desc
              limit ?`,
          )
          .bind(limit);
  const result = await statement.all();
  const rows = (result.results ?? []) as unknown[];
  return rows.map((row) => {
    const parsed = IdentityWithRoleRowSchema.parse(row);
    let scopes: string[] = [];
    if (parsed.scopes_json !== null) {
      try {
        const arr: unknown = JSON.parse(parsed.scopes_json);
        if (Array.isArray(arr)) scopes = arr.filter((entry): entry is string => typeof entry === "string");
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
  database: D1Database,
  input: {
    roleId: string;
    identityId: string;
    workspaceId: string;
    scopes: string[];
    now: string;
  },
): Promise<void> {
  const scopesJson = JSON.stringify(input.scopes);
  await database
    .prepare(
      `insert into studio_actor_role
         (role_id, identity_id, workspace_id, scopes_json, active, created_at, updated_at)
       values (?, ?, ?, ?, 1, ?, ?)
       on conflict (identity_id, workspace_id) do update set
         scopes_json = excluded.scopes_json,
         active = 1,
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.roleId,
      input.identityId,
      input.workspaceId,
      scopesJson,
      input.now,
      input.now,
    )
    .run();
}

export async function revokeStudioActorRole(
  database: D1Database,
  input: { identityId: string; workspaceId: string; now: string },
): Promise<boolean> {
  const result = await database
    .prepare(
      `update studio_actor_role set active = 0, updated_at = ?
        where identity_id = ? and workspace_id = ? and active = 1`,
    )
    .bind(input.now, input.identityId, input.workspaceId)
    .run();
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}

export async function softDeletePublicComment(
  database: D1Database,
  input: { commentId: string; identityId: string; now: string },
): Promise<boolean> {
  const result = await database
    .prepare(
      `update public_comment set deleted_at = ?
        where comment_id = ? and identity_id = ? and deleted_at is null`,
    )
    .bind(input.now, input.commentId, input.identityId)
    .run();
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}
