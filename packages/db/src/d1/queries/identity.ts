import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { identity, identitySession, studioActorRole } from "../schema.js";

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
  const parsed = OperatorRoleRowSchema.parse(row);
  return {
    roleId: parsed.role_id,
    identityId: parsed.identity_id,
    workspaceId: parsed.workspace_id,
    scopes: parseScopes(parsed.scopes_json),
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

const IdentityRowSchema = z
  .object({
    identity_id: z.string(),
    email: z.string(),
    display_name: z.string().nullable(),
  })
  .strict();

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
  const parsed = IdentityRowSchema.parse(row);
  return {
    identityId: parsed.identity_id,
    email: parsed.email,
    displayName: parsed.display_name,
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
  const parsed = IdentityRowSchema.parse(row);
  return {
    identityId: parsed.identity_id,
    email: parsed.email,
    displayName: parsed.display_name,
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
  const parsed = MagicConsumeRowSchema.parse(row);
  if (parsed.consumed_at !== null) return null;
  if (parsed.revoked_at !== null) return null;
  if (parsed.expires_at !== null && parsed.expires_at <= input.now) return null;
  const result = await db
    .update(identitySession)
    .set({ consumedAt: input.now })
    .where(
      and(eq(identitySession.sessionId, parsed.session_id), isNull(identitySession.consumedAt)),
    );
  const meta = (result as { meta?: { changes?: number } }).meta;
  if (meta?.changes === 0) return null;
  return { identityId: parsed.identity_id };
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
  db: D1ServingDb,
  input: { identityId: string; displayName: string | null; now: string },
): Promise<void> {
  await db
    .update(identity)
    .set({ displayName: input.displayName, updatedAt: input.now })
    .where(eq(identity.identityId, input.identityId));
}
