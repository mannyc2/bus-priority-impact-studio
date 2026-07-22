/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, SELF } from "cloudflare:test";
import { createHash } from "node:crypto";
import {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  type Plan097CompactedBatch,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  type Plan097RecoveryArtifactManifest,
  type Plan097RestoreBundle,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/env.js";
import {
  handlePlan097RecoveryRequest,
  PLAN097_OPERATION_PATH,
} from "../../src/worker/operations/plan097-recovery.js";

const publishedAt = "2026-07-22T12:00:00.000Z";
const releaseId = "pub_20260722T120000000Z";
const operationId = `plan097:${releaseId}`;
const serviceTokenId = "plan097-worker-test-id";
const serviceTokenSecret = "plan097-worker-test-secret";
const executionToken = "plan097-worker-test-execution";
const artifactBody = new TextEncoder().encode('{"artifactKind":"bp.test.plan097.v1"}\n');

type TestEnv = Env & {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  PLAN097_OPERATIONS: R2Bucket;
};

const testEnv = env as unknown as TestEnv;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function metrics(
  statements: Plan097CompactedBatch["statements"],
): Plan097CompactedBatch["metrics"] {
  const encoder = new TextEncoder();
  return {
    originalStatementCount: statements.length,
    compactedStatementCount: statements.length,
    sqlBytes: statements.reduce(
      (sum, statement) => sum + encoder.encode(statement.sql).byteLength,
      0,
    ),
    parameterBytes: statements.reduce(
      (sum, statement) =>
        sum +
        statement.params.reduce(
          (parameterSum, parameter) => parameterSum + encoder.encode(parameter).byteLength,
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

function activationBatch(): Plan097CompactedBatch {
  const statements: Plan097CompactedBatch["statements"] = [
    {
      sql: "DELETE FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      params: [],
      table: "source_month_coverage",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: `INSERT INTO source_month_coverage (source_id, month, label, source_kind, grain, status, generated_at)
            SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
                   json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'),
                   json_extract(value, '$[6]') FROM json_each(?)`,
      params: [
        JSON.stringify([
          [
            "plan097-worker-test",
            "2026-12",
            "Plan 097 worker test",
            "fixture",
            "month",
            "complete",
            publishedAt,
          ],
        ]),
      ],
      table: "source_month_coverage",
      kind: "insert",
      rowCount: 1,
    },
    {
      sql: `INSERT INTO route_batch_status (month, generated_at, status, route_count, artifact_count,
              missing_artifact_count, hash_mismatch_count, byte_length_mismatch_count,
              total_byte_length, issue_count)
            SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
                   json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'),
                   json_extract(value, '$[6]'), json_extract(value, '$[7]'), json_extract(value, '$[8]'),
                   json_extract(value, '$[9]') FROM json_each(?)`,
      params: [
        JSON.stringify([
          ["1900-01", publishedAt, "pass", 0, 1, 0, 0, 0, artifactBody.byteLength, 0],
        ]),
      ],
      table: "route_batch_status",
      kind: "activation",
      rowCount: 1,
    },
  ];
  return { schemaVersion: 1, statements, metrics: metrics(statements) };
}

function restoreBatch(): Plan097CompactedBatch {
  const statements: Plan097CompactedBatch["statements"] = [
    {
      sql: "DELETE FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      params: [],
      table: "source_month_coverage",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: "DELETE FROM route_batch_status WHERE month = '1900-01'",
      params: [],
      table: "route_batch_status",
      kind: "activation",
      rowCount: 0,
    },
  ];
  return { schemaVersion: 1, statements, metrics: metrics(statements) };
}

function headers(execute = false): Headers {
  return new Headers({
    "Content-Type": "application/json",
    "CF-Access-Client-Id": serviceTokenId,
    "CF-Access-Client-Secret": serviceTokenSecret,
    ...(execute ? { "X-Plan097-Execution-Token": executionToken } : {}),
  });
}

async function operationRequest(input: {
  body: Record<string, unknown>;
  env: Env;
  execute?: boolean;
}): Promise<Response> {
  return handlePlan097RecoveryRequest(
    new Request(`https://example.test${PLAN097_OPERATION_PATH}`, {
      method: "POST",
      headers: headers(input.execute),
      body: JSON.stringify(input.body),
    }),
    input.env,
  );
}

async function cleanD1(): Promise<void> {
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM source_month_coverage WHERE source_id = 'plan097-worker-test'"),
    testEnv.DB.prepare("DELETE FROM route_batch_status WHERE month = '1900-01'"),
  ]);
}

describe("Plan 097 protected Worker operation", () => {
  let operationEnv: Env;
  let activationBundleSha256: string;
  let restoreBundleSha256: string;
  let artifactManifest: Plan097RecoveryArtifactManifest;

  beforeEach(async () => {
    await cleanD1();
    const bodySha256 = sha256(artifactBody);
    artifactManifest = {
      artifactKind: "bp.ops.plan097.recovery_artifact_manifest.v1",
      schemaVersion: 1,
      releaseId,
      createdAt: publishedAt,
      entries: [
        {
          logicalId: "studio/v2/plan097-worker-test.json",
          logicalKey: "studio/v2/plan097-worker-test.json",
          key: `operations/plan097/blobs/sha256/${bodySha256.slice(0, 2)}/${bodySha256}.json`,
          sha256: bodySha256,
          bytes: artifactBody.byteLength,
          mediaType: "application/json",
          schemaId: "bp.test.plan097.v1",
        },
      ],
    };
    const manifestText = `${canonicalPlan097Json(artifactManifest)}\n`;
    const manifestSha256 = sha256(manifestText);
    const bundle: Plan097ActivationBundle = {
      artifactKind: "bp.ops.plan097.activation-bundle.v1",
      schemaVersion: 1,
      operationId,
      candidate: {
        releaseId,
        publishedAt,
        coverage: { start: "2025-02", end: "2026-12" },
      },
      artifactManifest: {
        key: `operations/plan097/releases/${releaseId}/artifact-manifest.json`,
        sha256: manifestSha256,
        byteLength: new TextEncoder().encode(manifestText).byteLength,
        entryCount: 1,
      },
      sources: [
        { kind: "canonical-schema", sha256: "1".repeat(64), byteLength: 1 },
        { kind: "recovery-seed", sha256: "2".repeat(64), byteLength: 1 },
        { kind: "exact-route-registration", sha256: "3".repeat(64), byteLength: 1 },
        { kind: "map-release-registration", sha256: "4".repeat(64), byteLength: 1 },
      ],
      batch: activationBatch(),
    };
    const activationText = `${canonicalPlan097Json(bundle)}\n`;
    activationBundleSha256 = sha256(activationText);
    const restore: Plan097RestoreBundle = {
      artifactKind: "bp.ops.plan097.restore-bundle.v1",
      schemaVersion: 1,
      operationId,
      candidate: bundle.candidate,
      snapshotSha256: "5".repeat(64),
      expectedElection: {
        studioReleaseId: null,
        mapReleaseId: null,
        exactRouteReleaseId: null,
      },
      protectedFingerprints: [],
      batch: restoreBatch(),
    };
    const restoreText = `${canonicalPlan097Json(restore)}\n`;
    restoreBundleSha256 = sha256(restoreText);
    await Promise.all([
      testEnv.PLAN097_OPERATIONS.put(
        `operations/plan097/bundles/${releaseId}/activation.${activationBundleSha256}.json`,
        activationText,
      ),
      testEnv.PLAN097_OPERATIONS.put(bundle.artifactManifest.key, manifestText),
      testEnv.PLAN097_OPERATIONS.put(
        `operations/plan097/bundles/${releaseId}/restore.${restoreBundleSha256}.json`,
        restoreText,
      ),
    ]);
    operationEnv = {
      DB: testEnv.DB,
      ARTIFACTS: testEnv.ARTIFACTS,
      PLAN097_OPERATIONS: testEnv.PLAN097_OPERATIONS,
      PLAN097_RECOVERY_OPERATION_ENABLED: "true",
      PLAN097_OPERATION_ID: operationId,
      PLAN097_ACTIVATION_BUNDLE_SHA256: activationBundleSha256,
      PLAN097_RESTORE_BUNDLE_SHA256: restoreBundleSha256,
      PLAN097_SERVICE_TOKEN_ID: serviceTokenId,
      PLAN097_SERVICE_TOKEN_SECRET: serviceTokenSecret,
      PLAN097_EXECUTION_TOKEN: executionToken,
      PLAN097_PROOF_MODE: "true",
    };
  });

  afterEach(cleanD1);

  it("keeps the route absent when its one-time binding is disabled", async () => {
    const response = await SELF.fetch(`https://example.test${PLAN097_OPERATION_PATH}`, {
      method: "POST",
    });
    expect(response.status).toBe(404);
  });

  it("stages only signed bodies, proves rollback on failure, activates, and rolls back", async () => {
    const base = { operationId, activationBundleSha256 };
    const dryRun = await operationRequest({
      body: { ...base, action: "dry-run" },
      env: operationEnv,
    });
    expect(dryRun.status).toBe(200);
    expect(decodeStrict(Plan097OperationResponseSchema)(await dryRun.json()).objectCount).toBe(1);

    const entry = artifactManifest.entries[0];
    if (entry === undefined) throw new Error("missing fixture entry");
    const badStage = await operationRequest({
      body: {
        ...base,
        action: "stage-body",
        logicalId: "studio/v2/not-signed.json",
        declaredSha256: entry.sha256,
        declaredBytes: entry.bytes,
        mediaType: entry.mediaType,
        bodyBase64: btoa(String.fromCharCode(...artifactBody)),
      },
      env: operationEnv,
      execute: true,
    });
    expect(badStage.status).toBe(409);

    const stage = await operationRequest({
      body: {
        ...base,
        action: "stage-body",
        logicalId: entry.logicalId,
        declaredSha256: entry.sha256,
        declaredBytes: entry.bytes,
        mediaType: entry.mediaType,
        bodyBase64: btoa(String.fromCharCode(...artifactBody)),
      },
      env: operationEnv,
      execute: true,
    });
    expect(stage.status).toBe(200);
    expect(await testEnv.ARTIFACTS.get(entry.key)).not.toBeNull();

    const finalize = await operationRequest({
      body: { ...base, action: "finalize-manifest" },
      env: operationEnv,
      execute: true,
    });
    expect(finalize.status).toBe(200);

    const failureProof = await operationRequest({
      body: {
        ...base,
        action: "prove",
        bundle: "activation",
        failBeforeStatement: 1,
      },
      env: operationEnv,
    });
    expect(failureProof.status).toBe(200);
    const failureResponse = decodeStrict(Plan097OperationResponseSchema)(await failureProof.json());
    expect(failureResponse.outcome).toBe("failed_as_expected");
    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      ).first("count"),
    ).toBe(0);

    const unauthorized = await operationRequest({
      body: { ...base, action: "activate" },
      env: operationEnv,
    });
    expect(unauthorized.status).toBe(403);

    const activate = await operationRequest({
      body: { ...base, action: "activate" },
      env: operationEnv,
      execute: true,
    });
    expect(activate.status).toBe(200);
    const activationResponse = decodeStrict(Plan097OperationResponseSchema)(
      await activate.json(),
    ) as Plan097OperationResponse;
    expect(await testEnv.PLAN097_OPERATIONS.get(activationResponse.receiptKey)).not.toBeNull();
    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      ).first("count"),
    ).toBe(1);

    const rollback = await operationRequest({
      body: { ...base, action: "rollback", restoreBundleSha256 },
      env: operationEnv,
      execute: true,
    });
    expect(rollback.status).toBe(200);
    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      ).first("count"),
    ).toBe(0);
    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM route_batch_status WHERE month = '1900-01'",
      ).first("count"),
    ).toBe(0);
  });
});
