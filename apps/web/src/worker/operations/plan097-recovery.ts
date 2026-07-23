import {
  buildPlan097CanonicalSchemaSnapshot,
  buildPlan097RestoreBatchFromVerifiedSnapshot,
  canonicalPlan097Json,
  decidePlan097MapReleaseCatalogRecovery,
  type Plan097ActivationBundle,
  Plan097ActivationBundleSchema,
  type Plan097CompactedBatch,
  type Plan097OperationRequest,
  Plan097OperationRequestSchema,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  type Plan097PreflightReceipt,
  Plan097PreflightReceiptSchema,
  type Plan097ProtectedFingerprint,
  Plan097RecoveryArtifactManifestSchema,
  Plan097RestoreBundleSchema,
  type Plan097SchemaAuditInput,
  type Plan097SelectiveSnapshot,
  Plan097SelectiveSnapshotSchema,
  plan097PreflightSignedPayloadBytes,
  plan097RecoveryMutationTables,
  plan097StructuralSchemaEnvelopeSha256,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { releaseIdFromPublishedAt } from "@bp/domain/studio/shared";
import type { Env } from "../env.js";

export const PLAN097_OPERATION_PATH = "/__operations/plan097";

const textEncoder = new TextEncoder();

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Bytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function signPlan097PreflightReceipt(
  env: Env,
  unsignedReceipt: Omit<Plan097PreflightReceipt, "signature">,
) {
  const keyId = env.PLAN097_PREFLIGHT_SIGNING_KEY_ID;
  const privateKeyBase64 = env.PLAN097_PREFLIGHT_SIGNING_PRIVATE_KEY_PKCS8_BASE64;
  const publicKeyBase64 = env.PLAN097_PREFLIGHT_SIGNING_PUBLIC_KEY_SPKI_BASE64;
  if (keyId === undefined || privateKeyBase64 === undefined || publicKeyBase64 === undefined) {
    throw new Error("Plan 097 preflight signing configuration is incomplete");
  }
  const payload = plan097PreflightSignedPayloadBytes(unsignedReceipt);
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey(
      "pkcs8",
      decodeBase64Bytes(privateKeyBase64),
      { name: "Ed25519" },
      false,
      ["sign"],
    ),
    crypto.subtle.importKey(
      "spki",
      decodeBase64Bytes(publicKeyBase64),
      { name: "Ed25519" },
      false,
      ["verify"],
    ),
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, payload));
  if (!(await crypto.subtle.verify("Ed25519", publicKey, signature, payload))) {
    throw new Error("Plan 097 preflight signing key pair does not match");
  }
  return {
    algorithm: "Ed25519" as const,
    keyId,
    publicKeySpkiSha256: await sha256(decodeBase64Bytes(publicKeyBase64)),
    signedPayloadSha256: await sha256(payload),
    signatureBase64: encodeBase64Bytes(signature),
  };
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new Error(`Unsafe Plan 097 SQLite identifier ${value}`);
  }
  return `"${value}"`;
}

async function d1All<Row extends Record<string, unknown> = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: readonly string[] = [],
): Promise<Row[]> {
  const prepared = db.prepare(sql);
  const result = await (params.length === 0 ? prepared : prepared.bind(...params)).all();
  return result.results as Row[];
}

async function d1First<Row extends Record<string, unknown> = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: readonly string[] = [],
): Promise<Row | null> {
  return (await d1All<Row>(db, sql, params))[0] ?? null;
}

