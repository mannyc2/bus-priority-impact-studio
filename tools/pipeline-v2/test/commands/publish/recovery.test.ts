import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  type Plan097CompactedBatch,
  type Plan097FreshnessMatrix,
  type Plan097OperationResponse,
  type Plan097PreflightReceipt,
  Plan097PreflightReceiptSchema,
  type Plan097RecoveryArtifactManifest,
  type Plan097RestoreBundle,
  plan097PreflightSignedPayloadBytes,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import {
  resolvePublishRecoveryCliInputs,
  runPublishRecovery,
  verifyReturnedPlan097Preflight,
} from "../../../src/commands/publish/recovery.ts";

const publishedAt = "2026-07-22T12:00:00.000Z";
const releaseId = "pub_20260722T120000000Z";
const operationId = `plan097:${releaseId}`;

function operationMetrics() {
  return {
    scope: "operation-before-receipt-persistence" as const,
    durationMs: 1,
    d1: { statementCount: 1, rowsRead: 0, rowsWritten: 1, queryDurationMs: 0.5 },
    r2: {
      headRequests: 1,
      getRequests: 1,
      putRequests: 1,
      bytesRead: 1,
      bytesWritten: 1,
    },
  };
}

function readyFreshnessMatrix(): Plan097FreshnessMatrix {
  const sources = [
    ["bus_segment_speeds_2025", "month", "source_complete_probe", "2026-05"],
    ["bus_hourly_ridership_2025", "month", "latest_closed_upstream_month", "2026-06"],
    ["bus_wait_assessment", "month", "latest_closed_upstream_month", "2026-05"],
    ["ace_violations", "month", "latest_closed_upstream_month", "2026-06"],
    ["ace_routes", "snapshot", "atomic_snapshot", `snapshot:${"1".repeat(64)}`],
    [
      "nyc_dot_bus_lanes_local_streets",
      "snapshot",
      "atomic_snapshot",
      `snapshot:${"2".repeat(64)}`,
    ],
    ["bus_time_gtfsrt_vehicle_positions", "realtime", "preserved_current_signal", "2026-05-19"],
  ] as const;
  return {
    artifactKind: "bp.ops.plan097.freshness-matrix.v1",
    schemaVersion: 1,
    checkedAt: "2026-07-22T11:58:00.000Z",
    status: "ready",
    candidateCompatibilityCoverageEnd: "2026-05",
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
    analysisPeriod: "2026-05",
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
      sql: "DELETE FROM route_batch_status WHERE month = '2026-05'",
      params: [],
      table: "route_batch_status",
      kind: "activation",
      rowCount: 0,
    },
  ];
  return { schemaVersion: 1, statements, metrics: metrics(statements) };
}

