import { createHash } from "node:crypto";
import { Plan097HttpBaselineSchema } from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { type Plan097HttpCheckResult, runPlan097HttpCheck } from "./plan097-http-check.ts";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const RepoShaSchema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const WorkerVersionIdSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u),
);
const UtcInstantSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const RequestRoutingSchema = Schema.Literals(["ordinary", "version-override"]);
const ReaderAttemptObservationSchema = Schema.Struct({
  path: Schema.String.check(Schema.isPattern(/^\//u)),
  status: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  requestId: Schema.NullOr(Schema.String),
  cfRay: Schema.NullOr(Schema.String),
  cacheControl: Schema.NullOr(Schema.String),
  cfCacheStatus: Schema.NullOr(Schema.String),
  age: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[0-9]+$/u))),
  workerVersionId: Schema.NullOr(WorkerVersionIdSchema),
});

export const Plan097ReaderDeployReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.reader-deploy.v1"),
  schemaVersion: Schema.Literal(1),
  repoSha: RepoShaSchema,
  workflowRunId: Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)),
  workerVersionId: WorkerVersionIdSchema,
  requestRouting: RequestRoutingSchema,
  checkedAt: UtcInstantSchema,
  expectedPreviousReleaseId: ReleaseIdSchema,
  baseline: Plan097HttpBaselineSchema,
  exactRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  representativeGeometry: Schema.NullOr(
    Schema.Struct({
      path: Schema.String.check(Schema.isPattern(/^\//u)),
      sha256: Sha256Schema,
      featureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    }),
  ),
  recoveryNamespace: Schema.Struct({
    path: Schema.Literal("/__operations/plan097"),
    status: Schema.Literal(404),
    safeBodySha256: Sha256Schema,
    requestId: Schema.NullOr(Schema.String),
    cfRay: Schema.NullOr(Schema.String),
    cacheControl: Schema.NullOr(Schema.String),
    cfCacheStatus: Schema.NullOr(Schema.String),
    age: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[0-9]+$/u))),
    workerVersionId: WorkerVersionIdSchema,
  }),
}).check(
  Schema.makeFilter((receipt) => {
    const issues: Array<{ path: ReadonlyArray<string | number>; issue: string }> = [];
    if (receipt.baseline.activeReleaseId !== receipt.expectedPreviousReleaseId) {
      issues.push({
        path: ["baseline", "activeReleaseId"],
        issue: "The reader predeploy elected a release other than the pinned previous release",
      });
    }
    for (const [index, endpoint] of receipt.baseline.endpoints.entries()) {
      if (endpoint.workerVersionId !== receipt.workerVersionId) {
        issues.push({
          path: ["baseline", "endpoints", index, "workerVersionId"],
          issue: "The endpoint evidence is not bound to the receipt Worker version",
        });
      }
    }
    if (receipt.recoveryNamespace.workerVersionId !== receipt.workerVersionId) {
      issues.push({
        path: ["recoveryNamespace", "workerVersionId"],
        issue: "The recovery-namespace evidence is not bound to the receipt Worker version",
      });
    }
    return issues;
  }),
);

export type Plan097ReaderDeployReceipt = typeof Plan097ReaderDeployReceiptSchema.Type;

export const Plan097ReaderDeployFailureReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.reader-deploy-attempt.v1"),
  schemaVersion: Schema.Literal(1),
  repoSha: RepoShaSchema,
  workflowRunId: Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)),
  workerVersionId: WorkerVersionIdSchema,
  requestRouting: RequestRoutingSchema,
  expectedPreviousReleaseId: ReleaseIdSchema,
  failedAt: UtcInstantSchema,
  errorName: Schema.String.check(Schema.isMinLength(1)),
  errorMessage: Schema.String.check(Schema.isMinLength(1)),
  observations: Schema.Array(ReaderAttemptObservationSchema),
});

export type Plan097ReaderDeployFailureReceipt = typeof Plan097ReaderDeployFailureReceiptSchema.Type;

export async function runPlan097ReaderDeployCheck(
  input: {
    baseUrl: string;
    expectedReleaseId: string;
    repoSha: string;
    workflowRunId: string;
    expectedWorkerVersionId: string;
    versionOverrideWorkerName?: string | undefined;
    checkedAt?: string | undefined;
    nonce?: string | undefined;
  },
  dependencies: {
    fetch?: Fetch | undefined;
    httpCheck?: typeof runPlan097HttpCheck | undefined;
  } = {},
): Promise<Plan097ReaderDeployReceipt> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const fetchDependency = dependencies.fetch ?? fetch;
  const result: Plan097HttpCheckResult = await (dependencies.httpCheck ?? runPlan097HttpCheck)({
    baseUrl: input.baseUrl,
    fetch: fetchDependency,
    mode: "baseline",
    expectedReleaseId: input.expectedReleaseId,
    checkedAt,
    nonce: input.nonce,
    expectedWorkerVersionId: input.expectedWorkerVersionId,
    versionOverrideWorkerName: input.versionOverrideWorkerName,
  });
  const operationPath = "/__operations/plan097";
  const operationHeaders = new Headers({
    accept: "text/plain",
    "user-agent": "bp-plan097-reader-deploy-check/1",
  });
  if (input.versionOverrideWorkerName !== undefined) {
    operationHeaders.set(
      "Cloudflare-Workers-Version-Overrides",
      `${input.versionOverrideWorkerName}="${input.expectedWorkerVersionId}"`,
    );
  }
  const operationResponse = await fetchDependency(new URL(operationPath, input.baseUrl), {
    headers: operationHeaders,
  });
  const operationBody = await operationResponse.text();
  const operationWorkerVersionId = operationResponse.headers.get("x-bp-worker-version");
  if (operationWorkerVersionId !== input.expectedWorkerVersionId) {
    throw new Error(
      `Plan 097 operation namespace expected Worker ${input.expectedWorkerVersionId}, received ${
        operationWorkerVersionId ?? "no version metadata"
      }`,
    );
  }
  if (operationResponse.status !== 404) {
    throw new Error(
      `Plan 097 operation namespace is reachable with HTTP ${operationResponse.status}`,
    );
  }

  return decodeStrict(Plan097ReaderDeployReceiptSchema)({
    artifactKind: "bp.ops.plan097.reader-deploy.v1",
    schemaVersion: 1,
    repoSha: input.repoSha,
    workflowRunId: input.workflowRunId,
    workerVersionId: input.expectedWorkerVersionId,
    requestRouting: input.versionOverrideWorkerName === undefined ? "ordinary" : "version-override",
    checkedAt,
    expectedPreviousReleaseId: input.expectedReleaseId,
    baseline: result.baseline,
    exactRouteCount: result.exactRouteCount,
    representativeGeometry: result.representativeGeometry,
    recoveryNamespace: {
      path: operationPath,
      status: 404,
      safeBodySha256: createHash("sha256").update(operationBody).digest("hex"),
      requestId: operationResponse.headers.get("x-request-id"),
      cfRay: operationResponse.headers.get("cf-ray"),
      cacheControl: operationResponse.headers.get("cache-control"),
      cfCacheStatus: operationResponse.headers.get("cf-cache-status"),
      age: operationResponse.headers.get("age"),
      workerVersionId: operationWorkerVersionId,
    },
  });
}
