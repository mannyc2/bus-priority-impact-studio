import type { D1Database } from "@cloudflare/workers-types";
import * as z from "zod";

export const IdentitySessionKindSchema = z.enum(["magic_pending", "session", "legacy_bearer"]);
export type IdentitySessionKind = z.output<typeof IdentitySessionKindSchema>;

export const StudioActorScopeSchema = z.enum([
  "read:briefs",
  "write:briefs",
  "review:briefs",
  "publish:briefs",
  "admin:identities",
]);
const StudioActorScopesJsonSchema = z.array(StudioActorScopeSchema);
export type StudioActorScope = z.output<typeof StudioActorScopeSchema>;

export type IdentityRecord = {
  identityId: string;
  email: string;
  displayName: string | null;
};

export type IdentitySessionRecord = {
  sessionId: string;
  identityId: string;
  kind: IdentitySessionKind;
};

export type OperatorRoleRecord = {
  roleId: string;
  identityId: string;
  workspaceId: string;
  scopes: StudioActorScope[];
};

const IdentitySessionLookupRowSchema = z
  .object({
    session_id: z.string(),
    identity_id: z.string(),
    kind: IdentitySessionKindSchema,
    email: z.string(),
    display_name: z.string().nullable(),
    identity_active: z.number().int(),
  })
  .strict();

const OperatorRoleRowSchema = z
  .object({
    role_id: z.string(),
    identity_id: z.string(),
    workspace_id: z.string(),
    scopes_json: z.string(),
  })
  .strict();

function parseScopes(scopesJson: string): StudioActorScope[] {
  try {
    return StudioActorScopesJsonSchema.parse(JSON.parse(scopesJson));
  } catch {
    return [];
  }
}

export async function getIdentityBySessionTokenHash(
  database: D1Database,
  tokenHash: string,
  now: string,
): Promise<{ identity: IdentityRecord; session: IdentitySessionRecord } | null> {
  const row = await database
    .prepare(
      `select s.session_id, s.identity_id, s.kind,
              i.email, i.display_name, i.active as identity_active
         from identity_session s
         join identity i on i.identity_id = s.identity_id
        where s.token_hash = ?
          and s.revoked_at is null
          and s.consumed_at is null
          and s.kind in ('session', 'legacy_bearer')
          and (s.expires_at is null or s.expires_at > ?)
        limit 1`,
    )
    .bind(tokenHash, now)
    .first();
  if (row === null) return null;
  const parsed = IdentitySessionLookupRowSchema.parse(row);
  if (parsed.identity_active !== 1) return null;
  return {
    identity: {
      identityId: parsed.identity_id,
      email: parsed.email,
      displayName: parsed.display_name,
    },
    session: {
      sessionId: parsed.session_id,
      identityId: parsed.identity_id,
      kind: parsed.kind,
    },
  };
}

export async function getOperatorRoleForIdentity(
  database: D1Database,
  identityId: string,
): Promise<OperatorRoleRecord | null> {
  const row = await database
    .prepare(
      `select role_id, identity_id, workspace_id, scopes_json
         from studio_actor_role
        where identity_id = ? and active = 1
        limit 1`,
    )
    .bind(identityId)
    .first();
  if (row === null) return null;
  const parsed = OperatorRoleRowSchema.parse(row);
  return {
    roleId: parsed.role_id,
    identityId: parsed.identity_id,
    workspaceId: parsed.workspace_id,
    scopes: parseScopes(parsed.scopes_json),
  };
}

export async function recordSessionUse(
  database: D1Database,
  input: { sessionId: string; usedAt: string },
): Promise<void> {
  await database
    .prepare("update identity_session set last_used_at = ? where session_id = ?")
    .bind(input.usedAt, input.sessionId)
    .run();
}

const IdentityRowSchema = z
  .object({
    identity_id: z.string(),
    email: z.string(),
    display_name: z.string().nullable(),
  })
  .strict();

export async function getIdentityById(
  database: D1Database,
  identityId: string,
): Promise<IdentityRecord | null> {
  const row = await database
    .prepare(
      `select identity_id, email, display_name
         from identity
        where identity_id = ? and active = 1
        limit 1`,
    )
    .bind(identityId)
    .first();
  if (row === null) return null;
  const parsed = IdentityRowSchema.parse(row);
  return {
    identityId: parsed.identity_id,
    email: parsed.email,
    displayName: parsed.display_name,
  };
}

export async function getIdentityByEmailNormalized(
  database: D1Database,
  emailNormalized: string,
): Promise<IdentityRecord | null> {
  const row = await database
    .prepare(
      `select identity_id, email, display_name
         from identity
        where email_normalized = ? and active = 1
        limit 1`,
    )
    .bind(emailNormalized)
    .first();
  if (row === null) return null;
  const parsed = IdentityRowSchema.parse(row);
  return {
    identityId: parsed.identity_id,
    email: parsed.email,
    displayName: parsed.display_name,
  };
}

