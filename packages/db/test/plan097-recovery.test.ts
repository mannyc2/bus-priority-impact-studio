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
  type Plan097FreshnessMatrix,
  Plan097HttpBaselineSchema,
  Plan097OperationRequestSchema,
  Plan097PreflightReceiptSchema,
  Plan097RecoveryArtifactManifestSchema,
  type Plan097SchemaAuditInput,
  Plan097StudioScheduleEvidenceSchema,
  plan097MapReleaseCatalogRecoveryStatements,
} from "../recovery/plan097/index.js";

const sha = (digit: string) => digit.repeat(64);

function readyFreshnessMatrix(): Plan097FreshnessMatrix {
  const sources = [
    ["bus_segment_speeds_2025", "month", "source_complete_probe", "2026-05"],
    ["bus_hourly_ridership_2025", "month", "latest_closed_upstream_month", "2026-06"],
    ["bus_wait_assessment", "month", "latest_closed_upstream_month", "2026-05"],
    ["ace_violations", "month", "latest_closed_upstream_month", "2026-06"],
    ["ace_routes", "snapshot", "atomic_snapshot", `snapshot:${sha("1")}`],
    ["nyc_dot_bus_lanes_local_streets", "snapshot", "atomic_snapshot", `snapshot:${sha("2")}`],
    ["bus_time_gtfsrt_vehicle_positions", "realtime", "preserved_current_signal", "2026-05-19"],
  ] as const;
  return {
    artifactKind: "bp.ops.plan097.freshness-matrix.v1",
    schemaVersion: 1,
    checkedAt: "2026-07-22T11:58:00.000Z",
    status: "ready",
    candidateCompatibilityCoverageEnd: "2026-05",
    datasets: sources.map(([sourceId, grain, selectionBasis, partition]) => ({
      sourceId,
      grain,
      selectionBasis,
      upstreamLatest: grain === "month" ? partition : null,
      selectedCompletePartition: partition,
      ingestedLatest: partition,
      evidence: {
        sourceId,
        partition,
        rowCount: 1,
        routeCount: grain === "month" ? 1 : null,
        rowsSha256: sha("a"),
        sourceSnapshotSha256: grain === "snapshot" ? sha("b") : null,
      },
      status: "ready",
      reasons: [],
    })),
  };
}

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

