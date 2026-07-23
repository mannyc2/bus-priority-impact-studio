/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, SELF } from "cloudflare:test";
import { createHash } from "node:crypto";
import {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  type Plan097CompactedBatch,
  type Plan097FreshnessMatrix,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  Plan097PreflightReceiptSchema,
  type Plan097RecoveryArtifactManifest,
  type Plan097RestoreBundle,
  plan097MapReleaseCatalogRecoveryStatements,
  plan097StructuralSchemaEnvelopeSha256,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/env.js";
import {
  capturePlan097D1CanonicalSchema,
  capturePlan097D1ProtectedFingerprints,
  handlePlan097RecoveryRequest,
  PLAN097_OPERATION_PATH,
} from "../../src/worker/operations/plan097-recovery.js";
import { isoMonthFixture } from "../shared/schema-fixtures.js";

const publishedAt = "2026-07-22T12:00:00.000Z";
const previousPublishedAt = "2026-07-21T12:00:00.000Z";
const releaseId = "pub_20260722T120000000Z";
const previousReleaseId = "pub_20260721T120000000Z";
const operationId = `plan097:${releaseId}`;
const serviceTokenId = "plan097-worker-test-id";
const serviceTokenSecret = "plan097-worker-test-secret";
const executionToken = "plan097-worker-test-execution";
const signingPrivateKeyPkcs8Base64 =
  "MC4CAQAwBQYDK2VwBCIEIDp1exzvpQ8qM4k5RKedsgEvdHeBHQTNLbtQthgE9aGk";
const signingPublicKeySpkiBase64 = "MCowBQYDK2VwAyEAHHz9KF4gst+kxVBA9dnFnQ3pyjoTXRULUEsEV+Ckr5w=";
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

function readyFreshnessMatrix(): Plan097FreshnessMatrix {
  const sources = [
    ["bus_segment_speeds_2025", "month", "source_complete_probe", "2026-12"],
    ["bus_hourly_ridership_2025", "month", "latest_closed_upstream_month", "2026-12"],
    ["bus_wait_assessment", "month", "latest_closed_upstream_month", "2026-12"],
    ["ace_violations", "month", "latest_closed_upstream_month", "2026-12"],
    ["ace_routes", "snapshot", "atomic_snapshot", `snapshot:${"1".repeat(64)}`],
    [
      "nyc_dot_bus_lanes_local_streets",
      "snapshot",
      "atomic_snapshot",
      `snapshot:${"2".repeat(64)}`,
    ],
    ["bus_time_gtfsrt_vehicle_positions", "realtime", "preserved_current_signal", "2026-07-22"],
  ] as const;
  return {
    artifactKind: "bp.ops.plan097.freshness-matrix.v1",
    schemaVersion: 1,
    checkedAt: "2026-07-22T11:58:00.000Z",
    status: "ready",
    candidateCompatibilityCoverageEnd: "2026-12",
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
        rowsSha256: "a".repeat(64),
        sourceSnapshotSha256: grain === "snapshot" ? "b".repeat(64) : null,
      },
      status: "ready",
      reasons: [],
    })),
  };
}