async function fixture(options: { largeArtifact?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plan097-publish-recovery-"));
  const artifactRoot = join(root, "artifacts");
  const logicalKey = "studio/v2/test.json";
  const artifactPath = join(artifactRoot, logicalKey);
  const body = options.largeArtifact
    ? "x".repeat(8 * 1024 * 1024)
    : '{"artifactKind":"bp.test.plan097.v1"}\n';
  await Bun.write(artifactPath, body);
  const bodyBytes = new TextEncoder().encode(body);
  const bodySha = new Bun.CryptoHasher("sha256").update(bodyBytes).digest("hex");
  const manifest: Plan097RecoveryArtifactManifest = {
    artifactKind: "bp.ops.plan097.recovery_artifact_manifest.v1",
    schemaVersion: 1,
    releaseId,
    createdAt: publishedAt,
    entries: [
      {
        logicalId: logicalKey,
        logicalKey,
        key: `operations/plan097/blobs/sha256/${bodySha.slice(0, 2)}/${bodySha}.json`,
        sha256: bodySha,
        bytes: bodyBytes.byteLength,
        mediaType: "application/json",
        schemaId: "bp.test.plan097.v1",
      },
    ],
  };
  const manifestText = `${canonicalPlan097Json(manifest)}\n`;
  const manifestPath = join(root, "artifact-manifest.json");
  await Bun.write(manifestPath, manifestText);
  const manifestBytes = new TextEncoder().encode(manifestText);
  const manifestSha = new Bun.CryptoHasher("sha256").update(manifestBytes).digest("hex");
  const bundle: Plan097ActivationBundle = {
    artifactKind: "bp.ops.plan097.activation-bundle.v1",
    schemaVersion: 1,
    operationId,
    candidate: decodeStrict(ReleaseIdentitySchema)({
      releaseId,
      publishedAt,
      coverage: { start: "2025-02", end: "2026-05" },
    }),
    freshnessMatrix: readyFreshnessMatrix(),
    studioScheduleEvidence: studioScheduleEvidence(),
    expectedExactRouteCount: 2,
    schemaEnvelope: {
      canonicalSnapshotSha256: "a".repeat(64),
      structuralSha256: "b".repeat(64),
    },
    artifactManifest: {
      key: `operations/plan097/releases/${releaseId}/artifact-manifest.json`,
      sha256: manifestSha,
      byteLength: manifestBytes.byteLength,
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
  const activationBundlePath = join(root, "activation.json");
  await Bun.write(activationBundlePath, `${canonicalPlan097Json(bundle)}\n`);
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
    batch: activationBatch(),
  };
  const restoreBundlePath = join(root, "restore.json");
  await Bun.write(restoreBundlePath, `${canonicalPlan097Json(restore)}\n`);
  const httpBaselinePath = join(root, "http-baseline.json");
  await Bun.write(
    httpBaselinePath,
    `${JSON.stringify({
      checkedAt: "2026-07-22T11:59:00.000Z",
      activeReleaseId: "pub_20260721T120000000Z",
      endpoints: [
        {
          path: "/api/v1/status",
          status: 200,
          schemaId: "bp.release_status_response.v1",
          safeBodySha256: "9".repeat(64),
          requestId: "request-1",
          cfRay: null,
          cacheControl: "no-store",
          cfCacheStatus: null,
          age: null,
          workerVersionId: null,
          etag: null,
        },
      ],
    })}\n`,
  );
  return {
    root,
    artifactRoot,
    activationBundlePath,
    manifestPath,
    restoreBundlePath,
    httpBaselinePath,
  };
}

async function signedPreflightFixture(root: string): Promise<{
  response: Plan097OperationResponse;
  publicKeyPath: string;
  publicKeySpkiSha256: string;
  receiptSha256: string;
}> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpki = publicKey.export({ format: "der", type: "spki" });
  const publicKeySpkiSha256 = createHash("sha256").update(publicKeySpki).digest("hex");
  const unsignedReceipt: Omit<Plan097PreflightReceipt, "signature"> = {
    artifactKind: "bp.ops.plan097.preflight.v1",
    schemaVersion: 1,
    outcome: "ready",
    preparedAt: publishedAt,
    repoSha: "f".repeat(40),
    commandVersion: "plan097-test",
    resources: {
      d1DatabaseName: "plan097-test-db",
      d1DatabaseId: "12345678-1234-4123-8123-123456789abc",
      r2Bucket: "plan097-test-bucket",
    },
    candidate: {
      releaseId,
      activationBundleSha256: "a".repeat(64),
      manifestKey: `operations/plan097/releases/${releaseId}/artifact-manifest.json`,
      manifestSha256: "b".repeat(64),
    },
    freshnessMatrix: readyFreshnessMatrix(),
    schemaSnapshot: {
      sqliteMaster: [],
      tables: [],
      indexes: [],
      migrationLedger: { present: false, rows: [] },
      sha256: "c".repeat(64),
    },
    schemaReconciliation: {
      expectedStructuralSha256: "d".repeat(64),
      actualStructuralSha256: "d".repeat(64),
      mapReleaseCatalogState: "exact",
      applyRecoverySql: false,
      routeCatalogState: "exact",
      applyRouteCatalogRecoverySql: false,
    },
    httpBaseline: {
      checkedAt: "2026-07-22T11:59:00.000Z",
      activeReleaseId: "pub_20260721T120000000Z",
      endpoints: [
        {
          path: "/api/v1/status",
          status: 200,
          schemaId: "bp.release_status_response.v1",
          safeBodySha256: "e".repeat(64),
          requestId: null,
          cfRay: null,
          cacheControl: "no-store",
          cfCacheStatus: null,
          age: null,
          workerVersionId: null,
          etag: null,
        },
      ],
    },
    selectiveSnapshot: { key: "snapshot.json", sha256: "1".repeat(64), bytes: 1 },
    rollbackPackage: { key: "rollback.json", sha256: "2".repeat(64), bytes: 1 },
    costPreview: { d1Statements: 1, d1Bytes: 1, r2Puts: 1, r2Bytes: 1 },
  };
  const signedPayload = plan097PreflightSignedPayloadBytes(unsignedReceipt);
  const receipt = decodeStrict(Plan097PreflightReceiptSchema)({
    ...unsignedReceipt,
    signature: {
      algorithm: "Ed25519",
      keyId: "plan097-test-20260722",
      publicKeySpkiSha256,
      signedPayloadSha256: createHash("sha256").update(signedPayload).digest("hex"),
      signatureBase64: sign(null, signedPayload, privateKey).toString("base64"),
    },
  });
  const receiptBytes = Buffer.from(`${canonicalPlan097Json(receipt)}\n`);
  const receiptSha256 = createHash("sha256").update(receiptBytes).digest("hex");
  const publicKeyPath = join(root, "preflight-public-key.pem");
  await Bun.write(publicKeyPath, publicKey.export({ format: "pem", type: "spki" }));
  return {
    publicKeyPath,
    publicKeySpkiSha256,
    receiptSha256,
    response: {
      artifactKind: "bp.ops.plan097.worker-response.v1",
      schemaVersion: 1,
      operationId,
      action: "preflight",
      outcome: "pass",
      releaseId,
      activationBundleSha256: "a".repeat(64),
      receiptKey: `operations/plan097/receipts/${releaseId}/preflight.${"3".repeat(64)}.json`,
      statementCount: 1,
      objectCount: 3,
      metrics: operationMetrics(),
      evidence: [
        {
          kind: "preflight",
          key: `operations/plan097/preflight/${releaseId}/preflight.${receiptSha256}.json`,
          sha256: receiptSha256,
          bytes: receiptBytes.byteLength,
        },
      ],
      preflightReceiptBase64: receiptBytes.toString("base64"),
    },
  };
}

describe("publish recovery command", () => {
  test("resolves the plan's exact candidate and operation command shapes from closed environment configuration", () => {
    const candidateDir = "/tmp/plan097-candidate/d1/2026-05";
    const commonEnvironment = {
      PLAN097_CANDIDATE_DIR: candidateDir,
      PLAN097_ARTIFACT_ROOT: "/tmp/plan097-candidate/artifacts",
      PLAN097_SERVICE_TOKEN_ID: "id",
      PLAN097_SERVICE_TOKEN_SECRET: "secret",
      PLAN097_BOOTSTRAP_TOKEN: "bootstrap-token",
      PLAN097_RESTORE_BUNDLE_SHA256: "a".repeat(64),
      PLAN097_PREFLIGHT_RECEIPT_SHA256: "b".repeat(64),
      PLAN097_PREFLIGHT_PUBLIC_KEY: "/tmp/plan097-preflight.pem",
    };
    const dryRun = resolvePublishRecoveryCliInputs(
      { action: "dry-run", candidate: releaseId },
      {
        ...commonEnvironment,
        PLAN097_RECOVERY_ENDPOINT: "https://production.test/__operations/plan097",
        PLAN097_PUBLIC_BASE_URL: "https://production.test/",
      },
    );
    expect(dryRun).toMatchObject({
      expectedCandidateId: releaseId,
      activationBundlePath: `${candidateDir}/plan097-activation-bundle.json`,
      artifactManifestPath: `${candidateDir}/plan097-artifact-manifest.json`,
    });

    const proof = resolvePublishRecoveryCliInputs(
      { action: "prove", operation: operationId, proofEnv: "plan097-proof" },
      {
        ...commonEnvironment,
        PLAN097_PROOF_ENDPOINT: "https://proof-worker.test/__operations/plan097",
        PLAN097_PROOF_BASE_URL: "https://proof-public.test/",
        PLAN097_EXECUTION_TOKEN: "proof-token",
      },
    );
    expect(proof).toMatchObject({
      expectedOperationId: operationId,
      endpoint: "https://proof-worker.test/__operations/plan097",
      publicBaseUrl: "https://proof-public.test/",
      restoreBundleSha256: "a".repeat(64),
    });

    const activation = resolvePublishRecoveryCliInputs(
      { action: "activate", operation: operationId, receiptSha256: "b".repeat(64) },
      {
        ...commonEnvironment,
        PLAN097_RECOVERY_ENDPOINT: "https://activation.test/__operations/plan097",
        PLAN097_PUBLIC_BASE_URL: "https://production.test/",
        PLAN097_EXECUTION_TOKEN: "fresh-production-token",
        PLAN097_MIRROR_PROOF_ARTIFACTS: "true",
        PLAN097_PROOF_SUMMARY_KEY: `operations/plan097/proof/${releaseId}/proof-summary.${"c".repeat(64)}.json`,
        PLAN097_PROOF_SUMMARY_SHA256: "c".repeat(64),
        PLAN097_PROOF_SUMMARY_BYTES: "100",
      },
    );
    expect(activation.proofSummaryRef).toEqual({
      kind: "proof-summary",
      key: `operations/plan097/proof/${releaseId}/proof-summary.${"c".repeat(64)}.json`,
      sha256: "c".repeat(64),
      bytes: 100,
    });
    expect(activation.mirrorProofArtifacts).toBe(true);
  });

  test("independently verifies the exact returned preflight bytes with the trusted Ed25519 key", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan097-preflight-verification-"));
    try {
      const fixture = await signedPreflightFixture(root);
      await expect(
        verifyReturnedPlan097Preflight(fixture.response, fixture.publicKeyPath),
      ).resolves.toEqual({
        receiptSha256: fixture.receiptSha256,
        keyId: "plan097-test-20260722",
        publicKeySpkiSha256: fixture.publicKeySpkiSha256,
      });
      const otherKey = generateKeyPairSync("ed25519").publicKey.export({
        format: "pem",
        type: "spki",
      });
      const otherKeyPath = join(root, "other-public-key.pem");
      await Bun.write(otherKeyPath, otherKey);
      await expect(verifyReturnedPlan097Preflight(fixture.response, otherKeyPath)).rejects.toThrow(
        "fingerprint",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("runs the exact staged A→B→A proof without accepting resource or SQL selectors", async () => {
    const files = await fixture({ largeArtifact: true });
    const calls: Array<{ action: string; executionToken: string | null }> = [];
    const httpModes: string[] = [];
    let transientStageFailures = 0;
    let transientExecutionTokenFailures = 0;
    let rawStageRequests = 0;
    const baseline = JSON.parse(await Bun.file(files.httpBaselinePath).text()) as {
      checkedAt: string;
      activeReleaseId: string;
      endpoints: Array<{
        path: string;
        status: number;
        schemaId: string;
        safeBodySha256: string;
        requestId: string | null;
        cfRay: string | null;
        cacheControl: string | null;
        cfCacheStatus: string | null;
        age: string | null;
        workerVersionId: string | null;
        etag: string | null;
      }>;
    };
    try {
      const result = await runPublishRecovery(
        {
          action: "prove",
          endpoint: "https://worker.test/__operations/plan097",
          activationBundlePath: files.activationBundlePath,
          artifactManifestPath: files.manifestPath,
          artifactRoot: files.artifactRoot,
          restoreBundlePath: files.restoreBundlePath,
          publicBaseUrl: "https://proof.test/",
          serviceTokenId: "id",
          serviceTokenSecret: "secret",
          executionToken: "fresh-token",
        },
        {
          fetch: async (_input, init) => {
            const requestHeaders = new Headers(init?.headers);
            const rawAction = requestHeaders.get("X-Plan097-Stage-Action");
            const request =
              rawAction === null
                ? (JSON.parse(String(init?.body)) as { action: string })
                : { action: rawAction };
            if (rawAction !== null) rawStageRequests += 1;
            calls.push({
              action: request.action,
              executionToken: requestHeaders.get("X-Plan097-Execution-Token"),
            });
            if (request.action === "mirror-bundle" && transientExecutionTokenFailures === 0) {
              transientExecutionTokenFailures += 1;
              return new Response("Forbidden", { status: 403 });
            }
            if (request.action === "stage-body" && transientStageFailures === 0) {
              transientStageFailures += 1;
              return new Response("temporary edge failure", { status: 503 });
            }
            return Response.json({
              artifactKind: "bp.ops.plan097.worker-response.v1",
              schemaVersion: 1,
              operationId,
              action: request.action,
              outcome:
                request.action === "prove" &&
                calls.filter((call) => call.action === "prove").length === 1
                  ? "failed_as_expected"
                  : "pass",
              releaseId,
              activationBundleSha256: "a".repeat(64),
              receiptKey: `operations/plan097/receipts/${releaseId}/${request.action}.${"b".repeat(64)}.json`,
              statementCount: 1,
              objectCount: 1,
              metrics: operationMetrics(),
              ...(request.action === "record-proof"
                ? {
                    evidence: [
                      {
                        kind: "proof-summary",
                        key: `operations/plan097/proof/${releaseId}/proof-summary.${"c".repeat(64)}.json`,
                        sha256: "c".repeat(64),
                        bytes: 100,
                      },
                    ],
                  }
                : {}),
            });
          },
          httpCheck: async (input) => {
            httpModes.push(input.mode ?? "candidate");
            return {
              baseline: {
                ...baseline,
                activeReleaseId: input.mode === "candidate" ? releaseId : baseline.activeReleaseId,
              },
              exactRouteCount: 2,
              representativeGeometry: {
                path: "/api/v1/artifacts/map.geojson",
                sha256: "a".repeat(64),
                featureCount: 1,
              },
            };
          },
          sleep: async () => {},
        },
      );
      expect(result.outcome).toBe("pass");
      expect(rawStageRequests).toBe(3);
      expect(calls.map((call) => call.action)).toEqual([
        "mirror-bundle",
        "mirror-bundle",
        "stage-body",
        "stage-body",
        "seed-proof-alias",
        "finalize-manifest",
        "prove",
        "prove",
        "prove",
        "prove",
        "record-proof",
      ]);
      expect(
        calls
          .filter((call) => call.action !== "prove")
          .every((call) => call.executionToken === "fresh-token"),
      ).toBe(true);
      expect(
        calls
          .filter((call) => call.action === "prove")
          .every((call) => call.executionToken === null),
      ).toBe(true);
      expect(httpModes).toEqual(["baseline", "baseline", "candidate", "baseline"]);
      expect(result.httpComparisons.map((comparison) => comparison.phase)).toEqual([
        "proof-baseline",
        "injected-failure",
        "candidate-active",
        "baseline-restored",
      ]);
      expect(result.proofSummary?.kind).toBe("proof-summary");
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });

  test("restores the disposable baseline when candidate HTTP proof fails", async () => {
    const files = await fixture();
    const actions: string[] = [];
    const httpModes: string[] = [];
    const baseline = JSON.parse(await Bun.file(files.httpBaselinePath).text()) as {
      checkedAt: string;
      activeReleaseId: string;
      endpoints: Array<{
        path: string;
        status: number;
        schemaId: string;
        safeBodySha256: string;
        requestId: string | null;
        cfRay: string | null;
        cacheControl: string | null;
        cfCacheStatus: string | null;
        age: string | null;
        workerVersionId: string | null;
        etag: string | null;
      }>;
    };
    try {
      await expect(
        runPublishRecovery(
          {
            action: "prove",
            endpoint: "https://worker.test/__operations/plan097",
            activationBundlePath: files.activationBundlePath,
            artifactManifestPath: files.manifestPath,
            artifactRoot: files.artifactRoot,
            restoreBundlePath: files.restoreBundlePath,
            publicBaseUrl: "https://proof.test/",
            serviceTokenId: "id",
            serviceTokenSecret: "secret",
            executionToken: "fresh-token",
          },
          {
            fetch: async (_input, init) => {
              const headers = new Headers(init?.headers);
              const rawAction = headers.get("X-Plan097-Stage-Action");
              const request =
                rawAction === null
                  ? (JSON.parse(String(init?.body)) as { action: string })
                  : { action: rawAction };
              actions.push(request.action);
              return Response.json({
                artifactKind: "bp.ops.plan097.worker-response.v1",
                schemaVersion: 1,
                operationId,
                action: request.action,
                outcome: "pass",
                releaseId,
                activationBundleSha256: "a".repeat(64),
                receiptKey: `operations/plan097/receipts/${releaseId}/${request.action}.${"b".repeat(64)}.json`,
                statementCount: 1,
                objectCount: 1,
                metrics: operationMetrics(),
              });
            },
            httpCheck: async (input) => {
              const mode = input.mode ?? "candidate";
              httpModes.push(mode);
              if (mode === "candidate") throw new Error("candidate smoke failed");
              return {
                baseline,
                exactRouteCount: 1,
                representativeGeometry: null,
              };
            },
          },
        ),
      ).rejects.toThrow("candidate smoke failed");
      expect(actions.filter((action) => action === "prove")).toHaveLength(4);
      expect(actions.at(-1)).toBe("prove");
      expect(httpModes).toEqual(["baseline", "baseline", "candidate", "baseline"]);
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });

  test("requires the fresh execution token before activation", async () => {
    const files = await fixture();
    try {
      await expect(
        runPublishRecovery(
          {
            action: "activate",
            endpoint: "https://worker.test/__operations/plan097",
            activationBundlePath: files.activationBundlePath,
            artifactManifestPath: files.manifestPath,
            artifactRoot: files.artifactRoot,
            serviceTokenId: "id",
            serviceTokenSecret: "secret",
          },
          {
            fetch: async (_input, init) => {
              const request = JSON.parse(String(init?.body)) as { action: string };
              return Response.json({
                artifactKind: "bp.ops.plan097.worker-response.v1",
                schemaVersion: 1,
                operationId,
                action: request.action,
                outcome: "pass",
                releaseId,
                activationBundleSha256: "a".repeat(64),
                receiptKey: `operations/plan097/receipts/${releaseId}/${request.action}.${"b".repeat(64)}.json`,
                statementCount: 1,
                objectCount: 1,
                metrics: operationMetrics(),
              });
            },
          },
        ),
      ).rejects.toThrow("fresh PLAN097_EXECUTION_TOKEN");
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });

  test("turns dry-run into the signed read-only preflight and returns durable evidence keys", async () => {
    const files = await fixture();
    try {
      const result = await runPublishRecovery(
        {
          action: "dry-run",
          endpoint: "https://worker.test/__operations/plan097",
          activationBundlePath: files.activationBundlePath,
          artifactManifestPath: files.manifestPath,
          artifactRoot: files.artifactRoot,
          httpBaselinePath: files.httpBaselinePath,
          serviceTokenId: "id",
          serviceTokenSecret: "secret",
          bootstrapToken: "bootstrap-token",
        },
        {
          fetch: async (_input, init) => {
            const request = JSON.parse(String(init?.body)) as {
              action: string;
              httpBaseline?: { activeReleaseId: string };
            };
            if (request.action === "seed-bundle") {
              expect(new Headers(init?.headers).get("X-Plan097-Execution-Token")).toBe(
                "bootstrap-token",
              );
            } else {
              expect(request.action).toBe("preflight");
              expect(request.httpBaseline?.activeReleaseId).toBe("pub_20260721T120000000Z");
            }
            return Response.json({
              artifactKind: "bp.ops.plan097.worker-response.v1",
              schemaVersion: 1,
              operationId,
              action: request.action,
              outcome: "pass",
              releaseId,
              activationBundleSha256: "a".repeat(64),
              receiptKey: `operations/plan097/receipts/${releaseId}/preflight.${"b".repeat(64)}.json`,
              statementCount: 1,
              objectCount: 3,
              metrics: operationMetrics(),
              ...(request.action === "preflight"
                ? {
                    evidence: [
                      {
                        kind: "restore-bundle",
                        key: `operations/plan097/bundles/${releaseId}/restore.${"d".repeat(64)}.json`,
                        sha256: "d".repeat(64),
                        bytes: 200,
                      },
                      {
                        kind: "preflight",
                        key: `operations/plan097/preflight/${releaseId}/preflight.${"c".repeat(64)}.json`,
                        sha256: "c".repeat(64),
                        bytes: 100,
                      },
                    ],
                    preflightReceiptBase64: "e30K",
                  }
                : {}),
            });
          },
          verifyPreflightReceipt: async (response) => {
            expect(response.preflightReceiptBase64).toBe("e30K");
            return {
              receiptSha256: "c".repeat(64),
              keyId: "plan097-test-20260722",
              publicKeySpkiSha256: "d".repeat(64),
            };
          },
        },
      );
      expect(result.remoteReceipts).toHaveLength(4);
      expect(result.remoteReceipts[3]).toContain("/preflight/");
      expect(result.restoreBundleSha256).toBe("d".repeat(64));
      expect(result.preflightAttestation).toEqual({
        receiptSha256: "c".repeat(64),
        keyId: "plan097-test-20260722",
        publicKeySpkiSha256: "d".repeat(64),
      });
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });

  test("atomically rolls back and reports STOP when post-activation HTTP smoke fails", async () => {
    const files = await fixture();
    const actions: string[] = [];
    let httpCheckCount = 0;
    const baseline = JSON.parse(await Bun.file(files.httpBaselinePath).text()) as {
      checkedAt: string;
      activeReleaseId: string;
      endpoints: Array<{
        path: string;
        status: number;
        schemaId: string;
        safeBodySha256: string;
        requestId: string | null;
        cfRay: string | null;
        cacheControl: string | null;
        cfCacheStatus: string | null;
        age: string | null;
        workerVersionId: string | null;
        etag: string | null;
      }>;
    };
    try {
      const result = await runPublishRecovery(
        {
          action: "activate",
          endpoint: "https://worker.test/__operations/plan097",
          activationBundlePath: files.activationBundlePath,
          artifactManifestPath: files.manifestPath,
          artifactRoot: files.artifactRoot,
          restoreBundlePath: files.restoreBundlePath,
          httpBaselinePath: files.httpBaselinePath,
          publicBaseUrl: "https://production.test/",
          serviceTokenId: "id",
          serviceTokenSecret: "secret",
          executionToken: "fresh-token",
          mirrorProofArtifacts: true,
          preflightReceiptSha256: "c".repeat(64),
          proofSummaryRef: {
            kind: "proof-summary",
            key: `operations/plan097/proof/${releaseId}/proof-summary.${"d".repeat(64)}.json`,
            sha256: "d".repeat(64),
            bytes: 100,
          },
        },
        {
          fetch: async (_input, init) => {
            const request = JSON.parse(String(init?.body)) as { action: string };
            actions.push(request.action);
            return Response.json({
              artifactKind: "bp.ops.plan097.worker-response.v1",
              schemaVersion: 1,
              operationId,
              action: request.action,
              outcome: "pass",
              releaseId,
              activationBundleSha256: "a".repeat(64),
              receiptKey: `operations/plan097/receipts/${releaseId}/${request.action}.${"b".repeat(64)}.json`,
              statementCount: 1,
              objectCount: 1,
              metrics: operationMetrics(),
              ...(request.action === "record-completion"
                ? {
                    evidence: [
                      {
                        kind: "completion",
                        key: `operations/plan097/completion/${releaseId}/completion.${"e".repeat(64)}.json`,
                        sha256: "e".repeat(64),
                        bytes: 100,
                      },
                    ],
                  }
                : {}),
            });
          },
          httpCheck: async () => {
            httpCheckCount += 1;
            if (httpCheckCount === 2) throw new Error("post-activation smoke failed");
            return {
              baseline,
              exactRouteCount: 1,
              representativeGeometry: {
                path: "/api/v1/artifacts/map.geojson",
                sha256: "a".repeat(64),
                featureCount: 1,
              },
            };
          },
        },
      );
      expect(result.outcome).toBe("rolled_back");
      expect(actions).toEqual([
        "mirror-bundle",
        "mirror-proof-body",
        "finalize-manifest",
        "dry-run",
        "reconcile-schema",
        "activate",
        "rollback",
        "record-completion",
      ]);
      expect(httpCheckCount).toBe(3);
      expect(result.completion?.kind).toBe("completion");
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});
