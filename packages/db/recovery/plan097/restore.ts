import { decodeStrict } from "@bp/domain/decode";
import {
  type Plan097BatchStatement,
  type Plan097CompactedBatch,
  Plan097CompactedBatchSchema,
} from "./batches.js";
import {
  type Plan097SelectiveSnapshot,
  Plan097SelectiveSnapshotSchema,
  type Plan097ServingTableSnapshot,
} from "./snapshot.js";

const textEncoder = new TextEncoder();
const maximumJsonParameterBytes = 80_000;

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe Plan 097 SQLite identifier ${value}`);
  }
  return `"${value}"`;
}

function chunkRows(rows: Plan097ServingTableSnapshot["rows"]) {
  const chunks: Array<{ json: string; rowCount: number }> = [];
  let current: Plan097ServingTableSnapshot["rows"] = [];
  for (const row of rows) {
    const candidate = [...current, row];
    const json = JSON.stringify(candidate);
    if (textEncoder.encode(json).byteLength > maximumJsonParameterBytes && current.length > 0) {
      chunks.push({ json: JSON.stringify(current), rowCount: current.length });
      current = [row];
    } else {
      current = candidate;
    }
    if (textEncoder.encode(JSON.stringify(current)).byteLength > maximumJsonParameterBytes) {
      throw new Error("A single Plan 097 restore row exceeds the JSON parameter limit");
    }
  }
  if (current.length > 0) chunks.push({ json: JSON.stringify(current), rowCount: current.length });
  return chunks;
}

function restoreInserts(snapshot: Plan097ServingTableSnapshot): Plan097BatchStatement[] {
  if (snapshot.rowCount !== snapshot.rows.length) {
    throw new Error(`Plan 097 snapshot row count drift for ${snapshot.table}`);
  }
  const table = quoteIdentifier(snapshot.table);
  const columns = snapshot.columns.map(quoteIdentifier).join(", ");
  const projection = snapshot.columns
    .map((_, index) => `json_extract(value, '$[${index}]')`)
    .join(", ");
  const sql = `INSERT INTO ${table} (${columns}) SELECT ${projection} FROM json_each(?)`;
  return chunkRows(snapshot.rows).map((chunk) => ({
    sql,
    params: [chunk.json],
    table: snapshot.table,
    kind: snapshot.table === "route_batch_status" ? "activation" : "insert",
    rowCount: chunk.rowCount,
  }));
}

function metrics(
  statements: Plan097BatchStatement[],
  originalStatementCount: number,
): Plan097CompactedBatch["metrics"] {
  return {
    originalStatementCount,
    compactedStatementCount: statements.length,
    sqlBytes: statements.reduce(
      (sum, statement) => sum + textEncoder.encode(statement.sql).byteLength,
      0,
    ),
    parameterBytes: statements.reduce(
      (sum, statement) =>
        sum +
        statement.params.reduce(
          (parameterSum, parameter) => parameterSum + textEncoder.encode(parameter).byteLength,
          0,
        ),
      0,
    ),
    rowCount: statements.reduce((sum, statement) => sum + statement.rowCount, 0),
    maxParametersPerStatement: Math.max(
      0,
      ...statements.map((statement) => statement.params.length),
    ),
  };
}

export function buildPlan097RestoreBatchFromVerifiedSnapshot(
  input: Plan097SelectiveSnapshot,
): Plan097CompactedBatch {
  const snapshot = decodeStrict(Plan097SelectiveSnapshotSchema)(input);
  const registrationDeletes: Plan097BatchStatement[] = [
    {
      sql: 'DELETE FROM "map_release_catalog" WHERE "release_id" = ?',
      params: [snapshot.candidate.releaseId],
      table: "map_release_catalog",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: 'DELETE FROM "exact_route_identity_release" WHERE "release_id" = ?',
      params: [snapshot.candidate.releaseId],
      table: "exact_route_identity_release",
      kind: "delete",
      rowCount: 0,
    },
  ];
  const status = snapshot.tables.find((table) => table.table === "route_batch_status");
  if (status === undefined) {
    throw new Error("Plan 097 selective snapshot is missing route_batch_status activation state");
  }
  const nonStatus = snapshot.tables.filter((table) => table.table !== "route_batch_status");
  const servingDeletes: Plan097BatchStatement[] = nonStatus.map((table) => ({
    ...table.deleteStatement,
    table: table.table,
    kind: "delete",
    rowCount: 0,
  }));
  const inserts = nonStatus.toReversed().flatMap(restoreInserts);
  const activation: Plan097BatchStatement[] = [
    {
      ...status.deleteStatement,
      table: status.table,
      kind: "activation",
      rowCount: 0,
    },
    ...restoreInserts(status),
  ];
  const statements = [...registrationDeletes, ...servingDeletes, ...inserts, ...activation];
  return decodeStrict(Plan097CompactedBatchSchema)({
    schemaVersion: 1,
    statements,
    metrics: metrics(
      statements,
      registrationDeletes.length +
        snapshot.tables.length +
        snapshot.tables.reduce((sum, table) => sum + table.rowCount, 0),
    ),
  });
}
