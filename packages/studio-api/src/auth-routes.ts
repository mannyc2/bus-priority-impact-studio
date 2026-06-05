import {
  consumeMagicLinkRequest,
  createD1ServingDb,
  createMagicLinkRequest,
  createSession,
  getIdentityById,
  getIdentityBySessionTokenHash,
  getOperatorRoleForIdentity,
  revokeSession,
} from "@bp/db/d1";
import { MagicLinkConsumeRequestSchema, MagicLinkRequestSchema } from "@bp/domain";
import type { StudioApiEnv } from "./env.js";
import { jsonResponse as json } from "./http/json.js";
import {
  authError,
  randomToken,
  readCookie,
  resolveIdentity,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookie,
  sha256Hex,
} from "./studio/auth.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;

function safeNextPath(value: string | undefined, origin: string): string | null {
  if (value === undefined || value.length === 0) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : null;
  }
}

export async function handleAuthRoutes(
  request: Request,
  env: StudioApiEnv,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/api/v1/me") {
    return json(await resolveIdentity(request, env));
  }

  if (url.pathname === "/api/v1/auth/magic-link/request" && request.method === "POST") {
    const parsed = MagicLinkRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || env.DB === undefined) {
      return new Response(null, { status: 204 });
    }
    const token = randomToken(32);
    const db = createD1ServingDb(env.DB);
    const now = new Date().toISOString();
    await createMagicLinkRequest(db, {
      identityId: randomToken(16),
      email: parsed.data.email,
      sessionId: randomToken(16),
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString(),
      now,
    });
    const link = new URL("/auth/consume", url.origin);
    link.searchParams.set("token", token);
    const next = safeNextPath(parsed.data.next, url.origin);
    if (next !== null) link.searchParams.set("next", next);
    if (env.EMAIL !== undefined && env.AUTH_EMAIL_FROM !== undefined) {
      await env.EMAIL.send({
        to: parsed.data.email,
        from: env.AUTH_EMAIL_FROM,
        subject: "Your Bus Priority Studio sign-in link",
        html: `<p>Sign in: <a href="${link.toString()}">${link.toString()}</a></p>`,
        text: `Sign in: ${link.toString()}`,
      });
      return new Response(null, { status: 204 });
    }
    console.log(`magic-link sign-in for ${parsed.data.email}: ${link.toString()}`);
    if (env.ENVIRONMENT === "development") {
      return json({ __devMagicLink: link.toString() }, { status: 202 });
    }
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/api/v1/auth/magic-link/consume" && request.method === "POST") {
    const parsed = MagicLinkConsumeRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || env.DB === undefined) {
      return authError(401, "UNAUTHORIZED", "Invalid or expired magic-link token.");
    }
    const db = createD1ServingDb(env.DB);
    const now = new Date().toISOString();
    const consumed = await consumeMagicLinkRequest(db, {
      tokenHash: await sha256Hex(parsed.data.token),
      now,
    });
    if (consumed === null) {
      return authError(401, "UNAUTHORIZED", "Invalid or expired magic-link token.");
    }
    const identity = await getIdentityById(db, consumed.identityId);
    if (identity === null) {
      return authError(401, "UNAUTHORIZED", "Identity is no longer active.");
    }
    const sessionToken = randomToken(32);
    await createSession(db, {
      sessionId: randomToken(16),
      identityId: consumed.identityId,
      tokenHash: await sha256Hex(sessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      userAgent: request.headers.get("user-agent"),
      ipHash: null,
      now,
    });
    const operator = await getOperatorRoleForIdentity(db, consumed.identityId);
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
    headers.append("Set-Cookie", sessionCookie(sessionToken, SESSION_MAX_AGE_SECONDS));
    return new Response(
      JSON.stringify({
        identity: {
          identityId: identity.identityId,
          email: identity.email,
          displayName: identity.displayName,
        },
        operator:
          operator === null ? null : { workspaceId: operator.workspaceId, scopes: operator.scopes },
        session: { kind: "session" },
      }),
      { status: 200, headers },
    );
  }

  if (url.pathname === "/api/v1/auth/signout" && request.method === "POST") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token !== null && env.DB !== undefined) {
      const db = createD1ServingDb(env.DB);
      const now = new Date().toISOString();
      const resolved = await getIdentityBySessionTokenHash(db, await sha256Hex(token), now);
      if (resolved !== null) {
        await revokeSession(db, { sessionId: resolved.session.sessionId, now });
      }
    }
    const headers = new Headers();
    headers.append("Set-Cookie", sessionCookie("", 0));
    return new Response(null, { status: 204, headers });
  }

  return null;
}
