import {
  activateServingRelease,
  D1_CANDIDATE_PROJECTION_TABLES,
  D1_SERVING_TABLE_OWNERSHIP,
  markServingCandidateArtifactVerified,
  markServingCandidateReady,
  registerServingCandidate,
  resolveActiveServingRelease,
} from "@bp/db/d1";
import {
  canonicalPlan097Json,
  Plan097PreflightReceiptSchema,
  plan097StructuralSchemaEnvelopeSha256,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import {
  canonicalServingCandidateSemanticJson,
  canonicalServingJson,
  ServingCandidateManifestV1Schema,
  ServingReleaseV1Schema,
} from "@bp/domain/studio/serving-release";
import { capturePlan097D1CanonicalSchema } from "./plan097-recovery.js";

export const PLAN098_OPERATION_PATH = "/__operations/plan098";

export type Plan098OperatorEnv = {
  DB?: D1Database;
  ARTIFACTS?: R2Bucket;
  PLAN097_OPERATIONS?: R2Bucket;
  PLAN098_EXECUTION_TOKEN?: string;
  PLAN098_OPERATOR_ENABLED?: string;
};

const PLAN097_BASELINE_RELEASE_ID = "pub_20260725T164123260Z";
const PLAN097_PREFLIGHT_RECEIPT_SHA256 =
  "f46204de5f909f81c834d92d087f73b296bad0fb5137ba3caeb41430da4ecce6";
// Plan 097 independently verified the Ed25519 signature before recording this exact receipt digest
// and signer fingerprint. Its one-time signing material was intentionally retired at cleanup, so
// Plan 098 re-establishes trust by requiring the immutable bytes and embedded signer identity.
const PLAN097_PREFLIGHT_SIGNING_KEY_ID = "plan097-20260725-rc28";
const PLAN097_PREFLIGHT_PUBLIC_KEY_SPKI_SHA256 =
  "7b6bb824b4754df8686bfc10e4295a2e47d9ab4da34a92c29af1199842adb8c6";
const PLAN097_PREFLIGHT_RECEIPT_KEY = `operations/plan097/preflight/${PLAN097_BASELINE_RELEASE_ID}/preflight.${PLAN097_PREFLIGHT_RECEIPT_SHA256}.json`;

type CandidateArtifactRow = {
  key: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  state: "staging" | "ready" | "rejected";
};

function json(value: unknown, status = 200): Response {
  return new Response(`${canonicalServingJson(value)}\n`, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function sha256(body: Uint8Array | string): Promise<string> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request, env: Plan098OperatorEnv): Promise<boolean> {
  const actual = request.headers.get("Authorization")?.replace(/^Bearer\s+/u, "") ?? "";
  const expected = env.PLAN098_EXECUTION_TOKEN ?? "";
  if (actual.length === 0 || expected.length === 0) return false;
  return (await sha256(actual)) === (await sha256(expected));
}

function requireBindings(
  env: Plan098OperatorEnv,
): asserts env is Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket } {
  if (env.DB === undefined || env.ARTIFACTS === undefined) {
    throw new Error("Plan 098 operator bindings are incomplete.");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Plan 098 request body must be an object.");
  }
  return value as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) throw new Error(`Missing ${key}.`);
  return field;
}