export async function createMagicLinkRequest(
  database: D1Database,
  input: {
    identityId: string;
    email: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: string;
    now: string;
  },
): Promise<{ identityId: string; created: boolean }> {
  const normalized = input.email.trim().toLowerCase();
  const existing = await getIdentityByEmailNormalized(database, normalized);
  let identityId = existing?.identityId ?? input.identityId;
  let created = false;
  if (existing === null) {
    await database
      .prepare(
        `insert into identity (identity_id, email, email_normalized, display_name,
                               active, created_at, updated_at)
                       values (?, ?, ?, NULL, 1, ?, ?)`,
      )
      .bind(identityId, input.email.trim(), normalized, input.now, input.now)
      .run();
    created = true;
  }
  await database
    .prepare(
      `insert into identity_session (session_id, identity_id, kind, token_hash,
                                     expires_at, created_at)
                              values (?, ?, 'magic_pending', ?, ?, ?)`,
    )
    .bind(input.sessionId, identityId, input.tokenHash, input.expiresAt, input.now)
    .run();
  return { identityId, created };
}

const MagicConsumeRowSchema = z
  .object({
    session_id: z.string(),
    identity_id: z.string(),
    expires_at: z.string().nullable(),
    consumed_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  })
  .strict();

export async function consumeMagicLinkRequest(
  database: D1Database,
  input: { tokenHash: string; now: string },
): Promise<{ identityId: string } | null> {
  const row = await database
    .prepare(
      `select session_id, identity_id, expires_at, consumed_at, revoked_at
         from identity_session
        where token_hash = ? and kind = 'magic_pending'
        limit 1`,
    )
    .bind(input.tokenHash)
    .first();
  if (row === null) return null;
  const parsed = MagicConsumeRowSchema.parse(row);
  if (parsed.consumed_at !== null) return null;
  if (parsed.revoked_at !== null) return null;
  if (parsed.expires_at !== null && parsed.expires_at <= input.now) return null;
  const result = await database
    .prepare(
      `update identity_session
          set consumed_at = ?
        where session_id = ? and consumed_at is null`,
    )
    .bind(input.now, parsed.session_id)
    .run();
  const meta = (result as { meta?: { changes?: number } }).meta;
  if (meta?.changes === 0) return null;
  return { identityId: parsed.identity_id };
}

export async function createSession(
  database: D1Database,
  input: {
    sessionId: string;
    identityId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent: string | null;
    ipHash: string | null;
    now: string;
  },
): Promise<void> {
  await database
    .prepare(
      `insert into identity_session (session_id, identity_id, kind, token_hash,
                                     user_agent, ip_hash, expires_at, created_at, last_used_at)
                              values (?, ?, 'session', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.sessionId,
      input.identityId,
      input.tokenHash,
      input.userAgent,
      input.ipHash,
      input.expiresAt,
      input.now,
      input.now,
    )
    .run();
}

export async function revokeSession(
  database: D1Database,
  input: { sessionId: string; now: string },
): Promise<void> {
  await database
    .prepare(
      `update identity_session set revoked_at = ?
        where session_id = ? and revoked_at is null`,
    )
    .bind(input.now, input.sessionId)
    .run();
}

export async function revokeAllSessionsForIdentity(
  database: D1Database,
  input: { identityId: string; now: string },
): Promise<void> {
  await database
    .prepare(
      `update identity_session set revoked_at = ?
        where identity_id = ? and kind = 'session' and revoked_at is null`,
    )
    .bind(input.now, input.identityId)
    .run();
}

const IdentitySessionListRowSchema = z
  .object({
    session_id: z.string(),
    kind: IdentitySessionKindSchema,
    user_agent: z.string().nullable(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
  })
  .strict();

export type IdentitySessionListEntry = {
  sessionId: string;
  kind: IdentitySessionKind;
  userAgent: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listSessionsForIdentity(
  database: D1Database,
  identityId: string,
): Promise<IdentitySessionListEntry[]> {
  const result = await database
    .prepare(
      `select session_id, kind, user_agent, expires_at, created_at, last_used_at
         from identity_session
        where identity_id = ?
          and revoked_at is null
          and kind in ('session', 'legacy_bearer')
        order by created_at desc`,
    )
    .bind(identityId)
    .all();
  const rows = (result.results ?? []) as unknown[];
  return rows.map((row) => {
    const parsed = IdentitySessionListRowSchema.parse(row);
    return {
      sessionId: parsed.session_id,
      kind: parsed.kind,
      userAgent: parsed.user_agent,
      expiresAt: parsed.expires_at,
      createdAt: parsed.created_at,
      lastUsedAt: parsed.last_used_at,
    };
  });
}

export async function updateIdentityDisplayName(
  database: D1Database,
  input: { identityId: string; displayName: string | null; now: string },
): Promise<void> {
  await database
    .prepare(
      "update identity set display_name = ?, updated_at = ? where identity_id = ?",
    )
    .bind(input.displayName, input.now, input.identityId)
    .run();
}
