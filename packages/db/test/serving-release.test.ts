import { Database, type SQLQueryBindings } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { decodeStrict } from "@bp/domain/decode";
import {
  ServingCandidateManifestV1Schema,
  ServingReleaseV1Schema,
} from "@bp/domain/studio/serving-release";
import type { D1Database } from "@cloudflare/workers-types";
import {
  D1_CANDIDATE_PROJECTION_TABLES,
  markServingCandidateReady,
  registerServingCandidate,
} from "../src/d1/serving-candidate.js";
import {
  activateServingRelease,
  resolveActiveServingRelease,
  ServingReleaseResolutionError,
} from "../src/d1/serving-release.js";

class BunD1Statement {
  readonly #database: Database;
  readonly #sql: string;
  #bindings: SQLQueryBindings[] = [];

  constructor(database: Database, sql: string) {
    this.#database = database;
    this.#sql = sql;
  }

  bind(...values: SQLQueryBindings[]): BunD1Statement {
    this.#bindings = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.#database.query(this.#sql).get(...this.#bindings) as T | null) ?? null;
  }

  async all<T>(): Promise<{ success: true; results: T[] }> {
    return {
      success: true,
      results: this.#database.query(this.#sql).all(...this.#bindings) as T[],
    };
  }

  async run(): Promise<{ success: true }> {
    this.#database.query(this.#sql).run(...this.#bindings);
    return { success: true };
  }
}