function studioScheduleEvidence() {
  return {
    analysisPeriod: "2026-12",
    sourceCoverage: {
      sourceId: "bus_schedules_2026",
      datasetId: "4fnn-qsea",
      scheduleDateStart: "2026-01-01T00:00:00.000",
      scheduleDateEnd: "2026-04-11T00:00:00.000",
      rowCount: 22_703_125,
      routeCount: 375,
    },
    selectedRouteCount: 1,
    completeRouteCount: 1,
    excludedRouteCount: 0,
    missingSegmentCount: 0,
    excludedRoutes: [],
    publicationPolicy: "omit_schedule_incomplete_studio_routes",
  } as const;
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
      sql: "DELETE FROM route_brief_summary WHERE month = '1900-01'",
      params: [],
      table: "route_brief_summary",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: `INSERT INTO route_brief_summary VALUES ('B44', '1900-01', 1, 1, 'fixture', 1, 0, 1, 0, 0, 0, 0, 1)`,
      params: [],
      table: "route_brief_summary",
      kind: "insert",
      rowCount: 1,
    },
    {
      sql: "DELETE FROM route_batch_status WHERE month = '1900-01'",
      params: [],
      table: "route_batch_status",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: `INSERT INTO map_release_catalog VALUES ('${releaseId}', '${publishedAt}', '2025-02', '2026-12', 'map/2026-12/manifest.json', '${"7".repeat(64)}', 'full', 'pass', 1)`,
      params: [],
      table: "map_release_catalog",
      kind: "registration",
      rowCount: 1,
    },
    {
      sql: `INSERT INTO exact_route_identity_release VALUES ('${releaseId}', '${publishedAt}', '2025-02', '2026-12', 'fixture-wiki', '${"1".repeat(64)}', '${"2".repeat(64)}', '${"3".repeat(64)}', '${"4".repeat(64)}', '${"5".repeat(64)}', '${"6".repeat(64)}', 1, 1, 1)`,
      params: [],
      table: "exact_route_identity_release",
      kind: "registration",
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
      sql: `DELETE FROM map_release_catalog WHERE release_id = '${releaseId}'`,
      params: [],
      table: "map_release_catalog",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: `DELETE FROM exact_route_identity_release WHERE release_id = '${releaseId}'`,
      params: [],
      table: "exact_route_identity_release",
      kind: "delete",
      rowCount: 0,
    },
    {
      sql: "DELETE FROM route_brief_summary WHERE month = '1900-01'",
      params: [],
      table: "route_brief_summary",
      kind: "delete",
      rowCount: 0,
    },
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
    testEnv.DB.prepare("DELETE FROM route_batch_status WHERE month = '1899-12'"),
    testEnv.DB.prepare("DELETE FROM route_brief_summary WHERE month = '1899-12'"),
    testEnv.DB.prepare("DELETE FROM route_brief_summary WHERE month = '1900-01'"),
    testEnv.DB.prepare("DELETE FROM map_release_catalog WHERE release_id = ?").bind(releaseId),
    testEnv.DB.prepare("DELETE FROM exact_route_identity_release WHERE release_id = ?").bind(
      releaseId,
    ),
    testEnv.DB.prepare("DELETE FROM map_release_catalog WHERE release_id = ?").bind(
      previousReleaseId,
    ),
    testEnv.DB.prepare("DELETE FROM exact_route_identity_release WHERE release_id = ?").bind(
      previousReleaseId,
    ),
  ]);
}