function unknownField(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

async function candidateArtifact(
  database: D1Database,
  candidateId: string,
  logicalId: string,
): Promise<CandidateArtifactRow> {
  const row = await database
    .prepare(
      `SELECT
        artifact.physical_key AS key,
        artifact.sha256,
        artifact.byte_length AS bytes,
        artifact.media_type AS mediaType,
        candidate.state
      FROM serving_candidate_artifact AS artifact
      JOIN serving_candidate AS candidate ON candidate.candidate_id = artifact.candidate_id
      WHERE artifact.candidate_id = ? AND artifact.logical_id = ?`,
    )
    .bind(candidateId, logicalId)
    .first<CandidateArtifactRow>();
  if (row === null) throw new Error("Candidate artifact is not registered.");
  return row;
}

async function verifiedObject(bucket: R2Bucket, artifact: CandidateArtifactRow): Promise<boolean> {
  const object = await bucket.get(artifact.key);
  if (object === null || object.size !== artifact.bytes) return false;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  return (
    (await sha256(bytes)) === artifact.sha256 && headers.get("Content-Type") === artifact.mediaType
  );
}

async function registerCandidate(
  env: Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket },
  payload: Record<string, unknown>,
) {
  const manifest = decodeStrict(ServingCandidateManifestV1Schema)(
    unknownField(payload, "manifest"),
  );
  const manifestKey = stringField(payload, "manifestKey");
  const manifestSha256 = stringField(payload, "manifestSha256");
  const stagedAt = stringField(payload, "stagedAt");
  const semanticSha256 = await sha256(canonicalServingCandidateSemanticJson(manifest));
  if (semanticSha256 !== manifest.candidateId) {
    throw new Error("Candidate ID does not match canonical semantic content.");
  }
  const manifestBytes = new TextEncoder().encode(`${canonicalServingJson(manifest)}\n`);
  if ((await sha256(manifestBytes)) !== manifestSha256 || !manifestKey.includes(manifestSha256)) {
    throw new Error("Candidate manifest bytes do not match their immutable key.");
  }
  const existing = await env.ARTIFACTS.get(manifestKey);
  if (existing === null) {
    await env.ARTIFACTS.put(manifestKey, manifestBytes, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { sha256: manifestSha256 },
    });
  } else if (
    existing.size !== manifestBytes.byteLength ||
    (await sha256(new Uint8Array(await existing.arrayBuffer()))) !== manifestSha256
  ) {
    throw new Error("Candidate manifest key collides with different bytes.");
  }
  return registerServingCandidate(env.DB, { manifest, manifestKey, manifestSha256, stagedAt });
}

async function copyD1Table(
  database: D1Database,
  payload: Record<string, unknown>,
): Promise<{ table: string; rowCount: number }> {
  const candidateId = stringField(payload, "candidateId");
  const table = stringField(payload, "table");
  const sourceCandidateId =
    unknownField(payload, "sourceCandidateId") === null
      ? null
      : stringField(payload, "sourceCandidateId");
  const coverageEnd = stringField(payload, "coverageEnd");
  if (!/^\d{4}-\d{2}$/u.test(coverageEnd)) throw new Error("Invalid coverageEnd.");
  if (!D1_CANDIDATE_PROJECTION_TABLES.includes(table as never)) {
    throw new Error(`Table ${table} is outside the candidate projection allowlist.`);
  }
  const header = await database
    .prepare("SELECT state FROM serving_candidate WHERE candidate_id = ?")
    .bind(candidateId)
    .first<{ state: string }>();
  if (header?.state !== "staging") throw new Error("Target candidate is not staging.");
  const info = await database.prepare(`PRAGMA table_info("${table}_v2")`).all<{ name: string }>();
  if (!info.success) throw new Error(`Unable to inspect ${table}_v2.`);
  const columns = info.results
    .map((column) => column.name)
    .filter((name) => name !== "candidate_id");
  if (columns.length === 0 || columns.some((name) => !/^[a-z][a-z0-9_]*$/u.test(name))) {
    throw new Error(`Candidate projection columns are invalid for ${table}.`);
  }
  const names = columns.map((name) => `"${name}"`).join(", ");
  const sourceSql =
    sourceCandidateId === null
      ? `SELECT ${names}, ? FROM "${table}"${
          table === "route_month_source_status" || table === "route_observed_reliability_summary"
            ? " WHERE month <= ?"
            : ""
        }`
      : `SELECT ${names}, ? FROM "${table}_v2" WHERE candidate_id = ?`;
  await database.batch([
    database.prepare(`DELETE FROM "${table}_v2" WHERE candidate_id = ?`).bind(candidateId),
    database
      .prepare(`INSERT INTO "${table}_v2" (${names}, candidate_id) ${sourceSql}`)
      .bind(
        candidateId,
        ...(sourceCandidateId === null
          ? table === "route_month_source_status" || table === "route_observed_reliability_summary"
            ? [coverageEnd]
            : []
          : [sourceCandidateId]),
      ),
  ]);
  const row = await database
    .prepare(`SELECT COUNT(*) AS rowCount FROM "${table}_v2" WHERE candidate_id = ?`)
    .bind(candidateId)
    .first<{ rowCount: number }>();
  if (row === null) throw new Error(`Candidate projection count failed for ${table}.`);
  return { table, rowCount: row.rowCount };
}

