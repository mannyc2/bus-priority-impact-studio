import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { identity, identitySession, studioActorRole } from "../schema.js";

export const identitySessionKinds = ["magic_pending", "session", "legacy_bearer"] as const;
export type IdentitySessionKind = (typeof identitySessionKinds)[number];

export const studioActorScopes = [
  "read:briefs",
  "write:briefs",
  "review:briefs",
  "publish:briefs",
  "admin:identities",
] as const;
export type StudioActorScope = (typeof studioActorScopes)[number];

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

function isStudioActorScope(value: unknown): value is StudioActorScope {
  return studioActorScopes.includes(value as StudioActorScope);
}

function parseScopes(scopesJson: string): StudioActorScope[] {
  try {
    const parsed: unknown = JSON.parse(scopesJson);
    return Array.isArray(parsed) && parsed.every(isStudioActorScope) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getIdentityBySessionTokenHash(
  db: D1ServingDb,
  tokenHash: string,
  now: string,
): Promise<{ identity: IdentityRecord; session: IdentitySessionRecord } | null> {
  const [row] = await db
    .select({
      session_id: identitySession.sessionId,
      identity_id: identitySession.identityId,
      kind: identitySession.kind,
      email: identity.email,
      display_name: identity.displayName,
      identity_active: sql<number>`${identity.active}`,
    })
    .from(identitySession)
    .innerJoin(identity, eq(identity.identityId, identitySession.identityId))
    .where(
      and(
        eq(identitySession.tokenHash, tokenHash),
        isNull(identitySession.revokedAt),
        isNull(identitySession.consumedAt),
        inArray(identitySession.kind, ["session", "legacy_bearer"]),
        or(isNull(identitySession.expiresAt), gt(identitySession.expiresAt, now)),
      ),
    )
    .limit(1);
  if (row === undefined) return null;
  if (row.identity_active !== 1) return null;
  return {
    identity: {
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
    },
    session: {
      sessionId: row.session_id,
      identityId: row.identity_id,
      kind: row.kind as IdentitySessionKind,
    },
  };
}

export async function getOperatorRoleForIdentity(
  db: D1ServingDb,
  identityId: string,
): Promise<OperatorRoleRecord | null> {
  const [row] = await db
    .select({
      role_id: studioActorRole.roleId,
      identity_id: studioActorRole.identityId,
      workspace_id: studioActorRole.workspaceId,
      scopes_json: studioActorRole.scopesJson,
    })
    .from(studioActorRole)
    .where(and(eq(studioActorRole.identityId, identityId), eq(studioActorRole.active, true)))
    .limit(1);
  if (row === undefined) return null;
  return {
    roleId: row.role_id,
    identityId: row.identity_id,
    workspaceId: row.workspace_id,
    scopes: parseScopes(row.scopes_json),
  };
}

export async function recordSessionUse(
  db: D1ServingDb,
  input: { sessionId: string; usedAt: string },
): Promise<void> {
  await db
    .update(identitySession)
    .set({ lastUsedAt: input.usedAt })
    .where(eq(identitySession.sessionId, input.sessionId));
}

export async function getIdentityById(
  db: D1ServingDb,
  identityId: string,
): Promise<IdentityRecord | null> {
  const [row] = await db
    .select({
      identity_id: identity.identityId,
      email: identity.email,
      display_name: identity.displayName,
    })
    .from(identity)
    .where(and(eq(identity.identityId, identityId), eq(identity.active, true)))
    .limit(1);
  if (row === undefined) return null;
  return {
    identityId: row.identity_id,
    email: row.email,
    displayName: row.display_name,
  };
}

export async function getIdentityByEmailNormalized(
  db: D1ServingDb,
  emailNormalized: string,
): Promise<IdentityRecord | null> {
  const [row] = await db
    .select({
      identity_id: identity.identityId,
      email: identity.email,
      display_name: identity.displayName,
    })
    .from(identity)
    .where(and(eq(identity.emailNormalized, emailNormalized), eq(identity.active, true)))
    .limit(1);
  if (row === undefined) return null;
  return {
    identityId: row.identity_id,
    email: row.email,
    displayName: row.display_name,
  };
}

export async function createMagicLinkRequest(
  db: D1ServingDb,
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
  const existing = await getIdentityByEmailNormalized(db, normalized);
  const identityId = existing?.identityId ?? input.identityId;
  let created = false;
  await db.transaction(async (tx) => {
    if (existing === null) {
      await tx.insert(identity).values({
        identityId,
        email: input.email.trim(),
        emailNormalized: normalized,
        displayName: null,
        active: true,
        createdAt: input.now,
        updatedAt: input.now,
      });
      created = true;
    }
    await tx.insert(identitySession).values({
      sessionId: input.sessionId,
      identityId,
      kind: "magic_pending",
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    });
  });
  return { identityId, created };
}

export async function consumeMagicLinkRequest(
  db: D1ServingDb,
  input: { tokenHash: string; now: string },
): Promise<{ identityId: string } | null> {
  const [row] = await db
    .select({
      session_id: identitySession.sessionId,
      identity_id: identitySession.identityId,
      expires_at: identitySession.expiresAt,
      consumed_at: identitySession.consumedAt,
      revoked_at: identitySession.revokedAt,
    })
    .from(identitySession)
    .where(
      and(
        eq(identitySession.tokenHash, input.tokenHash),
        eq(identitySession.kind, "magic_pending"),
      ),
    )
    .limit(1);
  if (row === undefined) return null;
  if (row.consumed_at !== null) return null;
  if (row.revoked_at !== null) return null;
  if (row.expires_at !== null && row.expires_at <= input.now) return null;
  const result = await db
    .update(identitySession)
    .set({ consumedAt: input.now })
    .where(and(eq(identitySession.sessionId, row.session_id), isNull(identitySession.consumedAt)));
  const meta = (result as { meta?: { changes?: number } }).meta;
  if (meta?.changes === 0) return null;
  return { identityId: row.identity_id };
}

export async function createSession(
  db: D1ServingDb,
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
  await db.insert(identitySession).values({
    sessionId: input.sessionId,
    identityId: input.identityId,
    kind: "session",
    tokenHash: input.tokenHash,
    userAgent: input.userAgent,
    ipHash: input.ipHash,
    expiresAt: input.expiresAt,
    createdAt: input.now,
    lastUsedAt: input.now,
  });
}

export async function revokeSession(
  db: D1ServingDb,
  input: { sessionId: string; now: string },
): Promise<void> {
  await db
    .update(identitySession)
    .set({ revokedAt: input.now })
    .where(and(eq(identitySession.sessionId, input.sessionId), isNull(identitySession.revokedAt)));
}

export async function revokeAllSessionsForIdentity(
  db: D1ServingDb,
  input: { identityId: string; now: string },
): Promise<void> {
  await db
    .update(identitySession)
    .set({ revokedAt: input.now })
    .where(
      and(
        eq(identitySession.identityId, input.identityId),
        eq(identitySession.kind, "session"),
        isNull(identitySession.revokedAt),
      ),
    );
}

export type IdentitySessionListEntry = {
  sessionId: string;
  kind: IdentitySessionKind;
  userAgent: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listSessionsForIdentity(
  db: D1ServingDb,
  identityId: string,
): Promise<IdentitySessionListEntry[]> {
  const rows = await db
    .select({
      session_id: identitySession.sessionId,
      kind: identitySession.kind,
      user_agent: identitySession.userAgent,
      expires_at: identitySession.expiresAt,
      created_at: identitySession.createdAt,
      last_used_at: identitySession.lastUsedAt,
    })
    .from(identitySession)
    .where(
      and(
        eq(identitySession.identityId, identityId),
        isNull(identitySession.revokedAt),
        inArray(identitySession.kind, ["session", "legacy_bearer"]),
      ),
    )
    .orderBy(desc(identitySession.createdAt));
  return rows.map((row) => {
    return {
      sessionId: row.session_id,
      kind: row.kind as IdentitySessionKind,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  });
}

export async function updateIdentityDisplayName(
  db: D1ServingDb,
  input: { identityId: string; displayName: string | null; now: string },
): Promise<void> {
  await db
    .update(identity)
    .set({ displayName: input.displayName, updatedAt: input.now })
    .where(eq(identity.identityId, input.identityId));
}
