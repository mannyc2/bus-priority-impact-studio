/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, SELF } from "cloudflare:test";
import {
  AlertResponseSchema,
  AlertsListResponseSchema,
  PublicCommentResponseSchema,
  PublicCommentsListResponseSchema,
  SavedSearchesListResponseSchema,
  SavedSearchResponseSchema,
} from "@bp/domain/studio/identity";
import { beforeEach, describe, expect, it } from "vitest";

type IdentitySurfaceTestEnv = {
  DB?: D1Database;
};

const testEnv = env as unknown as IdentitySurfaceTestEnv;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireDb(): D1Database {
  expect(testEnv.DB).toBeDefined();
  return testEnv.DB as D1Database;
}

async function resetIdentityTables(): Promise<void> {
  const db = requireDb();
  await db.prepare("DELETE FROM public_comment").run();
  await db.prepare("DELETE FROM saved_search").run();
  await db.prepare("DELETE FROM alert").run();
  await db.prepare("DELETE FROM identity_session").run();
  await db.prepare("DELETE FROM studio_actor_role").run();
  await db.prepare("DELETE FROM identity").run();
}

async function seedIdentity(): Promise<string> {
  const db = requireDb();
  const now = "2026-06-05T00:00:00.000Z";
  const sessionToken = "identity-surface-session-token";
  await db
    .prepare(
      `INSERT INTO identity (
        identity_id, email, email_normalized, display_name, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "identity-surface-user",
      "surface@example.test",
      "surface@example.test",
      "Surface User",
      1,
      now,
      now,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO identity_session (
        session_id, identity_id, kind, token_hash, label, user_agent, ip_hash,
        expires_at, consumed_at, revoked_at, created_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "identity-surface-session",
      "identity-surface-user",
      "session",
      await sha256Hex(sessionToken),
      null,
      null,
      null,
      "2999-01-01T00:00:00.000Z",
      null,
      null,
      now,
      null,
    )
    .run();
  return `bp_session=${sessionToken}`;
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://example.test${path}`, init);
}

function jsonRequest(path: string, method: "POST" | "DELETE", body?: unknown, cookie?: string) {
  return request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  await resetIdentityTables();
});

describe("Worker identity surface APIs", () => {
  it("keeps public comment reads anonymous while requiring identity for writes", async () => {
    const emptyResponse = await SELF.fetch(request("/api/v1/briefs/brief-1/public-comments"));
    expect(emptyResponse.status).toBe(200);
    expect(PublicCommentsListResponseSchema.parse(await emptyResponse.json()).comments).toEqual([]);

    const anonymousPost = await SELF.fetch(
      jsonRequest("/api/v1/briefs/brief-1/public-comments", "POST", {
        body: "Anonymous should not post.",
      }),
    );
    expect(anonymousPost.status).toBe(401);

    const cookie = await seedIdentity();
    const createResponse = await SELF.fetch(
      jsonRequest(
        "/api/v1/briefs/brief-1/public-comments",
        "POST",
        { body: "This route needs bus priority." },
        cookie,
      ),
    );
    expect(createResponse.status).toBe(200);
    const created = PublicCommentResponseSchema.parse(await createResponse.json());
    expect(created.displayName).toBe("Surface User");
    expect(created.body).toBe("This route needs bus priority.");

    const listResponse = await SELF.fetch(request("/api/v1/briefs/brief-1/public-comments"));
    expect(listResponse.status).toBe(200);
    const listed = PublicCommentsListResponseSchema.parse(await listResponse.json());
    expect(listed.comments.map((comment) => comment.commentId)).toEqual([created.commentId]);

    const deleteResponse = await SELF.fetch(
      jsonRequest(
        `/api/v1/briefs/brief-1/public-comments/${encodeURIComponent(created.commentId)}`,
        "DELETE",
        undefined,
        cookie,
      ),
    );
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await SELF.fetch(request("/api/v1/briefs/brief-1/public-comments"));
    expect(
      PublicCommentsListResponseSchema.parse(await afterDeleteResponse.json()).comments,
    ).toEqual([]);
  });

  it("lets signed-in identities create, list, and delete alerts and saved searches", async () => {
    const cookie = await seedIdentity();

    const alertCreateResponse = await SELF.fetch(
      jsonRequest("/api/v1/alerts", "POST", { kind: "route", payload: { routeId: "M15" } }, cookie),
    );
    expect(alertCreateResponse.status).toBe(200);
    const alert = AlertResponseSchema.parse(await alertCreateResponse.json());
    expect(alert.kind).toBe("route");

    const alertsListResponse = await SELF.fetch(
      request("/api/v1/alerts", { headers: { Cookie: cookie } }),
    );
    expect(alertsListResponse.status).toBe(200);
    expect(AlertsListResponseSchema.parse(await alertsListResponse.json()).alerts).toHaveLength(1);

    const alertDeleteResponse = await SELF.fetch(
      jsonRequest(
        `/api/v1/alerts/${encodeURIComponent(alert.alertId)}`,
        "DELETE",
        undefined,
        cookie,
      ),
    );
    expect(alertDeleteResponse.status).toBe(204);

    const savedSearchCreateResponse = await SELF.fetch(
      jsonRequest(
        "/api/v1/saved-searches",
        "POST",
        { label: "Slow crosstown routes", query: { q: "crosstown slow" } },
        cookie,
      ),
    );
    expect(savedSearchCreateResponse.status).toBe(200);
    const savedSearch = SavedSearchResponseSchema.parse(await savedSearchCreateResponse.json());
    expect(savedSearch.label).toBe("Slow crosstown routes");

    const savedSearchesListResponse = await SELF.fetch(
      request("/api/v1/saved-searches", { headers: { Cookie: cookie } }),
    );
    expect(savedSearchesListResponse.status).toBe(200);
    expect(
      SavedSearchesListResponseSchema.parse(await savedSearchesListResponse.json()).savedSearches,
    ).toHaveLength(1);

    const savedSearchDeleteResponse = await SELF.fetch(
      jsonRequest(
        `/api/v1/saved-searches/${encodeURIComponent(savedSearch.savedSearchId)}`,
        "DELETE",
        undefined,
        cookie,
      ),
    );
    expect(savedSearchDeleteResponse.status).toBe(204);
  });
});