async function d1TableInfo(db: D1Database, tableName: string) {
  const rows = await d1All<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>(db, `PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (rows.length === 0) throw new Error(`Required Plan 097 table ${tableName} is absent`);
  return rows.map((column) => ({
    cid: Number(column.cid),
    name: String(column.name),
    type: String(column.type),
    notNull: Boolean(column.notnull),
    defaultValue: column.dflt_value === null ? null : String(column.dflt_value),
    primaryKey: Number(column.pk),
  }));
}

export async function capturePlan097D1CanonicalSchema(db: D1Database) {
  const rawMaster = await d1All<{
    type: string;
    name: string;
    tableName: string;
    sql: string | null;
  }>(
    db,
    `SELECT type, name, tbl_name AS tableName, sql
     FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
     ORDER BY type, name, tbl_name`,
  );
  const sqliteMaster: Plan097SchemaAuditInput["sqliteMaster"] = rawMaster.map((row) => {
    const type = String(row.type);
    if (!(["table", "index", "trigger", "view"] as const).includes(type as never)) {
      throw new Error(`Unexpected Plan 097 sqlite_master type ${type}`);
    }
    return {
      type: type as "table" | "index" | "trigger" | "view",
      name: String(row.name),
      tableName: String(row.tableName),
      sql: row.sql === null ? null : String(row.sql),
    };
  });
  const tableNames = sqliteMaster
    .filter((row) => row.type === "table")
    .map((row) => row.name)
    .toSorted();
  const tables: Plan097SchemaAuditInput["tables"] = [];
  const indexes: Plan097SchemaAuditInput["indexes"] = [];
  for (const tableName of tableNames) {
    tables.push({ tableName, columns: await d1TableInfo(db, tableName) });
    const tableIndexes = await d1All<{
      name: string;
      unique: number;
      origin: string;
      partial: number;
    }>(db, `PRAGMA index_list(${quoteIdentifier(tableName)})`);
    for (const index of tableIndexes) {
      const name = String(index.name);
      indexes.push({
        tableName,
        name,
        unique: Boolean(index.unique),
        origin: String(index.origin),
        partial: Boolean(index.partial),
        columns: (
          await d1All<{ seqno: number; cid: number; name: string | null }>(
            db,
            `PRAGMA index_info(${quoteIdentifier(name)})`,
          )
        ).map((column) => ({
          sequence: Number(column.seqno),
          cid: Number(column.cid),
          name: column.name === null ? null : String(column.name),
        })),
      });
    }
  }
  const migrationLedger = tableNames.includes("d1_migrations")
    ? {
        present: true,
        rows: (
          await d1All<{ id: number; name: string; appliedAt: string | null }>(
            db,
            "SELECT id, name, applied_at AS appliedAt FROM d1_migrations ORDER BY id, name",
          )
        ).map((row) => ({
          id: Number(row.id),
          name: String(row.name),
          appliedAt: row.appliedAt === null ? null : String(row.appliedAt),
        })),
      }
    : { present: false, rows: [] };
  return buildPlan097CanonicalSchemaSnapshot({
    sqliteMaster,
    tables,
    indexes,
    migrationLedger,
  });
}

function objectSha256(object: R2Object): string | undefined {
  return (object.customMetadata as { sha256?: string } | undefined)?.sha256;
}

async function secretMatches(
  actual: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (actual === null || expected === undefined || expected.length === 0) return false;
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(actual)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualHash);
  const right = new Uint8Array(expectedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function authenticated(request: Request, env: Env): Promise<boolean> {
  const [idMatches, secretMatchesResult] = await Promise.all([
    secretMatches(request.headers.get("CF-Access-Client-Id"), env.PLAN097_SERVICE_TOKEN_ID),
    secretMatches(request.headers.get("CF-Access-Client-Secret"), env.PLAN097_SERVICE_TOKEN_SECRET),
  ]);
  return idMatches && secretMatchesResult;
}

function releaseIdFromOperationId(operationId: string): string {
  return operationId.slice("plan097:".length);
}

function activationBundleKey(releaseId: string, sha: string): string {
  return `operations/plan097/bundles/${releaseId}/activation.${sha}.json`;
}

function restoreBundleKey(releaseId: string, sha: string): string {
  return `operations/plan097/bundles/${releaseId}/restore.${sha}.json`;
}

async function readVerifiedObject(input: {
  bucket: R2Bucket;
  key: string;
  expectedSha256: string;
  expectedBytes?: number | undefined;
}): Promise<Uint8Array> {
  const object = await input.bucket.get(input.key);
  if (object === null) throw new Error(`Required Plan 097 object ${input.key} is missing`);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (input.expectedBytes !== undefined && bytes.byteLength !== input.expectedBytes) {
    throw new Error(`Plan 097 object ${input.key} has an unexpected length`);
  }
  if ((await sha256(bytes)) !== input.expectedSha256) {
    throw new Error(`Plan 097 object ${input.key} has an unexpected SHA-256`);
  }
  return bytes;
}

async function loadActivationBundle(input: {
  env: Env & { PLAN097_OPERATIONS: R2Bucket };
  request: Plan097OperationRequest;
}): Promise<Plan097ActivationBundle> {
  const releaseId = releaseIdFromOperationId(input.request.operationId);
  const key = activationBundleKey(releaseId, input.request.activationBundleSha256);
  const bytes = await readVerifiedObject({
    bucket: input.env.PLAN097_OPERATIONS,
    key,
    expectedSha256: input.request.activationBundleSha256,
  });
  const bundle = decodeStrict(Plan097ActivationBundleSchema)(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (
    bundle.operationId !== input.request.operationId ||
    bundle.candidate.releaseId !== releaseId
  ) {
    throw new Error("Plan 097 activation bundle identity does not match the operation");
  }
  return bundle;
}

async function mirrorOperationBundle(input: {
  env: Env & { PLAN097_OPERATIONS: R2Bucket; PLAN097_PROOF_BUNDLES: R2Bucket };
  request: Extract<Plan097OperationRequest, { action: "mirror-bundle" }>;
}): Promise<{ releaseId: string; objectCount: number }> {
  const releaseId = releaseIdFromOperationId(input.request.operationId);
  const activationKey = activationBundleKey(releaseId, input.request.activationBundleSha256);
  const activationBytes = await readVerifiedObject({
    bucket: input.env.PLAN097_PROOF_BUNDLES,
    key: activationKey,
    expectedSha256: input.request.activationBundleSha256,
  });
  const bundle = decodeStrict(Plan097ActivationBundleSchema)(
    JSON.parse(new TextDecoder().decode(activationBytes)),
  );
  if (
    bundle.operationId !== input.request.operationId ||
    bundle.candidate.releaseId !== releaseId
  ) {
    throw new Error("Plan 097 proof activation bundle identity does not match the operation");
  }
  await putIdentical({
    bucket: input.env.PLAN097_OPERATIONS,
    key: activationKey,
    body: activationBytes,
    sha256: input.request.activationBundleSha256,
    mediaType: "application/json",
  });
  const manifestBytes = await readVerifiedObject({
    bucket: input.env.PLAN097_PROOF_BUNDLES,
    key: bundle.artifactManifest.key,
    expectedSha256: bundle.artifactManifest.sha256,
    expectedBytes: bundle.artifactManifest.byteLength,
  });
  decodeStrict(Plan097RecoveryArtifactManifestSchema)(
    JSON.parse(new TextDecoder().decode(manifestBytes)),
  );
  await putIdentical({
    bucket: input.env.PLAN097_OPERATIONS,
    key: bundle.artifactManifest.key,
    body: manifestBytes,
    sha256: bundle.artifactManifest.sha256,
    mediaType: "application/json",
  });
  let objectCount = 2;
  if (input.env.PLAN097_RESTORE_BUNDLE_SHA256 !== undefined) {
    const restoreKey = restoreBundleKey(releaseId, input.env.PLAN097_RESTORE_BUNDLE_SHA256);
    const restoreBytes = await readVerifiedObject({
      bucket: input.env.PLAN097_PROOF_BUNDLES,
      key: restoreKey,
      expectedSha256: input.env.PLAN097_RESTORE_BUNDLE_SHA256,
    });
    decodeStrict(Plan097RestoreBundleSchema)(JSON.parse(new TextDecoder().decode(restoreBytes)));
    await putIdentical({
      bucket: input.env.PLAN097_OPERATIONS,
      key: restoreKey,
      body: restoreBytes,
      sha256: input.env.PLAN097_RESTORE_BUNDLE_SHA256,
      mediaType: "application/json",
    });
    objectCount += 1;
  }
  return { releaseId, objectCount };
}

async function loadArtifactManifest(input: {
  env: Env & { PLAN097_OPERATIONS: R2Bucket };
  bundle: Plan097ActivationBundle;
}) {
  const bytes = await readVerifiedObject({
    bucket: input.env.PLAN097_OPERATIONS,
    key: input.bundle.artifactManifest.key,
    expectedSha256: input.bundle.artifactManifest.sha256,
    expectedBytes: input.bundle.artifactManifest.byteLength,
  });
  const manifest = decodeStrict(Plan097RecoveryArtifactManifestSchema)(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (
    manifest.releaseId !== input.bundle.candidate.releaseId ||
    manifest.entries.length !== input.bundle.artifactManifest.entryCount
  ) {
    throw new Error("Plan 097 artifact manifest does not match the activation bundle");
  }
  return { manifest, bytes };
}

async function putIdentical(input: {
  bucket: R2Bucket;
  key: string;
  body: Uint8Array;
  sha256: string;
  mediaType: string;
}): Promise<"created" | "identical"> {
  const existing = await input.bucket.get(input.key);
  if (existing !== null) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    const headers = new Headers();
    existing.writeHttpMetadata(headers);
    if (
      existingBytes.byteLength !== input.body.byteLength ||
      (await sha256(existingBytes)) !== input.sha256 ||
      objectSha256(existing) !== input.sha256 ||
      headers.get("Content-Type") !== input.mediaType
    ) {
      throw new Error(`Plan 097 refuses to overwrite non-identical object ${input.key}`);
    }
    return "identical";
  }
  await input.bucket.put(input.key, input.body, {
    httpMetadata: { contentType: input.mediaType },
    customMetadata: { sha256: input.sha256 },
  });
  const verified = await input.bucket.get(input.key);
  if (verified === null) throw new Error(`Plan 097 object ${input.key} disappeared after PUT`);
  const verifiedBytes = new Uint8Array(await verified.arrayBuffer());
  if (
    verifiedBytes.byteLength !== input.body.byteLength ||
    (await sha256(verifiedBytes)) !== input.sha256 ||
    objectSha256(verified) !== input.sha256
  ) {
    throw new Error(`Plan 097 object ${input.key} failed post-PUT verification`);
  }
  return "created";
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Plan 097 staged body is not valid base64");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyStagedEntry(
  bucket: R2Bucket,
  entry: {
    key: string;
    sha256: string;
    bytes: number;
    mediaType: string;
  },
): Promise<void> {
  const object = await bucket.get(entry.key);
  if (object === null) throw new Error(`Plan 097 staged object ${entry.key} is missing`);
  const body = new Uint8Array(await object.arrayBuffer());
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (
    body.byteLength !== entry.bytes ||
    (await sha256(body)) !== entry.sha256 ||
    objectSha256(object) !== entry.sha256 ||
    headers.get("Content-Type") !== entry.mediaType
  ) {
    throw new Error(`Plan 097 staged object ${entry.key} failed verification`);
  }
}

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

function sqliteScalar(value: unknown): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error(`Plan 097 snapshot cannot encode ${typeof value} SQLite values`);
}

async function orderedD1Rows(input: {
  db: D1Database;
  table: string;
  predicate?: string | undefined;
  params?: readonly string[] | undefined;
}) {
  const info = await d1TableInfo(input.db, input.table);
  const columns = info.map((column) => column.name);
  const primaryKey = info
    .filter((column) => column.primaryKey > 0)
    .toSorted((left, right) => left.primaryKey - right.primaryKey)
    .map((column) => column.name);
  const order = [...primaryKey, ...columns.filter((column) => !primaryKey.includes(column))];
  const sql = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(
    input.table,
  )}${input.predicate === undefined ? "" : ` WHERE ${input.predicate}`} ORDER BY ${order
    .map(quoteIdentifier)
    .join(", ")}`;
  const rows = (await d1All(input.db, sql, input.params)).map((row) =>
    columns.map((column) => sqliteScalar(row[column])),
  );
  return { info, columns, primaryKey, rows };
}

async function canonicalValueSha256(value: unknown): Promise<string> {
  return sha256(textEncoder.encode(`${canonicalPlan097Json(value)}\n`));
}

function deletePredicate(statement: Plan097CompactedBatch["statements"][number]) {
  const match = statement.sql.match(
    /^delete\s+from\s+[`"]?([a-z0-9_]+)[`"]?(?:\s+where\s+([\s\S]+))?$/iu,
  );
  if (match?.[1] !== statement.table) {
    throw new Error(`Plan 097 snapshot cannot classify delete for ${statement.table}`);
  }
  return match[2]?.trim();
}

async function activeD1Election(db: D1Database) {
  const studio = await d1First<{ generatedAt: string }>(
    db,
    `SELECT status.generated_at AS generatedAt
     FROM route_batch_status AS status
     WHERE status.status = 'pass'
       AND EXISTS (
         SELECT 1 FROM route_brief_summary AS brief WHERE brief.month = status.month
       )
     ORDER BY status.month DESC
     LIMIT 1`,
  );
  const studioReleaseId =
    studio === null ? null : releaseIdFromPublishedAt(String(studio.generatedAt));
  const map = await d1First<{ releaseId: string }>(
    db,
    `SELECT release_id AS releaseId
     FROM map_release_catalog
     WHERE release_profile = 'full' AND verification_status = 'pass'
     ORDER BY published_at DESC, release_id DESC
     LIMIT 1`,
  );
  const exact =
    studioReleaseId === null
      ? null
      : await d1First<{ releaseId: string }>(
          db,
          "SELECT release_id AS releaseId FROM exact_route_identity_release WHERE release_id = ? LIMIT 1",
          [studioReleaseId],
        );
  return {
    studioReleaseId,
    mapReleaseId: map === null ? null : String(map.releaseId),
    exactRouteReleaseId: exact === null ? null : String(exact.releaseId),
  };
}

async function protectedD1Fingerprints(db: D1Database): Promise<Plan097ProtectedFingerprint[]> {
  const whole: Plan097ProtectedFingerprint[] = [];
  for (const table of protectedWholeTables) {
    const rows = (await orderedD1Rows({ db, table })).rows;
    whole.push({
      scope: "whole-table",
      table,
      predicate: null,
      rowCount: rows.length,
      rowsSha256: await canonicalValueSha256(rows),
    });
  }
  const reliability = (
    await orderedD1Rows({
      db,
      table: "route_month_source_status",
      predicate: appendixReliabilityPredicate,
    })
  ).rows;
  return [
    ...whole,
    {
      scope: "appendix-reliability-status",
      table: "route_month_source_status",
      predicate: appendixReliabilityPredicate,
      rowCount: reliability.length,
      rowsSha256: await canonicalValueSha256(reliability),
    },
  ];
}

async function captureSelectiveSnapshot(input: {
  db: D1Database;
  bundle: Plan097ActivationBundle;
  capturedAt: string;
}): Promise<Plan097SelectiveSnapshot> {
  const deletes = input.bundle.batch.statements.filter(
    (statement) =>
      statement.kind === "delete" &&
      (plan097RecoveryMutationTables as readonly string[]).includes(statement.table),
  );
  if (new Set(deletes.map((statement) => statement.table)).size !== deletes.length) {
    throw new Error("Plan 097 activation contains duplicate serving delete targets");
  }
  const tables: Array<Plan097SelectiveSnapshot["tables"][number]> = [];
  for (const statement of deletes) {
    const predicate = deletePredicate(statement);
    const ordered = await orderedD1Rows({
      db: input.db,
      table: statement.table,
      ...(predicate === undefined ? {} : { predicate }),
      params: statement.params,
    });
    tables.push({
      table: statement.table,
      columns: ordered.columns,
      primaryKey: ordered.primaryKey,
      deleteStatement: { sql: statement.sql, params: statement.params },
      schemaSha256: await canonicalValueSha256(ordered.info),
      rows: ordered.rows,
      rowCount: ordered.rows.length,
      rowsSha256: await canonicalValueSha256(ordered.rows),
    });
  }
  const previousElection = await activeD1Election(input.db);
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
    candidate: input.bundle.candidate,
    previousElection,
    tables,
    protectedFingerprints: await protectedD1Fingerprints(input.db),
  });
}

