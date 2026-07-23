import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  buildPlan097RestoreBatchFromVerifiedSnapshot,
  canonicalPlan097Json,
  type Plan097BatchStatement,
  type Plan097CompactedBatch,
  Plan097CompactedBatchSchema,
  type Plan097ProtectedFingerprint,
  type Plan097SelectiveSnapshot,
  Plan097SelectiveSnapshotSchema,
  type Plan097ServingTableSnapshot,
  plan097RecoveryMutationTables,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { type ReleaseIdentity, releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import { applyPlan097CompactedBatch } from "./plan097-recovery-batch.ts";

const protectedWholeTables = [
  "identity",
  "identity_session",
  "studio_actor_role",
  "alert",
  "saved_search",
  "public_comment",
  "route_observed_reliability_summary",
  "d1_migrations",
] as const;

const appendixReliabilityPredicate =
  "source_scope = 'reliability' AND source_id IN ('observedHeadways', 'bunching', 'waitTimeReliability')";

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error(`Unsafe SQLite identifier ${value}`);
  return `"${value}"`;
}

function tableInfo(sqlite: Database, table: string) {
  const rows = sqlite.query(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
  if (rows.length === 0) throw new Error(`Required Plan 097 table ${table} is absent`);
  return rows.toSorted((left, right) => left.cid - right.cid);
}

function scalar(value: unknown): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error(`Plan 097 snapshot cannot encode ${typeof value} SQLite values`);
}

function orderedRows(input: {
  sqlite: Database;
  table: string;
  predicate?: string | undefined;
  params?: readonly string[] | undefined;
}) {
  const info = tableInfo(input.sqlite, input.table);
  const columns = info.map((column) => column.name);
  const primaryKey = info
    .filter((column) => column.pk > 0)
    .toSorted((left, right) => left.pk - right.pk)
    .map((column) => column.name);
  const order = [...primaryKey, ...columns.filter((column) => !primaryKey.includes(column))];
  const sql = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(
    input.table,
  )}${input.predicate === undefined ? "" : ` WHERE ${input.predicate}`} ORDER BY ${order
    .map(quoteIdentifier)
    .join(", ")}`;
  const rows = input.sqlite
    .query(sql)
    .all(...(input.params ?? []))
    .map((row) => {
      const record = row as Record<string, unknown>;
      return columns.map((column) => scalar(record[column]));
    });
  return { info, columns, primaryKey, rows };
}

function tableSchemaSha256(info: ReturnType<typeof tableInfo>): string {
  return sha256Text(`${canonicalPlan097Json(info)}\n`);
}

function rowsSha256(rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return sha256Text(`${canonicalPlan097Json(rows)}\n`);
}

function deleteSelect(statement: Plan097BatchStatement): {
  predicate?: string;
  selectSql: string;
} {
  const match = statement.sql.match(
    /^delete\s+from\s+[`"]?([a-z0-9_]+)[`"]?(?:\s+where\s+([\s\S]+))?$/iu,
  );
  if (match?.[1] !== statement.table) {
    throw new Error(`Plan 097 snapshot cannot classify delete for ${statement.table}`);
  }
  const predicate = match[2]?.trim();
  return {
    ...(predicate === undefined ? {} : { predicate }),
    selectSql: `SELECT * FROM ${quoteIdentifier(statement.table)}${
      predicate === undefined ? "" : ` WHERE ${predicate}`
    }`,
  };
}

function activeElection(sqlite: Database) {
  const studio = sqlite
    .query(
      `SELECT status.generated_at
       FROM route_batch_status AS status
       WHERE status.status = 'pass'
         AND EXISTS (
           SELECT 1 FROM route_brief_summary AS brief WHERE brief.month = status.month
         )
       ORDER BY status.month DESC
       LIMIT 1`,
    )
    .get() as { generated_at: string } | null;
  const studioReleaseId =
    studio === null ? null : releaseIdFromPublishedAt(String(studio.generated_at));
  const map = sqlite
    .query(
      `SELECT release_id
       FROM map_release_catalog
       WHERE release_profile = 'full' AND verification_status = 'pass'
       ORDER BY published_at DESC, release_id DESC
       LIMIT 1`,
    )
    .get() as { release_id: string } | null;
  const exact =
    studioReleaseId === null
      ? null
      : (sqlite
          .query("SELECT release_id FROM exact_route_identity_release WHERE release_id = ? LIMIT 1")
          .get(studioReleaseId) as { release_id: string } | null);
  return {
    studioReleaseId,
    mapReleaseId: map === null ? null : String(map.release_id),
    exactRouteReleaseId: exact === null ? null : String(exact.release_id),
  };
}

function protectedFingerprints(sqlite: Database): Plan097ProtectedFingerprint[] {
  const whole = protectedWholeTables.map((table) => {
    const { rows } = orderedRows({ sqlite, table });
    return {
      scope: "whole-table" as const,
      table,
      predicate: null,
      rowCount: rows.length,
      rowsSha256: rowsSha256(rows),
    };
  });
  const reliability = orderedRows({
    sqlite,
    table: "route_month_source_status",
    predicate: appendixReliabilityPredicate,
  }).rows;
  return [
    ...whole,
    {
      scope: "appendix-reliability-status" as const,
      table: "route_month_source_status",
      predicate: appendixReliabilityPredicate,
      rowCount: reliability.length,
      rowsSha256: rowsSha256(reliability),
    },
  ];
}

