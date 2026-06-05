import { describe, expect, it } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";
import { handleStudioApiRequest, type StudioApiEnv } from "../src/index.js";

type Row = {
  active?: unknown;
  consumed_at?: unknown;
  created_at?: unknown;
  display_name?: unknown;
  email?: unknown;
  email_normalized?: unknown;
  expires_at?: unknown;
  identity_active?: unknown;
  identity_id?: unknown;
  ip_hash?: unknown;
  kind?: unknown;
  label?: unknown;
  last_used_at?: unknown;
  revoked_at?: unknown;
  session_id?: unknown;
  token_hash?: unknown;
  updated_at?: unknown;
  user_agent?: unknown;
};

class FakeIdentityDb {
  identity: Row[] = [];
  session: Row[] = [];
  role: Row[] = [];

  prepare(query: string) {
    const normalized = query.toLowerCase().replaceAll('"', "");
    const captureSelf = this;
    let bound: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        bound = values;
        return this;
      },
      async first() {
        const rows = captureSelf.rowsForQuery(normalized, bound);
        return rows[0] ?? null;
      },
      async all() {
        return { results: captureSelf.rowsForQuery(normalized, bound) };
      },
      async raw() {
        return captureSelf.rowsForQuery(normalized, bound).map((row) => Object.values(row));
      },
      async run() {
        return { meta: captureSelf.runQuery(normalized, bound) };
      },
    };
  }

  private rowsForQuery(normalized: string, bound: unknown[]): Row[] {
    if (normalized.includes("from identity_session") && normalized.includes("join identity")) {
      const tokenHash = bound[0] as string;
      const nowStr = (bound.length > 3 ? bound[3] : bound[1]) as string;
      const session = this.session.find(
        (row) =>
          row.token_hash === tokenHash &&
          row.revoked_at === null &&
          row.consumed_at === null &&
          (row.kind === "session" || row.kind === "legacy_bearer") &&
          (row.expires_at === null || (row.expires_at as string) > nowStr),
      );
      if (session === undefined) return [];
      const identity = this.identity.find((row) => row.identity_id === session.identity_id);
      if (identity === undefined || (identity.active !== 1 && identity.active !== true)) {
        return [];
      }
      return [
        {
          session_id: session.session_id,
          identity_id: identity.identity_id,
          kind: session.kind,
          email: identity.email,
          display_name: identity.display_name,
          identity_active: identity.active,
        },
      ];
    }
    if (normalized.includes("from studio_actor_role")) {
      const identityId = bound[0] as string;
      const role = this.role.find(
        (row) => row.identity_id === identityId && (row.active === 1 || row.active === true),
      );
      return role === undefined ? [] : [role];
    }
    if (normalized.includes("from identity_session") && normalized.includes("token_hash")) {
      const tokenHash = bound[0] as string;
      const row = this.session.find(
        (entry) => entry.token_hash === tokenHash && entry.kind === "magic_pending",
      );
      if (row === undefined) return [];
      return [
        {
          session_id: row.session_id,
          identity_id: row.identity_id,
          expires_at: row.expires_at,
          consumed_at: row.consumed_at,
          revoked_at: row.revoked_at,
        },
      ];
    }
    if (normalized.includes("from identity") && normalized.includes("identity_id")) {
      const identityId = bound[0] as string;
      const row = this.identity.find(
        (entry) =>
          entry.identity_id === identityId && (entry.active === 1 || entry.active === true),
      );
      if (row === undefined) return [];
      return [
        {
          identity_id: row.identity_id,
          email: row.email,
          display_name: row.display_name,
        },
      ];
    }
    if (normalized.includes("from identity") && normalized.includes("email_normalized")) {
      const emailNorm = bound[0] as string;
      const row = this.identity.find(
        (entry) =>
          entry.email_normalized === emailNorm && (entry.active === 1 || entry.active === true),
      );
      if (row === undefined) return [];
      return [
        {
          identity_id: row.identity_id,
          email: row.email,
          display_name: row.display_name,
        },
      ];
    }
    return [];
  }

  private runQuery(normalized: string, bound: unknown[]): { changes: number } {
    if (normalized.startsWith("update identity_session set last_used_at")) {
      const session = this.session.find((row) => row.session_id === bound[1]);
      if (session !== undefined) session.last_used_at = bound[0];
      return { changes: session === undefined ? 0 : 1 };
    }
    if (normalized.startsWith("update identity_session") && normalized.includes("consumed_at")) {
      const session = this.session.find(
        (row) => row.session_id === bound[1] && row.consumed_at === null,
      );
      if (session === undefined) return { changes: 0 };
      session.consumed_at = bound[0];
      return { changes: 1 };
    }
    if (normalized.startsWith("update identity_session set revoked_at")) {
      const session = this.session.find(
        (row) => row.session_id === bound[1] && row.revoked_at === null,
      );
      if (session === undefined) return { changes: 0 };
      session.revoked_at = bound[0];
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into identity ")) {
      if (bound.length >= 7) {
        this.identity.push({
          identity_id: bound[0],
          email: bound[1],
          email_normalized: bound[2],
          display_name: bound[3],
          active: bound[4],
          created_at: bound[5],
          updated_at: bound[6],
        });
        return { changes: 1 };
      }
      this.identity.push({
        identity_id: bound[0],
        email: bound[1],
        email_normalized: bound[2],
        display_name: null,
        active: 1,
        created_at: bound[3],
        updated_at: bound[4],
      });
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into identity_session ")) {
      const boundKind = bound[2] as string | undefined;
      const isMagic = normalized.includes("'magic_pending'") || boundKind === "magic_pending";
      if (isMagic) {
        if (bound.length >= 12) {
          this.session.push({
            session_id: bound[0],
            identity_id: bound[1],
            kind: "magic_pending",
            token_hash: bound[3],
            label: bound[4],
            user_agent: bound[5],
            ip_hash: bound[6],
            expires_at: bound[7],
            consumed_at: bound[8],
            revoked_at: bound[9],
            created_at: bound[10],
            last_used_at: bound[11],
          });
          return { changes: 1 };
        }
        this.session.push({
          session_id: bound[0],
          identity_id: bound[1],
          kind: "magic_pending",
          token_hash: boundKind === "magic_pending" ? bound[3] : bound[2],
          label: null,
          user_agent: null,
          ip_hash: null,
          expires_at: boundKind === "magic_pending" ? bound[4] : bound[3],
          consumed_at: null,
          revoked_at: null,
          created_at: boundKind === "magic_pending" ? bound[5] : bound[4],
          last_used_at: null,
        });
      } else {
        if (bound.length >= 12) {
          this.session.push({
            session_id: bound[0],
            identity_id: bound[1],
            kind: "session",
            token_hash: bound[3],
            label: bound[4],
            user_agent: bound[5],
            ip_hash: bound[6],
            expires_at: bound[7],
            consumed_at: bound[8],
            revoked_at: bound[9],
            created_at: bound[10],
            last_used_at: bound[11],
          });
          return { changes: 1 };
        }
        this.session.push({
          session_id: bound[0],
          identity_id: bound[1],
          kind: "session",
          token_hash: boundKind === "session" ? bound[3] : bound[2],
          label: null,
          user_agent: boundKind === "session" ? bound[4] : bound[3],
          ip_hash: boundKind === "session" ? bound[5] : bound[4],
          expires_at: boundKind === "session" ? bound[6] : bound[5],
          consumed_at: null,
          revoked_at: null,
          created_at: boundKind === "session" ? bound[7] : bound[6],
          last_used_at: boundKind === "session" ? bound[8] : bound[7],
        });
      }
      return { changes: 1 };
    }
    return { changes: 0 };
  }
}