type EvidenceRef = NonNullable<Plan097OperationResponse["evidence"]>[number];

async function putCanonicalEvidence(input: {
  bucket: R2Bucket;
  keyForSha: (sha256: string) => string;
  value: unknown;
  kind: EvidenceRef["kind"];
}): Promise<EvidenceRef> {
  const bytes = textEncoder.encode(`${canonicalPlan097Json(input.value)}\n`);
  const digest = await sha256(bytes);
  const key = input.keyForSha(digest);
  await putIdentical({
    bucket: input.bucket,
    key,
    body: bytes,
    sha256: digest,
    mediaType: "application/json",
  });
  return { kind: input.kind, key, sha256: digest, bytes: bytes.byteLength };
}

async function runPreflight(input: {
  env: Env & { DB: D1Database; PLAN097_OPERATIONS: R2Bucket };
  bundle: Plan097ActivationBundle;
  request: Extract<Plan097OperationRequest, { action: "preflight" }>;
  manifestEntryCount: number;
  manifestBytes: number;
  manifestBodyBytes: number;
}): Promise<{ evidence: EvidenceRef[]; statementCount: number; objectCount: number }> {
  const requireMetadata = (value: string | undefined): string => {
    if (value === undefined || value.length === 0) {
      throw new Error("Plan 097 preflight deployment metadata is incomplete");
    }
    return value;
  };
  const repoSha = requireMetadata(input.env.PLAN097_REPO_SHA);
  const commandVersion = requireMetadata(input.env.PLAN097_COMMAND_VERSION);
  const d1DatabaseName = requireMetadata(input.env.PLAN097_D1_DATABASE_NAME);
  const d1DatabaseId = requireMetadata(input.env.PLAN097_D1_DATABASE_ID);
  const r2Bucket = requireMetadata(input.env.PLAN097_ARTIFACTS_BUCKET_NAME);
  const schemaSnapshot = await capturePlan097D1CanonicalSchema(input.env.DB);
  const actualStructuralSha256 = plan097StructuralSchemaEnvelopeSha256(schemaSnapshot);
  if (actualStructuralSha256 !== input.bundle.schemaEnvelope.structuralSha256) {
    throw new Error("Production schema differs from the Plan 097 canonical schema envelope");
  }
  const mapDecision = decidePlan097MapReleaseCatalogRecovery(schemaSnapshot);
  const capturedAt = new Date().toISOString();
  const snapshot = await captureSelectiveSnapshot({
    db: input.env.DB,
    bundle: input.bundle,
    capturedAt,
  });
  if (
    snapshot.previousElection.studioReleaseId !== input.request.httpBaseline.activeReleaseId ||
    input.bundle.candidate.releaseId <= input.request.httpBaseline.activeReleaseId
  ) {
    throw new Error("Plan 097 HTTP baseline does not identify an older active D1 release");
  }
  const releaseId = input.bundle.candidate.releaseId;
  const snapshotRef = await putCanonicalEvidence({
    bucket: input.env.PLAN097_OPERATIONS,
    keyForSha: (digest) => `operations/plan097/snapshots/${releaseId}/selective.${digest}.json`,
    value: snapshot,
    kind: "selective-snapshot",
  });
  const restoreBundle = decodeStrict(Plan097RestoreBundleSchema)({
    artifactKind: "bp.ops.plan097.restore-bundle.v1",
    schemaVersion: 1,
    operationId: input.bundle.operationId,
    candidate: input.bundle.candidate,
    snapshotSha256: snapshotRef.sha256,
    expectedElection: snapshot.previousElection,
    protectedFingerprints: snapshot.protectedFingerprints,
    batch: buildPlan097RestoreBatchFromVerifiedSnapshot(snapshot),
  });
  const restoreRef = await putCanonicalEvidence({
    bucket: input.env.PLAN097_OPERATIONS,
    keyForSha: (digest) => restoreBundleKey(releaseId, digest),
    value: restoreBundle,
    kind: "restore-bundle",
  });
  const unsignedReceipt = {
    artifactKind: "bp.ops.plan097.preflight.v1",
    schemaVersion: 1,
    outcome: "ready",
    preparedAt: capturedAt,
    repoSha,
    commandVersion,
    resources: {
      d1DatabaseName,
      d1DatabaseId,
      r2Bucket,
    },
    candidate: {
      releaseId,
      manifestKey: input.bundle.artifactManifest.key,
      manifestSha256: input.bundle.artifactManifest.sha256,
    },
    schemaSnapshot,
    schemaReconciliation: {
      expectedStructuralSha256: input.bundle.schemaEnvelope.structuralSha256,
      actualStructuralSha256,
      mapReleaseCatalogState: mapDecision.state,
      applyRecoverySql: mapDecision.applyRecoverySql,
    },
    httpBaseline: input.request.httpBaseline,
    selectiveSnapshot: {
      key: snapshotRef.key,
      sha256: snapshotRef.sha256,
      bytes: snapshotRef.bytes,
    },
    rollbackPackage: {
      key: restoreRef.key,
      sha256: restoreRef.sha256,
      bytes: restoreRef.bytes,
    },
    costPreview: {
      d1Statements: input.bundle.batch.statements.length,
      d1Bytes: input.bundle.batch.metrics.sqlBytes + input.bundle.batch.metrics.parameterBytes,
      r2Puts: input.manifestEntryCount + 1,
      r2Bytes: input.manifestBodyBytes + input.manifestBytes,
    },
  } as const;
  const signature = await signPlan097PreflightReceipt(input.env, unsignedReceipt);
  const receipt = decodeStrict(Plan097PreflightReceiptSchema)({
    ...unsignedReceipt,
    signature,
  });
  const preflightRef = await putCanonicalEvidence({
    bucket: input.env.PLAN097_OPERATIONS,
    keyForSha: (digest) => `operations/plan097/preflight/${releaseId}/preflight.${digest}.json`,
    value: receipt,
    kind: "preflight",
  });
  return {
    evidence: [snapshotRef, restoreRef, preflightRef],
    statementCount: input.bundle.batch.statements.length,
    objectCount: 3,
  };
}

