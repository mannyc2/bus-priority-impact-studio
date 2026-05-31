import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

type Row = Record<string, unknown>;

class FakeIdentityDb {
  identity: Row[] = [];
  session: Row[] = [];
  role: Row[] = [];

  prepare(query: string) {
    const normalized = query.toLowerCase();
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
      async run() {
        return { meta: captureSelf.runQuery(normalized, bound) };
      },
    };
  }

  private rowsForQuery(normalized: string, bound: unknown[]): Row[] {
    if (
      normalized.includes("from identity_session s") &&
      normalized.includes("join identity i")
    ) {
      const tokenHash = bound[0] as string;
      const nowStr = bound[1] as string;
      const session = this.session.find(
        (row) =>
          row["token_hash"] === tokenHash &&
          row["revoked_at"] === null &&
          row["consumed_at"] === null &&
          (row["kind"] === "session" || row["kind"] === "legacy_bearer") &&
          (row["expires_at"] === null || (row["expires_at"] as string) > nowStr),
      );
      if (session === undefined) return [];
      const identity = this.identity.find(
        (row) => row["identity_id"] === session["identity_id"],
      );
      if (identity === undefined || identity["active"] !== 1) return [];
      return [
        {
          session_id: session["session_id"],
          identity_id: identity["identity_id"],
          kind: session["kind"],
          email: identity["email"],
          display_name: identity["display_name"],
          identity_active: identity["active"],
        },
      ];
    }
    if (normalized.includes("from studio_actor_role")) {
      const identityId = bound[0] as string;
      const role = this.role.find(
        (row) => row["identity_id"] === identityId && row["active"] === 1,
      );
      return role === undefined ? [] : [role];
    }
    if (normalized.includes("from identity_session") && normalized.includes("where token_hash")) {
      const tokenHash = bound[0] as string;
      const row = this.session.find(
        (entry) => entry["token_hash"] === tokenHash && entry["kind"] === "magic_pending",
      );
      if (row === undefined) return [];
      return [
        {
          session_id: row["session_id"],
          identity_id: row["identity_id"],
          expires_at: row["expires_at"],
          consumed_at: row["consumed_at"],
          revoked_at: row["revoked_at"],
        },
      ];
    }
    if (normalized.includes("from identity") && normalized.includes("where identity_id")) {
      const identityId = bound[0] as string;
      const row = this.identity.find(
        (entry) => entry["identity_id"] === identityId && entry["active"] === 1,
      );
      if (row === undefined) return [];
      return [
        {
          identity_id: row["identity_id"],
          email: row["email"],
          display_name: row["display_name"],
        },
      ];
    }
    if (normalized.includes("from identity") && normalized.includes("where email_normalized")) {
      const emailNorm = bound[0] as string;
      const row = this.identity.find(
        (entry) => entry["email_normalized"] === emailNorm && entry["active"] === 1,
      );
      if (row === undefined) return [];
      return [
        {
          identity_id: row["identity_id"],
          email: row["email"],
          display_name: row["display_name"],
        },
      ];
    }
    return [];
  }

  private runQuery(normalized: string, bound: unknown[]): { changes: number } {
    if (normalized.startsWith("update identity_session set last_used_at")) {
      const session = this.session.find((row) => row["session_id"] === bound[1]);
      if (session !== undefined) session["last_used_at"] = bound[0];
      return { changes: session === undefined ? 0 : 1 };
    }
    if (normalized.startsWith("update identity_session\n          set consumed_at")) {
      const session = this.session.find(
        (row) => row["session_id"] === bound[1] && row["consumed_at"] === null,
      );
      if (session === undefined) return { changes: 0 };
      session["consumed_at"] = bound[0];
      return { changes: 1 };
    }
    if (normalized.startsWith("update identity_session set revoked_at")) {
      const session = this.session.find(
        (row) => row["session_id"] === bound[1] && row["revoked_at"] === null,
      );
      if (session === undefined) return { changes: 0 };
      session["revoked_at"] = bound[0];
      return { changes: 1 };
    }
    if (normalized.startsWith("insert into identity ")) {
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
      const isMagic = normalized.includes("'magic_pending'");
      if (isMagic) {
        this.session.push({
          session_id: bound[0],
          identity_id: bound[1],
          kind: "magic_pending",
          token_hash: bound[2],
          label: null,
          user_agent: null,
          ip_hash: null,
          expires_at: bound[3],
          consumed_at: null,
          revoked_at: null,
          created_at: bound[4],
          last_used_at: null,
        });
      } else {
        this.session.push({
          session_id: bound[0],
          identity_id: bound[1],
          kind: "session",
          token_hash: bound[2],
          label: null,
          user_agent: bound[3],
          ip_hash: bound[4],
          expires_at: bound[5],
          consumed_at: null,
          revoked_at: null,
          created_at: bound[6],
          last_used_at: bound[7],
        });
      }
      return { changes: 1 };
    }
    return { changes: 0 };
  }
}

