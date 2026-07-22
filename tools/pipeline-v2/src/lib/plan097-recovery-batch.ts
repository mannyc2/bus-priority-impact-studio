import { Database } from "bun:sqlite";
import {
  type Plan097BatchStatement,
  type Plan097CompactedBatch,
  Plan097CompactedBatchSchema,
  plan097RecoveryMutationTables,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";

const PLAN097_D1_STATEMENT_BYTE_LIMIT = 100_000;
const PLAN097_D1_PARAMETER_LIMIT = 100;
const PLAN097_D1_QUERY_LIMIT = 1_000;
const DEFAULT_JSON_PARAMETER_BYTE_LIMIT = 80_000;

const allowedMutationTables = new Set<string>(plan097RecoveryMutationTables);
const allowedRegistrationTables = new Set(["exact_route_identity_release", "map_release_catalog"]);

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
