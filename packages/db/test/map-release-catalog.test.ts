import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createBunSqliteServingDb } from "../src/d1/bun-sqlite.js";
import { findLatestVerifiedFullMapRelease, type MapReleaseCatalogEntry } from "../src/d1/index.js";
import {
  buildMapReleaseRegistrationSql,
  type MapReleaseRegistrationInput,
} from "../src/d1/seed/index.js";

const baseRegistration = {
  releaseId: "pub_20260719T123456789Z",
  publishedAt: "2026-07-19T12:34:56.789Z",
  coverage: { start: "2023-04", end: "2026-03" },
  manifestKey: "map/releases/pub_20260719T123456789Z/manifest.json",
  manifestSha256: "a".repeat(64),
  releaseProfile: "full",
  verificationStatus: "pass",
  routeCount: 350,
} as const;

function registration(overrides: Record<string, unknown> = {}): MapReleaseRegistrationInput {
  return { ...baseRegistration, ...overrides } as unknown as MapReleaseRegistrationInput;
}

async function createTestDb(): Promise<Database> {
  const sqlite = new Database(":memory:");
  const migrationSql = await Bun.file(
    new URL("../migrations/d1/0033_map_release_catalog.sql", import.meta.url),
  ).text();
  sqlite.exec(migrationSql);
  return sqlite;
}

function executeRegistration(sqlite: Database, input: MapReleaseRegistrationInput): void {
  sqlite.query(buildMapReleaseRegistrationSql(input)).run();
}