export function capturePlan097SelectiveSnapshot(input: {
  sqlite: Database;
  activationBatch: Plan097CompactedBatch;
  candidate: ReleaseIdentity;
  capturedAt: string;
}): Plan097SelectiveSnapshot {
  const batch = decodeStrict(Plan097CompactedBatchSchema)(input.activationBatch);
  const deleteStatements = batch.statements.filter(
    (statement) =>
      statement.kind === "delete" &&
      (plan097RecoveryMutationTables as readonly string[]).includes(statement.table),
  );
  const uniqueTables = new Set(deleteStatements.map((statement) => statement.table));
  if (uniqueTables.size !== deleteStatements.length) {
    throw new Error("Plan 097 activation contains duplicate serving delete targets");
  }
  const tables: Plan097ServingTableSnapshot[] = deleteStatements.map((statement) => {
    const { predicate } = deleteSelect(statement);
    const ordered = orderedRows({
      sqlite: input.sqlite,
      table: statement.table,
      ...(predicate === undefined ? {} : { predicate }),
      params: statement.params,
    });
    return {
      table: statement.table,
      columns: ordered.columns,
      primaryKey: ordered.primaryKey,
      deleteStatement: { sql: statement.sql, params: statement.params },
      schemaSha256: tableSchemaSha256(ordered.info),
      rows: ordered.rows,
      rowCount: ordered.rows.length,
      rowsSha256: rowsSha256(ordered.rows),
    };
  });
  const previousElection = activeElection(input.sqlite);
  if (
    previousElection.studioReleaseId === null ||
    previousElection.studioReleaseId !== previousElection.mapReleaseId ||
    previousElection.studioReleaseId !== previousElection.exactRouteReleaseId
  ) {
    throw new Error("Plan 097 pre-cut Studio/map/exact election is missing or inconsistent");
  }
  return decodeStrict(Plan097SelectiveSnapshotSchema)({
    artifactKind: "bp.ops.plan097.selective-snapshot.v1",
    schemaVersion: 1,
    capturedAt: input.capturedAt,
    candidate: input.candidate,
    previousElection,
    tables,
    protectedFingerprints: protectedFingerprints(input.sqlite),
  });
}

export function buildPlan097SelectiveRestoreBatch(input: {
  snapshot: Plan097SelectiveSnapshot;
  snapshotSha256: string;
}): Plan097CompactedBatch {
  const snapshot = decodeStrict(Plan097SelectiveSnapshotSchema)(input.snapshot);
  const snapshotText = `${canonicalPlan097Json(snapshot)}\n`;
  if (sha256Text(snapshotText) !== input.snapshotSha256) {
    throw new Error("Plan 097 selective snapshot hash does not match its immutable receipt");
  }
  for (const table of snapshot.tables) {
    if (table.rowsSha256 !== rowsSha256(table.rows)) {
      throw new Error(`Plan 097 snapshot row receipt drift for ${table.table}`);
    }
  }
  return buildPlan097RestoreBatchFromVerifiedSnapshot(snapshot);
}

export function assertPlan097ProtectedFingerprints(input: {
  sqlite: Database;
  expected: readonly Plan097ProtectedFingerprint[];
}): void {
  const actual = protectedFingerprints(input.sqlite);
  if (canonicalPlan097Json(actual) !== canonicalPlan097Json(input.expected)) {
    throw new Error("Plan 097 protected live/current-signal fingerprints changed");
  }
}

export function provePlan097ActivationAndRestore(input: {
  sqlite: Database;
  activationBatch: Plan097CompactedBatch;
  snapshot: Plan097SelectiveSnapshot;
  snapshotSha256: string;
}): { restoreBatch: Plan097CompactedBatch; finalElection: ReturnType<typeof activeElection> } {
  applyPlan097CompactedBatch({ sqlite: input.sqlite, batch: input.activationBatch });
  assertPlan097ProtectedFingerprints({
    sqlite: input.sqlite,
    expected: input.snapshot.protectedFingerprints,
  });
  const restoreBatch = buildPlan097SelectiveRestoreBatch({
    snapshot: input.snapshot,
    snapshotSha256: input.snapshotSha256,
  });
  applyPlan097CompactedBatch({ sqlite: input.sqlite, batch: restoreBatch });
  assertPlan097ProtectedFingerprints({
    sqlite: input.sqlite,
    expected: input.snapshot.protectedFingerprints,
  });
  const finalElection = activeElection(input.sqlite);
  if (
    canonicalPlan097Json(finalElection) !== canonicalPlan097Json(input.snapshot.previousElection)
  ) {
    throw new Error("Plan 097 selective restore did not restore the pre-cut election");
  }
  return { restoreBatch, finalElection };
}