async function runD1Batch(input: {
  db: D1Database;
  batch: Plan097CompactedBatch;
  failBeforeStatement?: number | undefined;
}): Promise<void> {
  const statements = input.batch.statements.map((statement, index) =>
    input.db
      .prepare(
        input.failBeforeStatement === index
          ? "INSERT INTO plan097_injected_failure__missing_table VALUES (1)"
          : statement.sql,
      )
      .bind(...statement.params),
  );
  const results = await input.db.batch(statements);
  if (results.length !== statements.length || results.some((result) => !result.success)) {
    throw new Error("Plan 097 D1 batch did not report complete success");
  }
}

async function loadRestoreBatch(input: {
  env: Env & { PLAN097_OPERATIONS: R2Bucket };
  request: Extract<Plan097OperationRequest, { action: "prove" | "rollback" }>;
}) {
  const sha = input.request.restoreBundleSha256;
  if (sha === undefined) throw new Error("Plan 097 restore bundle SHA-256 is required");
  if (input.env.PLAN097_RESTORE_BUNDLE_SHA256 !== sha) {
    throw new Error("Plan 097 restore bundle is not allowlisted by the deployment");
  }
  const releaseId = releaseIdFromOperationId(input.request.operationId);
  const bytes = await readVerifiedObject({
    bucket: input.env.PLAN097_OPERATIONS,
    key: restoreBundleKey(releaseId, sha),
    expectedSha256: sha,
  });
  const bundle = decodeStrict(Plan097RestoreBundleSchema)(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (
    bundle.operationId !== input.request.operationId ||
    bundle.candidate.releaseId !== releaseId
  ) {
    throw new Error("Plan 097 restore bundle identity does not match the operation");
  }
  return bundle.batch;
}

async function writeReceipt(input: {
  env: Env & { PLAN097_OPERATIONS: R2Bucket };
  request: Plan097OperationRequest;
  releaseId: string;
  outcome: "pass" | "failed_as_expected";
  statementCount: number;
  objectCount: number;
  evidence?: EvidenceRef[] | undefined;
}): Promise<Plan097OperationResponse> {
  const receipt = {
    artifactKind: "bp.ops.plan097.worker-receipt.v1",
    schemaVersion: 1,
    operationId: input.request.operationId,
    action: input.request.action,
    outcome: input.outcome,
    releaseId: input.releaseId,
    activationBundleSha256: input.request.activationBundleSha256,
    completedAt: new Date().toISOString(),
    statementCount: input.statementCount,
    objectCount: input.objectCount,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
  };
  const receiptBytes = textEncoder.encode(`${canonicalPlan097Json(receipt)}\n`);
  const receiptSha256 = await sha256(receiptBytes);
  const receiptKey = `operations/plan097/receipts/${input.releaseId}/${input.request.action}.${receiptSha256}.json`;
  await putIdentical({
    bucket: input.env.PLAN097_OPERATIONS,
    key: receiptKey,
    body: receiptBytes,
    sha256: receiptSha256,
    mediaType: "application/json",
  });
  return decodeStrict(Plan097OperationResponseSchema)({
    artifactKind: "bp.ops.plan097.worker-response.v1",
    schemaVersion: 1,
    operationId: input.request.operationId,
    action: input.request.action,
    outcome: input.outcome,
    releaseId: input.releaseId,
    activationBundleSha256: input.request.activationBundleSha256,
    receiptKey,
    statementCount: input.statementCount,
    objectCount: input.objectCount,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
  });
}

export async function handlePlan097RecoveryRequest(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname !== PLAN097_OPERATION_PATH)
    return new Response("Not found", { status: 404 });
  if (env.PLAN097_RECOVERY_OPERATION_ENABLED !== "true") {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await authenticated(request, env))) return new Response("Forbidden", { status: 403 });
  if (env.DB === undefined || env.ARTIFACTS === undefined || env.PLAN097_OPERATIONS === undefined) {
    return jsonResponse({ error: "Plan 097 one-time bindings are incomplete" }, 503);
  }

  try {
    const operationRequest = decodeStrict(Plan097OperationRequestSchema)(await request.json());
    if (
      operationRequest.operationId !== env.PLAN097_OPERATION_ID ||
      operationRequest.activationBundleSha256 !== env.PLAN097_ACTIVATION_BUNDLE_SHA256
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const mutating = !["dry-run", "preflight", "prove"].includes(operationRequest.action);
    if (
      mutating &&
      !(await secretMatches(
        request.headers.get("X-Plan097-Execution-Token"),
        env.PLAN097_EXECUTION_TOKEN,
      ))
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    if (operationRequest.action === "prove" && env.PLAN097_PROOF_MODE !== "true") {
      return new Response("Forbidden", { status: 403 });
    }
    const boundEnv = env as Env & {
      PLAN097_OPERATIONS: R2Bucket;
      DB: D1Database;
      ARTIFACTS: R2Bucket;
    };
    if (operationRequest.action === "mirror-bundle") {
      if (env.PLAN097_PROOF_BUNDLES === undefined) {
        return jsonResponse({ error: "Plan 097 proof-bundle binding is missing" }, 503);
      }
      const mirrored = await mirrorOperationBundle({
        env: boundEnv as typeof boundEnv & { PLAN097_PROOF_BUNDLES: R2Bucket },
        request: operationRequest,
      });
      const response = await writeReceipt({
        env: boundEnv,
        request: operationRequest,
        releaseId: mirrored.releaseId,
        outcome: "pass",
        statementCount: 0,
        objectCount: mirrored.objectCount,
      });
      return jsonResponse(response);
    }
    const bundle = await loadActivationBundle({ env: boundEnv, request: operationRequest });
    const releaseId = bundle.candidate.releaseId;
    let statementCount = 0;
    let objectCount = 0;
    let outcome: "pass" | "failed_as_expected" = "pass";
    let evidence: EvidenceRef[] | undefined;

    switch (operationRequest.action) {
      case "dry-run": {
        const { manifest } = await loadArtifactManifest({ env: boundEnv, bundle });
        statementCount = bundle.batch.statements.length;
        objectCount = manifest.entries.length;
        break;
      }
      case "preflight": {
        const { manifest, bytes } = await loadArtifactManifest({ env: boundEnv, bundle });
        const result = await runPreflight({
          env: boundEnv,
          bundle,
          request: operationRequest,
          manifestEntryCount: manifest.entries.length,
          manifestBytes: bytes.byteLength,
          manifestBodyBytes: manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0),
        });
        statementCount = result.statementCount;
        objectCount = result.objectCount;
        evidence = result.evidence;
        break;
      }
      case "stage-body": {
        const { manifest } = await loadArtifactManifest({ env: boundEnv, bundle });
        const entry = manifest.entries.find(
          (candidate) => candidate.logicalId === operationRequest.logicalId,
        );
        if (
          entry === undefined ||
          entry.sha256 !== operationRequest.declaredSha256 ||
          entry.bytes !== operationRequest.declaredBytes ||
          entry.mediaType !== operationRequest.mediaType
        ) {
          throw new Error("Plan 097 staged body is not declared by the signed manifest");
        }
        const body = decodeBase64(operationRequest.bodyBase64);
        if (body.byteLength !== entry.bytes || (await sha256(body)) !== entry.sha256) {
          throw new Error("Plan 097 staged body bytes do not match the signed manifest");
        }
        await putIdentical({
          bucket: boundEnv.ARTIFACTS,
          key: entry.key,
          body,
          sha256: entry.sha256,
          mediaType: entry.mediaType,
        });
        objectCount = 1;
        break;
      }
      case "finalize-manifest": {
        const { manifest, bytes } = await loadArtifactManifest({ env: boundEnv, bundle });
        for (const entry of manifest.entries) await verifyStagedEntry(boundEnv.ARTIFACTS, entry);
        await putIdentical({
          bucket: boundEnv.ARTIFACTS,
          key: bundle.artifactManifest.key,
          body: bytes,
          sha256: bundle.artifactManifest.sha256,
          mediaType: "application/json",
        });
        objectCount = manifest.entries.length + 1;
        break;
      }
      case "activate": {
        const { manifest } = await loadArtifactManifest({ env: boundEnv, bundle });
        await verifyStagedEntry(boundEnv.ARTIFACTS, {
          key: bundle.artifactManifest.key,
          sha256: bundle.artifactManifest.sha256,
          bytes: bundle.artifactManifest.byteLength,
          mediaType: "application/json",
        });
        for (const entry of manifest.entries) await verifyStagedEntry(boundEnv.ARTIFACTS, entry);
        await runD1Batch({ db: boundEnv.DB, batch: bundle.batch });
        statementCount = bundle.batch.statements.length;
        objectCount = manifest.entries.length + 1;
        break;
      }
      case "prove": {
        const batch =
          operationRequest.bundle === "activation"
            ? bundle.batch
            : await loadRestoreBatch({ env: boundEnv, request: operationRequest });
        statementCount = batch.statements.length;
        let failure: unknown;
        try {
          await runD1Batch({
            db: boundEnv.DB,
            batch,
            failBeforeStatement: operationRequest.failBeforeStatement,
          });
        } catch (error) {
          failure = error;
        }
        if (operationRequest.failBeforeStatement === undefined) {
          if (failure !== undefined) throw failure;
        } else {
          if (failure === undefined) {
            throw new Error("Plan 097 injected failure unexpectedly committed");
          }
          if (!String(failure).includes("plan097_injected_failure__missing_table")) {
            throw failure;
          }
          outcome = "failed_as_expected";
        }
        break;
      }
      case "rollback": {
        const batch = await loadRestoreBatch({ env: boundEnv, request: operationRequest });
        await runD1Batch({ db: boundEnv.DB, batch });
        statementCount = batch.statements.length;
        break;
      }
    }
    const response = await writeReceipt({
      env: boundEnv,
      request: operationRequest,
      releaseId,
      outcome,
      statementCount,
      objectCount,
      evidence,
    });
    return jsonResponse(response);
  } catch (error) {
    console.error("Plan 097 recovery operation failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse({ error: "Plan 097 recovery operation failed closed" }, 409);
  }
}
