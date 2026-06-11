import {
  createD1ServingDb,
  getIdentityBySessionTokenHash,
  getOperatorRoleForIdentity,
  recordSessionUse,
} from "@bp/db/d1";
import type { StudioApiEnv } from "../env.js";
import { jsonResponse } from "../http/json.js";

export const SESSION_COOKIE = "bp_session";
export const GUEST_COOKIE = "bp_guest";
export const SESSION_MAX_AGE_SECONDS = 2592000;
export const GUEST_MAX_AGE_SECONDS = 2592000;

export type ResolvedIdentity = {
  identity: { identityId: string; email: string; displayName: string | null } | null;
  operator: { workspaceId: string; scopes: string[] } | null;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function guestCookie(value: string, maxAgeSeconds: number): string {
  return `${GUEST_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function authError(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

export async function resolveIdentity(
  request: Request,
  env: Pick<StudioApiEnv, "DB">,
): Promise<ResolvedIdentity> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token === null || env.DB === undefined) {
    return { identity: null, operator: null };
  }
  const db = createD1ServingDb(env.DB);
  const now = new Date().toISOString();
  const resolved = await getIdentityBySessionTokenHash(db, await sha256Hex(token), now);
  if (resolved === null) {
    return { identity: null, operator: null };
  }
  await recordSessionUse(db, { sessionId: resolved.session.sessionId, usedAt: now });
  const operator = await getOperatorRoleForIdentity(db, resolved.identity.identityId);
  return {
    identity: {
      identityId: resolved.identity.identityId,
      email: resolved.identity.email,
      displayName: resolved.identity.displayName,
    },
    operator:
      operator === null ? null : { workspaceId: operator.workspaceId, scopes: operator.scopes },
  };
}
