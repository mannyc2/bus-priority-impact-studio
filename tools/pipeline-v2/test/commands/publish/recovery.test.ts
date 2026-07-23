import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalPlan097Json,
  type Plan097ActivationBundle,
  type Plan097CompactedBatch,
  type Plan097RecoveryArtifactManifest,
  type Plan097RestoreBundle,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { runPublishRecovery } from "../../../src/commands/publish/recovery.ts";

const publishedAt = "2026-07-22T12:00:00.000Z";
const releaseId = "pub_20260722T120000000Z";
const operationId = `plan097:${releaseId}`;

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

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "plan097-publish-recovery-"));
  const artifactRoot = join(root, "artifacts");
  const logicalKey = "studio/v2/test.json";
  const artifactPath = join(artifactRoot, logicalKey);
  const body = '{"artifactKind":"bp.test.plan097.v1"}\n';
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

describe("publish recovery command", () => {
  test("runs the exact staged A→B→A proof without accepting resource or SQL selectors", async () => {
    const files = await fixture();
    const calls: Array<{ action: string; executionToken: string | null }> = [];
    try {
      const result = await runPublishRecovery(
        {
          action: "prove",
          endpoint: "https://worker.test/__operations/plan097",
          activationBundlePath: files.activationBundlePath,
          artifactManifestPath: files.manifestPath,
          artifactRoot: files.artifactRoot,
          restoreBundlePath: files.restoreBundlePath,
          serviceTokenId: "id",
          serviceTokenSecret: "secret",
          executionToken: "fresh-token",
        },
        {
          fetch: async (_input, init) => {
            const request = JSON.parse(String(init?.body)) as { action: string };
            const requestHeaders = new Headers(init?.headers);
            calls.push({
              action: request.action,
              executionToken: requestHeaders.get("X-Plan097-Execution-Token"),
            });
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
            });
          },
        },
      );
      expect(result.outcome).toBe("pass");
      expect(calls.map((call) => call.action)).toEqual([
        "mirror-bundle",
        "stage-body",
        "finalize-manifest",
        "prove",
        "prove",
        "prove",
      ]);
      expect(calls.slice(0, 3).every((call) => call.executionToken === "fresh-token")).toBe(true);
      expect(calls.slice(3).every((call) => call.executionToken === null)).toBe(true);
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
        },
        {
          fetch: async (_input, init) => {
            const request = JSON.parse(String(init?.body)) as {
              action: string;
              httpBaseline?: { activeReleaseId: string };
            };
            expect(request.action).toBe("preflight");
            expect(request.httpBaseline?.activeReleaseId).toBe("pub_20260721T120000000Z");
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
              evidence: [
                {
                  kind: "preflight",
                  key: `operations/plan097/preflight/${releaseId}/preflight.${"c".repeat(64)}.json`,
                  sha256: "c".repeat(64),
                  bytes: 100,
                },
              ],
            });
          },
        },
      );
      expect(result.remoteReceipts).toHaveLength(2);
      expect(result.remoteReceipts[1]).toContain("/preflight/");
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
          preflightReceiptSha256: "c".repeat(64),
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
        "reconcile-schema",
        "stage-body",
        "finalize-manifest",
        "dry-run",
        "activate",
        "rollback",
      ]);
      expect(httpCheckCount).toBe(3);
    } finally {
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});
