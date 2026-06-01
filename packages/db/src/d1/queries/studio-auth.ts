import type { D1Database } from "@cloudflare/workers-types";

import {
  getIdentityBySessionTokenHash,
  getOperatorRoleForIdentity,
  recordSessionUse,
  type StudioActorScope,
} from "./identity.js";

export type { StudioActorScope } from "./identity.js";

export type StudioActorAuth = {
  actorId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  scopes: StudioActorScope[];
  tokenId: string;
};

export async function getStudioActorAuthByTokenHash(
  database: D1Database,
  tokenHash: string,
): Promise<StudioActorAuth | null> {
  const resolved = await getIdentityBySessionTokenHash(
    database,
    tokenHash,
    new Date().toISOString(),
  );
  if (resolved === null) return null;
  const role = await getOperatorRoleForIdentity(database, resolved.identity.identityId);
  if (role === null) return null;
  return {
    actorId: resolved.identity.identityId,
    email: resolved.identity.email,
    displayName: resolved.identity.displayName ?? "",
    workspaceId: role.workspaceId,
    scopes: role.scopes,
    tokenId: resolved.session.sessionId,
  };
}

export async function markStudioActorTokenUsed(
  database: D1Database,
  input: { tokenId: string; usedAt: string },
): Promise<void> {
  await recordSessionUse(database, { sessionId: input.tokenId, usedAt: input.usedAt });
}
