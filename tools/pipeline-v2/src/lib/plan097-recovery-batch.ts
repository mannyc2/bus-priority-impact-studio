import { Database } from "bun:sqlite";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";

const PLAN097_D1_STATEMENT_BYTE_LIMIT = 100_000;
const PLAN097_D1_PARAMETER_LIMIT = 100;
const PLAN097_D1_QUERY_LIMIT = 1_000;
const DEFAULT_JSON_PARAMETER_BYTE_LIMIT = 80_000;

export const plan097RecoveryMutationTables = [
  "corridor",
  "corridor_artifact",
  "corridor_hotspot",
  "corridor_intervention_context",
  "corridor_month_summary",
  "corridor_route_member",
  "intervention_event",
  "route_artifact",
  "route_batch_built_route",
  "route_batch_issue",
  "route_batch_status",
  "route_brief_peak_window",
  "route_brief_slowest_window",
  "route_brief_summary",
  "route_build_plan",
  "route_catalog",
  "route_catalog_trip_type",
  "route_catalog_type",
  "route_comparison_rank",
  "route_direction",
  "route_equity_context",
  "route_intervention_comparison",
  "route_month_coverage",
  "route_month_source_status",
  "route_month_trend",
  "route_readiness",
  "route_readiness_missing_input",
  "route_reliability_baseline",
  "route_reliability_gap_window",
  "route_scorecard",
  "route_speed_history_coverage",
  "route_timeline_index",
  "source_month_coverage",
] as const;

const allowedMutationTables = new Set<string>(plan097RecoveryMutationTables);
const allowedRegistrationTables = new Set(["exact_route_identity_release", "map_release_catalog"]);