async function verifyArtifacts(
  env: Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket },
  payload: Record<string, unknown>,
) {
  const candidateId = stringField(payload, "candidateId");
  const verifiedAt = stringField(payload, "verifiedAt");
  const logicalIds = unknownField(payload, "logicalIds");
  if (!Array.isArray(logicalIds) || logicalIds.some((value) => typeof value !== "string")) {
    throw new Error("logicalIds must be a string array.");
  }
  if (logicalIds.length === 0 || logicalIds.length > 20) {
    throw new Error("Each artifact verification batch must contain 1-20 logical IDs.");
  }
  for (const logicalId of logicalIds) {
    const artifact = await candidateArtifact(env.DB, candidateId, logicalId);
    if (artifact.state !== "staging" || !(await verifiedObject(env.ARTIFACTS, artifact))) {
      throw new Error(`Candidate artifact verification failed for ${logicalId}.`);
    }
    await markServingCandidateArtifactVerified(env.DB, {
      candidateId,
      logicalId,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      verifiedAt,
    });
  }
  return { candidateId, verifiedCount: logicalIds.length };
}

async function uploadArtifact(
  request: Request,
  env: Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket },
) {
  const candidateId = request.headers.get("X-Plan098-Candidate-Id") ?? "";
  const logicalId = request.headers.get("X-Plan098-Logical-Id") ?? "";
  const verifiedAt = request.headers.get("X-Plan098-Verified-At") ?? "";
  if (candidateId.length === 0 || logicalId.length === 0 || verifiedAt.length === 0) {
    throw new Error("Plan 098 upload headers are incomplete.");
  }
  const artifact = await candidateArtifact(env.DB, candidateId, logicalId);
  if (artifact.state !== "staging") throw new Error("Candidate is not staging.");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== artifact.bytes || (await sha256(body)) !== artifact.sha256) {
    throw new Error("Uploaded artifact bytes do not match the candidate manifest.");
  }
  const existing = await env.ARTIFACTS.get(artifact.key);
  if (existing !== null) {
    if (!(await verifiedObject(env.ARTIFACTS, artifact))) {
      throw new Error("Immutable artifact key collides with different bytes or metadata.");
    }
  } else {
    await env.ARTIFACTS.put(artifact.key, body, {
      httpMetadata: { contentType: artifact.mediaType },
      customMetadata: { sha256: artifact.sha256 },
    });
    if (!(await verifiedObject(env.ARTIFACTS, artifact))) {
      throw new Error("Uploaded artifact failed read-after-write verification.");
    }
  }
  await markServingCandidateArtifactVerified(env.DB, {
    candidateId,
    logicalId,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    verifiedAt,
  });
  return { candidateId, logicalId, key: artifact.key, sha256: artifact.sha256 };
}

async function recordReceipt(
  env: Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket },
  payload: Record<string, unknown>,
) {
  const operationId = stringField(payload, "operationId");
  const receiptKind = stringField(payload, "receiptKind");
  const createdAt = stringField(payload, "createdAt");
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(receiptKind)) throw new Error("Invalid receipt kind.");
  const bytes = new TextEncoder().encode(
    `${canonicalServingJson(unknownField(payload, "receipt"))}\n`,
  );
  const digest = await sha256(bytes);
  const key = `serving/operations/${operationId}/${receiptKind}.${digest}.json`;
  const existing = await env.ARTIFACTS.get(key);
  if (existing === null) {
    await env.ARTIFACTS.put(key, bytes, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { sha256: digest },
    });
  } else if (
    existing.size !== bytes.byteLength ||
    (await sha256(new Uint8Array(await existing.arrayBuffer()))) !== digest
  ) {
    throw new Error("Receipt key collides with different bytes.");
  }
  await env.DB.prepare(
    `INSERT INTO serving_operation_receipt(
      operation_id, receipt_kind, physical_key, sha256, byte_length, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id, receipt_kind) DO NOTHING`,
  )
    .bind(operationId, receiptKind, key, digest, bytes.byteLength, createdAt)
    .run();
  const row = await env.DB.prepare(
    `SELECT physical_key AS key, sha256, byte_length AS bytes
    FROM serving_operation_receipt
    WHERE operation_id = ? AND receipt_kind = ?`,
  )
    .bind(operationId, receiptKind)
    .first<{ key: string; sha256: string; bytes: number }>();
  if (row?.key !== key || row.sha256 !== digest || row.bytes !== bytes.byteLength) {
    throw new Error("Receipt operation ID collides with different evidence.");
  }
  return { operationId, receiptKind, key, sha256: digest, bytes: bytes.byteLength };
}