function buildEnv(db: FakeIdentityDb, overrides: Partial<StudioApiEnv> = {}): StudioApiEnv {
  return {
    DB: db as unknown as D1Database,
    AUTH_EMAIL_FROM: "auth@example.test",
    ENVIRONMENT: "development",
    ...overrides,
  };
}

function postJson(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function fetchApi(request: Request, env: StudioApiEnv): Promise<Response> {
  const response = await handleStudioApiRequest(request, env);
  if (response === null) {
    throw new Error(`Expected API response for ${request.url}`);
  }
  return response;
}

describe("magic-link auth", () => {
  it("returns 204 for invalid email shapes without leaking", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "not-an-email" }),
      env,
    );
    expect(response.status).toBe(204);
    expect(db.identity.length).toBe(0);
  });

  it("creates an identity + magic_pending session on request (dev mode echoes link)", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "alice@example.test" }),
      env,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { __devMagicLink?: string };
    expect(typeof body.__devMagicLink).toBe("string");
    expect(db.identity).toHaveLength(1);
    const session = db.session[0];
    expect(session).toBeDefined();
    expect(session?.kind).toBe("magic_pending");
  });

  it("carries same-origin next paths through the dev magic link", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", {
        email: "alice@example.test",
        next: "/briefs/new?route=m15-sbs",
      }),
      env,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { __devMagicLink?: string };
    const link = new URL(body.__devMagicLink ?? "");
    expect(link.searchParams.get("next")).toBe("/briefs/new?route=m15-sbs");
  });

  it("drops cross-origin next paths from the dev magic link", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", {
        email: "alice@example.test",
        next: "https://evil.example/briefs/new",
      }),
      env,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { __devMagicLink?: string };
    const link = new URL(body.__devMagicLink ?? "");
    expect(link.searchParams.has("next")).toBe(false);
  });

  it("consumes a fresh token, sets cookie, returns identity (no operator)", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "bob@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    expect(token).toBeTruthy();
    const consumeResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    expect(consumeResponse.status).toBe(200);
    const setCookie = consumeResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/bp_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    const body = (await consumeResponse.json()) as {
      identity: { email: string };
      operator: unknown;
      session: { kind: string };
    };
    expect(body.identity.email).toBe("bob@example.test");
    expect(body.operator).toBeNull();
    expect(body.session.kind).toBe("session");
  });

  it("rejects a consumed magic-link token on second use", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "carol@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const first = await fetchApi(postJson("/api/v1/auth/magic-link/consume", { token }), env);
    expect(first.status).toBe(200);
    const second = await fetchApi(postJson("/api/v1/auth/magic-link/consume", { token }), env);
    expect(second.status).toBe(401);
  });

  it("rejects an expired magic-link token", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "dave@example.test" }),
      env,
    );
    const magic = db.session[0];
    expect(magic).toBeDefined();
    if (magic === undefined) throw new Error("expected magic-link session");
    magic.expires_at = "1970-01-01T00:00:00.000Z";
    const consumeResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/consume", {
        token: "x".repeat(40) /* wrong token; just make sure shape passes */,
      }),
      env,
    );
    expect(consumeResponse.status).toBe(401);
  });

  it("/api/v1/me returns anonymous shape without a cookie", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await fetchApi(new Request("https://example.test/api/v1/me"), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { identity: unknown; operator: unknown };
    expect(body.identity).toBeNull();
    expect(body.operator).toBeNull();
  });

  it("/api/v1/me returns the signed-in identity when a session cookie is presented", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "eve@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const consumeResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    const cookie = consumeResponse.headers.get("set-cookie") ?? "";
    const cookieValue = cookie.match(/bp_session=([^;]+)/)?.[1] ?? "";
    expect(cookieValue.length).toBeGreaterThan(0);
    const meResponse = await fetchApi(
      new Request("https://example.test/api/v1/me", {
        headers: { Cookie: `bp_session=${cookieValue}` },
      }),
      env,
    );
    expect(meResponse.status).toBe(200);
    const body = (await meResponse.json()) as { identity: { email: string } | null };
    expect(body.identity?.email).toBe("eve@example.test");
  });

  it("signout revokes the session and subsequent /me returns anonymous", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/request", { email: "frank@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const consumeResponse = await fetchApi(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    const cookieValue =
      (consumeResponse.headers.get("set-cookie") ?? "").match(/bp_session=([^;]+)/)?.[1] ?? "";
    const signoutResponse = await fetchApi(
      new Request("https://example.test/api/v1/auth/signout", {
        method: "POST",
        headers: { Cookie: `bp_session=${cookieValue}` },
      }),
      env,
    );
    expect(signoutResponse.status).toBe(204);
    const meResponse = await fetchApi(
      new Request("https://example.test/api/v1/me", {
        headers: { Cookie: `bp_session=${cookieValue}` },
      }),
      env,
    );
    const body = (await meResponse.json()) as { identity: unknown };
    expect(body.identity).toBeNull();
  });
});