function asD1(database: Database): D1Database {
  return {
    prepare: (sql: string) => new BunD1Statement(database, sql),
    batch: async (statements: BunD1Statement[]) => {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

async function migratedDatabase(): Promise<Database> {
  const database = new Database(":memory:");
  for (const directory of ["../migrations/d1/", "../migrations/d1-v2/active/"]) {
    const migrations = new URL(directory, import.meta.url);
    const filenames = (await readdir(migrations))
      .filter((filename) => filename.endsWith(".sql"))
      .toSorted();
    for (const filename of filenames) {
      database.exec(await Bun.file(new URL(filename, migrations)).text());
    }
  }
  return database;
}

const hash = (character: string) => character.repeat(64);

function stageReadyCandidate(
  database: Database,
  candidateId: string,
  manifestSha256: string,
): void {
  database
    .query(
      `INSERT INTO serving_candidate(
        candidate_id, state, schema_version, semantic_input_fingerprint,
        source_commit, canonical_manifest_key, canonical_manifest_sha256,
        projection_schema, projection_sha256, exact_identity_projection_sha256,
        exact_identity_route_count, expected_dataset_count, expected_artifact_count,
        expected_d1_table_count, created_at, ready_at, rejected_at, rejection_code
      ) VALUES (?, 'staging', 1, ?, ?, ?, ?, ?, ?, ?, 375, 1, 1, 1, ?, NULL, NULL, NULL)`,
    )
    .run(
      candidateId,
      hash("f"),
      "c".repeat(40),
      `serving/candidates/${candidateId}/manifest.${manifestSha256}.json`,
      manifestSha256,
      "bp.d1.serving.v2",
      hash("d"),
      hash("e"),
      "2026-08-01T19:50:00.000Z",
    );
  database
    .query(
      `INSERT INTO serving_candidate_d1_count(candidate_id, table_name, row_count)
      VALUES (?, 'route_catalog', 0)`,
    )
    .run(candidateId);
  database
    .query(
      `INSERT INTO serving_candidate_builder(candidate_id, builder_rank, name, version)
      VALUES (?, 0, 'plan098-test', '1')`,
    )
    .run(candidateId);
  database
    .query(
      `INSERT INTO serving_candidate_dataset(
        candidate_id, dataset_id, grain, coverage_start, coverage_end, source_snapshot_ids_json
      ) VALUES (?, 'route-speed', 'month', '2025-01', '2026-06', '["snapshot-a"]')`,
    )
    .run(candidateId);
  const artifactSha = hash("a");
  database
    .query(
      `INSERT INTO serving_candidate_artifact(
        candidate_id, logical_id, physical_key, sha256, byte_length, media_type, schema_id, verified_at
      ) VALUES (?, 'route/bx38/speed-history', ?, ?, 42, 'application/json', 'bp.route-speed.v1', ?)`,
    )
    .run(
      candidateId,
      `serving/blobs/sha256/aa/${artifactSha}.json`,
      artifactSha,
      "2026-08-01T19:55:00.000Z",
    );
  database
    .query("UPDATE serving_candidate SET state = 'ready', ready_at = ? WHERE candidate_id = ?")
    .run("2026-08-01T19:56:00.000Z", candidateId);
}

function release(candidateId: string, publishedAt: string, activatedAt: string) {
  const releaseId = `pub_${publishedAt.replaceAll("-", "").replaceAll(":", "").replace(".", "")}`;
  return decodeStrict(ServingReleaseV1Schema)({
    schemaVersion: 1,
    releaseId,
    candidateId,
    publishedAt,
    activatedAt,
  });
}

function emptyCandidateManifest(candidateId: string) {
  return decodeStrict(ServingCandidateManifestV1Schema)({
    schemaVersion: 1,
    candidateId,
    semanticInputFingerprint: hash("b"),
    sourceCommit: "c".repeat(40),
    builderVersions: [{ name: "plan098-test", version: "1" }],
    datasets: [
      {
        datasetId: "route-speed",
        grain: "month",
        coverage: { start: "2025-01", end: "2026-06" },
        sourceSnapshotIds: ["snapshot-a"],
      },
    ],
    artifacts: [],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: hash("d"),
      rowCounts: Object.fromEntries(D1_CANDIDATE_PROJECTION_TABLES.map((table) => [table, 0])),
    },
    exactIdentity: { projectionSha256: hash("e"), routeCount: 0 },
  });
}

function protectedSentinels(database: Database): string {
  return JSON.stringify({
    identity: database.query("SELECT * FROM identity ORDER BY identity_id").all(),
    reliability: database
      .query("SELECT * FROM route_observed_reliability_current_signal ORDER BY route_id, month")
      .all(),
    statuses: database
      .query("SELECT * FROM route_month_source_status_current_signal ORDER BY route_id, month")
      .all(),
  });
}

describe("Plan 098 serving release pointer", () => {
  test("boots legacy+v2 and resolves the null bootstrap state", async () => {
    const database = await migratedDatabase();
    expect(await resolveActiveServingRelease(asD1(database))).toEqual({
      kind: "legacy",
      generation: 0,
    });
  });

  test("performs A→B→A→B by exact CAS and resolves one immutable candidate", async () => {
    const database = await migratedDatabase();
    const d1 = asD1(database);
    const candidateA = hash("1");
    const candidateB = hash("2");
    const manifestA = hash("3");
    const manifestB = hash("4");
    stageReadyCandidate(database, candidateA, manifestA);
    stageReadyCandidate(database, candidateB, manifestB);
    database
      .query(
        `INSERT INTO identity(
          identity_id, email, email_normalized, display_name, active, created_at, updated_at
        ) VALUES ('identity-sentinel', 'sentinel@example.test', 'sentinel@example.test',
          'Sentinel', 1, '2026-08-01T19:00:00.000Z', '2026-08-01T19:00:00.000Z')`,
      )
      .run();
    database
      .query(
        `INSERT INTO route_observed_reliability_current_signal(
          route_id, month, run_id, reliability_status, min_sample_threshold,
          sample_count, stop_count, direction_count
        ) VALUES ('M1', '2026-07', 'signal-run', 'observed', 100, 250, 12, 2)`,
      )
      .run();
    database
      .query(
        `INSERT INTO route_month_source_status_current_signal(
          route_id, month, source_scope, source_id, status, row_count, snapshot_id, note
        ) VALUES ('M1', '2026-07', 'reliability', 'observedHeadways', 'complete', 250,
          'signal-snapshot', NULL)`,
      )
      .run();
    const sentinelsBefore = protectedSentinels(database);
    const releaseA = release(candidateA, "2026-08-01T20:00:00.000Z", "2026-08-01T20:00:00.000Z");
    const releaseB = release(candidateB, "2026-08-01T20:00:00.001Z", "2026-08-01T20:00:00.001Z");

    const transitions = [];
    transitions.push(
      await activateServingRelease(d1, {
        operationId: "activate-a",
        expectedReleaseId: null,
        expectedGeneration: 0,
        release: releaseA,
        manifestSha256: manifestA,
      }),
    );
    transitions.push(
      await activateServingRelease(d1, {
        operationId: "activate-b",
        expectedReleaseId: releaseA.releaseId,
        expectedGeneration: 1,
        release: releaseB,
        manifestSha256: manifestB,
      }),
    );
    transitions.push(
      await activateServingRelease(d1, {
        operationId: "rollback-a",
        expectedReleaseId: releaseB.releaseId,
        expectedGeneration: 2,
        release: { ...releaseA, activatedAt: "2026-08-01T20:00:00.002Z" },
        manifestSha256: manifestA,
      }),
    );
    transitions.push(
      await activateServingRelease(d1, {
        operationId: "reactivate-b",
        expectedReleaseId: releaseA.releaseId,
        expectedGeneration: 3,
        release: { ...releaseB, activatedAt: "2026-08-01T20:00:00.003Z" },
        manifestSha256: manifestB,
      }),
    );

    expect(transitions.map((transition) => transition.newGeneration)).toEqual([1, 2, 3, 4]);
    const context = await resolveActiveServingRelease(d1);
    expect(context.kind).toBe("pointed");
    if (context.kind === "pointed") {
      expect(context.release.releaseId).toBe(releaseB.releaseId);
      expect(String(context.candidate.candidateId)).toBe(candidateB);
      expect(context.generation).toBe(4);
    }
    expect(
      database.query("SELECT COUNT(*) AS count FROM serving_release").get() as { count: number },
    ).toEqual({ count: 2 });
    expect(protectedSentinels(database)).toBe(sentinelsBefore);
  });

  test("makes ready candidate metadata and projection rows immutable", async () => {
    const database = await migratedDatabase();
    const candidateId = hash("8");
    stageReadyCandidate(database, candidateId, hash("9"));

    expect(() =>
      database
        .query(
          `INSERT INTO route_catalog_v2(
            route_id, route_short_name, shape_count, stop_count, timepoint_stop_count, candidate_id
          ) VALUES ('M1', 'M1', 1, 10, 4, ?)`,
        )
        .run(candidateId),
    ).toThrow(/terminal serving candidate rows are immutable/u);
    expect(() =>
      database
        .query("UPDATE serving_candidate_d1_count SET row_count = 1 WHERE candidate_id = ?")
        .run(candidateId),
    ).toThrow(/terminal serving candidate rows are immutable/u);
  });

  test("registers a complete staged namespace idempotently and rejects count drift", async () => {
    const database = await migratedDatabase();
    const d1 = asD1(database);
    const candidateId = hash("a");
    const manifest = emptyCandidateManifest(candidateId);
    const input = {
      manifest,
      manifestKey: `serving/candidates/${candidateId}/manifest.${hash("f")}.json`,
      manifestSha256: hash("f"),
      stagedAt: "2026-08-01T19:00:00.000Z",
    };
    expect((await registerServingCandidate(d1, input)).state).toBe("staging");
    expect((await registerServingCandidate(d1, input)).state).toBe("staging");
    expect(await resolveActiveServingRelease(d1)).toEqual({ kind: "legacy", generation: 0 });

    database
      .query(
        `INSERT INTO route_catalog_v2(
          route_id, route_short_name, shape_count, stop_count, timepoint_stop_count, candidate_id
        ) VALUES ('M1', 'M1', 1, 10, 4, ?)`,
      )
      .run(candidateId);
    await expect(
      markServingCandidateReady(d1, candidateId, "2026-08-01T19:10:00.000Z"),
    ).rejects.toMatchObject({ code: "candidate_incomplete" });
    database.query("DELETE FROM route_catalog_v2 WHERE candidate_id = ?").run(candidateId);
    await markServingCandidateReady(d1, candidateId, "2026-08-01T19:10:00.000Z");
    expect(
      database
        .query("SELECT state, ready_at AS readyAt FROM serving_candidate WHERE candidate_id = ?")
        .get(candidateId),
    ).toEqual({ state: "ready", readyAt: "2026-08-01T19:10:00.000Z" });
  });

  test("replays a committed operation but rejects collisions and stale CAS", async () => {
    const database = await migratedDatabase();
    const d1 = asD1(database);
    const candidateId = hash("5");
    const manifestSha256 = hash("6");
    stageReadyCandidate(database, candidateId, manifestSha256);
    const target = release(candidateId, "2026-08-01T20:00:00.004Z", "2026-08-01T20:00:00.004Z");
    const input = {
      operationId: "idempotent-activation",
      expectedReleaseId: null,
      expectedGeneration: 0,
      release: target,
      manifestSha256,
    };

    const first = await activateServingRelease(d1, input);
    expect(await activateServingRelease(d1, input)).toEqual(first);
    await expect(
      activateServingRelease(d1, { ...input, manifestSha256: hash("7") }),
    ).rejects.toMatchObject({ code: "operation_collision" });
    await expect(
      activateServingRelease(d1, {
        ...input,
        operationId: "stale-activation",
      }),
    ).rejects.toBeInstanceOf(ServingReleaseResolutionError);
    expect(
      database.query("SELECT generation FROM serving_active_release").get() as {
        generation: number;
      },
    ).toEqual({ generation: 1 });
  });
});