async function jsonAction(
  request: Request,
  env: Plan098OperatorEnv & { DB: D1Database; ARTIFACTS: R2Bucket },
) {
  const payload = record(await request.json());
  const action = stringField(payload, "action");
  if (action === "verify-plan097-preflight") {
    if (env.PLAN097_OPERATIONS === undefined) {
      throw new Error("Plan 097 retained operations binding is unavailable.");
    }
    const object = await env.PLAN097_OPERATIONS.get(PLAN097_PREFLIGHT_RECEIPT_KEY);
    if (object === null) throw new Error("Pinned Plan 097 preflight receipt is unavailable.");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if ((await sha256(bytes)) !== PLAN097_PREFLIGHT_RECEIPT_SHA256) {
      throw new Error("Pinned Plan 097 preflight receipt bytes drifted.");
    }
    const receipt = decodeStrict(Plan097PreflightReceiptSchema)(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    if (
      receipt.outcome !== "ready" ||
      receipt.signature.keyId !== PLAN097_PREFLIGHT_SIGNING_KEY_ID ||
      receipt.signature.publicKeySpkiSha256 !== PLAN097_PREFLIGHT_PUBLIC_KEY_SPKI_SHA256 ||
      receipt.candidate.releaseId !== PLAN097_BASELINE_RELEASE_ID ||
      receipt.candidate.manifestSha256 !==
        "6bc5cc028bfd20eadb7912b6022212847ba2f8087511450ac463f9e783300e70" ||
      receipt.resources.d1DatabaseName !== "bus-priority-serving" ||
      receipt.resources.d1DatabaseId !== "d9cd87e2-1f77-44eb-b712-e834b23497b0" ||
      receipt.resources.r2Bucket !== "bus-priority-artifacts"
    ) {
      throw new Error("Pinned Plan 097 preflight receipt does not bind the production baseline.");
    }
    const current = await capturePlan097D1CanonicalSchema(env.DB);
    const structuralSha256 = plan097StructuralSchemaEnvelopeSha256(current);
    if (
      structuralSha256 !== receipt.schemaReconciliation.expectedStructuralSha256 ||
      canonicalPlan097Json(current.migrationLedger) !==
        canonicalPlan097Json(receipt.schemaSnapshot.migrationLedger)
    ) {
      throw new Error("Production schema or legacy migration ledger drifted from Plan 097.");
    }
    return {
      releaseId: PLAN097_BASELINE_RELEASE_ID,
      receiptKey: PLAN097_PREFLIGHT_RECEIPT_KEY,
      receiptSha256: PLAN097_PREFLIGHT_RECEIPT_SHA256,
      signature: receipt.signature,
      legacyMigrationLedger: current.migrationLedger,
      structuralSha256,
      schemaSnapshotSha256: current.sha256,
    };
  }
  if (action === "register-candidate") return registerCandidate(env, payload);
  if (action === "copy-d1-table") return copyD1Table(env.DB, payload);
  if (action === "bootstrap-current-signals") {
    const coverageEnd = stringField(payload, "coverageEnd");
    if (!/^\d{4}-\d{2}$/u.test(coverageEnd)) throw new Error("Invalid coverageEnd.");
    const pointer = await resolveActiveServingRelease(env.DB);
    if (pointer.kind !== "legacy" || pointer.generation !== 0) {
      throw new Error("Current signals can bootstrap only before the first pointer activation.");
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM route_observed_reliability_current_signal"),
      env.DB.prepare(
        `INSERT INTO route_observed_reliability_current_signal
          SELECT * FROM route_observed_reliability_summary WHERE month > ?`,
      ).bind(coverageEnd),
      env.DB.prepare("DELETE FROM route_month_source_status_current_signal"),
      env.DB.prepare(
        `INSERT INTO route_month_source_status_current_signal
          SELECT * FROM route_month_source_status WHERE month > ?`,
      ).bind(coverageEnd),
    ]);
    const reliability = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM route_observed_reliability_current_signal",
    ).first<{ count: number }>();
    const statuses = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM route_month_source_status_current_signal",
    ).first<{ count: number }>();
    return {
      coverageEnd,
      routeObservedReliabilityCurrentSignalCount: reliability?.count ?? 0,
      routeMonthSourceStatusCurrentSignalCount: statuses?.count ?? 0,
    };
  }
  if (action === "verify-artifacts") return verifyArtifacts(env, payload);
  if (action === "mark-ready") {
    const candidateId = stringField(payload, "candidateId");
    await markServingCandidateReady(env.DB, candidateId, stringField(payload, "readyAt"));
    return { candidateId, state: "ready" };
  }
  if (action === "activate") {
    const release = decodeStrict(ServingReleaseV1Schema)(unknownField(payload, "release"));
    return activateServingRelease(env.DB, {
      operationId: stringField(payload, "operationId"),
      expectedReleaseId:
        unknownField(payload, "expectedReleaseId") === null
          ? null
          : stringField(payload, "expectedReleaseId"),
      expectedGeneration: Number(unknownField(payload, "expectedGeneration")),
      release,
      manifestSha256: stringField(payload, "manifestSha256"),
    });
  }
  if (action === "status") {
    const context = await resolveActiveServingRelease(env.DB);
    return context.kind === "legacy"
      ? context
      : {
          kind: context.kind,
          generation: context.generation,
          release: context.release,
          candidateId: context.candidate.candidateId,
          artifactCount: context.candidate.artifacts.length,
        };
  }
  if (action === "protected-fingerprints") {
    const legacyLiveOnly = unknownField(payload, "scope") === "legacy-live";
    const liveTables = Object.entries(D1_SERVING_TABLE_OWNERSHIP)
      .filter(([, ownership]) => ownership.owner === "live_write")
      .map(([table]) => table)
      .toSorted();
    const tables = legacyLiveOnly
      ? liveTables
      : [
          ...liveTables,
          "route_month_source_status_current_signal",
          "route_observed_reliability_current_signal",
        ];
    const fingerprints = [];
    const absentTables = [];
    for (const table of tables) {
      if (!/^[a-z][a-z0-9_]*$/u.test(table)) throw new Error("Unsafe protected table name.");
      const info = await env.DB.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
      if (!info.success || info.results.length === 0) {
        absentTables.push(table);
        continue;
      }
      const columns = info.results.map((column) => column.name);
      if (columns.some((column) => !/^[a-z][a-z0-9_]*$/u.test(column))) {
        throw new Error(`Protected table ${table} has an unsafe column name.`);
      }
      const order = columns.map((column) => `"${column}"`).join(", ");
      const rows = await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY ${order}`).all();
      if (!rows.success) throw new Error(`Protected table ${table} fingerprint query failed.`);
      fingerprints.push({
        table,
        rowCount: rows.results.length,
        sha256: await sha256(`${canonicalServingJson(rows.results)}\n`),
      });
    }
    if (absentTables.length > 0) {
      throw new Error(`Protected tables are absent: ${absentTables.join(", ")}.`);
    }
    return { fingerprints };
  }
  if (action === "candidate-status") {
    const candidateId = stringField(payload, "candidateId");
    const candidate = await env.DB.prepare(
      `SELECT state, ready_at AS readyAt, canonical_manifest_sha256 AS manifestSha256
      FROM serving_candidate
      WHERE candidate_id = ?`,
    )
      .bind(candidateId)
      .first<{ state: string; readyAt: string | null; manifestSha256: string }>();
    const artifacts = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified
      FROM serving_candidate_artifact
      WHERE candidate_id = ?`,
    )
      .bind(candidateId)
      .first<{ total: number; verified: number | null }>();
    const releases = await env.DB.prepare(
      `SELECT release_id AS releaseId, published_at AS publishedAt, activated_at AS activatedAt
      FROM serving_release
      WHERE candidate_id = ?
      ORDER BY published_at`,
    )
      .bind(candidateId)
      .all<{ releaseId: string; publishedAt: string; activatedAt: string }>();
    if (!releases.success) throw new Error("Candidate release query failed.");
    return {
      candidateId,
      candidate,
      artifacts: { total: artifacts?.total ?? 0, verified: artifacts?.verified ?? 0 },
      releases: releases.results,
    };
  }
  if (action === "record-receipt") return recordReceipt(env, payload);
  throw new Error(`Unsupported Plan 098 action ${action}.`);
}

export async function handlePlan098ServingReleaseRequest(
  request: Request,
  env: Plan098OperatorEnv,
): Promise<Response> {
  if (
    env.PLAN098_OPERATOR_ENABLED?.trim().toLowerCase() !== "true" ||
    new URL(request.url).pathname !== PLAN098_OPERATION_PATH
  ) {
    return json({ error: "not_found" }, 404);
  }
  if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    requireBindings(env);
    const action = request.headers.get("X-Plan098-Action");
    const result =
      action === "upload-artifact"
        ? await uploadArtifact(request, env)
        : await jsonAction(request, env);
    return json({ ok: true, result });
  } catch (error) {
    console.error("Plan 098 operator action failed.", {
      code: "plan098_operator_failure",
      message: error instanceof Error ? error.message : String(error),
    });
    return json(
      {
        error: "plan098_operator_failure",
        message: error instanceof Error ? error.message : "failed",
      },
      409,
    );
  }
}
