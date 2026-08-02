import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { D1_CANDIDATE_PROJECTION_TABLES } from "@bp/db/d1";
import { canonicalServingJsonBytes } from "@bp/domain/studio/serving-release";
import {
  bindCandidateMapManifestLogicalKey,
  buildServingCandidate,
  renderServingD1CandidateSeedSql,
  servingD1ProjectionInventory,
} from "../../src/lib/serving-candidate.ts";

const hash = (character: string) => character.repeat(64);

function input(sourceCommit = "a".repeat(40)) {
  return {
    schemaVersion: 1 as const,
    semanticInputFingerprint: hash("b"),
    sourceCommit,
    builderVersions: [{ name: "plan098", version: "1" }],
    datasets: [
      {
        datasetId: "route-speed",
        grain: "month" as const,
        coverage: { start: "2023-04", end: "2026-05" },
        sourceSnapshotIds: ["snapshot-a"],
      },
    ],
    artifacts: [
      {
        logicalId: "route/m1/history",
        body: new TextEncoder().encode('{"routeId":"M1"}\n'),
        mediaType: "application/json",
        schemaId: "bp.route-history.v1",
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: hash("c"),
      rowCounts: { route_catalog: 1 },
    },
    exactIdentity: { projectionSha256: hash("d"), routeCount: 1 },
  };
}

describe("Plan 098 serving candidate builder", () => {
  test("rebinds a recovery physical map key only to its hash-matched logical ID", () => {
    const database = new Database(":memory:");
    const manifestSha256 = hash("a");
    database.exec(`
      CREATE TABLE map_release_catalog (
        release_id TEXT PRIMARY KEY,
        manifest_key TEXT NOT NULL,
        manifest_sha256 TEXT NOT NULL,
        verification_status TEXT NOT NULL
      );
      INSERT INTO map_release_catalog VALUES (
        'release-a',
        'operations/plan097/blobs/sha256/aa/${manifestSha256}.json',
        '${manifestSha256}',
        'pass'
      );
    `);
    const logicalKey = `map/2026-06/manifest.${manifestSha256}.json`;
    expect(bindCandidateMapManifestLogicalKey(database, logicalKey)).toEqual({
      releaseId: "release-a",
      manifestSha256,
    });
    expect(
      database.query("SELECT manifest_key AS manifestKey FROM map_release_catalog").get(),
    ).toEqual({ manifestKey: logicalKey });
    expect(() =>
      bindCandidateMapManifestLogicalKey(database, `map/2026-06/manifest.${hash("b")}.json`),
    ).toThrow("does not uniquely match");
    database.close();
  });

  test("derives immutable physical keys and a deterministic semantic candidate ID", () => {
    const first = buildServingCandidate(input());
    const second = buildServingCandidate(input("e".repeat(40)));
    expect(second.manifest.candidateId).toBe(first.manifest.candidateId);
    expect(second.manifestSha256).not.toBe(first.manifestSha256);
    expect(first.objects[0]?.key).toContain(first.objects[0]?.sha256 ?? "missing");
    expect(first.manifestKey).toContain(first.manifestSha256);
    expect(buildServingCandidate(input()).manifestBytes).toEqual(first.manifestBytes);
  });

  test("hashes D1 projections independently of insertion order and excludes future mixed rows", () => {
    const makeDatabase = (reverse: boolean, includeFuture: boolean): Database => {
      const database = new Database(":memory:");
      for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
        if (table === "exact_route_identity_release") {
          database.exec(
            `CREATE TABLE "${table}" (
              id TEXT PRIMARY KEY,
              coverage_end TEXT NOT NULL,
              projection_sha256 TEXT NOT NULL,
              exact_route_count INTEGER NOT NULL
            )`,
          );
          database
            .query(
              `INSERT INTO "${table}" (
                id, coverage_end, projection_sha256, exact_route_count
              ) VALUES (?, ?, ?, ?)`,
            )
            .run("release", "2026-06", hash("d"), 2);
          continue;
        }
        const hasMonth =
          table === "route_month_source_status" || table === "route_observed_reliability_summary";
        database.exec(
          `CREATE TABLE "${table}" (id TEXT PRIMARY KEY${hasMonth ? ", month TEXT NOT NULL" : ""})`,
        );
        const rows = reverse ? ["b", "a"] : ["a", "b"];
        for (const id of rows) {
          database
            .query(
              `INSERT INTO "${table}" (id${hasMonth ? ", month" : ""}) VALUES (?${hasMonth ? ", ?" : ""})`,
            )
            .run(...(hasMonth ? [id, "2026-06"] : [id]));
        }
        if (hasMonth && includeFuture) {
          database
            .query(`INSERT INTO "${table}" (id, month) VALUES (?, ?)`)
            .run("future", "2026-07");
        }
      }
      return database;
    };
    const firstDb = makeDatabase(false, false);
    const reorderedDb = makeDatabase(true, true);
    const first = servingD1ProjectionInventory(firstDb, "2026-06");
    const reordered = servingD1ProjectionInventory(reorderedDb, "2026-06");
    const candidateId = hash("f");
    const seed = renderServingD1CandidateSeedSql(firstDb, candidateId, "2026-06");
    expect(renderServingD1CandidateSeedSql(reorderedDb, candidateId, "2026-06")).toBe(seed);
    const target = new Database(":memory:");
    for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
      if (table === "exact_route_identity_release") {
        target.exec(
          `CREATE TABLE "${table}_v2" (
            id TEXT,
            coverage_end TEXT NOT NULL,
            projection_sha256 TEXT NOT NULL,
            exact_route_count INTEGER NOT NULL,
            candidate_id TEXT NOT NULL
          )`,
        );
        continue;
      }
      const hasMonth =
        table === "route_month_source_status" || table === "route_observed_reliability_summary";
      target.exec(
        `CREATE TABLE "${table}_v2" (id TEXT${hasMonth ? ", month TEXT NOT NULL" : ""}, candidate_id TEXT NOT NULL)`,
      );
    }
    target.exec(seed);
    target.exec(seed);
    for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
      const count = target
        .query(`SELECT COUNT(*) AS count FROM "${table}_v2" WHERE candidate_id = ?`)
        .get(candidateId) as { count: number };
      expect(count.count).toBe(table === "exact_route_identity_release" ? 1 : 2);
    }
    firstDb.close();
    reorderedDb.close();
    target.close();

    expect(reordered).toEqual(first);
    expect(first.exactIdentityProjectionSha256).toBe(hash("d"));
    expect(first.exactIdentityRouteCount).toBe(2);
    const rowCounts = new Map(Object.entries(first.rowCounts));
    expect(rowCounts.get("route_month_source_status")).toBe(2);
    expect(rowCounts.get("route_observed_reliability_summary")).toBe(2);
  });

  test("changes candidate identity when semantic bytes change", () => {
    const changed = input();
    const artifact = changed.artifacts[0];
    if (artifact === undefined) throw new Error("Missing artifact fixture.");
    changed.artifacts[0] = {
      ...artifact,
      body: new TextEncoder().encode('{"routeId":"M2"}\n'),
    };
    expect(buildServingCandidate(changed).manifest.candidateId).not.toBe(
      buildServingCandidate(input()).manifest.candidateId,
    );
  });

  test("is byte-identical across set enumeration and JSON property order", () => {
    const base = input();
    const first = buildServingCandidate({
      ...base,
      builderVersions: [
        { name: "route-history", version: "2" },
        { name: "map", version: "3" },
      ],
      artifacts: [
        {
          logicalId: "route/m1/history",
          body: canonicalServingJsonBytes({ routeId: "M1", summary: { count: 2, valid: true } }),
          mediaType: "application/json",
          schemaId: "bp.route-history.v2",
        },
        {
          logicalId: "map/network",
          body: canonicalServingJsonBytes({ type: "FeatureCollection", features: [] }),
          mediaType: "application/geo+json",
          schemaId: "bp.map.v3",
          extension: "geojson",
        },
      ],
    });
    const second = buildServingCandidate({
      ...base,
      builderVersions: [
        { name: "map", version: "3" },
        { name: "route-history", version: "2" },
      ],
      artifacts: [
        {
          logicalId: "map/network",
          body: canonicalServingJsonBytes({ features: [], type: "FeatureCollection" }),
          mediaType: "application/geo+json",
          schemaId: "bp.map.v3",
          extension: "geojson",
        },
        {
          logicalId: "route/m1/history",
          body: canonicalServingJsonBytes({ summary: { valid: true, count: 2 }, routeId: "M1" }),
          mediaType: "application/json",
          schemaId: "bp.route-history.v2",
        },
      ],
    });

    expect(second.manifestBytes).toEqual(first.manifestBytes);
    expect(second.objects.map((object) => object.key)).toEqual(
      first.objects.map((object) => object.key),
    );
    expect(second.objects.map((object) => object.body)).toEqual(
      first.objects.map((object) => object.body),
    );
  });
});
