import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildExactRouteIdentityRegistrationSql,
  type ExactRouteIdentityRegistrationInput,
} from "../src/d1/seed/index.js";

const base = {
  releaseId: "pub_20260722T120000000Z",
  publishedAt: "2026-07-22T12:00:00.000Z",
  coverage: { start: "2023-04", end: "2026-05" },
  sourceWikiRelease: "v1-rc27",
  sourceManifestSha256: "1".repeat(64),
  sourceRouteIdentitySha256: "2".repeat(64),
  sourceCurrentBusRoutesSha256: "3".repeat(64),
  sourceIndexSha256: "4".repeat(64),
  catalogSnapshotSha256: "5".repeat(64),
  projectionSha256: "6".repeat(64),
  exactRouteCount: 381,
  routeTypeCount: 390,
  tripTypeCount: 390,
} as const satisfies ExactRouteIdentityRegistrationInput;

async function createDb(): Promise<Database> {
  const sqlite = new Database(":memory:");
  sqlite.exec(
    await Bun.file(
      new URL("../migrations/d1/0034_exact_route_identity_release.sql", import.meta.url),
    ).text(),
  );
  return sqlite;
}

describe("exact route identity registration", () => {
  test("accepts an identical retry without duplicating rows", async () => {
    const sqlite = await createDb();
    const sql = buildExactRouteIdentityRegistrationSql(base);
    sqlite.query(sql).run();
    sqlite.query(sql).run();
    expect(
      sqlite.query("SELECT COUNT(*) AS count FROM exact_route_identity_release").get(),
    ).toEqual({ count: 1 });
    sqlite.close();
  });

  test("aborts release-id metadata drift and preserves the original", async () => {
    const sqlite = await createDb();
    sqlite.query(buildExactRouteIdentityRegistrationSql(base)).run();
    expect(() =>
      sqlite
        .query(
          buildExactRouteIdentityRegistrationSql({
            ...base,
            projectionSha256: "7".repeat(64),
          }),
        )
        .run(),
    ).toThrow();
    expect(
      sqlite.query("SELECT projection_sha256 FROM exact_route_identity_release").get(),
    ).toEqual({ projection_sha256: base.projectionSha256 });
    sqlite.close();
  });

  test("rejects malformed release identity, hashes, counts, and extra fields", () => {
    for (const input of [
      { ...base, releaseId: "pub_wrong" },
      { ...base, projectionSha256: "not-a-sha" },
      { ...base, exactRouteCount: 0 },
      { ...base, unexpected: true },
    ]) {
      expect(() =>
        buildExactRouteIdentityRegistrationSql(
          input as unknown as ExactRouteIdentityRegistrationInput,
        ),
      ).toThrow();
    }
  });
});
