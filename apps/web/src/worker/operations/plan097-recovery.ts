import {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  Plan097ActivationBundleSchema,
  type Plan097CompactedBatch,
  type Plan097OperationRequest,
  Plan097OperationRequestSchema,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  Plan097RecoveryArtifactManifestSchema,
  Plan097RestoreBundleSchema,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
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
    const mutating = !["dry-run", "prove"].includes(operationRequest.action);
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

    switch (operationRequest.action) {
      case "dry-run": {
        const { manifest } = await loadArtifactManifest({ env: boundEnv, bundle });
        statementCount = bundle.batch.statements.length;
        objectCount = manifest.entries.length;
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
    });
    return jsonResponse(response);
  } catch (error) {
    console.error("Plan 097 recovery operation failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse({ error: "Plan 097 recovery operation failed closed" }, 409);
  }
}
