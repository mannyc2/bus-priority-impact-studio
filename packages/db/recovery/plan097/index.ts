import { createHash } from "node:crypto";
import { CanonicalPublishedAtSchema, ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { plan097RecoveryServingSchemaTables } from "./batches.js";
import { Plan097FreshnessMatrixSchema } from "./freshness.js";
import { Plan097HttpBaselineSchema } from "./operation.js";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const GitShaSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const PositiveIntegerSchema = Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0));
const D1DatabaseIdSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
);

export const plan097MapReleaseCatalogRecoveryStatements = [
  `CREATE TABLE IF NOT EXISTS \`map_release_catalog\` (
    \`release_id\` text PRIMARY KEY,
    \`published_at\` text NOT NULL,
    \`coverage_start\` text,
    \`coverage_end\` text NOT NULL,
    \`manifest_key\` text NOT NULL,
    \`manifest_sha256\` text NOT NULL,
    \`release_profile\` text NOT NULL,
    \`verification_status\` text NOT NULL,
    \`route_count\` integer NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `map_release_catalog_manifest_key_idx` ON `map_release_catalog` (`manifest_key`)",
] as const;

export const plan097RouteCatalogRecoveryStatements = [
  "ALTER TABLE `route_catalog` ADD `route_miles` real",
  "ALTER TABLE `route_catalog` ADD `terminal_a_name` text",
  "ALTER TABLE `route_catalog` ADD `terminal_b_name` text",
] as const;

export const Plan097SqliteMasterRowSchema = Schema.Struct({
  type: Schema.Literals(["table", "index", "trigger", "view"]),
  name: NonEmptyStringSchema,
  tableName: NonEmptyStringSchema,
  sql: Schema.NullOr(Schema.String),
});

export const Plan097TableColumnSchema = Schema.Struct({
  cid: NonNegativeIntegerSchema,
  name: NonEmptyStringSchema,
  type: Schema.String,
  notNull: Schema.Boolean,
  defaultValue: Schema.NullOr(Schema.String),
  primaryKey: NonNegativeIntegerSchema,
});

export const Plan097TableInfoSchema = Schema.Struct({
  tableName: NonEmptyStringSchema,
  columns: Schema.Array(Plan097TableColumnSchema),
});

export const Plan097IndexColumnSchema = Schema.Struct({
  sequence: NonNegativeIntegerSchema,
  cid: Schema.Number.check(Schema.isInt()),
  name: Schema.NullOr(Schema.String),
});

export const Plan097IndexInfoSchema = Schema.Struct({
  tableName: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  unique: Schema.Boolean,
  origin: NonEmptyStringSchema,
  partial: Schema.Boolean,
  columns: Schema.Array(Plan097IndexColumnSchema),
});

export const Plan097MigrationLedgerSchema = Schema.Struct({
  present: Schema.Boolean,
  rows: Schema.Array(
    Schema.Struct({
      id: NonNegativeIntegerSchema,
      name: NonEmptyStringSchema,
      appliedAt: Schema.NullOr(Schema.String),
    }),
  ),
});

export type Plan097SchemaAuditInput = {
  sqliteMaster: Array<typeof Plan097SqliteMasterRowSchema.Type>;
  tables: Array<{
    tableName: string;
    columns: Array<typeof Plan097TableColumnSchema.Type>;
  }>;
  indexes: Array<{
    tableName: string;
    name: string;
    unique: boolean;
    origin: string;
    partial: boolean;
    columns: Array<typeof Plan097IndexColumnSchema.Type>;
  }>;
  migrationLedger: {
    present: boolean;
    rows: Array<{ id: number; name: string; appliedAt: string | null }>;
  };
};

export const Plan097CanonicalSchemaSnapshotSchema = Schema.Struct({
  sqliteMaster: Schema.Array(Plan097SqliteMasterRowSchema),
  tables: Schema.Array(Plan097TableInfoSchema),
  indexes: Schema.Array(Plan097IndexInfoSchema),
  migrationLedger: Plan097MigrationLedgerSchema,
  sha256: Sha256Schema,
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPlan097CanonicalSchemaSnapshot(input: Plan097SchemaAuditInput) {
  const snapshot = {
    sqliteMaster: [...input.sqliteMaster].toSorted(
      (left, right) =>
        left.type.localeCompare(right.type) ||
        left.name.localeCompare(right.name) ||
        left.tableName.localeCompare(right.tableName),
    ),
    tables: input.tables
      .map((table) => ({
        ...table,
        columns: [...table.columns].toSorted((left, right) => left.cid - right.cid),
      }))
      .toSorted((left, right) => left.tableName.localeCompare(right.tableName)),
    indexes: input.indexes
      .map((index) => ({
        ...index,
        columns: [...index.columns].toSorted((left, right) => left.sequence - right.sequence),
      }))
      .toSorted(
        (left, right) =>
          left.tableName.localeCompare(right.tableName) || left.name.localeCompare(right.name),
      ),
    migrationLedger: {
      present: input.migrationLedger.present,
      rows: [...input.migrationLedger.rows].toSorted(
        (left, right) => left.id - right.id || left.name.localeCompare(right.name),
      ),
    },
  };
  return {
    ...snapshot,
    sha256: sha256Text(`${canonicalJson(snapshot)}\n`),
  };
}

const expectedMapReleaseColumns = [
  ["release_id", "TEXT", false, 1],
  ["published_at", "TEXT", true, 0],
  ["coverage_start", "TEXT", false, 0],
  ["coverage_end", "TEXT", true, 0],
  ["manifest_key", "TEXT", true, 0],
  ["manifest_sha256", "TEXT", true, 0],
  ["release_profile", "TEXT", true, 0],
  ["verification_status", "TEXT", true, 0],
  ["route_count", "INTEGER", true, 0],
] as const;

export function decidePlan097MapReleaseCatalogRecovery(input: Plan097SchemaAuditInput): {
  state: "absent" | "exact";
  applyRecoverySql: boolean;
} {
  const scopedObjects = input.sqliteMaster.filter(
    (entry) => entry.tableName === "map_release_catalog" || entry.name === "map_release_catalog",
  );
  const table = input.tables.find((entry) => entry.tableName === "map_release_catalog");
  const index = input.indexes.find(
    (entry) => entry.name === "map_release_catalog_manifest_key_idx",
  );
  if (scopedObjects.length === 0 && table === undefined && index === undefined) {
    return { state: "absent", applyRecoverySql: true };
  }
  if (table === undefined) throw new Error("Partial map_release_catalog state: table is absent");
  if (table.columns.length !== expectedMapReleaseColumns.length) {
    throw new Error("map_release_catalog column count differs from migration 0033");
  }
  for (const [position, expected] of expectedMapReleaseColumns.entries()) {
    const column = table.columns[position];
    if (
      column === undefined ||
      column.cid !== position ||
      column.name !== expected[0] ||
      column.type.toUpperCase() !== expected[1] ||
      column.notNull !== expected[2] ||
      column.defaultValue !== null ||
      column.primaryKey !== expected[3]
    ) {
      throw new Error(
        `map_release_catalog column ${String(expected[0])} differs from migration 0033`,
      );
    }
  }
  if (
    index === undefined ||
    !index.unique ||
    index.partial ||
    index.columns.length !== 1 ||
    index.columns[0]?.name !== "manifest_key"
  ) {
    throw new Error("map_release_catalog unique index differs from migration 0033");
  }
  const unexpectedScopedObject = scopedObjects.find(
    (entry) =>
      entry.name !== "map_release_catalog" &&
      entry.name !== "map_release_catalog_manifest_key_idx" &&
      !entry.name.startsWith("sqlite_autoindex_map_release_catalog_"),
  );
  if (unexpectedScopedObject !== undefined) {
    throw new Error(`Unexpected map_release_catalog schema object ${unexpectedScopedObject.name}`);
  }
  return { state: "exact", applyRecoverySql: false };
}

const expectedRouteCatalogColumns = [
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

export function decidePlan097RouteCatalogRecovery(input: Plan097SchemaAuditInput): {
  state: "legacy-0009" | "exact";
  applyRecoverySql: boolean;
} {
  const scopedObjects = input.sqliteMaster.filter(
    (entry) => entry.tableName === "route_catalog" || entry.name === "route_catalog",
  );
  const table = input.tables.find((entry) => entry.tableName === "route_catalog");
  const indexes = input.indexes.filter((entry) => entry.tableName === "route_catalog");
  if (table === undefined) throw new Error("Required route_catalog table is absent");
  const state =
    table.columns.length === expectedRouteCatalogColumns.length
      ? "exact"
      : table.columns.length === expectedRouteCatalogColumns.length - 3
        ? "legacy-0009"
        : null;
  if (state === null) {
    throw new Error("route_catalog column count is neither canonical nor legacy migration 0009");
  }
  for (const [position, expected] of expectedRouteCatalogColumns.entries()) {
    if (state === "legacy-0009" && position >= expectedRouteCatalogColumns.length - 3) break;
    const column = table.columns[position];
    if (
      column === undefined ||
      column.cid !== position ||
      column.name !== expected[0] ||
      column.type.toUpperCase() !== expected[1] ||
      column.notNull !== expected[2] ||
      column.defaultValue !== null ||
      column.primaryKey !== expected[3]
    ) {
      throw new Error(`route_catalog column ${String(expected[0])} differs from canonical schema`);
    }
  }
  if (
    indexes.length !== 1 ||
    !indexes[0]?.unique ||
    indexes[0].origin !== "pk" ||
    indexes[0].partial ||
    indexes[0].columns.length !== 1 ||
    indexes[0].columns[0]?.cid !== 0 ||
    indexes[0].columns[0]?.name !== "route_id"
  ) {
    throw new Error("route_catalog primary-key index differs from canonical schema");
  }
  const unexpectedScopedObject = scopedObjects.find(
    (entry) =>
      entry.name !== "route_catalog" && !entry.name.startsWith("sqlite_autoindex_route_catalog_"),
  );
  if (unexpectedScopedObject !== undefined) {
    throw new Error(`Unexpected route_catalog schema object ${unexpectedScopedObject.name}`);
  }
  return {
    state,
    applyRecoverySql: state === "legacy-0009",
  };
}

function schemaAuditInputFromSnapshot(
  snapshot: Plan097CanonicalSchemaSnapshot,
): Plan097SchemaAuditInput {
  return {
    sqliteMaster: snapshot.sqliteMaster.map((entry) => ({ ...entry })),
    tables: snapshot.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({ ...column })),
    })),
    indexes: snapshot.indexes.map((index) => ({
      ...index,
      columns: index.columns.map((column) => ({ ...column })),
    })),
    migrationLedger: {
      present: snapshot.migrationLedger.present,
      rows: snapshot.migrationLedger.rows.map((row) => ({ ...row })),
    },
  };
}

function verifyCanonicalSchemaSnapshot(snapshot: Plan097CanonicalSchemaSnapshot): void {
  const rebuilt = buildPlan097CanonicalSchemaSnapshot(schemaAuditInputFromSnapshot(snapshot));
  if (rebuilt.sha256 !== snapshot.sha256) {
    throw new Error("Plan 097 canonical schema snapshot hash does not match its contents");
  }
}

function normalizedSchemaEnvelope(snapshot: Plan097CanonicalSchemaSnapshot): string {
  const servingTables = new Set<string>(plan097RecoveryServingSchemaTables);
  const includedTable = (tableName: string) =>
    servingTables.has(tableName) && tableName !== "route_catalog";
  return canonicalJson({
    sqliteMaster: snapshot.sqliteMaster
      .filter((entry) => includedTable(entry.tableName) || includedTable(entry.name))
      .map(({ type, name, tableName }) => ({ type, name, tableName })),
    tables: snapshot.tables.filter((table) => includedTable(table.tableName)),
    indexes: snapshot.indexes.filter((index) => includedTable(index.tableName)),
  });
}

export function plan097StructuralSchemaTableSha256(
  snapshot: Plan097CanonicalSchemaSnapshot,
): Array<{ tableName: string; sha256: string }> {
  verifyCanonicalSchemaSnapshot(snapshot);
  return [...plan097RecoveryServingSchemaTables].toSorted().map((tableName) => {
    const normalized = canonicalJson({
      sqliteMaster: snapshot.sqliteMaster
        .filter((entry) => entry.tableName === tableName || entry.name === tableName)
        .map(({ type, name, tableName: entryTableName }) => ({
          type,
          name,
          tableName: entryTableName,
        })),
      tables: snapshot.tables.filter((table) => table.tableName === tableName),
      indexes: snapshot.indexes.filter((index) => index.tableName === tableName),
    });
    return { tableName, sha256: sha256Text(`${normalized}\n`) };
  });
}

export function plan097StructuralSchemaEnvelopeSha256(
  snapshot: Plan097CanonicalSchemaSnapshot,
): string {
  verifyCanonicalSchemaSnapshot(snapshot);
  return sha256Text(`${normalizedSchemaEnvelope(snapshot)}\n`);
}

export function assertPlan097SchemaEnvelope(input: {
  actual: Plan097CanonicalSchemaSnapshot;
  expected: Plan097CanonicalSchemaSnapshot;
}): {
  mapReleaseCatalog: ReturnType<typeof decidePlan097MapReleaseCatalogRecovery>;
  routeCatalog: ReturnType<typeof decidePlan097RouteCatalogRecovery>;
} {
  verifyCanonicalSchemaSnapshot(input.actual);
  verifyCanonicalSchemaSnapshot(input.expected);
  const expectedMap = decidePlan097MapReleaseCatalogRecovery(
    schemaAuditInputFromSnapshot(input.expected),
  );
  if (expectedMap.state !== "exact") {
    throw new Error("Plan 097 expected schema envelope must include canonical migration 0033");
  }
  const expectedRouteCatalog = decidePlan097RouteCatalogRecovery(
    schemaAuditInputFromSnapshot(input.expected),
  );
  if (expectedRouteCatalog.state !== "exact") {
    throw new Error("Plan 097 expected schema envelope must include canonical migration 0009");
  }
  const actualMap = decidePlan097MapReleaseCatalogRecovery(
    schemaAuditInputFromSnapshot(input.actual),
  );
  const actualRouteCatalog = decidePlan097RouteCatalogRecovery(
    schemaAuditInputFromSnapshot(input.actual),
  );
  if (
    plan097StructuralSchemaEnvelopeSha256(input.actual) !==
    plan097StructuralSchemaEnvelopeSha256(input.expected)
  ) {
    throw new Error("Production schema differs from the Plan 097 canonical schema envelope");
  }
  return { mapReleaseCatalog: actualMap, routeCatalog: actualRouteCatalog };
}

export function assertPlan097SafeRemoteCommand(argv: readonly string[]): void {
  const command = argv.join(" ");
  const normalized = command.toLowerCase();
  const safe0033Path = "packages/db/recovery/plan097/0033_map_release_catalog_idempotent.sql";
  const safe0033 = normalized.includes(safe0033Path);
  const ledgerMutation =
    normalized.includes("d1_migrations") && /\b(insert|update|delete)\b/u.test(normalized);
  if (ledgerMutation) throw new Error("Plan 097 forbids migration-ledger mutation");
  if (normalized.includes("schema.sql")) {
    throw new Error("Plan 097 forbids remote aggregate schema execution");
  }
  if (
    /packages\/db\/migrations\/d1\/(?:00(?:0[0-9]|[12][0-9]|3[0-4]))_[^\s]+\.sql/u.test(normalized)
  ) {
    throw new Error("Plan 097 forbids direct remote execution of canonical migrations 0000-0034");
  }
  const remoteD1Execute =
    normalized.includes("wrangler d1 execute") && normalized.includes("--remote");
  const fileFlags = argv.filter((value) => value === "--file").length;
  if (
    remoteD1Execute &&
    (!safe0033 ||
      fileFlags !== 1 ||
      normalized.includes("--command") ||
      !normalized.includes("--config"))
  ) {
    throw new Error("Plan 097 permits only the exact idempotent 0033 remote D1 execute shape");
  }
}

export {
  type Plan097RecoveryArtifactManifest,
  Plan097RecoveryArtifactManifestSchema,
} from "./artifacts.js";
export {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  Plan097ActivationBundleReceiptSchema,
  Plan097ActivationBundleSchema,
  type Plan097BatchStatement,
  Plan097BatchStatementSchema,
  type Plan097CompactedBatch,
  Plan097CompactedBatchSchema,
  type Plan097StudioScheduleEvidence,
  Plan097StudioScheduleEvidenceSchema,
  plan097RecoveryMutationTables,
  plan097RecoveryServingSchemaTables,
} from "./batches.js";
export {
  type Plan097FreshnessDataset,
  Plan097FreshnessDatasetSchema,
  type Plan097FreshnessEvidence,
  Plan097FreshnessEvidenceSchema,
  type Plan097FreshnessMatrix,
  Plan097FreshnessMatrixSchema,
  plan097FreshnessSourceIds,
} from "./freshness.js";
export {
  type Plan097CompletionReceipt,
  Plan097CompletionReceiptSchema,
  Plan097EvidenceRefSchema,
  type Plan097HttpBaseline,
  Plan097HttpBaselineSchema,
  Plan097HttpEndpointEvidenceSchema,
  type Plan097OperationMetrics,
  Plan097OperationMetricsSchema,
  type Plan097OperationRequest,
  Plan097OperationRequestSchema,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  type Plan097OperationUsage,
  Plan097OperationUsageSchema,
  Plan097ProductionHttpComparisonSchema,
  Plan097ProofHttpComparisonSchema,
  type Plan097ProofSummary,
  Plan097ProofSummarySchema,
  type Plan097WorkerReceipt,
  Plan097WorkerReceiptSchema,
} from "./operation.js";
export { buildPlan097RestoreBatchFromVerifiedSnapshot } from "./restore.js";
export {
  type Plan097ProtectedFingerprint,
  Plan097ProtectedFingerprintSchema,
  type Plan097RestoreBundle,
  Plan097RestoreBundleSchema,
  type Plan097SelectiveSnapshot,
  Plan097SelectiveSnapshotSchema,
  type Plan097ServingTableSnapshot,
  Plan097ServingTableSnapshotSchema,
} from "./snapshot.js";

const Plan097ImmutableBundleRefSchema = Schema.Struct({
  key: NonEmptyStringSchema,
  sha256: Sha256Schema,
  bytes: PositiveIntegerSchema,
});

export const Plan097PreflightReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.preflight.v1"),
  schemaVersion: Schema.Literal(1),
  outcome: Schema.Literals(["ready", "stop"]),
  preparedAt: CanonicalPublishedAtSchema,
  repoSha: GitShaSchema,
  commandVersion: NonEmptyStringSchema,
  resources: Schema.Struct({
    d1DatabaseName: NonEmptyStringSchema,
    d1DatabaseId: D1DatabaseIdSchema,
    r2Bucket: NonEmptyStringSchema,
  }),
  candidate: Schema.Struct({
    releaseId: ReleaseIdSchema,
    activationBundleSha256: Sha256Schema,
    manifestKey: Schema.String.check(
      Schema.isPattern(/^operations\/plan097\/releases\/pub_[0-9TZ]+\/artifact-manifest\.json$/u),
    ),
    manifestSha256: Sha256Schema,
  }),
  freshnessMatrix: Plan097FreshnessMatrixSchema,
  schemaSnapshot: Plan097CanonicalSchemaSnapshotSchema,
  schemaReconciliation: Schema.Struct({
    expectedStructuralSha256: Sha256Schema,
    actualStructuralSha256: Sha256Schema,
    mapReleaseCatalogState: Schema.Literals(["absent", "exact"]),
    applyRecoverySql: Schema.Boolean,
    routeCatalogState: Schema.Literals(["legacy-0009", "exact"]),
    applyRouteCatalogRecoverySql: Schema.Boolean,
  }),
  httpBaseline: Plan097HttpBaselineSchema,
  selectiveSnapshot: Plan097ImmutableBundleRefSchema,
  rollbackPackage: Plan097ImmutableBundleRefSchema,
  costPreview: Schema.Struct({
    d1Statements: NonNegativeIntegerSchema,
    d1Bytes: NonNegativeIntegerSchema,
    r2Puts: NonNegativeIntegerSchema,
    r2Bytes: NonNegativeIntegerSchema,
  }),
  signature: Schema.Struct({
    algorithm: Schema.Literal("Ed25519"),
    keyId: Schema.String.check(Schema.isPattern(/^plan097-[a-z0-9][a-z0-9._-]*$/u)),
    publicKeySpkiSha256: Sha256Schema,
    signedPayloadSha256: Sha256Schema,
    signatureBase64: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9+/]{86}==$/u)),
  }),
}).check(
  Schema.makeFilter((receipt) => {
    const { signature, ...unsigned } = receipt;
    const expected = sha256Text(`${canonicalJson(unsigned)}\n`);
    return signature.signedPayloadSha256 === expected
      ? []
      : [{ path: ["signature"], issue: "Preflight signature does not match canonical payload" }];
  }),
);

export type Plan097CanonicalSchemaSnapshot = typeof Plan097CanonicalSchemaSnapshotSchema.Type;
export type Plan097PreflightReceipt = typeof Plan097PreflightReceiptSchema.Type;

export function plan097PreflightSignedPayloadBytes(
  receipt: Omit<Plan097PreflightReceipt, "signature">,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${canonicalJson(receipt)}\n`);
}
