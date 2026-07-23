import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  Plan097ReaderDeployReceiptSchema,
  runPlan097ReaderDeployCheck,
} from "../../src/lib/plan097-reader-deploy.ts";

const releaseId = "pub_20260605T183601689Z";
const repoSha = "a".repeat(40);

describe("Plan 097 recovery-reader deploy receipt", () => {
  test("binds no-store public evidence and an absent operation namespace to the deployed SHA", async () => {
    const receipt = await runPlan097ReaderDeployCheck(
      {
        baseUrl: "https://plan097.example.test/",
        expectedReleaseId: releaseId,
        repoSha,
        workflowRunId: "330",
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
            headers: { "cf-ray": "ray-namespace", "x-request-id": "request-namespace" },
          }),
      },
    );

    expect(decodeStrict(Plan097ReaderDeployReceiptSchema)(receipt)).toEqual(receipt);
    expect(receipt).toMatchObject({
      artifactKind: "bp.ops.plan097.reader-deploy.v1",
      repoSha,
      workflowRunId: "330",
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
                  etag: null,
                },
              ],
            },
            exactRouteCount: 375,
            representativeGeometry: null,
          }),
          fetch: async () => new Response("Forbidden", { status: 403 }),
        },
      ),
    ).rejects.toThrow(/operation namespace/i);
  });
});
