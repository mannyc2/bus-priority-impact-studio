import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { decodeStrict } from "@bp/domain/decode";
import {
  assertPlan097SafeRemoteCommand,
  assertPlan097SchemaEnvelope,
  buildPlan097CanonicalSchemaSnapshot,
  canonicalPlan097Json,
  decidePlan097MapReleaseCatalogRecovery,
  Plan097CompactedBatchSchema,
  Plan097OperationRequestSchema,
  Plan097PreflightReceiptSchema,
  Plan097RecoveryArtifactManifestSchema,
  type Plan097SchemaAuditInput,
} from "../recovery/plan097/index.js";

const sha = (digit: string) => digit.repeat(64);

function mapCatalogAudit(
  overrides: Partial<Plan097SchemaAuditInput> = {},
): Plan097SchemaAuditInput {
  return {
    sqliteMaster: [],
    tables: [],
    indexes: [],
    migrationLedger: {
      present: true,
      rows: [{ id: 34, name: "0034_exact_route_identity_release.sql", appliedAt: null }],
    },
    ...overrides,
  };
}

function exactMapCatalogAudit(): Plan097SchemaAuditInput {
  return mapCatalogAudit({
    sqliteMaster: [
      {
        type: "index",
        name: "map_release_catalog_manifest_key_idx",
        tableName: "map_release_catalog",
        sql: "CREATE UNIQUE INDEX map_release_catalog_manifest_key_idx ON map_release_catalog (manifest_key)",
      },
      {
        type: "table",
        name: "map_release_catalog",
        tableName: "map_release_catalog",
        sql: "CREATE TABLE map_release_catalog (...) ",
      },
    ],
    tables: [
      {
        tableName: "map_release_catalog",
        columns: [
          {
            cid: 0,
            name: "release_id",
            type: "TEXT",
            notNull: false,
            defaultValue: null,
            primaryKey: 1,
          },
          {
            cid: 1,
            name: "published_at",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 2,
            name: "coverage_start",
            type: "TEXT",
            notNull: false,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 3,
            name: "coverage_end",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 4,
            name: "manifest_key",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 5,
            name: "manifest_sha256",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 6,
            name: "release_profile",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 7,
            name: "verification_status",
            type: "TEXT",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
          {
            cid: 8,
            name: "route_count",
            type: "INTEGER",
            notNull: true,
            defaultValue: null,
            primaryKey: 0,
          },
        ],
      },
    ],
    indexes: [
      {
        tableName: "map_release_catalog",
        name: "map_release_catalog_manifest_key_idx",
        unique: true,
        origin: "c",
        partial: false,
        columns: [{ sequence: 0, cid: 4, name: "manifest_key" }],
      },
    ],
  });
}

describe("Plan 097 recovery contracts", () => {
  test("canonicalizes complete schema evidence independently of query order", () => {
    const input = exactMapCatalogAudit();
    const reversed = {
      ...input,
      sqliteMaster: [...input.sqliteMaster].reverse(),
      tables: input.tables.map((table) => ({ ...table, columns: [...table.columns].reverse() })),
      indexes: input.indexes.map((index) => ({ ...index, columns: [...index.columns].reverse() })),
      migrationLedger: {
        ...input.migrationLedger,
        rows: [...input.migrationLedger.rows].reverse(),
      },
    };

    expect(buildPlan097CanonicalSchemaSnapshot(input)).toEqual(
      buildPlan097CanonicalSchemaSnapshot(reversed),
    );
    expect(buildPlan097CanonicalSchemaSnapshot(input).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("allows only absent or exact 0033 recovery states", () => {
    expect(decidePlan097MapReleaseCatalogRecovery(mapCatalogAudit())).toEqual({
      state: "absent",
      applyRecoverySql: true,
    });
    expect(
      decidePlan097MapReleaseCatalogRecovery(
        mapCatalogAudit({
          sqliteMaster: [
            {
              type: "table",
              name: "route_catalog",
              tableName: "route_catalog",
              sql: "CREATE TABLE route_catalog (route_id TEXT)",
            },
          ],
        }),
      ),
    ).toEqual({ state: "absent", applyRecoverySql: true });
    expect(decidePlan097MapReleaseCatalogRecovery(exactMapCatalogAudit())).toEqual({
      state: "exact",
      applyRecoverySql: false,
    });

    const partial = exactMapCatalogAudit();
    partial.tables[0]?.columns.pop();
    expect(() => decidePlan097MapReleaseCatalogRecovery(partial)).toThrow(/column/i);

    const wrongIndex = exactMapCatalogAudit();
    const index = wrongIndex.indexes[0];
    if (index === undefined) throw new Error("Missing index fixture");
    index.unique = false;
    expect(() => decidePlan097MapReleaseCatalogRecovery(wrongIndex)).toThrow(/index/i);

    const unexpectedMapObject = exactMapCatalogAudit();
    unexpectedMapObject.sqliteMaster.push({
      type: "index",
      name: "unexpected_map_index",
      tableName: "map_release_catalog",
      sql: "CREATE INDEX unexpected_map_index ON map_release_catalog (release_id)",
    });
    expect(() => decidePlan097MapReleaseCatalogRecovery(unexpectedMapObject)).toThrow(
      /unexpected map_release_catalog schema object/i,
    );
  });

  test("accepts only canonical schema plus an absent-or-exact 0033 and an independent ledger", () => {
    const expected = buildPlan097CanonicalSchemaSnapshot(exactMapCatalogAudit());
    const ledgerDivergent = buildPlan097CanonicalSchemaSnapshot({
      ...exactMapCatalogAudit(),
      migrationLedger: {
        present: true,
        rows: [{ id: 32, name: "0032_route_catalog_trip_type.sql", appliedAt: null }],
      },
    });
    expect(assertPlan097SchemaEnvelope({ actual: ledgerDivergent, expected })).toEqual({
      mapReleaseCatalog: { state: "exact", applyRecoverySql: false },
    });

    const absentMap = mapCatalogAudit({
      sqliteMaster: [],
      tables: [],
      indexes: [],
    });
    expect(
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(absentMap),
        expected,
      }),
    ).toEqual({ mapReleaseCatalog: { state: "absent", applyRecoverySql: true } });

    const unexpected = exactMapCatalogAudit();
    unexpected.sqliteMaster.push({
      type: "table",
      name: "unreviewed_table",
      tableName: "unreviewed_table",
      sql: "CREATE TABLE unreviewed_table (id TEXT)",
    });
    unexpected.tables.push({
      tableName: "unreviewed_table",
      columns: [
        {
          cid: 0,
          name: "id",
          type: "TEXT",
          notNull: false,
          defaultValue: null,
          primaryKey: 0,
        },
      ],
    });
    expect(() =>
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(unexpected),
        expected,
      }),
    ).toThrow(/schema envelope/i);
  });

  test("the idempotent 0033 recovery creates the exact table and is a no-op on retry", async () => {
    const sqlite = new Database(":memory:");
    const recoverySql = await Bun.file(
      new URL("../recovery/plan097/0033_map_release_catalog_idempotent.sql", import.meta.url),
    ).text();
    expect(recoverySql).not.toMatch(/d1_migrations|INSERT|UPDATE|DELETE/i);
    sqlite.exec(recoverySql);
    sqlite.exec(recoverySql);
    expect(
      sqlite
        .query("PRAGMA table_info(map_release_catalog)")
        .all()
        .map((row) => (row as { name: string }).name),
    ).toEqual([
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
    expect(sqlite.query("PRAGMA index_list(map_release_catalog)").all()).toContainEqual(
      expect.objectContaining({ name: "map_release_catalog_manifest_key_idx", unique: 1 }),
    );
    sqlite.close();
  });

  test("the recovery is a schema no-op after canonical migration replay", async () => {
    const sqlite = new Database(":memory:");
    const migrationsDir = new URL("../migrations/d1/", import.meta.url);
    const filenames = (await readdir(migrationsDir))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    for (const filename of filenames) {
      sqlite.exec(await Bun.file(new URL(filename, migrationsDir)).text());
    }
    const recoverySql = await Bun.file(
      new URL("../recovery/plan097/0033_map_release_catalog_idempotent.sql", import.meta.url),
    ).text();
    const schemaRows = () =>
      sqlite
        .query(
          "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
        .all();
    const before = schemaRows();
    sqlite.exec(recoverySql);
    sqlite.exec(recoverySql);
    expect(schemaRows()).toEqual(before);
    sqlite.close();
  });

  test("rejects unsafe remote command shapes", () => {
    const rejected = [
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--command",
        "INSERT INTO d1_migrations VALUES (33, 'forged')",
      ],
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--file",
        "data/exports/d1/candidate/schema.sql",
      ],
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--file",
        "packages/db/migrations/d1/0000_tense_jane_foster.sql",
      ],
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--file",
        "packages/db/migrations/d1/0034_exact_route_identity_release.sql",
      ],
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--file",
        "data/exports/d1/candidate/seed.sql",
      ],
      [
        "wrangler",
        "d1",
        "execute",
        "prod",
        "--remote",
        "--file",
        "packages/db/recovery/plan097/0033_map_release_catalog_idempotent.sql",
        "--command",
        "DELETE FROM route_catalog",
      ],
    ] as const;
    for (const command of rejected) {
      expect(() => assertPlan097SafeRemoteCommand(command)).toThrow();
    }
    expect(() =>
      assertPlan097SafeRemoteCommand([
        "wrangler",
        "d1",
        "execute",
        "bus-priority-serving",
        "--remote",
        "--file",
        "packages/db/recovery/plan097/0033_map_release_catalog_idempotent.sql",
        "--config",
        "packages/db/wrangler.d1.jsonc",
      ]),
    ).not.toThrow();
  });

  test("strictly decodes a closed immutable artifact manifest", () => {
    const manifest = {
      artifactKind: "bp.ops.plan097.recovery_artifact_manifest.v1",
      schemaVersion: 1,
      releaseId: "pub_20260722T120000000Z",
      createdAt: "2026-07-22T12:00:00.000Z",
      entries: [
        {
          logicalId: "route/b44/dossier",
          logicalKey: "studio/v2/routes/b44/dossier.json",
          key: `operations/plan097/blobs/sha256/${sha("a").slice(0, 2)}/${sha("a")}.json`,
          sha256: sha("a"),
          bytes: 42,
          mediaType: "application/json",
          schemaId: "bp.studio.route_dossier.v1",
        },
      ],
    };
    expect(decodeStrict(Plan097RecoveryArtifactManifestSchema)(manifest)).toEqual(manifest);
    expect(() =>
      decodeStrict(Plan097RecoveryArtifactManifestSchema)({ ...manifest, secret: "must-not-pass" }),
    ).toThrow();
    expect(() =>
      decodeStrict(Plan097RecoveryArtifactManifestSchema)({
        ...manifest,
        entries: [...manifest.entries, { ...manifest.entries[0] }],
      }),
    ).toThrow(/logical/i);
  });

  test("rejects out-of-scope batch targets and caller-selected resources", () => {
    const activation = {
      sql: 'INSERT INTO "route_batch_status" ("month", "status") VALUES (?, ?)',
      params: ["2026-03", "pass"],
      table: "route_batch_status",
      kind: "activation",
      rowCount: 1,
    } as const;
    const batch = {
      schemaVersion: 1,
      statements: [activation],
      metrics: {
        originalStatementCount: 1,
        compactedStatementCount: 1,
        sqlBytes: new TextEncoder().encode(activation.sql).byteLength,
        parameterBytes: new TextEncoder().encode(activation.params.join("")).byteLength,
        rowCount: 1,
        maxParametersPerStatement: 2,
      },
    };
    expect(decodeStrict(Plan097CompactedBatchSchema)(batch)).toEqual(batch);
    expect(() =>
      decodeStrict(Plan097CompactedBatchSchema)({
        ...batch,
        statements: [
          {
            ...activation,
            sql: "DELETE FROM d1_migrations",
            table: "d1_migrations",
            kind: "delete",
          },
          activation,
        ],
        metrics: {
          ...batch.metrics,
          compactedStatementCount: 2,
          sqlBytes:
            new TextEncoder().encode("DELETE FROM d1_migrations").byteLength +
            batch.metrics.sqlBytes,
          rowCount: 2,
        },
      }),
    ).toThrow(/allowlist/i);

    const operation = {
      operationId: "plan097:pub_20260722T120000000Z",
      activationBundleSha256: sha("a"),
      action: "activate",
    };
    expect(decodeStrict(Plan097OperationRequestSchema)(operation)).toEqual(operation);
    expect(() =>
      decodeStrict(Plan097OperationRequestSchema)({
        ...operation,
        database: "user-selected-production",
      }),
    ).toThrow();
  });

  test("preflight receipt binds baseline, rollback, cost, and immutable candidate evidence", () => {
    const schemaSnapshot = buildPlan097CanonicalSchemaSnapshot(exactMapCatalogAudit());
    const unsignedReceipt = {
      artifactKind: "bp.ops.plan097.preflight.v1",
      schemaVersion: 1,
      outcome: "ready",
      preparedAt: "2026-07-22T12:00:00.000Z",
      repoSha: "a".repeat(40),
      commandVersion: "plan097-recovery-v1",
      resources: {
        d1DatabaseName: "bus-priority-serving",
        d1DatabaseId: "11111111-1111-4111-8111-111111111111",
        r2Bucket: "bus-priority-artifacts",
      },
      candidate: {
        releaseId: "pub_20260722T120000000Z",
        manifestKey: "operations/plan097/releases/pub_20260722T120000000Z/artifact-manifest.json",
        manifestSha256: sha("b"),
      },
      schemaSnapshot,
      schemaReconciliation: {
        expectedStructuralSha256: sha("f"),
        actualStructuralSha256: sha("f"),
        mapReleaseCatalogState: "exact",
        applyRecoverySql: false,
      },
      httpBaseline: {
        checkedAt: "2026-07-22T12:00:00.000Z",
        activeReleaseId: "pub_20260721T120000000Z",
        endpoints: [
          {
            path: "/api/v1/status",
            status: 200,
            schemaId: "bp.api.release_status.v1",
            safeBodySha256: sha("c"),
            requestId: "request-1",
            cfRay: null,
            cacheControl: "no-store",
            etag: null,
          },
        ],
      },
      selectiveSnapshot: {
        key: "operations/plan097/snapshots/snapshot.json",
        sha256: sha("a"),
        bytes: 10,
      },
      rollbackPackage: {
        key: "operations/plan097/rollback/rollback.json",
        sha256: sha("d"),
        bytes: 10,
      },
      costPreview: { d1Statements: 100, d1Bytes: 10_000, r2Puts: 2, r2Bytes: 200 },
    };
    const receipt = {
      ...unsignedReceipt,
      signature: {
        algorithm: "Ed25519",
        keyId: "plan097-test-20260722",
        publicKeySpkiSha256: sha("e"),
        signedPayloadSha256: createHash("sha256")
          .update(`${canonicalPlan097Json(unsignedReceipt)}\n`)
          .digest("hex"),
        signatureBase64: `${"A".repeat(86)}==`,
      },
    };
    expect(decodeStrict(Plan097PreflightReceiptSchema)(receipt)).toEqual(receipt);
  });
});