const BatchStatementSchema = Schema.Struct({
  sql: Schema.String.check(Schema.isMinLength(1)),
  params: Schema.Array(Schema.String),
  table: Schema.String.check(Schema.isMinLength(1)),
  kind: Schema.Literals(["delete", "insert", "registration", "activation"]),
  rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const Plan097BundleSourceSchema = Schema.Struct({
  kind: Schema.Literals([
    "canonical-schema",
    "recovery-seed",
    "exact-route-registration",
    "map-release-registration",
  ]),
  sha256: Sha256Schema,
  byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const Plan097CompactedBatchSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  statements: Schema.Array(BatchStatementSchema),
  metrics: Schema.Struct({
    originalStatementCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    compactedStatementCount: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
    sqlBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    parameterBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    maxParametersPerStatement: Schema.Number.check(Schema.isInt()).check(
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
});

export const Plan097ActivationBundleSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.activation-bundle.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
  sources: Schema.Array(Plan097BundleSourceSchema).check(Schema.isLengthBetween(4, 4)),
  batch: Plan097CompactedBatchSchema,
});

export const Plan097ActivationBundleReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.activation-bundle-receipt.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
  bundle: Schema.Struct({
    key: Schema.String.check(
      Schema.isPattern(
        /^operations\/plan097\/bundles\/pub_[0-9TZ]+\/activation\.[a-f0-9]{64}\.json$/u,
      ),
    ),
    sha256: Sha256Schema,
    byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  }),
  metrics: Plan097CompactedBatchSchema.fields.metrics,
});

export type Plan097BatchStatement = typeof BatchStatementSchema.Type;
export type Plan097CompactedBatch = typeof Plan097CompactedBatchSchema.Type;
export type Plan097ActivationBundle = typeof Plan097ActivationBundleSchema.Type;
export type Plan097ActivationBundleReceipt = typeof Plan097ActivationBundleReceiptSchema.Type;

export function canonicalPlan097Json(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPlan097Json).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalPlan097Json(entry)}`)
    .join(",")}}`;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe SQLite identifier ${value}`);
  }
  return `"${value}"`;
}

function statementBytes(sql: string): number {
  return new TextEncoder().encode(sql).byteLength;
}

function originalStatementCount(sql: string): number {
  return sql.match(/;\s*(?:\n|$)/gu)?.length ?? 0;
}

function deleteStatements(seedSql: string): Plan097BatchStatement[] {
  const firstInsert = seedSql.search(/\binsert\s+into\b/iu);
  const prefix = firstInsert === -1 ? seedSql : seedSql.slice(0, firstInsert);
  return prefix
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((sql) => {
      const table = sql.match(/^delete\s+from\s+"([a-z0-9_]+)"/iu)?.[1];
      if (table === undefined || !allowedMutationTables.has(table)) {
        throw new Error(`Unclassified Plan 097 delete statement: ${sql}`);
      }
      return { sql, params: [], table, kind: "delete" as const, rowCount: 0 };
    });
}

function insertionOrder(seedSql: string): string[] {
  const tables: string[] = [];
  for (const match of seedSql.matchAll(/\binsert\s+into\s+"([a-z0-9_]+)"/giu)) {
    const table = match[1];
    if (table === undefined || !allowedMutationTables.has(table)) {
      throw new Error(`Unclassified Plan 097 insert table ${String(table)}`);
    }
    if (!tables.includes(table)) tables.push(table);
  }
  return tables.filter((table) => table !== "route_batch_status");
}

function chunkRows(rows: Array<Record<string, unknown>>, maximumBytes: number) {
  const chunks: Array<{ json: string; rows: number }> = [];
  let current: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const candidate = [...current, row];
    const json = JSON.stringify(candidate);
    if (new TextEncoder().encode(json).byteLength > maximumBytes && current.length > 0) {
      chunks.push({ json: JSON.stringify(current), rows: current.length });
      current = [row];
    } else {
      current = candidate;
    }
    if (new TextEncoder().encode(JSON.stringify(current)).byteLength > maximumBytes) {
      throw new Error("A single compacted D1 row exceeds the JSON parameter byte limit");
    }
  }
  if (current.length > 0) chunks.push({ json: JSON.stringify(current), rows: current.length });
  return chunks;
}

function tableInsertStatements(input: {
  sqlite: Database;
  table: string;
  kind: "insert" | "activation";
  maximumParameterBytes: number;
}): Plan097BatchStatement[] {
  const table = quoteIdentifier(input.table);
  const columns = input.sqlite
    .query(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String((row as { name: unknown }).name));
  if (columns.length === 0) throw new Error(`Plan 097 table ${input.table} has no columns`);
  const rows = input.sqlite.query(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];
  const columnSql = columns.map(quoteIdentifier).join(", ");
  const projectionSql = columns.map((column) => `json_extract(value, '$.${column}')`).join(", ");
  const sql = `INSERT INTO ${table} (${columnSql}) SELECT ${projectionSql} FROM json_each(?)`;
  return chunkRows(rows, input.maximumParameterBytes).map((chunk) => ({
    sql,
    params: [chunk.json],
    table: input.table,
    kind: input.kind,
    rowCount: chunk.rows,
  }));
}

export function buildPlan097CompactedBatch(input: {
  schemaSql: string;
  recoverySeedSql: string;
  registrations?: readonly Plan097BatchStatement[] | undefined;
  maximumParameterBytes?: number | undefined;
}): Plan097CompactedBatch {
  const sqlite = new Database(":memory:");
  try {
    sqlite.exec(input.schemaSql);
    sqlite.exec(input.recoverySeedSql);
    const maximumParameterBytes = input.maximumParameterBytes ?? DEFAULT_JSON_PARAMETER_BYTE_LIMIT;
    const deletes = deleteStatements(input.recoverySeedSql);
    const inserts = insertionOrder(input.recoverySeedSql).flatMap((table) =>
      tableInsertStatements({ sqlite, table, kind: "insert", maximumParameterBytes }),
    );
    const registrations = [...(input.registrations ?? [])];
    for (const registration of registrations) {
      const target = registration.sql.match(/\binsert\s+into\s+[`"]?([a-z0-9_]+)/iu)?.[1];
      if (
        registration.kind !== "registration" ||
        !allowedRegistrationTables.has(registration.table) ||
        target !== registration.table
      ) {
        throw new Error(`Unclassified Plan 097 registration target ${registration.table}`);
      }
    }
    const activation = tableInsertStatements({
      sqlite,
      table: "route_batch_status",
      kind: "activation",
      maximumParameterBytes,
    });
    const statements = [...deletes, ...inserts, ...registrations, ...activation];
    for (const statement of statements) {
      if (statementBytes(statement.sql) > PLAN097_D1_STATEMENT_BYTE_LIMIT) {
        throw new Error(`Plan 097 statement for ${statement.table} exceeds 100 KB`);
      }
      if (statement.params.length > PLAN097_D1_PARAMETER_LIMIT) {
        throw new Error(`Plan 097 statement for ${statement.table} exceeds 100 parameters`);
      }
    }
    if (statements.length > PLAN097_D1_QUERY_LIMIT) {
      throw new Error("Plan 097 compacted batch exceeds the D1 query-per-invocation limit");
    }
    const batch = decodeStrict(Plan097CompactedBatchSchema)({
      schemaVersion: 1,
      statements,
      metrics: {
        originalStatementCount: originalStatementCount(input.recoverySeedSql),
        compactedStatementCount: statements.length,
        sqlBytes: statements.reduce((sum, statement) => sum + statementBytes(statement.sql), 0),
        parameterBytes: statements.reduce(
          (sum, statement) =>
            sum + statement.params.reduce((paramSum, param) => paramSum + statementBytes(param), 0),
          0,
        ),
        rowCount: statements.reduce((sum, statement) => sum + statement.rowCount, 0),
        maxParametersPerStatement: Math.max(
          0,
          ...statements.map((statement) => statement.params.length),
        ),
      },
    });
    applyPlan097CompactedBatch({ sqlite, batch });
    return batch;
  } finally {
    sqlite.close();
  }
}

export function applyPlan097CompactedBatch(input: {
  sqlite: Database;
  batch: Plan097CompactedBatch;
  failBeforeStatement?: number | undefined;
}): void {
  const batch = decodeStrict(Plan097CompactedBatchSchema)(input.batch);
  input.sqlite.exec("BEGIN IMMEDIATE");
  try {
    batch.statements.forEach((statement, index) => {
      if (input.failBeforeStatement === index) {
        throw new Error(`Injected Plan 097 failure before statement ${index}`);
      }
      input.sqlite.query(statement.sql).run(...statement.params);
    });
    input.sqlite.exec("COMMIT");
  } catch (error) {
    input.sqlite.exec("ROLLBACK");
    throw error;
  }
}
