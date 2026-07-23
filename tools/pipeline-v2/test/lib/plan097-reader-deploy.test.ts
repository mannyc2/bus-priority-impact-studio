import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  Plan097ReaderDeployFailureReceiptSchema,
  Plan097ReaderDeployReceiptSchema,
  runPlan097ReaderDeployCheck,
} from "../../src/lib/plan097-reader-deploy.ts";

const releaseId = "pub_20260605T183601689Z";
const repoSha = "a".repeat(40);
const workerVersionId = "aef011c3-0e48-4c35-92f7-3516a2259afe";

describe("Plan 097 recovery-reader deploy receipt", () => {
  test("binds no-store public evidence and an absent operation namespace to the deployed SHA", async () => {
    const receipt = await runPlan097ReaderDeployCheck(
      {
        baseUrl: "https://plan097.example.test/",
        expectedReleaseId: releaseId,
        repoSha,
        workflowRunId: "330",
        expectedWorkerVersionId: workerVersionId,
        versionOverrideWorkerName: "bus-priority-impact-studio",
        checkedAt: "2026-07-23T05:00:00.000Z",
        nonce: "reader-deploy",
      },
      {
        httpCheck: async () => ({
          baseline: {
            checkedAt: "2026-07-23T05:00:00.000Z",
            activeReleaseId: releaseId,
            endpoints: [
              {
                path: "/api/v1/status?plan097=reader-deploy",
                status: 200,
                schemaId: "bp.release_status_response.v1",
                safeBodySha256: "b".repeat(64),
                requestId: "request-1",
                cfRay: "ray-1",
                cacheControl: "no-store",
                cfCacheStatus: "BYPASS",
                age: null,
                workerVersionId,
                etag: null,
              },
            ],
          },
          exactRouteCount: 375,
          representativeGeometry: null,
        }),
        fetch: async () =>
          new Response("Not found", {
            status: 404,
            headers: {
              "cf-cache-status": "BYPASS",
              "cf-ray": "ray-namespace",
              "x-bp-worker-version": workerVersionId,
              "x-request-id": "request-namespace",
            },
          }),
      },
    );

    expect(decodeStrict(Plan097ReaderDeployReceiptSchema)(receipt)).toEqual(receipt);
    expect(receipt).toMatchObject({
      artifactKind: "bp.ops.plan097.reader-deploy.v1",
      repoSha,
      workflowRunId: "330",
      workerVersionId,
      requestRouting: "version-override",
      expectedPreviousReleaseId: releaseId,
      exactRouteCount: 375,
      recoveryNamespace: {
        path: "/__operations/plan097",
        status: 404,
        cacheControl: null,
      },
    });
  });

  test("fails closed when the operation namespace is reachable", async () => {
    await expect(
      runPlan097ReaderDeployCheck(
        {
          baseUrl: "https://plan097.example.test/",
          expectedReleaseId: releaseId,
          repoSha,
          workflowRunId: "330",
          expectedWorkerVersionId: workerVersionId,
          checkedAt: "2026-07-23T05:00:00.000Z",
        },
        {
          httpCheck: async () => ({
            baseline: {
              checkedAt: "2026-07-23T05:00:00.000Z",
              activeReleaseId: releaseId,
              endpoints: [
                {
                  path: "/api/v1/status?plan097=reader-deploy",
                  status: 200,
                  schemaId: "bp.release_status_response.v1",
                  safeBodySha256: "b".repeat(64),
                  requestId: null,
                  cfRay: null,
                  cacheControl: "no-store",
                  cfCacheStatus: null,
                  age: null,
                  workerVersionId,
                  etag: null,
                },
              ],
            },
            exactRouteCount: 375,
            representativeGeometry: null,
          }),
          fetch: async () =>
            new Response("Forbidden", {
              status: 403,
              headers: { "x-bp-worker-version": workerVersionId },
            }),
        },
      ),
    ).rejects.toThrow(/operation namespace/i);
  });

  test("keeps failed version/cache observations in a separate strict attempt receipt", () => {
    const failure = decodeStrict(Plan097ReaderDeployFailureReceiptSchema)({
      artifactKind: "bp.ops.plan097.reader-deploy-attempt.v1",
      schemaVersion: 1,
      repoSha,
      workflowRunId: "332",
      workerVersionId,
      requestRouting: "ordinary",
      expectedPreviousReleaseId: releaseId,
      failedAt: "2026-07-23T10:09:52.900Z",
      errorName: "Error",
      errorMessage: "Plan 097 cache bypass is missing for /api/v1/status",
      observations: [
        {
          path: "/api/v1/status?plan097=fixture",
          status: 200,
          requestId: "request-1",
          cfRay: "ray-1",
          cacheControl: "public, max-age=60, stale-while-revalidate=86400",
          cfCacheStatus: "HIT",
          age: "20",
          workerVersionId: null,
        },
      ],
    });

    expect(failure.artifactKind).toBe("bp.ops.plan097.reader-deploy-attempt.v1");
    expect(failure.observations[0]?.cfCacheStatus).toBe("HIT");
  });

  test("rejects success receipts whose nested evidence is not bound to the top-level Worker version", () => {
    const validReceipt = {
      artifactKind: "bp.ops.plan097.reader-deploy.v1" as const,
      schemaVersion: 1 as const,
      repoSha,
      workflowRunId: "333",
      workerVersionId,
      requestRouting: "ordinary" as const,
      checkedAt: "2026-07-23T11:00:00.000Z",
      expectedPreviousReleaseId: releaseId,
      baseline: {
        checkedAt: "2026-07-23T11:00:00.000Z",
        activeReleaseId: releaseId,
        endpoints: [
          {
            path: "/api/v1/status?plan097=receipt-version-binding",
            status: 200,
            schemaId: "bp.release_status_response.v1",
            safeBodySha256: "b".repeat(64),
            requestId: null,
            cfRay: null,
            cacheControl: "no-store",
            cfCacheStatus: "BYPASS",
            age: null,
            workerVersionId,
            etag: null,
          },
        ],
      },
      exactRouteCount: 375,
      representativeGeometry: null,
      recoveryNamespace: {
        path: "/__operations/plan097" as const,
        status: 404 as const,
        safeBodySha256: "c".repeat(64),
        requestId: null,
        cfRay: null,
        cacheControl: null,
        cfCacheStatus: "BYPASS",
        age: null,
        workerVersionId,
      },
    };
    const otherWorkerVersionId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    expect(() =>
      decodeStrict(Plan097ReaderDeployReceiptSchema)({
        ...validReceipt,
        baseline: {
          ...validReceipt.baseline,
          endpoints: validReceipt.baseline.endpoints.map((endpoint) => ({
            ...endpoint,
            workerVersionId: otherWorkerVersionId,
          })),
        },
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(Plan097ReaderDeployReceiptSchema)({
        ...validReceipt,
        recoveryNamespace: {
          ...validReceipt.recoveryNamespace,
          workerVersionId: otherWorkerVersionId,
        },
      }),
    ).toThrow();
  });
});