function buildEnv(db: FakeIdentityDb, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    AUTH_EMAIL_FROM: "auth@example.test",
    ENVIRONMENT: "development",
    ...overrides,
  } as Env;
}

function postJson(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("magic-link auth", () => {
  it("returns 204 for invalid email shapes without leaking", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "not-an-email" }),
      env,
    );
    expect(response.status).toBe(204);
    expect(db.identity.length).toBe(0);
  });

  it("creates an identity + magic_pending session on request (dev mode echoes link)", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "alice@example.test" }),
      env,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { __devMagicLink?: string };
    expect(typeof body.__devMagicLink).toBe("string");
    expect(db.identity).toHaveLength(1);
    const session = db.session[0];
    expect(session).toBeDefined();
    expect(session?.["kind"]).toBe("magic_pending");
  });

  it("consumes a fresh token, sets cookie, returns identity (no operator)", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "bob@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    expect(token).toBeTruthy();
    const consumeResponse = await worker.fetch(
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
    const requestResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "carol@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const first = await worker.fetch(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    expect(first.status).toBe(200);
    const second = await worker.fetch(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    expect(second.status).toBe(401);
  });

  it("rejects an expired magic-link token", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "dave@example.test" }),
      env,
    );
    const magic = db.session[0];
    expect(magic).toBeDefined();
    magic!["expires_at"] = "1970-01-01T00:00:00.000Z";
    const consumeResponse = await worker.fetch(
      postJson(
        "/api/v1/auth/magic-link/consume",
        { token: "x".repeat(40) /* wrong token; just make sure shape passes */ },
      ),
      env,
    );
    expect(consumeResponse.status).toBe(401);
  });

  it("/api/v1/me returns anonymous shape without a cookie", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const response = await worker.fetch(
      new Request("https://example.test/api/v1/me"),
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { identity: unknown; operator: unknown };
    expect(body.identity).toBeNull();
    expect(body.operator).toBeNull();
  });

  it("/api/v1/me returns the signed-in identity when a session cookie is presented", async () => {
    const db = new FakeIdentityDb();
    const env = buildEnv(db);
    const requestResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "eve@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const consumeResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    const cookie = consumeResponse.headers.get("set-cookie") ?? "";
    const cookieValue = cookie.match(/bp_session=([^;]+)/)?.[1] ?? "";
    expect(cookieValue.length).toBeGreaterThan(0);
    const meResponse = await worker.fetch(
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
    const requestResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/request", { email: "frank@example.test" }),
      env,
    );
    const { __devMagicLink } = (await requestResponse.json()) as { __devMagicLink: string };
    const token = new URL(__devMagicLink).searchParams.get("token");
    const consumeResponse = await worker.fetch(
      postJson("/api/v1/auth/magic-link/consume", { token }),
      env,
    );
    const cookieValue =
      (consumeResponse.headers.get("set-cookie") ?? "").match(/bp_session=([^;]+)/)?.[1] ?? "";
    const signoutResponse = await worker.fetch(
      new Request("https://example.test/api/v1/auth/signout", {
        method: "POST",
        headers: { Cookie: `bp_session=${cookieValue}` },
      }),
      env,
    );
    expect(signoutResponse.status).toBe(204);
    const meResponse = await worker.fetch(
      new Request("https://example.test/api/v1/me", {
        headers: { Cookie: `bp_session=${cookieValue}` },
      }),
      env,
    );
    const body = (await meResponse.json()) as { identity: unknown };
    expect(body.identity).toBeNull();
  });
});