async function seedPreviousElection(): Promise<void> {
  await testEnv.DB.batch([
    testEnv.DB.prepare(
      `INSERT INTO route_batch_status VALUES (?, ?, 'pass', 1, 1, 0, 0, 0, 1, 0)`,
    ).bind("1899-12", previousPublishedAt),
    testEnv.DB.prepare(
      `INSERT INTO route_brief_summary VALUES (?, ?, 1, 1, 'fixture', 1, 0, 1, 0, 0, 0, 0, 1)`,
    ).bind("B44", "1899-12"),
    testEnv.DB.prepare(
      `INSERT INTO map_release_catalog VALUES (?, ?, '1899-01', '1899-12', ?, ?, 'full', 'pass', 1)`,
    ).bind(previousReleaseId, previousPublishedAt, "map/1899-12/manifest.json", "c".repeat(64)),
    testEnv.DB.prepare(
      `INSERT INTO exact_route_identity_release VALUES (?, ?, '1899-01', '1899-12', ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
    ).bind(
      previousReleaseId,
      previousPublishedAt,
      "fixture-wiki",
      "1".repeat(64),
      "2".repeat(64),
      "3".repeat(64),
      "4".repeat(64),
      "5".repeat(64),
      "6".repeat(64),
    ),
  ]);
}

describe("Plan 097 protected Worker operation", () => {
  let operationEnv: Env;
  let activationBundleSha256: string;
  let restoreBundleSha256: string;
  let artifactManifest: Plan097RecoveryArtifactManifest;

  beforeEach(async () => {
    await cleanD1();
    await seedPreviousElection();
    const canonicalSchema = await capturePlan097D1CanonicalSchema(testEnv.DB);
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
        coverage: { start: isoMonthFixture("2025-02"), end: isoMonthFixture("2026-12") },
      },
      freshnessMatrix: readyFreshnessMatrix(),
      studioScheduleEvidence: studioScheduleEvidence(),
      expectedExactRouteCount: 1,
      schemaEnvelope: {
        canonicalSnapshotSha256: canonicalSchema.sha256,
        structuralSha256: plan097StructuralSchemaEnvelopeSha256(canonicalSchema),
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
    const protectedFingerprints = await capturePlan097D1ProtectedFingerprints(testEnv.DB);
    const restore: Plan097RestoreBundle = {
      artifactKind: "bp.ops.plan097.restore-bundle.v1",
      schemaVersion: 1,
      operationId,
      candidate: bundle.candidate,
      snapshotSha256: "5".repeat(64),
      expectedElection: {
        studioReleaseId: previousReleaseId,
        mapReleaseId: previousReleaseId,
        exactRouteReleaseId: previousReleaseId,
      },
      protectedFingerprints,
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
      PLAN097_REPO_SHA: "a".repeat(40),
      PLAN097_COMMAND_VERSION: "plan097-recovery-v1",
      PLAN097_D1_DATABASE_NAME: "bus-priority-serving-test",
      PLAN097_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
      PLAN097_ARTIFACTS_BUCKET_NAME: "bus-priority-artifacts-test",
      PLAN097_PREFLIGHT_SIGNING_KEY_ID: "plan097-test-20260722",
      PLAN097_PREFLIGHT_SIGNING_PRIVATE_KEY_PKCS8_BASE64: signingPrivateKeyPkcs8Base64,
      PLAN097_PREFLIGHT_SIGNING_PUBLIC_KEY_SPKI_BASE64: signingPublicKeySpkiBase64,
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
        restoreBundleSha256,
        failBeforeStatement: 1,
      },
      env: operationEnv,
    });
    expect(failureProof.status).toBe(200);
    const failureResponse = decodeStrict(Plan097OperationResponseSchema)(await failureProof.json());
    expect(failureResponse.outcome).toBe("failed_as_expected");
    expect(failureResponse.proofState).toMatchObject({
      phase: "injected-failure",
      election: {
        studioReleaseId: previousReleaseId,
        mapReleaseId: previousReleaseId,
        exactRouteReleaseId: previousReleaseId,
      },
    });
    expect(
      await testEnv.DB.prepare(
        "SELECT COUNT(*) AS count FROM source_month_coverage WHERE source_id = 'plan097-worker-test'",
      ).first("count"),
    ).toBe(0);

    const candidateProof = await operationRequest({
      body: {
        ...base,
        action: "prove",
        bundle: "activation",
        restoreBundleSha256,
      },
      env: operationEnv,
    });
    expect(candidateProof.status).toBe(200);
    expect(
      decodeStrict(Plan097OperationResponseSchema)(await candidateProof.json()).proofState,
    ).toMatchObject({
      phase: "candidate-active",
      election: {
        studioReleaseId: releaseId,
        mapReleaseId: releaseId,
        exactRouteReleaseId: releaseId,
      },
    });

    const restoreProof = await operationRequest({
      body: {
        ...base,
        action: "prove",
        bundle: "restore",
        restoreBundleSha256,
      },
      env: operationEnv,
    });
    expect(restoreProof.status).toBe(200);
    expect(
      decodeStrict(Plan097OperationResponseSchema)(await restoreProof.json()).proofState,
    ).toMatchObject({
      phase: "baseline-restored",
      election: {
        studioReleaseId: previousReleaseId,
        mapReleaseId: previousReleaseId,
        exactRouteReleaseId: previousReleaseId,
      },
    });

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

  it("captures a signed read-only schema, selective rollback, and protected-surface preflight", async () => {
    const response = await operationRequest({
      body: {
        operationId,
        activationBundleSha256,
        action: "preflight",
        httpBaseline: {
          checkedAt: "2026-07-22T11:59:00.000Z",
          activeReleaseId: previousReleaseId,
          endpoints: [
            {
              path: "/api/v1/status",
              status: 200,
              schemaId: "bp.api.release_status.v1",
              safeBodySha256: "9".repeat(64),
              requestId: "request-1",
              cfRay: null,
              cacheControl: "no-store",
              etag: null,
            },
          ],
        },
      },
      env: operationEnv,
    });
    expect(response.status).toBe(200);
    const result = decodeStrict(Plan097OperationResponseSchema)(await response.json());
    expect(result.action).toBe("preflight");
    expect(result.evidence?.map((entry) => entry.kind)).toEqual([
      "selective-snapshot",
      "restore-bundle",
      "preflight",
    ]);
    const preflightRef = result.evidence?.find((entry) => entry.kind === "preflight");
    if (preflightRef === undefined) throw new Error("missing preflight evidence");
    const object = await testEnv.PLAN097_OPERATIONS.get(preflightRef.key);
    expect(object).not.toBeNull();
    if (object === null) throw new Error("missing persisted preflight receipt");
    const persistedReceiptText = await object.text();
    expect(result.preflightReceiptBase64).toBeDefined();
    if (result.preflightReceiptBase64 === undefined) {
      throw new Error("missing returned preflight receipt bytes");
    }
    expect(Buffer.from(result.preflightReceiptBase64, "base64").toString("utf8")).toBe(
      persistedReceiptText,
    );
    const receipt = decodeStrict(Plan097PreflightReceiptSchema)(JSON.parse(persistedReceiptText));
    expect(receipt.outcome).toBe("ready");
    expect(receipt.httpBaseline.activeReleaseId).toBe(previousReleaseId);
    expect(receipt.freshnessMatrix.candidateCompatibilityCoverageEnd).toBe("2026-12");
    expect(receipt.schemaReconciliation.actualStructuralSha256).toBe(
      receipt.schemaReconciliation.expectedStructuralSha256,
    );
    expect(receipt.selectiveSnapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rollbackPackage.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.signature).toMatchObject({
      algorithm: "Ed25519",
      keyId: "plan097-test-20260722",
      publicKeySpkiSha256: "3f20deeccb7c358fcb07f5804a31ef573bbb1c9dc7af5efbfc79a5c8d2e7e61a",
    });
  });

  it("reconciles an absent exact 0033 only from the signed preflight and is retry-safe", async () => {
    const ledgerBefore = (
      await testEnv.DB.prepare(
        "SELECT id, name, applied_at AS appliedAt FROM d1_migrations ORDER BY id, name",
      ).all()
    ).results;
    await testEnv.DB.prepare("DROP TABLE map_release_catalog").run();
    try {
      const base = { operationId, activationBundleSha256 };
      const preflight = await operationRequest({
        body: {
          ...base,
          action: "preflight",
          httpBaseline: {
            checkedAt: "2026-07-22T11:59:00.000Z",
            activeReleaseId: previousReleaseId,
            endpoints: [
              {
                path: "/api/v1/status",
                status: 200,
                schemaId: "bp.api.release_status.v1",
                safeBodySha256: "9".repeat(64),
                requestId: "request-absent-0033",
                cfRay: null,
                cacheControl: "no-store",
                etag: null,
              },
            ],
          },
        },
        env: operationEnv,
      });
      expect(preflight.status).toBe(200);
      const preflightResponse = decodeStrict(Plan097OperationResponseSchema)(
        await preflight.json(),
      );
      const preflightRef = preflightResponse.evidence?.find((entry) => entry.kind === "preflight");
      if (preflightRef === undefined) throw new Error("missing absent-0033 preflight receipt");

      const unauthorized = await operationRequest({
        body: {
          ...base,
          action: "reconcile-schema",
          preflightReceiptSha256: preflightRef.sha256,
        },
        env: operationEnv,
      });
      expect(unauthorized.status).toBe(403);

      const reconcile = () =>
        operationRequest({
          body: {
            ...base,
            action: "reconcile-schema",
            preflightReceiptSha256: preflightRef.sha256,
          },
          env: operationEnv,
          execute: true,
        });
      const first = await reconcile();
      expect(first.status).toBe(200);
      expect(decodeStrict(Plan097OperationResponseSchema)(await first.json()).statementCount).toBe(
        2,
      );
      const retry = await reconcile();
      expect(retry.status).toBe(200);
      expect(decodeStrict(Plan097OperationResponseSchema)(await retry.json()).statementCount).toBe(
        0,
      );
      expect(
        (await testEnv.DB.prepare("PRAGMA table_info(map_release_catalog)").all()).results,
      ).toHaveLength(9);
      expect(
        (
          await testEnv.DB.prepare(
            "SELECT id, name, applied_at AS appliedAt FROM d1_migrations ORDER BY id, name",
          ).all()
        ).results,
      ).toEqual(ledgerBefore);
    } finally {
      await testEnv.DB.batch(
        plan097MapReleaseCatalogRecoveryStatements.map((sql) => testEnv.DB.prepare(sql)),
      );
    }
  });
});