function insertRaw(
  sqlite: Database,
  input: {
    releaseId: string;
    publishedAt: string;
    coverageStart: string | null;
    coverageEnd: string;
    manifestKey: string;
    manifestSha256: string;
    releaseProfile: string;
    verificationStatus: string;
    routeCount: number;
  },
): void {
  sqlite
    .query(
      `INSERT INTO map_release_catalog (
        release_id, published_at, coverage_start, coverage_end, manifest_key,
        manifest_sha256, release_profile, verification_status, route_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.releaseId,
      input.publishedAt,
      input.coverageStart,
      input.coverageEnd,
      input.manifestKey,
      input.manifestSha256,
      input.releaseProfile,
      input.verificationStatus,
      input.routeCount,
    );
}

describe("D1 map release catalog", () => {
  test("migration has the exact publication columns and unique manifest key", async () => {
    const sqlite = await createTestDb();
    const columns = sqlite.query("PRAGMA table_info(map_release_catalog)").all() as Array<{
      name: string;
      notnull: number;
      pk: number;
    }>;
    const indexes = sqlite.query("PRAGMA index_list(map_release_catalog)").all() as Array<{
      name: string;
      unique: number;
    }>;

    expect(columns.map((column) => column.name)).toEqual([
      "release_id",
      "published_at",
      "coverage_start",
      "coverage_end",
      "manifest_key",
      "manifest_sha256",
      "release_profile",
      "verification_status",
      "route_count",
    ]);
    expect(columns.find((column) => column.name === "release_id")).toMatchObject({ pk: 1 });
    expect(columns.find((column) => column.name === "coverage_start")).toMatchObject({
      notnull: 0,
    });
    expect(
      columns
        .filter((column) => column.name !== "coverage_start")
        .every((column) => (column.name === "release_id" ? column.pk === 1 : column.notnull === 1)),
    ).toBe(true);
    expect(indexes).toContainEqual(
      expect.objectContaining({ name: "map_release_catalog_manifest_key_idx", unique: 1 }),
    );
    sqlite.close();
  });

  test("returns only the latest verified full release and leaves a new catalog empty", async () => {
    const sqlite = await createTestDb();
    const db = createBunSqliteServingDb(sqlite);
    await expect(findLatestVerifiedFullMapRelease(db)).resolves.toBeNull();

    executeRegistration(
      sqlite,
      registration({
        releaseId: "pub_20260718T123456789Z",
        publishedAt: "2026-07-18T12:34:56.789Z",
        manifestKey: "map/releases/older/manifest.json",
      }),
    );
    executeRegistration(sqlite, registration());
    insertRaw(sqlite, {
      releaseId: "pub_20260720T123456789Z",
      publishedAt: "2026-07-20T12:34:56.789Z",
      coverageStart: "2023-04",
      coverageEnd: "2026-03",
      manifestKey: "map/releases/demo/manifest.json",
      manifestSha256: "b".repeat(64),
      releaseProfile: "demo",
      verificationStatus: "pass",
      routeCount: 1,
    });
    insertRaw(sqlite, {
      releaseId: "pub_20260721T123456789Z",
      publishedAt: "2026-07-21T12:34:56.789Z",
      coverageStart: "2023-04",
      coverageEnd: "2026-03",
      manifestKey: "map/releases/unverified/manifest.json",
      manifestSha256: "c".repeat(64),
      releaseProfile: "full",
      verificationStatus: "fail",
      routeCount: 350,
    });

    await expect(findLatestVerifiedFullMapRelease(db)).resolves.toEqual(
      baseRegistration as unknown as MapReleaseCatalogEntry,
    );
    sqlite.close();
  });

  test("fails closed when the selected catalog row has invalid metadata", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [
      { publishedAt: "2026-07-19T12:34:56Z" },
      { releaseId: "pub_20260718T123456789Z" },
      { coverageEnd: "March 2026" },
      { coverageStart: "2026-04", coverageEnd: "2026-03" },
      { manifestSha256: "not-a-sha" },
      { routeCount: -1 },
      { routeCount: 1.5 },
    ];

    for (const [index, overrides] of cases.entries()) {
      const sqlite = await createTestDb();
      insertRaw(sqlite, {
        releaseId: (overrides["releaseId"] as string | undefined) ?? baseRegistration.releaseId,
        publishedAt:
          (overrides["publishedAt"] as string | undefined) ?? baseRegistration.publishedAt,
        coverageStart:
          (overrides["coverageStart"] as string | null | undefined) ??
          baseRegistration.coverage.start,
        coverageEnd:
          (overrides["coverageEnd"] as string | undefined) ?? baseRegistration.coverage.end,
        manifestKey: `${baseRegistration.manifestKey}.${index}`,
        manifestSha256:
          (overrides["manifestSha256"] as string | undefined) ?? baseRegistration.manifestSha256,
        releaseProfile: "full",
        verificationStatus: "pass",
        routeCount: (overrides["routeCount"] as number | undefined) ?? baseRegistration.routeCount,
      });

      await expect(
        findLatestVerifiedFullMapRelease(createBunSqliteServingDb(sqlite)),
      ).rejects.toThrow();
      sqlite.close();
    }
  });

  test("escapes SQL strings and treats an identical retry as success", async () => {
    const sqlite = await createTestDb();
    const input = registration({
      coverage: { start: null, end: "2026-03" },
      manifestKey: "map/releases/operator's/manifest.json",
    });
    const sql = buildMapReleaseRegistrationSql(input);

    expect(sql).toContain("operator''s");
    sqlite.query(sql).run();
    sqlite.query(sql).run();

    expect(sqlite.query("SELECT manifest_key FROM map_release_catalog").get()).toEqual({
      manifest_key: "map/releases/operator's/manifest.json",
    });
    expect(sqlite.query("SELECT COUNT(*) AS count FROM map_release_catalog").get()).toEqual({
      count: 1,
    });
    sqlite.close();
  });

  test("aborts same-release metadata drift without mutating the original row", async () => {
    const sqlite = await createTestDb();
    executeRegistration(sqlite, registration());

    expect(() =>
      executeRegistration(sqlite, registration({ manifestSha256: "b".repeat(64) })),
    ).toThrow();
    expect(sqlite.query("SELECT manifest_sha256 FROM map_release_catalog").get()).toEqual({
      manifest_sha256: baseRegistration.manifestSha256,
    });
    sqlite.close();
  });

  test("aborts a manifest-key collision on another release", async () => {
    const sqlite = await createTestDb();
    executeRegistration(sqlite, registration());

    expect(() =>
      executeRegistration(
        sqlite,
        registration({
          releaseId: "pub_20260720T123456789Z",
          publishedAt: "2026-07-20T12:34:56.789Z",
        }),
      ),
    ).toThrow();
    expect(sqlite.query("SELECT COUNT(*) AS count FROM map_release_catalog").get()).toEqual({
      count: 1,
    });
    sqlite.close();
  });

  test("rejects invalid, demo, unverified, and v1 registration inputs", () => {
    const invalidInputs: unknown[] = [
      registration({ releaseProfile: "demo" }),
      registration({ verificationStatus: "fail" }),
      registration({ publishedAt: "2026-07-19T12:34:56Z" }),
      registration({ coverage: { start: "2026-04", end: "2026-03" } }),
      registration({ manifestSha256: "not-a-sha" }),
      registration({ routeCount: -1 }),
      {
        schemaVersion: 1,
        baselineMonth: "2026-03",
        manifestKey: "map/2026-03/manifest.json",
        releaseProfile: "demo",
        verificationStatus: "pass",
      },
    ];

    for (const input of invalidInputs) {
      expect(() => buildMapReleaseRegistrationSql(input as MapReleaseRegistrationInput)).toThrow();
    }
  });
});