function withRouteCatalog(
  input: Plan097SchemaAuditInput,
  state: "legacy-0009" | "exact" = "exact",
): Plan097SchemaAuditInput {
  const columns = [
    ["route_id", "TEXT", true, 1],
    ["route_short_name", "TEXT", true, 0],
    ["route_long_name", "TEXT", false, 0],
    ["shape_count", "INTEGER", true, 0],
    ["stop_count", "INTEGER", true, 0],
    ["timepoint_stop_count", "INTEGER", true, 0],
    ["latitude_min", "REAL", false, 0],
    ["latitude_max", "REAL", false, 0],
    ["longitude_min", "REAL", false, 0],
    ["longitude_max", "REAL", false, 0],
    ["route_miles", "REAL", false, 0],
    ["terminal_a_name", "TEXT", false, 0],
    ["terminal_b_name", "TEXT", false, 0],
  ] as const;
  const selected = state === "exact" ? columns : columns.slice(0, -3);
  return {
    ...input,
    sqliteMaster: [
      ...input.sqliteMaster,
      {
        type: "table",
        name: "route_catalog",
        tableName: "route_catalog",
        sql: "CREATE TABLE route_catalog (...)",
      },
    ],
    tables: [
      ...input.tables,
      {
        tableName: "route_catalog",
        columns: selected.map(([name, type, notNull, primaryKey], cid) => ({
          cid,
          name,
          type,
          notNull,
          defaultValue: null,
          primaryKey,
        })),
      },
    ],
    indexes: [
      ...input.indexes,
      {
        tableName: "route_catalog",
        name: "sqlite_autoindex_route_catalog_1",
        unique: true,
        origin: "pk",
        partial: false,
        columns: [{ sequence: 0, cid: 0, name: "route_id" }],
      },
    ],
  };
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

  test("accepts only the serving schema plus authorized 0033/0009 recovery states and an independent ledger", () => {
    const exactAudit = withRouteCatalog(exactMapCatalogAudit());
    const expected = buildPlan097CanonicalSchemaSnapshot(exactAudit);
    const ledgerDivergent = buildPlan097CanonicalSchemaSnapshot({
      ...exactAudit,
      migrationLedger: {
        present: true,
        rows: [{ id: 32, name: "0032_route_catalog_trip_type.sql", appliedAt: null }],
      },
    });
    expect(assertPlan097SchemaEnvelope({ actual: ledgerDivergent, expected })).toEqual({
      mapReleaseCatalog: { state: "exact", applyRecoverySql: false },
      routeCatalog: { state: "exact", applyRecoverySql: false },
    });

    const absentMap = withRouteCatalog(mapCatalogAudit());
    expect(
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(absentMap),
        expected,
      }),
    ).toEqual({
      mapReleaseCatalog: { state: "absent", applyRecoverySql: true },
      routeCatalog: { state: "exact", applyRecoverySql: false },
    });

    const legacyRouteCatalog = withRouteCatalog(exactMapCatalogAudit(), "legacy-0009");
    expect(
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(legacyRouteCatalog),
        expected,
      }),
    ).toEqual({
      mapReleaseCatalog: { state: "exact", applyRecoverySql: false },
      routeCatalog: { state: "legacy-0009", applyRecoverySql: true },
    });

    const unexpected = withRouteCatalog(exactMapCatalogAudit());
    unexpected.sqliteMaster.push({
      type: "table",
      name: "source_month_coverage",
      tableName: "source_month_coverage",
      sql: "CREATE TABLE source_month_coverage (source_id TEXT)",
    });
    unexpected.tables.push({
      tableName: "source_month_coverage",
      columns: [
        {
          cid: 0,
          name: "source_id",
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

    const unrelated = withRouteCatalog(exactMapCatalogAudit());
    unrelated.sqliteMaster.push({
      type: "table",
      name: "identity",
      tableName: "identity",
      sql: "CREATE TABLE identity (id TEXT)",
    });
    unrelated.tables.push({
      tableName: "identity",
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
    expect(
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(unrelated),
        expected,
      }),
    ).toEqual({
      mapReleaseCatalog: { state: "exact", applyRecoverySql: false },
      routeCatalog: { state: "exact", applyRecoverySql: false },
    });

    const expectedServing = withRouteCatalog(exactMapCatalogAudit());
    const textuallyDifferentServing = structuredClone(expectedServing);
    const routeCatalogMaster = textuallyDifferentServing.sqliteMaster.find(
      (entry) => entry.name === "route_catalog",
    );
    if (routeCatalogMaster === undefined) throw new Error("Missing route_catalog fixture");
    routeCatalogMaster.sql = 'CREATE TABLE "route_catalog" ("route_id" text)';
    expect(
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(textuallyDifferentServing),
        expected: buildPlan097CanonicalSchemaSnapshot(expectedServing),
      }),
    ).toEqual({
      mapReleaseCatalog: { state: "exact", applyRecoverySql: false },
      routeCatalog: { state: "exact", applyRecoverySql: false },
    });

    const semanticallyDifferentServing = structuredClone(expectedServing);
    const routeCatalogTable = semanticallyDifferentServing.tables.find(
      (table) => table.tableName === "route_catalog",
    );
    if (routeCatalogTable === undefined) throw new Error("Missing route_catalog table fixture");
    const routeIdColumn = routeCatalogTable.columns[0];
    if (routeIdColumn === undefined) throw new Error("Missing route_catalog column fixture");
    routeIdColumn.type = "INTEGER";
    expect(() =>
      assertPlan097SchemaEnvelope({
        actual: buildPlan097CanonicalSchemaSnapshot(semanticallyDifferentServing),
        expected: buildPlan097CanonicalSchemaSnapshot(expectedServing),
      }),
    ).toThrow(/route_catalog column|schema envelope/i);
  });

  test("the idempotent 0033 recovery creates the exact table and is a no-op on retry", async () => {
    const sqlite = new Database(":memory:");
    const recoverySql = await Bun.file(
      new URL("../recovery/plan097/0033_map_release_catalog_idempotent.sql", import.meta.url),
    ).text();
    expect(recoverySql).not.toMatch(/d1_migrations|INSERT|UPDATE|DELETE/i);
    const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
    expect(
      recoverySql
        .split(";")
        .map(normalized)
        .filter((statement) => statement.length > 0),
    ).toEqual(plan097MapReleaseCatalogRecoveryStatements.map(normalized));
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
    } as const;
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
    } as const;
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
    } as const;
    expect(decodeStrict(Plan097OperationRequestSchema)(operation)).toEqual(operation);
    expect(() =>
      decodeStrict(Plan097OperationRequestSchema)({
        ...operation,
        database: "user-selected-production",
      }),
    ).toThrow();
  });

  test("requires the Studio schedule exclusion inventory to reconcile", () => {
    const evidence = {
      analysisPeriod: "2026-05",
      sourceCoverage: {
        sourceId: "bus_schedules_2026",
        datasetId: "4fnn-qsea",
        scheduleDateStart: "2026-01-01T00:00:00.000",
        scheduleDateEnd: "2026-04-11T00:00:00.000",
        rowCount: 22_703_125,
        routeCount: 375,
      },
      selectedRouteCount: 2,
      completeRouteCount: 1,
      excludedRouteCount: 1,
      missingSegmentCount: 1,
      excludedRoutes: [{ routeId: "M104", missingSegmentIds: ["M104:segment"] }],
      publicationPolicy: "omit_schedule_incomplete_studio_routes",
    } as const;
    expect(decodeStrict(Plan097StudioScheduleEvidenceSchema)(evidence)).toEqual(evidence);
    expect(() =>
      decodeStrict(Plan097StudioScheduleEvidenceSchema)({
        ...evidence,
        missingSegmentCount: 0,
      }),
    ).toThrow(/reconcile/i);
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
        activationBundleSha256: sha("9"),
        manifestKey: "operations/plan097/releases/pub_20260722T120000000Z/artifact-manifest.json",
        manifestSha256: sha("b"),
      },
      freshnessMatrix: readyFreshnessMatrix(),
      schemaSnapshot,
      schemaReconciliation: {
        expectedStructuralSha256: sha("f"),
        actualStructuralSha256: sha("f"),
        mapReleaseCatalogState: "exact",
        applyRecoverySql: false,
        routeCatalogState: "exact",
        applyRouteCatalogRecoverySql: false,
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
            cfCacheStatus: null,
            age: null,
            workerVersionId: null,
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
    } as const;
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
    } as const;
    expect(decodeStrict(Plan097PreflightReceiptSchema)(receipt)).toEqual(receipt);
  });

  test("preflight HTTP evidence fails closed when a successful endpoint can be cached", () => {
    const baseline = {
      checkedAt: "2026-07-22T12:00:00.000Z",
      activeReleaseId: "pub_20260721T120000000Z",
      endpoints: [
        {
          path: "/api/v1/status",
          status: 200,
          schemaId: "bp.api.release_status.v1",
          safeBodySha256: sha("c"),
          requestId: "request-1",
          cfRay: "ray-1",
          cacheControl: "public, max-age=60",
          cfCacheStatus: "HIT",
          age: "60",
          workerVersionId: null,
          etag: null,
        },
      ],
    };
    expect(() => decodeStrict(Plan097HttpBaselineSchema)(baseline)).toThrow(/cache bypass/i);
  });
});
